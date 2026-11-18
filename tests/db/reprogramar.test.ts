/**
 * Migración 30: que no se pase ningún cliente.
 *  - pendientes_sin_reprogramar(fecha): visitas sin hacer de los 7 días anteriores que nadie volvió a agendar
 *  - itinerary_items.rescheduled_from_item_id: una sola vez, misma pileta, hacia adelante, nunca de una hecha
 *  - solo owner y super_admin ven la lista; el empleado no puede tocar la columna
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { TestUserKey } from '../../e2e/support/env';
import { as, svc, userIds, type Actor } from '../support/clients';
import { addDays, todayInArgentina } from '@/lib/dates';

const HOY = todayInArgentina();
const T = addDays(HOY, 1); // el día que se está armando
let ids: Record<TestUserKey, string>;
const P: Record<string, string> = {};
const I: Record<string, string> = {};
const created: string[] = [];

const day = async (date: string) =>
  (await svc().from('itinerary_days').upsert({ date }, { onConflict: 'date' }).select('id').single()).data!.id as string;

const addItem = async (key: string, pool: string, date: string, status = 'pending', extra: Record<string, unknown> = {}) => {
  const { data, error } = await svc()
    .from('itinerary_items')
    .insert({ itinerary_day_id: await day(date), pool_id: P[pool], sort_order: 900 + created.length, status, ...extra })
    .select('id')
    .single();
  if (error) throw error;
  I[key] = data.id as string;
  created.push(data.id as string);
  return data.id as string;
};

beforeAll(async () => {
  ids = await userIds();
  const names = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'];
  const { data, error } = await svc()
    .from('pools')
    .insert(names.map((n) => ({ client_id: ids.client, address: `Reprogramar ${n} ${Date.now()}`, is_active: n !== 'F' })))
    .select('id, address');
  if (error) throw error;
  for (const p of data!) P[(p.address as string).split(' ')[1]] = p.id as string;

  await addItem('A', 'A', addDays(T, -2), 'skipped');
  await addItem('B', 'B', addDays(T, -2), 'no_client');
  await addItem('C', 'C', addDays(T, -2), 'pending');
  await svc().from('itinerary_items').update({ status: 'done' }).eq('id', I.C); // hecha (sin registro: solo para la prueba)
  await addItem('D', 'D', addDays(T, -5), 'pending');
  await addItem('E', 'E', addDays(T, -9), 'skipped'); // fuera de la semana
  await addItem('F', 'F', addDays(T, -2), 'skipped'); // pileta inactiva
  await addItem('G', 'G', addDays(T, -3), 'skipped');
  await addItem('G2', 'G', addDays(T, -1), 'pending'); // ya tiene otra visita después
  await addItem('H', 'H', addDays(HOY, -2), 'skipped');
  await addItem('Hhoy', 'H', HOY, 'pending');
});

afterAll(async () => {
  const pools = Object.values(P);
  await svc().from('itinerary_items').update({ rescheduled_from_item_id: null }).in('pool_id', pools);
  await svc().from('itinerary_items').delete().in('pool_id', pools);
  await svc().from('pools').delete().in('id', pools);
});

const lista = async (actor: Actor = 'owner', fecha = T) => {
  const c = await as(actor);
  const { data, error } = await c.rpc('pendientes_sin_reprogramar', { p_fecha: fecha });
  return { error, ids: ((data ?? []) as { item_id: string }[]).map((r) => r.item_id).filter((id) => created.includes(id)) };
};

describe('pendientes_sin_reprogramar', () => {
  it('trae salteadas, "no estaba" y pendientes de los 7 días anteriores, sin hechas, sin inactivas y sin las que ya tienen otra visita', async () => {
    const { error, ids: got } = await lista();
    expect(error).toBeNull();
    expect(got.sort()).toEqual([I.A, I.B, I.D].sort());
  });

  it('el super_admin también la ve', async () => {
    const { error, ids: got } = await lista('admin');
    expect(error).toBeNull();
    expect(got).toContain(I.A);
  });

  it.each(['employee', 'marketing', 'client'] as Actor[])('%s no la puede pedir', async (actor) => {
    const { error } = await lista(actor);
    expect(error?.code).toBe('42501');
  });

  it('anon no la puede ejecutar', async () => {
    const { error } = await lista('anon');
    expect(error).not.toBeNull();
  });
});

describe('rescheduled_from_item_id', () => {
  it('el dueño reprograma una visita y deja de aparecer', async () => {
    const owner = await as('owner');
    const { error } = await owner
      .from('itinerary_items')
      .insert({ itinerary_day_id: await day(T), pool_id: P.A, sort_order: 990, rescheduled_from_item_id: I.A });
    expect(error).toBeNull();
    const { data } = await svc().from('itinerary_items').select('id').eq('rescheduled_from_item_id', I.A).single();
    created.push(data!.id as string);
    expect((await lista()).ids).not.toContain(I.A);
  });

  it('no se puede reprogramar dos veces la misma visita', async () => {
    const owner = await as('owner');
    const { error } = await owner
      .from('itinerary_items')
      .insert({ itinerary_day_id: await day(addDays(T, 1)), pool_id: P.A, sort_order: 991, rescheduled_from_item_id: I.A });
    expect(error?.code).toBe('23505');
  });

  it('no se puede reprogramar una visita hecha', async () => {
    const owner = await as('owner');
    const { error } = await owner
      .from('itinerary_items')
      .insert({ itinerary_day_id: await day(T), pool_id: P.C, sort_order: 992, rescheduled_from_item_id: I.C });
    expect(error?.code).toBe('22023');
  });

  it('tiene que ser la misma pileta', async () => {
    const owner = await as('owner');
    const { error } = await owner
      .from('itinerary_items')
      .insert({ itinerary_day_id: await day(T), pool_id: P.B, sort_order: 993, rescheduled_from_item_id: I.D });
    expect(error?.code).toBe('22023');
  });

  it('solo hacia adelante: no a un día anterior o igual al de la visita', async () => {
    const owner = await as('owner');
    const { error } = await owner
      .from('itinerary_items')
      .insert({ itinerary_day_id: await day(addDays(T, -6)), pool_id: P.D, sort_order: 994, rescheduled_from_item_id: I.D });
    expect(error?.code).toBe('22023');
  });

  it('el empleado no puede cambiarla', async () => {
    const emp = await as('employee');
    const { error } = await emp.from('itinerary_items').update({ rescheduled_from_item_id: I.H }).eq('id', I.Hhoy);
    expect(error?.code).toBe('42501');
    const { data } = await svc().from('itinerary_items').select('rescheduled_from_item_id').eq('id', I.Hhoy).single();
    expect(data!.rescheduled_from_item_id).toBeNull();
  });

  it('si se borra la visita original, la nueva queda sin referencia', async () => {
    const tmp = await addItem('X', 'B', addDays(T, -1), 'skipped');
    const owner = await as('owner');
    const { data: nueva, error } = await owner
      .from('itinerary_items')
      .insert({ itinerary_day_id: await day(addDays(T, 2)), pool_id: P.B, sort_order: 995, rescheduled_from_item_id: tmp })
      .select('id')
      .single();
    expect(error).toBeNull();
    created.push(nueva!.id as string);
    await svc().from('itinerary_items').delete().eq('id', tmp);
    const { data } = await svc().from('itinerary_items').select('rescheduled_from_item_id').eq('id', nueva!.id).single();
    expect(data!.rescheduled_from_item_id).toBeNull();
  });
});
