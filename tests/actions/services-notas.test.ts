// Notas del mes por pileta en Services (migración 27): las escribe el dueño (o el súper admin); vacía = se borra
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
vi.mock('@/lib/supabase/server', async () => (await import('../support/session')).serverMock);
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));

import { guardarNotaMesAction } from '@/app/admin/services/actions';
import { actAs, except, resetRevalidated, revalidated, type ActionResult } from '../support/session';
import { svc, userIds, type Actor } from '../support/clients';

const OWNER_UP: Actor[] = ['owner', 'admin'];
const MES = '2031-03';
let pool: string;

const notaDe = async (mes = MES) =>
  (await svc().from('pool_month_notes').select('notes, updated_by').eq('pool_id', pool).eq('month', `${mes}-01`).maybeSingle()).data;

beforeAll(async () => {
  const ids = await userIds();
  pool = (await svc().from('pools').insert({ client_id: ids.client, address: `Notas del mes ${Date.now()}` }).select('id').single()).data!.id as string;
});
afterAll(async () => { await svc().from('pools').delete().eq('id', pool); });
beforeEach(async () => {
  resetRevalidated();
  await svc().from('pool_month_notes').delete().eq('pool_id', pool);
});

describe('guardarNotaMesAction', () => {
  it.each(OWNER_UP)('%s guarda, cambia y borra la nota; la base anota quién fue', async (actor) => {
    await actAs(actor);
    const ids = await userIds();
    expect(((await guardarNotaMesAction(pool, MES, '  cobrar  ')) as ActionResult).success).toBe(true);
    expect(await notaDe()).toEqual({ notes: 'cobrar', updated_by: ids[actor === 'admin' ? 'admin' : 'owner'] });
    expect(revalidated()).toContain('/admin/services');

    expect(((await guardarNotaMesAction(pool, MES, 'cambiar el filtro')) as ActionResult).success).toBe(true);
    expect((await notaDe())!.notes).toBe('cambiar el filtro');
    const { count } = await svc().from('pool_month_notes').select('*', { count: 'exact', head: true }).eq('pool_id', pool);
    expect(count).toBe(1); // una sola nota por pileta y mes

    expect(((await guardarNotaMesAction(pool, MES, '   ')) as ActionResult).success).toBe(true);
    expect(await notaDe()).toBeNull();
  });

  it('cada mes tiene su propia nota', async () => {
    await actAs('owner');
    await guardarNotaMesAction(pool, MES, 'marzo');
    await guardarNotaMesAction(pool, '2031-04', 'abril');
    expect((await notaDe())!.notes).toBe('marzo');
    expect((await notaDe('2031-04'))!.notes).toBe('abril');
  });

  it.each(except(OWNER_UP))('%s no puede escribir notas', async (actor) => {
    await actAs(actor);
    const r = (await guardarNotaMesAction(pool, MES, 'hola')) as ActionResult;
    expect(r.error).toBeTruthy();
    expect(await notaDe()).toBeNull();
  });

  it.each([
    ['pileta inválida', 'no-uuid', MES, 'x', 'Datos inválidos'],
    ['mes inválido', null, '2031-13', 'x', 'Datos inválidos'],
    ['mes con día', null, '2031-03-01', 'x', 'Datos inválidos'],
    ['pileta inexistente', '00000000-0000-4000-8000-000000000000', MES, 'x', 'Pileta no encontrada'],
    ['nota muy larga', null, MES, 'a'.repeat(2001), 'La nota puede tener hasta 2000 caracteres'],
  ])('rechaza %s', async (_n, poolId, mes, texto, error) => {
    await actAs('owner');
    const r = (await guardarNotaMesAction(poolId ?? pool, mes as string, texto as string)) as ActionResult;
    expect(r.error).toBe(error);
    expect(await notaDe()).toBeNull();
  });

  it('la base rechaza un mes que no empieza el día 1 aunque se escriba directo', async () => {
    const { error } = await svc().from('pool_month_notes').insert({ pool_id: pool, month: '2031-03-15', notes: 'x' });
    expect(error?.code).toBe('23514');
  });
});
