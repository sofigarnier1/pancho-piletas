// Etapa 3a: autos, equipos por día y auto/tipo de cada visita desde el itinerario del dueño
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
vi.mock('@/lib/supabase/server', async () => (await import('../support/session')).serverMock);
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));

import {
  addPoolToItineraryAction,
  assignCrewAction,
  copyLastWeekAction,
  removeCrewAction,
  setItemServiceTypeAction,
  setItemVehicleAction,
} from '@/app/admin/itinerario/actions';
import { createVehicleAction, setVehicleActiveAction, updateVehicleAction } from '@/app/admin/itinerario/autos/actions';
import { FIXTURE } from '../../e2e/support/seed';
import { actAs, except, resetRevalidated, revalidated, type ActionResult } from '../support/session';
import { rand, svc, userIds, type Actor } from '../support/clients';

const OWNER_UP: Actor[] = ['owner', 'admin'];
const P1 = FIXTURE.pools.pool1.id;
const P2 = FIXTURE.pools.pool2.id;
const BAD = '00000000-0000-4000-8000-000000000000';

let n = 0;
const days: string[] = [];
const date = () => {
  const d = new Date(Date.UTC(2042, 0, 1 + n++)).toISOString().slice(0, 10);
  days.push(d);
  return d;
};
const vehiclesToClean: string[] = [];
let carA: string;
let carB: string;
let ids: Awaited<ReturnType<typeof userIds>>;

const newCar = async (name = rand('Auto')) => {
  const { data } = await svc().from('vehicles').insert({ name }).select('id').single();
  vehiclesToClean.push(data!.id);
  return data!.id as string;
};
const dayId = async (fecha: string) => (await svc().from('itinerary_days').select('id').eq('date', fecha).maybeSingle()).data?.id as string | undefined;
const itemsOf = async (fecha: string) => {
  const id = await dayId(fecha);
  if (!id) return null;
  const { data } = await svc()
    .from('itinerary_items')
    .select('id, pool_id, sort_order, vehicle_id, service_type')
    .eq('itinerary_day_id', id)
    .order('sort_order');
  return data ?? [];
};
const crewsOf = async (fecha: string) => {
  const id = await dayId(fecha);
  if (!id) return null;
  const { data } = await svc().from('itinerary_day_crews').select('id, vehicle_id, employee_id').eq('itinerary_day_id', id);
  return data ?? [];
};

beforeAll(async () => {
  ids = await userIds();
  carA = await newCar();
  carB = await newCar();
});
beforeEach(() => resetRevalidated());
afterEach(async () => {
  for (const d of days.splice(0)) await svc().from('itinerary_days').delete().eq('date', d);
});
afterAll(async () => {
  await svc().from('vehicles').delete().in('id', vehiclesToClean);
});

describe('addPoolToItineraryAction · auto y tipo de visita', () => {
  it('guarda el auto y el tipo elegidos', async () => {
    await actAs('owner');
    const f = date();
    expect(((await addPoolToItineraryAction(f, P1, { vehicleId: carA, serviceType: 'desagote' })) as ActionResult).success).toBe(true);
    expect(await itemsOf(f)).toEqual([expect.objectContaining({ pool_id: P1, vehicle_id: carA, service_type: 'desagote' })]);
  });

  it('sin opciones: sin auto y service (como antes)', async () => {
    await actAs('owner');
    const f = date();
    await addPoolToItineraryAction(f, P1);
    expect(await itemsOf(f)).toEqual([expect.objectContaining({ vehicle_id: null, service_type: 'service' })]);
  });

  it.each([
    ['auto que no es uuid', { vehicleId: 'x' }],
    ['tipo desconocido', { serviceType: 'pintura' }],
  ])('rechaza %s', async (_l, opts) => {
    await actAs('owner');
    const f = date();
    expect(((await addPoolToItineraryAction(f, P1, opts as never)) as ActionResult).error).toBe('Datos inválidos');
    expect(await itemsOf(f)).toBeNull();
  });

  it('un auto inexistente da un mensaje claro', async () => {
    await actAs('owner');
    const f = date();
    expect(((await addPoolToItineraryAction(f, P1, { vehicleId: BAD })) as ActionResult).error).toBe('Auto no encontrado');
  });
});

