import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
vi.mock('@/lib/supabase/server', async () => (await import('../support/session')).serverMock);
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));

import { addPoolToItineraryAction, addPoolsToItineraryAction, copyLastWeekAction, removeItemFromItineraryAction, reorderItemAction, reorderItineraryAction, setItemAssigneeAction } from '@/app/admin/itinerario/actions';
import { FIXTURE } from '../../e2e/support/seed';
import { actAs, except, resetRevalidated, revalidated, type ActionResult } from '../support/session';
import { svc, uniqueDate, userIds, type Actor } from '../support/clients';

const OWNER_UP: Actor[] = ['owner', 'admin'];
const P1 = FIXTURE.pools.pool1.id;
const P2 = FIXTURE.pools.pool2.id;
const days: string[] = [];
beforeAll(() => undefined);
beforeEach(() => resetRevalidated());
afterEach(async () => { for (const d of days.splice(0)) await svc().from('itinerary_days').delete().eq('date', d); });

const date = () => { const d = uniqueDate(); days.push(d); return d; };
const itemsOf = async (fecha: string) => {
  const { data: day } = await svc().from('itinerary_days').select('id').eq('date', fecha).maybeSingle();
  if (!day) return null;
  const { data } = await svc().from('itinerary_items').select('id, pool_id, sort_order, status').eq('itinerary_day_id', day.id).order('sort_order');
  return data ?? [];
};
const seedDay = async (fecha: string, pools: string[]) => {
  days.push(fecha);
  const { data: day } = await svc().from('itinerary_days').insert({ date: fecha }).select('id').single();
  await svc().from('itinerary_items').insert(pools.map((pool_id, i) => ({ itinerary_day_id: day!.id, pool_id, sort_order: i })));
};

describe('addPoolToItineraryAction', () => {
  it.each(OWNER_UP)('%s agrega piletas: crea el día y ordena en secuencia', async (actor) => {
    await actAs(actor);
    const f = date();
    expect(((await addPoolToItineraryAction(f, P1)) as ActionResult).success).toBe(true);
    expect(((await addPoolToItineraryAction(f, P2)) as ActionResult).success).toBe(true);
    const items = await itemsOf(f);
    expect(items?.map((i) => [i.pool_id, i.sort_order, i.status])).toEqual([[P1, 0, 'pending'], [P2, 1, 'pending']]);
    expect(revalidated()).toEqual(expect.arrayContaining([`/admin/itinerario/${f}`, '/admin/itinerario']));
  });

  it('la misma pileta dos veces en el mismo día da un mensaje claro y no duplica', async () => {
    await actAs('owner');
    const f = date();
    await addPoolToItineraryAction(f, P1);
    const r = (await addPoolToItineraryAction(f, P1)) as ActionResult;
    expect(r.error).toBe('Esa pileta ya está en el itinerario de ese día');
    expect(await itemsOf(f)).toHaveLength(1);
  });

  it('agregar a un día que ya existe no crea un segundo día', async () => {
    await actAs('owner');
    const f = date();
    await addPoolToItineraryAction(f, P1);
    await addPoolToItineraryAction(f, P2);
    const { data } = await svc().from('itinerary_days').select('id').eq('date', f);
    expect(data).toHaveLength(1);
  });

  it.each(except(OWNER_UP))('%s NO puede armar el itinerario (ni se crea el día)', async (actor) => {
    await actAs(actor);
    const f = date();
    const r = (await addPoolToItineraryAction(f, P1)) as ActionResult;
    expect(r.error).toBeTruthy();
    expect(await itemsOf(f)).toBeNull();
  });

  it.each([['2026-02-30'], ['hoy'], ['2026-9-3'], ['']])('rechaza la fecha inválida %j', async (f) => {
    await actAs('owner');
    expect(((await addPoolToItineraryAction(f, P1)) as ActionResult).error).toBe('Datos inválidos');
    expect(await itemsOf(f)).toBeNull();
  });

  it('rechaza una pileta que no es UUID', async () => {
    await actAs('owner');
    const f = date();
    expect(((await addPoolToItineraryAction(f, "1' or '1'='1")) as ActionResult).error).toBe('Datos inválidos');
  });

  it('una pileta inexistente da error y no deja el día con basura', async () => {
    await actAs('owner');
    const f = date();
    const r = (await addPoolToItineraryAction(f, '00000000-0000-4000-8000-000000000000')) as ActionResult;
    expect(r.error).toBeTruthy();
    expect(await itemsOf(f)).toEqual([]);
  });
});

