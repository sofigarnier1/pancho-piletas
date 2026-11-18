import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
vi.mock('@/lib/supabase/server', async () => (await import('../support/session')).serverMock);
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));

import { randomUUID } from 'node:crypto';
import type { TestUserKey } from '../../e2e/support/env';
import { anotarCobroAction, borrarCobroAction } from '@/app/employee/actions';
import { borrarPagoAction, cargarPagoAction, confirmarCobroAction, confirmarCobrosDeAction } from '@/app/admin/cobros/actions';
import { FIXTURE } from '../../e2e/support/seed';
import { actAs, except, type ActionResult } from '../support/session';
import { svc, userIds } from '../support/clients';
import { todayInArgentina } from '@/lib/dates';

const TODAY = todayInArgentina();
let ids: Record<TestUserKey, string>;
let item2: string; // pileta 2 (cliente 2), hoy: la ve el empleado

beforeAll(async () => {
  ids = await userIds();
  const day = (await svc().from('itinerary_days').select('id').eq('date', TODAY).single()).data!;
  const { data } = await svc().from('itinerary_items').select('id, pool_id').eq('itinerary_day_id', day.id);
  item2 = data!.find((i) => i.pool_id === FIXTURE.pools.pool2.id)!.id;
  await svc().from('payments').delete().eq('client_id', ids.client2);
});
afterAll(async () => { await svc().from('payments').delete().eq('client_id', ids.client2); });

const pagosDe = async () => (await svc().from('payments').select('id, amount_cents, status, received_by, client_id').eq('client_id', ids.client2).order('created_at')).data ?? [];
const r = (p: Promise<unknown>) => p as Promise<ActionResult>;

describe('Cobré (empleado y modo campo)', () => {
  it('el empleado anota el monto; queda con él, a nombre del titular; un doble envío no duplica', async () => {
    await actAs('employee');
    const rid = randomUUID();
    expect((await r(anotarCobroAction(item2, rid, '15.000', 'pagó el mes'))).success).toBe(true);
    expect((await r(anotarCobroAction(item2, rid, '15.000'))).success).toBe(true);
    expect(await pagosDe()).toMatchObject([{ amount_cents: 1_500_000, status: 'con_empleado', received_by: ids.employee, client_id: ids.client2 }]);
  });

  it('rechaza montos inválidos', async () => {
    await actAs('employee');
    for (const m of ['', '0', 'mucho', '-5']) expect((await r(anotarCobroAction(item2, randomUUID(), m))).error).toMatch(/^Escribí cuánto te dieron/);
    expect((await r(anotarCobroAction('nope', randomUUID(), '1'))).error).toBe('Datos inválidos');
  });

  it('el dueño en modo campo anota y queda recibido', async () => {
    await actAs('owner');
    expect((await r(anotarCobroAction(item2, randomUUID(), '100'))).success).toBe(true);
    const ultimo = (await pagosDe()).at(-1)!;
    expect(ultimo).toMatchObject({ amount_cents: 10_000, status: 'recibido', received_by: ids.owner });
    expect((await r(borrarCobroAction(ultimo.id as string))).success).toBe(true);
  });

  it.each(['marketing', 'client', 'anon'] as const)('%s no puede anotar cobros', async (actor) => {
    await actAs(actor);
    expect((await r(anotarCobroAction(item2, randomUUID(), '1'))).error).toBeTruthy();
  });
});

describe('cobros del dueño', () => {
  it('confirmar uno, y después ya no; el empleado ya no lo puede borrar', async () => {
    const [p] = await pagosDe();
    await actAs('owner');
    expect((await r(confirmarCobroAction(p.id as string))).success).toBe(true);
    expect((await r(confirmarCobroAction(p.id as string))).error).toBe('Ese cobro ya estaba confirmado');
    await actAs('employee');
    expect((await r(borrarCobroAction(p.id as string))).error).toMatch(/^Ese cobro ya no se puede borrar/);
  });

  it('confirmar todo lo de un empleado', async () => {
    await actAs('employee');
    await anotarCobroAction(item2, randomUUID(), '1');
    await anotarCobroAction(item2, randomUUID(), '2');
    await actAs('admin');
    expect(await r(confirmarCobrosDeAction(ids.employee))).toMatchObject({ success: true, count: 2 });
    expect((await r(confirmarCobrosDeAction(ids.employee))).error).toBe('No tenía cobros sin entregar');
  });

  it('cargar un pago directo y borrarlo', async () => {
    await actAs('owner');
    expect((await r(cargarPagoAction(ids.client2, '20.000,50', TODAY, 'transferencia'))).success).toBe(true);
    const ultimo = (await pagosDe()).at(-1)!;
    expect(ultimo).toMatchObject({ amount_cents: 2_000_050, status: 'recibido', received_by: ids.owner });
    expect((await r(borrarPagoAction(ultimo.id as string))).success).toBe(true);
    expect((await r(borrarPagoAction(ultimo.id as string))).error).toBe('Ese pago ya no estaba');
  });

  it('valida cliente, monto y fecha', async () => {
    await actAs('owner');
    expect((await r(cargarPagoAction(ids.employee, '1', TODAY))).error).toBe('Los pagos son solo de clientes');
    expect((await r(cargarPagoAction(ids.client2, '0', TODAY))).error).toMatch(/^El monto tiene que ser/);
    expect((await r(cargarPagoAction(ids.client2, '1', '1999-12-31'))).error).toMatch(/^Revisá la fecha/);
    expect((await r(cargarPagoAction(ids.client2, '1', 'ayer'))).error).toBe('Datos inválidos');
  });

  it.each(except(['owner', 'admin']))('%s no puede usar las acciones de cobros del dueño', async (actor) => {
    const [p] = await pagosDe();
    await actAs(actor);
    expect((await r(cargarPagoAction(ids.client2, '1', TODAY))).error).toBeTruthy();
    expect((await r(confirmarCobrosDeAction(ids.employee))).error).toBeTruthy();
    expect((await r(confirmarCobroAction(p.id as string))).error).toBeTruthy();
    expect((await r(borrarPagoAction(p.id as string))).error).toBeTruthy();
  });
});