describe('setItemVehicleAction', () => {
  it.each(OWNER_UP)('%s pasa una visita a otro auto y queda última en su ruta', async (actor) => {
    await actAs('owner');
    const f = date();
    await addPoolToItineraryAction(f, P1, { vehicleId: carA });
    await addPoolToItineraryAction(f, P2, { vehicleId: carB });
    const [first] = (await itemsOf(f))!;
    await actAs(actor);
    expect(((await setItemVehicleAction(first.id, carB, f)) as ActionResult).success).toBe(true);
    const items = (await itemsOf(f))!;
    expect(items.map((i) => [i.pool_id, i.vehicle_id])).toEqual([[P2, carB], [P1, carB]]);
    expect(revalidated()).toContain(`/admin/itinerario/${f}`);
  });

  it('null la deja sin auto', async () => {
    await actAs('owner');
    const f = date();
    await addPoolToItineraryAction(f, P1, { vehicleId: carA });
    const [it] = (await itemsOf(f))!;
    expect(((await setItemVehicleAction(it.id, null, f)) as ActionResult).success).toBe(true);
    expect((await itemsOf(f))![0].vehicle_id).toBeNull();
  });

  it.each(except(OWNER_UP))('%s NO puede cambiar el auto de una visita', async (actor) => {
    await actAs('owner');
    const f = date();
    await addPoolToItineraryAction(f, P1, { vehicleId: carA });
    const [it] = (await itemsOf(f))!;
    await actAs(actor);
    expect(((await setItemVehicleAction(it.id, carB, f)) as ActionResult).error).toBeTruthy();
    expect((await itemsOf(f))![0].vehicle_id).toBe(carA);
  });

  it('visita inexistente y auto inexistente dan mensajes claros', async () => {
    await actAs('owner');
    const f = date();
    await addPoolToItineraryAction(f, P1);
    const [it] = (await itemsOf(f))!;
    expect(((await setItemVehicleAction(BAD, carA, f)) as ActionResult).error).toBe('Visita no encontrada');
    expect(((await setItemVehicleAction(it.id, BAD, f)) as ActionResult).error).toBe('Auto no encontrado');
    expect(((await setItemVehicleAction('x', carA, f)) as ActionResult).error).toBe('Datos inválidos');
  });
});

describe('setItemServiceTypeAction', () => {
  it.each(OWNER_UP)('%s cambia service por desagote y los registros lo acompañan', async (actor) => {
    await actAs('owner');
    const f = '2026-01-15'; // pasado: admite un registro
    days.push(f);
    await addPoolToItineraryAction(f, P2);
    const [it] = (await itemsOf(f))!;
    const { data: log } = await svc()
      .from('service_logs')
      .insert({ itinerary_item_id: it.id, employee_id: ids.employee, pool_id: P2, client_id: ids.client2 })
      .select('id')
      .single();
    await actAs(actor);
    expect(((await setItemServiceTypeAction(it.id, 'desagote', f)) as ActionResult).success).toBe(true);
    expect((await itemsOf(f))![0].service_type).toBe('desagote');
    const { data: after } = await svc().from('service_logs').select('service_type').eq('id', log!.id).single();
    expect(after!.service_type).toBe('desagote');
    await svc().from('service_logs').delete().eq('id', log!.id);
  });

  it.each(except(OWNER_UP))('%s NO puede cambiar el tipo', async (actor) => {
    await actAs('owner');
    const f = date();
    await addPoolToItineraryAction(f, P1);
    const [it] = (await itemsOf(f))!;
    await actAs(actor);
    expect(((await setItemServiceTypeAction(it.id, 'desagote', f)) as ActionResult).error).toBeTruthy();
    expect((await itemsOf(f))![0].service_type).toBe('service');
  });

  it('rechaza un tipo desconocido y una visita inexistente', async () => {
    await actAs('owner');
    const f = date();
    expect(((await setItemServiceTypeAction(BAD, 'pintura' as never, f)) as ActionResult).error).toBe('Datos inválidos');
    expect(((await setItemServiceTypeAction(BAD, 'desagote', f)) as ActionResult).error).toBe('Visita no encontrada');
  });
});