describe('removeItemFromItineraryAction', () => {
  it.each(OWNER_UP)('%s quita una pileta del día', async (actor) => {
    const f = date(); await seedDay(f, [P1, P2]);
    const [first] = (await itemsOf(f))!;
    await actAs(actor);
    expect(((await removeItemFromItineraryAction(first.id, f)) as ActionResult).success).toBe(true);
    expect((await itemsOf(f))!.map((i) => i.pool_id)).toEqual([P2]);
    expect(revalidated()).toContain(`/admin/itinerario/${f}`);
  });

  it.each(except(OWNER_UP))('%s NO puede quitar piletas', async (actor) => {
    const f = date(); await seedDay(f, [P1]);
    const [first] = (await itemsOf(f))!;
    await actAs(actor);
    expect(((await removeItemFromItineraryAction(first.id, f)) as ActionResult).error).toBeTruthy();
    expect(await itemsOf(f)).toHaveLength(1);
  });

  it.each([['no-uuid', '2040-01-01'], ['00000000-0000-4000-8000-000000000000', 'mañana']])('rechaza datos inválidos (%s, %s)', async (id, f) => {
    await actAs('owner');
    expect(((await removeItemFromItineraryAction(id, f)) as ActionResult).error).toBe('Datos inválidos');
  });
});

describe('reorderItemAction', () => {
  it.each(OWNER_UP)('%s reordena', async (actor) => {
    const f = date(); await seedDay(f, [P1, P2]);
    const items = (await itemsOf(f))!;
    await actAs(actor);
    expect(((await reorderItemAction(items[0].id, 7, f)) as ActionResult).success).toBe(true);
    expect((await itemsOf(f))!.map((i) => [i.pool_id, i.sort_order])).toEqual([[P2, 1], [P1, 7]]);
  });

  it.each(except(OWNER_UP))('%s NO puede reordenar', async (actor) => {
    const f = date(); await seedDay(f, [P1]);
    const [it] = (await itemsOf(f))!;
    await actAs(actor);
    expect(((await reorderItemAction(it.id, 9, f)) as ActionResult).error).toBeTruthy();
    expect((await itemsOf(f))![0].sort_order).toBe(0);
  });

  it.each([[1.5], [Number.NaN], [Infinity]])('rechaza el orden no entero %s', async (n) => {
    const f = date(); await seedDay(f, [P1]);
    const [it] = (await itemsOf(f))!;
    await actAs('owner');
    expect(((await reorderItemAction(it.id, n, f)) as ActionResult).error).toBe('Datos inválidos');
  });
});

describe('copyLastWeekAction', () => {
  it.each(OWNER_UP)('%s copia el itinerario de hace 7 días, con su orden', async (actor) => {
    const target = '2040-03-14', source = '2040-03-07';
    await seedDay(source, [P2, P1]);
    days.push(target);
    await actAs(actor);
    const r = (await copyLastWeekAction(target)) as ActionResult;
    expect(r.success).toBe(true);
    expect(r.count).toBe(2);
    expect((await itemsOf(target))!.map((i) => [i.pool_id, i.sort_order, i.status])).toEqual([[P2, 0, 'pending'], [P1, 1, 'pending']]);
    expect(revalidated()).toEqual(expect.arrayContaining([`/admin/itinerario/${target}`, '/admin/itinerario']));
  });

  it('copiar dos veces no duplica ni da error', async () => {
    await seedDay('2040-06-07', [P1, P2]); days.push('2040-06-14');
    await actAs('owner');
    expect(((await copyLastWeekAction('2040-06-14')) as ActionResult).success).toBe(true);
    expect(((await copyLastWeekAction('2040-06-14')) as ActionResult).success).toBe(true);
    expect(await itemsOf('2040-06-14')).toHaveLength(2);
  });

  it('si el día destino ya tiene una pileta, completa solo las que faltan', async () => {
    await seedDay('2040-07-07', [P1, P2]);
    await seedDay('2040-07-14', [P2]);
    await actAs('owner');
    expect(((await copyLastWeekAction('2040-07-14')) as ActionResult).success).toBe(true);
    expect((await itemsOf('2040-07-14'))!.map((i) => i.pool_id).sort()).toEqual([P1, P2].sort());
  });

  it('calcula bien "hace 7 días" cruzando el fin de mes (año bisiesto)', async () => {
    await seedDay('2040-02-25', [P1]); days.push('2040-03-03');
    await actAs('owner');
    expect(((await copyLastWeekAction('2040-03-03')) as ActionResult).success).toBe(true);
    expect((await itemsOf('2040-03-03'))!.map((i) => i.pool_id)).toEqual([P1]);
  });

  it('calcula bien "hace 7 días" cruzando el fin de año', async () => {
    await seedDay('2040-12-27', [P2]); days.push('2041-01-03');
    await actAs('owner');
    expect(((await copyLastWeekAction('2041-01-03')) as ActionResult).success).toBe(true);
    expect((await itemsOf('2041-01-03'))!.map((i) => i.pool_id)).toEqual([P2]);
  });

  it('sin itinerario de la semana anterior da un mensaje claro y no crea el día', async () => {
    await actAs('owner');
    const f = date();
    expect(((await copyLastWeekAction(f)) as ActionResult).error).toBe('No hay itinerario de la semana anterior para copiar');
    expect(await itemsOf(f)).toBeNull();
  });

  it('un día de la semana anterior sin piletas tampoco se copia', async () => {
    days.push('2040-08-07', '2040-08-14');
    await svc().from('itinerary_days').insert({ date: '2040-08-07' });
    await actAs('owner');
    expect(((await copyLastWeekAction('2040-08-14')) as ActionResult).error).toBe('No hay itinerario de la semana anterior para copiar');
  });

  it('copia siempre como pendiente, aunque la semana pasada estuvieran hechas', async () => {
    await seedDay('2040-09-07', [P1]);
    await svc().from('itinerary_items').update({ status: 'done' }).eq('pool_id', P1).in('itinerary_day_id', [(await svc().from('itinerary_days').select('id').eq('date', '2040-09-07').single()).data!.id]);
    days.push('2040-09-14');
    await actAs('owner');
    await copyLastWeekAction('2040-09-14');
    expect((await itemsOf('2040-09-14'))![0].status).toBe('pending');
  });

  it.each(except(OWNER_UP))('%s NO puede copiar', async (actor) => {
    await seedDay('2040-10-07', [P1]); days.push('2040-10-14');
    await actAs(actor);
    expect(((await copyLastWeekAction('2040-10-14')) as ActionResult).error).toBeTruthy();
    expect(await itemsOf('2040-10-14')).toBeNull();
  });

  it.each([['2040-02-31'], ['x'], ['']])('rechaza la fecha %j', async (f) => {
    await actAs('owner');
    expect(((await copyLastWeekAction(f)) as ActionResult).error).toBe('Fecha inválida');
  });
});

