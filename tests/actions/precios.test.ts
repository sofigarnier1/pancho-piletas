import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
vi.mock('@/lib/supabase/server', async () => (await import('../support/session')).serverMock);
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));

import type { TestUserKey } from '../../e2e/support/env';
import { guardarPrecioAction, borrarPrecioAction } from '@/app/admin/clientes/precios-actions';
import { actAs, except, type ActionResult } from '../support/session';
import { svc, userIds } from '../support/clients';

let ids: Record<TestUserKey, string>;
beforeAll(async () => { ids = await userIds(); await svc().from('client_prices').delete().eq('client_id', ids.client2); });
afterAll(async () => { await svc().from('client_prices').delete().eq('client_id', ids.client2); });

const precios = async () => (await svc().from('client_prices').select('id, kind, price_cents, valid_from').eq('client_id', ids.client2)).data ?? [];

describe('guardarPrecioAction / borrarPrecioAction', () => {
  it('el dueño guarda un precio y, con la misma fecha, lo reemplaza', async () => {
    await actAs('owner');
    expect(((await guardarPrecioAction(ids.client2, 'service', '12.500', '2033-01-01')) as ActionResult).success).toBe(true);
    expect(((await guardarPrecioAction(ids.client2, 'service', '13.000,50', '2033-01-01')) as ActionResult).success).toBe(true);
    expect(await precios()).toMatchObject([{ kind: 'service', price_cents: 1_300_050, valid_from: '2033-01-01' }]);
  });

  it('el súper admin también, y borra', async () => {
    await actAs('admin');
    const [p] = await precios();
    expect(((await borrarPrecioAction(p.id as string, ids.client2)) as ActionResult).success).toBe(true);
    expect(await precios()).toEqual([]);
    expect(((await borrarPrecioAction(p.id as string, ids.client2)) as ActionResult).error).toBe('Ese precio ya no estaba');
  });

  it('rechaza precio, tipo, fecha o cliente inválidos', async () => {
    await actAs('owner');
    expect(((await guardarPrecioAction(ids.client2, 'service', 'mucho', '2033-01-01')) as ActionResult).error).toMatch(/^El precio tiene que ser/);
    expect(((await guardarPrecioAction(ids.client2, 'pintura', '1', '2033-01-01')) as ActionResult).error).toBe('Datos inválidos');
    expect(((await guardarPrecioAction(ids.client2, 'service', '1', '33-1-1')) as ActionResult).error).toBe('Datos inválidos');
    expect(((await guardarPrecioAction(ids.employee, 'service', '1', '2033-01-01')) as ActionResult).error).toBe('Los precios son solo para clientes');
  });

  it.each(except(['owner', 'admin']))('%s no puede guardar ni borrar precios', async (actor) => {
    const id = (await svc().from('client_prices').insert({ client_id: ids.client2, kind: 'desagote', price_cents: 1, valid_from: '2033-02-01' }).select('id').single()).data!.id as string;
    await actAs(actor);
    expect(((await guardarPrecioAction(ids.client2, 'service', '1', '2033-03-01')) as ActionResult).error).toBeTruthy();
    expect(((await borrarPrecioAction(id, ids.client2)) as ActionResult).error).toBeTruthy();
    expect((await precios()).map((p) => p.kind)).toEqual(['desagote']);
    await svc().from('client_prices').delete().eq('id', id);
  });
});