describe('assignCrewAction / removeCrewAction', () => {
  it.each(OWNER_UP)('%s sube gente a un auto (crea el día) y la puede cambiar de auto', async (actor) => {
    await actAs(actor);
    const f = date();
    expect(((await assignCrewAction(f, carA, ids.employee)) as ActionResult).success).toBe(true);
    expect(((await assignCrewAction(f, carA, ids.owner)) as ActionResult).success).toBe(true);
    expect((await crewsOf(f))!.map((c) => [c.vehicle_id, c.employee_id]).sort()).toEqual([[carA, ids.employee], [carA, ids.owner]].sort());

    // Una persona va en un solo auto por día: pasarla a otro la cambia, no la duplica
    expect(((await assignCrewAction(f, carB, ids.employee)) as ActionResult).success).toBe(true);
    const crews = (await crewsOf(f))!;
    expect(crews).toHaveLength(2);
    expect(crews.find((c) => c.employee_id === ids.employee)!.vehicle_id).toBe(carB);
    expect(revalidated()).toContain(`/admin/itinerario/${f}`);
  });

  it('un cliente o alguien de marketing no puede ir en un auto', async () => {
    await actAs('owner');
    const f = date();
    expect(((await assignCrewAction(f, carA, ids.client)) as ActionResult).error).toBe('En un auto solo puede ir alguien del equipo');
    expect(((await assignCrewAction(f, carA, ids.marketing)) as ActionResult).error).toBe('En un auto solo puede ir alguien del equipo');
    expect(await crewsOf(f)).toEqual([]);
  });

  it('auto inexistente y datos inválidos', async () => {
    await actAs('owner');
    const f = date();
    expect(((await assignCrewAction(f, BAD, ids.employee)) as ActionResult).error).toBe('Auto no encontrado');
    expect(((await assignCrewAction('mañana', carA, ids.employee)) as ActionResult).error).toBe('Datos inválidos');
    expect(((await assignCrewAction(f, carA, 'x')) as ActionResult).error).toBe('Datos inválidos');
  });

  it.each(except(OWNER_UP))('%s NO puede armar los equipos', async (actor) => {
    await actAs(actor);
    const f = date();
    expect(((await assignCrewAction(f, carA, ids.employee)) as ActionResult).error).toBeTruthy();
    expect(await crewsOf(f)).toBeNull();
  });

  it.each(OWNER_UP)('%s baja a alguien del auto; repetirlo avisa', async (actor) => {
    await actAs('owner');
    const f = date();
    await assignCrewAction(f, carA, ids.employee);
    const [crew] = (await crewsOf(f))!;
    await actAs(actor);
    expect(((await removeCrewAction(crew.id, f)) as ActionResult).success).toBe(true);
    expect(await crewsOf(f)).toEqual([]);
    expect(((await removeCrewAction(crew.id, f)) as ActionResult).error).toBe('Esa persona ya no estaba en el auto');
  });

  it.each(except(OWNER_UP))('%s NO puede bajar a nadie del auto', async (actor) => {
    await actAs('owner');
    const f = date();
    await assignCrewAction(f, carA, ids.employee);
    const [crew] = (await crewsOf(f))!;
    await actAs(actor);
    expect(((await removeCrewAction(crew.id, f)) as ActionResult).error).toBeTruthy();
    expect(await crewsOf(f)).toHaveLength(1);
  });

  it('removeCrewAction rechaza datos inválidos', async () => {
    await actAs('owner');
    expect(((await removeCrewAction('x', '2042-01-01')) as ActionResult).error).toBe('Datos inválidos');
  });
});

describe('copyLastWeekAction · autos, tipos y equipos', () => {
  it('copia el auto y el tipo de cada visita y el equipo de cada auto', async () => {
    const source = '2042-06-03', target = '2042-06-10';
    days.push(source, target);
    await actAs('owner');
    await addPoolToItineraryAction(source, P1, { vehicleId: carA, serviceType: 'desagote' });
    await addPoolToItineraryAction(source, P2, { vehicleId: carB });
    await assignCrewAction(source, carA, ids.employee);
    await assignCrewAction(source, carB, ids.owner);

    const r = (await copyLastWeekAction(target)) as ActionResult;
    expect(r.success).toBe(true);
    expect(r.count).toBe(2);
    expect((await itemsOf(target))!.map((i) => [i.pool_id, i.vehicle_id, i.service_type])).toEqual([
      [P1, carA, 'desagote'],
      [P2, carB, 'service'],
    ]);
    expect((await crewsOf(target))!.map((c) => [c.vehicle_id, c.employee_id]).sort()).toEqual([[carA, ids.employee], [carB, ids.owner]].sort());
  });

  it('quien ya tiene auto en el día destino lo conserva, y repetir la copia no duplica', async () => {
    const source = '2042-07-01', target = '2042-07-08';
    days.push(source, target);
    await actAs('owner');
    await addPoolToItineraryAction(source, P1, { vehicleId: carA });
    await assignCrewAction(source, carA, ids.employee);
    await assignCrewAction(target, carB, ids.employee);

    await copyLastWeekAction(target);
    await copyLastWeekAction(target);
    expect((await crewsOf(target))!.map((c) => [c.vehicle_id, c.employee_id])).toEqual([[carB, ids.employee]]);
  });
});