describe('removeItemFromItineraryAction · pileta con service registrado', () => {
  it('no se puede quitar si ya tiene un registro de service, y el mensaje es claro', async () => {
    const f = date();
    await seedDay(f, [P2]);
    const [item] = (await itemsOf(f))!;
    const ids = await userIds();
    await svc().from('service_logs').insert({ itinerary_item_id: item.id, employee_id: ids.employee, pool_id: P2, client_id: ids.client2 });
    await actAs('owner');
    const r = (await removeItemFromItineraryAction(item.id, f)) as ActionResult;
    expect(r.error).toBe('No se puede quitar: esta pileta ya tiene un service registrado');
    expect(await itemsOf(f)).toHaveLength(1);
    await svc().from('service_logs').delete().eq('itinerary_item_id', item.id);
  });
});

describe('reorderItineraryAction', () => {
  it.each(OWNER_UP)('%s fija el orden completo del día', async (actor) => {
    const f = date();
    await seedDay(f, [P1, P2]);
    const [a, b] = (await itemsOf(f))!;
    await actAs(actor);
    expect(((await reorderItineraryAction(f, [b.id, a.id])) as ActionResult).success).toBe(true);
    expect((await itemsOf(f))!.map((i) => i.id)).toEqual([b.id, a.id]);
    expect(revalidated()).toContain(`/admin/itinerario/${f}`);
  });

  it.each(except(OWNER_UP))('%s NO puede reordenar', async (actor) => {
    const f = date();
    await seedDay(f, [P1, P2]);
    const [a, b] = (await itemsOf(f))!;
    await actAs(actor);
    expect(((await reorderItineraryAction(f, [b.id, a.id])) as ActionResult).error).toBeTruthy();
    expect((await itemsOf(f))!.map((i) => i.id)).toEqual([a.id, b.id]);
  });

  it('no toca items de otro día', async () => {
    const f1 = date(), f2 = date();
    await seedDay(f1, [P1]);
    await seedDay(f2, [P1, P2]);
    const [other] = (await itemsOf(f2))!;
    const [mine] = (await itemsOf(f1))!;
    await actAs('owner');
    await reorderItineraryAction(f1, [mine.id, other.id]);
    expect((await itemsOf(f2))![0].sort_order).toBe(0);
  });

  it.each([
    ['fecha inválida', 'ayer', ['00000000-0000-4000-8000-000000000001']],
    ['lista vacía', '2040-01-01', []],
    ['id que no es uuid', '2040-01-01', ['x']],
    ['ids repetidos', '2040-01-01', ['00000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000001']],
  ])('rechaza: %s', async (_l, fecha, orderedIds) => {
    await actAs('owner');
    expect(((await reorderItineraryAction(fecha, orderedIds)) as ActionResult).error).toBe('Datos inválidos');
  });

  it('un día inexistente da error', async () => {
    await actAs('owner');
    expect(((await reorderItineraryAction('2041-05-05', ['00000000-0000-4000-8000-000000000001'])) as ActionResult).error).toBe('Itinerario no encontrado');
  });
});

