/**
 * Migración 26: visita con encargado ("Lo tiene que hacer X").
 *  - la visita sigue en la ruta del auto: todo el equipo del auto la ve
 *  - solo el encargado la registra o la marca (salteada / no estaba)
 *  - el encargado la ve aunque no vaya en ese auto
 *  - el encargado tiene que ser empleado o dueño (no un cliente, ni marketing)
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { TestUserKey } from '../../e2e/support/env';
import { as, svc, userIds } from '../support/clients';
import { addDays, todayInArgentina } from '@/lib/dates';

let ids: Record<TestUserKey, string>;
const FECHA = addDays(todayInArgentina(), -2); // dentro de los 7 días en que el empleado puede registrar
const pools: string[] = [];
const items: Record<string, string> = {};
let dayId: string;
let enAuto: string; // auto donde va el empleado
let otroAuto: string; // auto donde no va

beforeAll(async () => {
  ids = await userIds();
  // Piletas propias del test, para no chocar con otros datos de ese día
  const { data: ps, error: pe } = await svc()
    .from('pools')
    .insert(['A', 'B', 'C', 'D'].map((n) => ({ client_id: ids.client, address: `Encargado ${n} ${Date.now()}` })))
    .select('id');
  if (pe) throw pe;
  pools.push(...ps!.map((p) => p.id as string));

  const { data: vs, error: ve } = await svc()
    .from('vehicles')
    .insert([{ name: `Encargado en auto ${Date.now()}` }, { name: `Encargado otro auto ${Date.now()}` }])
    .select('id');
  if (ve) throw ve;
  [enAuto, otroAuto] = vs!.map((v) => v.id as string);

  dayId = (await svc().from('itinerary_days').upsert({ date: FECHA }, { onConflict: 'date' }).select('id').single()).data!.id as string;
  // El empleado va en "enAuto" ese día (si ya tenía otro auto ese día, se cambia: es un día pasado de prueba)
  const { error: ce } = await svc()
    .from('itinerary_day_crews')
    .upsert({ itinerary_day_id: dayId, vehicle_id: enAuto, employee_id: ids.employee }, { onConflict: 'itinerary_day_id,employee_id' });
  if (ce) throw ce;

  const { data: its, error } = await svc()
    .from('itinerary_items')
    .insert([
      // en su auto, le toca al dueño
      { itinerary_day_id: dayId, pool_id: pools[0], sort_order: 900, vehicle_id: enAuto, assigned_employee_id: ids.owner },
      // en otro auto, le toca al empleado
      { itinerary_day_id: dayId, pool_id: pools[1], sort_order: 901, vehicle_id: otroAuto, assigned_employee_id: ids.employee },
      // en su auto, sin encargado
      { itinerary_day_id: dayId, pool_id: pools[2], sort_order: 902, vehicle_id: enAuto },
      // sin auto, le toca al dueño
      { itinerary_day_id: dayId, pool_id: pools[3], sort_order: 903, vehicle_id: null, assigned_employee_id: ids.owner },
    ])
    .select('id, pool_id');
  if (error) throw error;
  for (const i of its!) items[pools.indexOf(i.pool_id as string)] = i.id as string;
});

afterAll(async () => {
  await svc().from('service_logs').delete().in('pool_id', pools);
  await svc().from('itinerary_items').delete().in('pool_id', pools);
  await svc().from('itinerary_day_crews').delete().eq('itinerary_day_id', dayId).eq('employee_id', ids.employee);
  await svc().from('pools').delete().in('id', pools);
  await svc().from('vehicles').delete().in('id', [enAuto, otroAuto]);
});

const registrar = async (idx: number) => {
  const emp = await as('employee');
  return emp.from('service_logs').insert({
    itinerary_item_id: items[idx], employee_id: ids.employee, pool_id: pools[idx], client_id: ids.client, request_id: crypto.randomUUID(),
  });
};

describe('ver la visita', () => {
  it('el equipo del auto ve la visita aunque le toque a otro; el encargado la ve aunque vaya en otro auto', async () => {
    const emp = await as('employee');
    const { data } = await emp.from('itinerary_items').select('id').in('id', Object.values(items));
    const vistas = new Set((data ?? []).map((d) => d.id as string));
    expect(vistas.has(items[0])).toBe(true); // su auto, le toca al dueño
    expect(vistas.has(items[1])).toBe(true); // otro auto, le toca a él
    expect(vistas.has(items[2])).toBe(true); // su auto, sin encargado
    expect(vistas.has(items[3])).toBe(false); // sin auto, le toca al dueño
  });
});

describe('registrar y marcar', () => {
  it('no puede registrar una visita que le toca a otro (RLS)', async () => {
    const { error } = await registrar(0);
    expect(error?.code).toBe('42501');
    const { count } = await svc().from('service_logs').select('*', { count: 'exact', head: true }).eq('itinerary_item_id', items[0]);
    expect(count).toBe(0);
  });

  it('no puede saltear ni marcar "no estaba" una visita que le toca a otro', async () => {
    const emp = await as('employee');
    const { data } = await emp.from('itinerary_items').update({ status: 'skipped' }).eq('id', items[0]).select('id');
    expect(data ?? []).toHaveLength(0);
    const { data: item } = await svc().from('itinerary_items').select('status').eq('id', items[0]).single();
    expect(item!.status).toBe('pending');
  });

  it('registra la que le toca a él aunque vaya en otro auto, y la visita queda hecha', async () => {
    expect((await registrar(1)).error).toBeNull();
    const { data: item } = await svc().from('itinerary_items').select('status').eq('id', items[1]).single();
    expect(item!.status).toBe('done');
  });

  it('sin encargado, cualquiera del auto la registra como siempre', async () => {
    expect((await registrar(2)).error).toBeNull();
  });

  it('el dueño la registra a nombre de cualquiera aunque tenga encargado', async () => {
    const owner = await as('owner');
    const { error } = await owner.from('service_logs').insert({
      itinerary_item_id: items[0], employee_id: ids.employee, pool_id: pools[0], client_id: ids.client, request_id: crypto.randomUUID(),
    });
    expect(error).toBeNull();
  });
});

describe('quién puede ser encargado', () => {
  it('el dueño asigna a un empleado o a sí mismo', async () => {
    const owner = await as('owner');
    expect((await owner.from('itinerary_items').update({ assigned_employee_id: ids.employee }).eq('id', items[3])).error).toBeNull();
    expect((await owner.from('itinerary_items').update({ assigned_employee_id: ids.owner }).eq('id', items[3])).error).toBeNull();
    expect((await owner.from('itinerary_items').update({ assigned_employee_id: null }).eq('id', items[3])).error).toBeNull();
  });

  it.each(['client', 'marketing', 'admin'] as const)('no se le puede asignar a %s', async (rol) => {
    const owner = await as('owner');
    const { error } = await owner.from('itinerary_items').update({ assigned_employee_id: ids[rol] }).eq('id', items[3]);
    expect(error?.code).toBe('23514');
  });

  it('el empleado no puede cambiar el encargado', async () => {
    const emp = await as('employee');
    const { error } = await emp.from('itinerary_items').update({ assigned_employee_id: ids.employee }).eq('id', items[2]);
    expect(error).not.toBeNull();
    const { data } = await svc().from('itinerary_items').select('assigned_employee_id').eq('id', items[2]).single();
    expect(data!.assigned_employee_id).toBeNull();
  });
});