describe('autos: createVehicleAction / updateVehicleAction / setVehicleActiveAction', () => {
  const byName = async (name: string) => {
    const { data } = await svc().from('vehicles').select('id, name, plate, is_active').eq('name', name).maybeSingle();
    if (data) vehiclesToClean.push(data.id);
    return data;
  };

  it.each(OWNER_UP)('%s carga un auto (patente en mayúsculas)', async (actor) => {
    await actAs(actor);
    const name = rand('Fiorino');
    expect(((await createVehicleAction({ name: `  ${name} `, plate: 'ab 123 cd' })) as ActionResult).success).toBe(true);
    expect(await byName(name)).toMatchObject({ name, plate: 'AB 123 CD', is_active: true });
    expect(revalidated()).toContain('/admin/itinerario/autos');
  });

  it('no se repite el nombre (sin importar mayúsculas)', async () => {
    await actAs('owner');
    const name = rand('Kangoo');
    await createVehicleAction({ name });
    await byName(name);
    expect(((await createVehicleAction({ name: name.toUpperCase() })) as ActionResult).error).toBe('Ya hay un auto con ese nombre');
  });

  it.each([[''], ['   '], ['x'.repeat(61)]])('rechaza el nombre %j', async (name) => {
    await actAs('owner');
    expect(((await createVehicleAction({ name })) as ActionResult).error).toBe('Escribí el nombre del auto (hasta 60 letras)');
  });

  it.each(except(OWNER_UP))('%s NO puede cargar autos', async (actor) => {
    await actAs(actor);
    const name = rand('Prohibido');
    expect(((await createVehicleAction({ name })) as ActionResult).error).toBeTruthy();
    expect(await byName(name)).toBeNull();
  });

  it('el dueño renombra un auto y le saca la patente', async () => {
    const id = await newCar();
    await svc().from('vehicles').update({ plate: 'AAA111' }).eq('id', id);
    await actAs('owner');
    const name = rand('Renombrado');
    expect(((await updateVehicleAction(id, { name, plate: '' })) as ActionResult).success).toBe(true);
    const { data } = await svc().from('vehicles').select('name, plate').eq('id', id).single();
    expect(data).toEqual({ name, plate: null });
  });

  it('renombrar con un nombre que ya existe avisa; auto inexistente y datos inválidos también', async () => {
    const id = await newCar();
    const { data: other } = await svc().from('vehicles').select('name').eq('id', carA).single();
    await actAs('owner');
    expect(((await updateVehicleAction(id, { name: other!.name })) as ActionResult).error).toBe('Ya hay un auto con ese nombre');
    expect(((await updateVehicleAction(BAD, { name: 'Nada' })) as ActionResult).error).toBe('Auto no encontrado');
    expect(((await updateVehicleAction('x', { name: 'Nada' })) as ActionResult).error).toBe('Datos inválidos');
  });

  it.each(except(OWNER_UP))('%s NO puede renombrar ni desactivar autos', async (actor) => {
    const id = await newCar('Intocable ' + rand(''));
    await actAs(actor);
    expect(((await updateVehicleAction(id, { name: 'Cambiado' })) as ActionResult).error).toBeTruthy();
    expect(((await setVehicleActiveAction(id, false)) as ActionResult).error).toBeTruthy();
    const { data } = await svc().from('vehicles').select('name, is_active').eq('id', id).single();
    expect(data!.is_active).toBe(true);
    expect(data!.name).toMatch(/^Intocable/);
  });

  it('el dueño desactiva y vuelve a activar un auto', async () => {
    const id = await newCar();
    await actAs('owner');
    expect(((await setVehicleActiveAction(id, false)) as ActionResult).success).toBe(true);
    expect((await svc().from('vehicles').select('is_active').eq('id', id).single()).data!.is_active).toBe(false);
    expect(((await setVehicleActiveAction(id, true)) as ActionResult).success).toBe(true);
    expect((await svc().from('vehicles').select('is_active').eq('id', id).single()).data!.is_active).toBe(true);
    expect(((await setVehicleActiveAction(BAD, true)) as ActionResult).error).toBe('Auto no encontrado');
    expect(((await setVehicleActiveAction(id, 'no' as never)) as ActionResult).error).toBe('Datos inválidos');
  });
});