describe('addPoolsToItineraryAction · varias piletas de una vez a un auto', () => {
  it.each(OWNER_UP)('%s agrega varias en el orden elegido, al final de la ruta, con el tipo elegido', async (actor) => {
    await actAs(actor);
    const f = date();
    await addPoolToItineraryAction(f, P1);
    const r = (await addPoolsToItineraryAction(f, [P2], { vehicleId: null, serviceType: 'desagote' })) as ActionResult;
    expect(r).toMatchObject({ success: true, count: 1, skipped: 0 });
    const { data: day } = await svc().from('itinerary_days').select('id').eq('date', f).single();
    const { data } = await svc().from('itinerary_items').select('pool_id, sort_order, service_type, vehicle_id').eq('itinerary_day_id', day!.id).order('sort_order');
    expect(data).toEqual([
      { pool_id: P1, sort_order: 0, service_type: 'service', vehicle_id: null },
      { pool_id: P2, sort_order: 1, service_type: 'desagote', vehicle_id: null },
    ]);
    expect(revalidated()).toEqual(expect.arrayContaining([`/admin/itinerario/${f}`, '/admin/itinerario']));
  });

  it('saltea las que ya estaban; si estaban todas, avisa', async () => {
    await actAs('owner');
    const f = date();
    await addPoolToItineraryAction(f, P1);
    expect(await addPoolsToItineraryAction(f, [P1, P2])).toMatchObject({ success: true, count: 1, skipped: 1 });
    expect(((await addPoolsToItineraryAction(f, [P1, P2])) as ActionResult).error).toBe('Esas piletas ya están en el itinerario de ese día');
  });

  it('rechaza listas vacías, repetidas, ids inválidos y tipos raros', async () => {
    await actAs('owner');
    const f = date();
    for (const bad of [[], [P1, P1], ['no-es-uuid']]) expect(((await addPoolsToItineraryAction(f, bad)) as ActionResult).error).toBe('Datos inválidos');
    expect(((await addPoolsToItineraryAction(f, [P1], { serviceType: 'pintura' as never })) as ActionResult).error).toBe('Datos inválidos');
  });

  it.each(except(OWNER_UP))('%s no puede armar el itinerario', async (actor) => {
    await actAs(actor);
    const f = date();
    expect(((await addPoolsToItineraryAction(f, [P1])) as ActionResult).error).toBeTruthy();
    expect(await itemsOf(f)).toBeNull();
  });
});

describe('setItemAssigneeAction · "Lo tiene que hacer"', () => {
  it.each(OWNER_UP)('%s asigna un encargado y lo vuelve a "cualquiera del auto"', async (actor) => {
    const ids = await userIds();
    await actAs(actor);
    const f = date();
    await addPoolToItineraryAction(f, P1);
    const [item] = (await itemsOf(f))!;
    expect(((await setItemAssigneeAction(item.id as string, ids.employee, f)) as ActionResult).success).toBe(true);
    expect((await svc().from('itinerary_items').select('assigned_employee_id').eq('id', item.id).single()).data!.assigned_employee_id).toBe(ids.employee);
    expect(((await setItemAssigneeAction(item.id as string, null, f)) as ActionResult).success).toBe(true);
    expect((await svc().from('itinerary_items').select('assigned_employee_id').eq('id', item.id).single()).data!.assigned_employee_id).toBeNull();
  });

  it('a un cliente no se le puede asignar: mensaje claro', async () => {
    const ids = await userIds();
    await actAs('owner');
    const f = date();
    await addPoolToItineraryAction(f, P1);
    const [item] = (await itemsOf(f))!;
    expect(((await setItemAssigneeAction(item.id as string, ids.client, f)) as ActionResult).error)
      .toBe('La visita solo se le puede asignar a alguien del equipo (empleado o dueño)');
  });

  it('una visita que no existe o datos inválidos', async () => {
    await actAs('owner');
    expect(((await setItemAssigneeAction('00000000-0000-4000-8000-000000000999', null, '2026-01-01')) as ActionResult).error).toBe('Visita no encontrada');
    expect(((await setItemAssigneeAction('x', null, '2026-01-01')) as ActionResult).error).toBe('Datos inválidos');
  });

  it.each(except(OWNER_UP))('%s no puede asignar encargados', async (actor) => {
    const ids = await userIds();
    await actAs('owner');
    const f = date();
    await addPoolToItineraryAction(f, P1);
    const [item] = (await itemsOf(f))!;
    await actAs(actor);
    expect(((await setItemAssigneeAction(item.id as string, ids.employee, f)) as ActionResult).error).toBeTruthy();
    expect((await svc().from('itinerary_items').select('assigned_employee_id').eq('id', item.id).single()).data!.assigned_employee_id).toBeNull();
  });
});
