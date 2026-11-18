import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
vi.mock('@/lib/supabase/server', async () => (await import('../support/session')).serverMock);
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));

import { randomUUID } from 'node:crypto';
import type { TestUserKey } from '../../e2e/support/env';
import {
  marcarPiletaAction, registrarServiceAction, editarRegistroAction, borrarRegistroAction, type RegistroData,
} from '@/app/employee/actions';
import { sumarmeAAutoAction, agregarAMiDiaAction } from '@/app/employee/campo-actions';
import { FIXTURE } from '../../e2e/support/seed';
import { addDays, todayInArgentina } from '@/lib/dates';
import { actAs, except, resetRevalidated, revalidated, type ActionResult } from '../support/session';
import { rand, svc, userIds } from '../support/clients';

const TODAY = todayInArgentina();
const LOCKED = 'Ese registro ya no se puede cambiar (es de otra persona o de hace más de 7 días)';
const VISIT_DONE = 'Esta visita ya está hecha: para corregirla, editá o borrá sus registros';

let ids: Record<TestUserKey, string>;
let item1: string; // pileta 1 (cliente 1), hoy
let item2: string; // pileta 2 (cliente 2), hoy
beforeAll(async () => {
  ids = await userIds();
  const day = (await svc().from('itinerary_days').select('id').eq('date', TODAY).single()).data!;
  const { data } = await svc().from('itinerary_items').select('id, pool_id').eq('itinerary_day_id', day.id);
  item1 = data!.find((i) => i.pool_id === FIXTURE.pools.pool1.id)!.id;
  item2 = data!.find((i) => i.pool_id === FIXTURE.pools.pool2.id)!.id;
});
beforeEach(() => resetRevalidated());

const createdDays: string[] = [];
const extraItems: string[] = [];
afterEach(async () => {
  const extra = extraItems.splice(0);
  await svc().from('service_logs').delete().in('itinerary_item_id', [item1, item2, ...extra]);
  if (extra.length) await svc().from('itinerary_items').delete().in('id', extra);
  await svc().from('itinerary_items').update({ status: 'pending', status_note: null, completed_by: null, completed_at: null, assigned_employee_id: null, service_type: 'service' }).in('id', [item1, item2]);
  for (const dayId of createdDays.splice(0)) {
    await svc().from('itinerary_items').delete().eq('itinerary_day_id', dayId);
    await svc().from('itinerary_days').delete().eq('id', dayId);
  }
});

/** Una visita a la pileta 2 en otra fecha (crea el día si no existe). */
async function visitOn(date: string) {
  const { data: existing } = await svc().from('itinerary_days').select('id').eq('date', date).maybeSingle();
  let dayId = existing?.id as string | undefined;
  if (!dayId) {
    dayId = (await svc().from('itinerary_days').insert({ date }).select('id').single()).data!.id as string;
    createdDays.push(dayId);
  }
  const itemId = (await svc().from('itinerary_items').insert({ itinerary_day_id: dayId, pool_id: FIXTURE.pools.pool2.id, sort_order: 5 }).select('id').single()).data!.id as string;
  extraItems.push(itemId);
  return itemId;
}

const state = async (id: string) => (await svc().from('itinerary_items').select('status, completed_by, completed_at').eq('id', id).single()).data!;
const logsOf = async (itemId: string) => (await svc().from('service_logs').select('*').eq('itinerary_item_id', itemId).order('created_at')).data ?? [];
const data = (over: Partial<RegistroData> = {}): RegistroData => ({ chlorineType: null, chlorineAmount: null, notes: rand('emp'), ...over });
const register = (itemId: string, over: Partial<RegistroData> = {}, requestId = randomUUID()) =>
  registrarServiceAction(itemId, requestId, data(over)) as Promise<ActionResult>;
const mark = (id: string, status: string) => marcarPiletaAction(id, status as 'skipped') as Promise<ActionResult>;

/** Un registro propio del empleado en la visita (lo crea con su sesión). */
async function ownLog(itemId = item2) {
  await actAs('employee');
  expect((await register(itemId)).success).toBe(true);
  return (await logsOf(itemId)).at(-1)!.id as string;
}

// ── Registrar el service ─────────────────────────────────────────────────────────────────────

describe('registrarServiceAction', () => {
  it('guarda el cloro en su unidad, cierra la visita y la fecha y el tipo los pone la base', async () => {
    await svc().from('itinerary_items').update({ service_type: 'desagote' }).eq('id', item2);
    await actAs('employee');
    const requestId = randomUUID();
    const r = await register(item2, { chlorineType: 'granulado', chlorineAmount: 300, notes: '  emp-agua cristalina  ' }, requestId);
    expect(r.success).toBe(true);

    const [log] = await logsOf(item2);
    expect(log).toMatchObject({
      employee_id: ids.employee, pool_id: FIXTURE.pools.pool2.id, client_id: ids.client2, date: TODAY,
      chlorine_applied: true, chlorine_type: 'granulado', chlorine_amount: 300, chlorine_unit: 'g',
      service_type: 'desagote', request_id: requestId, notes: 'emp-agua cristalina',
    });
    expect(await state(item2)).toMatchObject({ status: 'done', completed_by: ids.employee });
    expect(revalidated()).toEqual(expect.arrayContaining(['/employee/itinerario', `/employee/piletas/${item2}`]));
  });

  it.each([
    ['liquido', 2.5, 'l'], ['liquido', 500, 'l'], ['granulado', 50_000, 'g'], ['pastilla', 0.5, 'u'], ['pastilla', 100, 'u'],
  ] as const)('acepta %s %s (%s)', async (chlorineType, chlorineAmount, unit) => {
    await actAs('employee');
    expect((await register(item2, { chlorineType, chlorineAmount })).success).toBe(true);
    expect((await logsOf(item2))[0]).toMatchObject({ chlorine_type: chlorineType, chlorine_amount: chlorineAmount, chlorine_unit: unit });
  });

  it('el cloro es opcional, y con cloro la cantidad también (se puede no saber)', async () => {
    await actAs('employee');
    expect((await register(item2)).success).toBe(true);
    expect((await register(item2, { chlorineType: 'pastilla', chlorineAmount: null })).success).toBe(true);
    const [a, b] = await logsOf(item2);
    expect(a).toMatchObject({ chlorine_applied: false, chlorine_type: null, chlorine_amount: null });
    expect(b).toMatchObject({ chlorine_applied: true, chlorine_type: 'pastilla', chlorine_amount: null });
  });

  it('sin tipo de cloro ignora la cantidad que llegue de más', async () => {
    await actAs('employee');
    await register(item2, { chlorineType: null, chlorineAmount: 5 });
    expect((await logsOf(item2))[0]).toMatchObject({ chlorine_applied: false, chlorine_amount: null });
  });

  it.each([
    ['tipo inválido', { chlorineType: 'agua', chlorineAmount: 1 }, 'Tipo de cloro inválido'],
    ['litros en 0', { chlorineType: 'liquido', chlorineAmount: 0 }, 'Cantidad de cloro inválida'],
    ['litros negativos', { chlorineType: 'liquido', chlorineAmount: -2 }, 'Cantidad de cloro inválida'],
    ['más de 500 litros', { chlorineType: 'liquido', chlorineAmount: 501 }, 'Cantidad de cloro inválida'],
    ['gramos con decimales', { chlorineType: 'granulado', chlorineAmount: 0.5 }, 'Cantidad de cloro inválida'],
    ['más de 50.000 gramos', { chlorineType: 'granulado', chlorineAmount: 50_001 }, 'Cantidad de cloro inválida'],
    ['pastillas que no son de a media', { chlorineType: 'pastilla', chlorineAmount: 0.3 }, 'Cantidad de cloro inválida'],
    ['más de 100 pastillas', { chlorineType: 'pastilla', chlorineAmount: 101 }, 'Cantidad de cloro inválida'],
    ['cantidad NaN', { chlorineType: 'pastilla', chlorineAmount: Number.NaN }, 'Cantidad de cloro inválida'],
    ['cantidad infinita', { chlorineType: 'liquido', chlorineAmount: Infinity }, 'Cantidad de cloro inválida'],
  ])('rechaza: %s (y no deja registro ni cierra la visita)', async (_l, over, msg) => {
    await actAs('employee');
    const r = await register(item2, over as Partial<RegistroData>);
    expect(r.error).toBe(msg);
    expect(await logsOf(item2)).toEqual([]);
    expect((await state(item2)).status).toBe('pending');
  });

  it('REGRESIÓN: el mismo envío repetido (doble toque, reintento) guarda un solo registro', async () => {
    await actAs('employee');
    const requestId = randomUUID();
    const [a, b] = await Promise.all([register(item2, {}, requestId), register(item2, {}, requestId)]);
    expect([a.success, b.success]).toEqual([true, true]);
    expect((await register(item2, {}, requestId)).success).toBe(true);
    expect(await logsOf(item2)).toHaveLength(1);
  });

  it('dos registros distintos en la misma visita se guardan los dos (puede ir un segundo empleado)', async () => {
    await actAs('employee');
    await register(item2);
    await register(item2);
    expect(await logsOf(item2)).toHaveLength(2);
  });

  it('si otro la cerró antes, suma su registro sin pisar quién la cerró', async () => {
    await svc().from('itinerary_items').update({ status: 'done', completed_by: ids.admin, completed_at: new Date().toISOString() }).eq('id', item2);
    await actAs('employee');
    expect((await register(item2)).success).toBe(true);
    expect(await logsOf(item2)).toHaveLength(1);
    expect((await state(item2)).completed_by).toBe(ids.admin);
  });

  it('sobre una visita salteada la da por hecha', async () => {
    await actAs('employee');
    await mark(item2, 'skipped');
    expect((await register(item2)).success).toBe(true);
    expect((await state(item2)).status).toBe('done');
  });

  it('las notas se recortan a 1000 caracteres y las vacías quedan en null', async () => {
    await actAs('employee');
    await register(item2, { notes: 'emp-' + 'x'.repeat(2000) });
    await register(item2, { notes: '   ' });
    const [a, b] = await logsOf(item2);
    expect(a.notes).toHaveLength(1000);
    expect(b.notes).toBeNull();
  });

  it('una visita sin auto asignada a otra persona del equipo no se ve ni se puede registrar', async () => {
    await svc().from('itinerary_items').update({ assigned_employee_id: ids.owner }).eq('id', item2);
    await actAs('employee');
    expect((await register(item2)).error).toBe('Pileta no encontrada');
    expect(await logsOf(item2)).toEqual([]);
  });

  it('visitas de hasta 7 días atrás sí; de hace 8 días o futuras, no', async () => {
    await actAs('employee');
    expect((await register(await visitOn(addDays(TODAY, -7)))).success).toBe(true);
    expect((await register(await visitOn(addDays(TODAY, -8)))).error).toBe('Solo se pueden registrar visitas de los últimos 7 días');
    expect((await register(await visitOn(addDays(TODAY, 3)))).error).toBe('No se pueden registrar visitas de días que todavía no llegaron');
  });

  it.each([
    ['item no-uuid', 'no-uuid', randomUUID()],
    ['clave de envío no-uuid', 'ITEM', 'abc'],
    ['inyección', "1' or '1'='1", randomUUID()],
  ])('rechaza datos inválidos: %s', async (_l, item, requestId) => {
    await actAs('employee');
    const r = (await registrarServiceAction(item === 'ITEM' ? item2 : item, requestId, data())) as ActionResult;
    expect(r.error).toBe('Datos inválidos');
  });

  it('un item inexistente da "Pileta no encontrada"', async () => {
    await actAs('employee');
    expect((await register('00000000-0000-4000-8000-000000000000')).error).toBe('Pileta no encontrada');
  });

  it.each(except(['employee', 'owner', 'admin']))('%s NO puede registrar desde la pantalla del empleado', async (actor) => {
    await actAs(actor);
    expect((await register(item1)).error).toBeTruthy();
    expect(await logsOf(item1)).toEqual([]);
    expect(revalidated()).toEqual([]);
  });
});

// ── Editar y borrar registros ────────────────────────────────────────────────────────────────

describe('editarRegistroAction', () => {
  it('corrige el cloro y las observaciones de un registro propio, y queda en el historial', async () => {
    const id = await ownLog();
    const r = (await editarRegistroAction(id, { chlorineType: 'liquido', chlorineAmount: 3, notes: 'emp-corregido' })) as ActionResult;
    expect(r.success).toBe(true);
    const [log] = await logsOf(item2);
    expect(log).toMatchObject({ chlorine_applied: true, chlorine_type: 'liquido', chlorine_amount: 3, chlorine_unit: 'l', notes: 'emp-corregido' });
    const hist = (await svc().from('service_log_history').select('action, changed_by').eq('service_log_id', id).order('changed_at')).data!;
    expect(hist).toEqual([{ action: 'insert', changed_by: ids.employee }, { action: 'update', changed_by: ids.employee }]);
  });

  it('sacarle el cloro deja el registro sin cloro', async () => {
    const id = await ownLog();
    await editarRegistroAction(id, { chlorineType: 'pastilla', chlorineAmount: 2 });
    await editarRegistroAction(id, { chlorineType: null, chlorineAmount: 2 });
    expect((await logsOf(item2))[0]).toMatchObject({ chlorine_applied: false, chlorine_type: null, chlorine_amount: null });
  });

  it('valida la cantidad igual que al registrar', async () => {
    const id = await ownLog();
    expect(((await editarRegistroAction(id, { chlorineType: 'granulado', chlorineAmount: 1.5 })) as ActionResult).error).toBe('Cantidad de cloro inválida');
  });

  it('no puede corregir el registro de otra persona', async () => {
    const otro = (await svc().from('service_logs').insert({ itinerary_item_id: item2, employee_id: ids.admin, pool_id: FIXTURE.pools.pool2.id, client_id: ids.client2, notes: 'emp-de otro' }).select('id').single()).data!.id as string;
    await actAs('employee');
    expect(((await editarRegistroAction(otro, data({ notes: 'emp-pisado' }))) as ActionResult).error).toBe(LOCKED);
    expect((await logsOf(item2))[0].notes).toBe('emp-de otro');
  });

  it('no puede corregir un registro propio de hace más de 7 días', async () => {
    const old = await visitOn(addDays(TODAY, -9));
    const id = (await svc().from('service_logs').insert({ itinerary_item_id: old, employee_id: ids.employee, pool_id: FIXTURE.pools.pool2.id, client_id: ids.client2, date: addDays(TODAY, -9), notes: 'emp-viejo' }).select('id').single()).data!.id as string;
    await actAs('employee');
    expect(((await editarRegistroAction(id, data())) as ActionResult).error).toBe(LOCKED);
    expect(((await borrarRegistroAction(id)) as ActionResult).error).toBe(LOCKED);
    expect(await logsOf(old)).toHaveLength(1);
  });

  it.each(except(['employee', 'owner', 'admin']))('%s no puede usar la acción', async (actor) => {
    const id = await ownLog();
    await actAs(actor);
    expect(((await editarRegistroAction(id, data({ notes: 'emp-x' }))) as ActionResult).error).toBeTruthy();
  });

  it('rechaza un id inválido', async () => {
    await actAs('employee');
    expect(((await editarRegistroAction('nope', data())) as ActionResult).error).toBe('Datos inválidos');
  });
});

describe('borrarRegistroAction', () => {
  it('borrar el último registro vuelve la visita a pendiente', async () => {
    const id = await ownLog();
    expect((await state(item2)).status).toBe('done');
    expect(((await borrarRegistroAction(id)) as ActionResult).success).toBe(true);
    expect(await logsOf(item2)).toEqual([]);
    expect(await state(item2)).toMatchObject({ status: 'pending', completed_by: null });
  });

  it('si quedan otros registros, la visita sigue hecha', async () => {
    const a = await ownLog();
    await ownLog();
    await borrarRegistroAction(a);
    expect(await logsOf(item2)).toHaveLength(1);
    expect((await state(item2)).status).toBe('done');
  });

  it('no puede borrar el registro de otra persona', async () => {
    const otro = (await svc().from('service_logs').insert({ itinerary_item_id: item2, employee_id: ids.admin, pool_id: FIXTURE.pools.pool2.id, client_id: ids.client2, notes: 'emp-de otro' }).select('id').single()).data!.id as string;
    await actAs('employee');
    expect(((await borrarRegistroAction(otro)) as ActionResult).error).toBe(LOCKED);
    expect(await logsOf(item2)).toHaveLength(1);
  });

  it.each(except(['employee', 'owner', 'admin']))('%s no puede usar la acción', async (actor) => {
    const id = await ownLog();
    await actAs(actor);
    expect(((await borrarRegistroAction(id)) as ActionResult).error).toBeTruthy();
    expect(await logsOf(item2)).toHaveLength(1);
  });
});

// ── Salteada, no estaba, volver a pendiente ──────────────────────────────────────────────────

describe('marcarPiletaAction', () => {
  it.each(['skipped', 'no_client'] as const)('%s: deja la visita así, con quién y cuándo, sin crear registro', async (status) => {
    await actAs('employee');
    expect((await mark(item1, status)).success).toBe(true);
    expect(await state(item1)).toMatchObject({ status, completed_by: ids.employee });
    expect((await state(item1)).completed_at).not.toBeNull();
    expect(await logsOf(item1)).toEqual([]);
    expect(revalidated()).toContain('/employee/itinerario');
  });

  it('se puede corregir: de salteada a no estaba, y volver a pendiente', async () => {
    await actAs('employee');
    await mark(item1, 'skipped');
    expect((await mark(item1, 'no_client')).success).toBe(true);
    expect((await state(item1)).status).toBe('no_client');
    expect((await mark(item1, 'pending')).success).toBe(true);
    expect(await state(item1)).toMatchObject({ status: 'pending', completed_by: null, completed_at: null });
  });

  it('"No se pudo" con nota: guarda el motivo (recortado a 500); al volver a pendiente se borra', async () => {
    await actAs('employee');
    const note = async () => (await svc().from('itinerary_items').select('status_note').eq('id', item1).single()).data!.status_note;
    expect(((await marcarPiletaAction(item1, 'no_client', '  Portón cerrado ')) as ActionResult).success).toBe(true);
    expect(await note()).toBe('Portón cerrado');
    expect(((await marcarPiletaAction(item1, 'skipped', 'x'.repeat(800))) as ActionResult).success).toBe(true);
    expect(await note()).toHaveLength(500);
    expect(((await marcarPiletaAction(item1, 'skipped', '')) as ActionResult).success).toBe(true);
    expect(await note()).toBeNull();
    await marcarPiletaAction(item1, 'skipped', 'Llovía');
    expect(((await marcarPiletaAction(item1, 'pending', 'no queda')) as ActionResult).success).toBe(true);
    expect(await note()).toBeNull();
  });

  it('una nota que no es texto se rechaza', async () => {
    await actAs('employee');
    expect(((await marcarPiletaAction(item1, 'skipped', 42 as unknown as string)) as ActionResult).error).toBe('Datos inválidos');
    expect((await state(item1)).status).toBe('pending');
  });

  it('una visita hecha no se cambia por acá: se corrige editando o borrando sus registros', async () => {
    await svc().from('itinerary_items').update({ status: 'done', completed_by: ids.admin, completed_at: new Date().toISOString() }).eq('id', item1);
    await actAs('employee');
    for (const status of ['skipped', 'no_client', 'pending']) {
      const r = await mark(item1, status);
      expect(r.error, status).toBe(VISIT_DONE);
      expect(r.alreadyDone).toBe(true);
    }
    expect(await state(item1)).toMatchObject({ status: 'done', completed_by: ids.admin });
  });

  it('una visita de hace más de 7 días no se cambia', async () => {
    const old = await visitOn(addDays(TODAY, -8));
    await actAs('employee');
    expect((await mark(old, 'skipped')).error).toBe('Solo se puede marcar el estado de visitas de los últimos 7 días');
  });

  it('una visita sin auto asignada a otra persona del equipo no se toca', async () => {
    await svc().from('itinerary_items').update({ assigned_employee_id: ids.owner }).eq('id', item1);
    await actAs('employee');
    expect((await mark(item1, 'no_client')).error).toBe('Pileta no encontrada');
    expect((await state(item1)).status).toBe('pending');
  });

  it.each(except(['employee', 'owner', 'admin']))('%s NO puede marcar visitas desde la pantalla del empleado', async (actor) => {
    await actAs(actor);
    expect((await mark(item1, 'skipped')).error).toBeTruthy();
    expect((await state(item1)).status).toBe('pending');
  });

  it.each([['no-uuid'], [''], ["1' or '1'='1"]])('rechaza el id de item %j', async (id) => {
    await actAs('employee');
    expect((await mark(id, 'skipped')).error).toBe('Datos inválidos');
  });

  it.each([['done'], ['cancelled'], ['DONE'], ['']])('rechaza el estado %j ("hecha" se da registrando el service)', async (status) => {
    await actAs('employee');
    expect((await mark(item1, status)).error).toBe('Datos inválidos');
    expect((await state(item1)).status).toBe('pending');
  });
});

describe('visita con encargado ("Lo tiene que hacer X")', () => {
  const OTRO = 'Esta pileta le toca a otra persona: solo ella la puede marcar';
  let vehiculo: string;
  let dayId: string;
  beforeAll(async () => {
    vehiculo = (await svc().from('vehicles').insert({ name: rand('Auto encargado') }).select('id').single()).data!.id as string;
    dayId = (await svc().from('itinerary_days').select('id').eq('date', TODAY).single()).data!.id as string;
  });
  // La visita va en un auto donde va el empleado: la ve, pero si le toca a otro no la puede marcar
  beforeEach(async () => {
    await svc().from('itinerary_day_crews').upsert({ itinerary_day_id: dayId, vehicle_id: vehiculo, employee_id: ids.employee }, { onConflict: 'itinerary_day_id,employee_id' });
    await svc().from('itinerary_items').update({ vehicle_id: vehiculo }).eq('id', item1);
  });
  afterEach(async () => {
    await svc().from('itinerary_items').update({ vehicle_id: null, assigned_employee_id: null }).eq('id', item1);
    await svc().from('itinerary_day_crews').delete().eq('vehicle_id', vehiculo);
  });
  afterAll(async () => { await svc().from('vehicles').delete().eq('id', vehiculo); });

  it('si le toca a otro, el empleado no la puede registrar ni marcar, con un mensaje claro', async () => {
    expect((await svc().from('itinerary_items').update({ assigned_employee_id: ids.owner }).eq('id', item1)).error).toBeNull();
    await actAs('employee');
    expect(((await register(item1)) as ActionResult).error).toBe(OTRO);
    expect(await logsOf(item1)).toHaveLength(0);
    expect(((await marcarPiletaAction(item1, 'skipped')) as ActionResult).error).toBe(OTRO);
    expect((await state(item1)).status).toBe('pending');
  });

  it('si le toca a él, la registra como siempre', async () => {
    expect((await svc().from('itinerary_items').update({ assigned_employee_id: ids.employee }).eq('id', item1)).error).toBeNull();
    await actAs('employee');
    expect(((await register(item1)) as ActionResult).success).toBe(true);
    expect((await state(item1)).status).toBe('done');
  });
});

// ── Modo campo: el dueño usa la pantalla del empleado ─────────────────────────────────────────

describe('modo campo (dueño y súper admin)', () => {
  let auto: string;
  let poolExtra: string;
  beforeAll(async () => {
    auto = (await svc().from('vehicles').insert({ name: rand('Campo') }).select('id').single()).data!.id as string;
    poolExtra = (await svc().from('pools').insert({ client_id: ids.client, address: rand('Campo pileta') }).select('id').single()).data!.id as string;
  });
  afterAll(async () => {
    await svc().from('itinerary_items').delete().eq('pool_id', poolExtra);
    await svc().from('pools').delete().eq('id', poolExtra);
    await svc().from('itinerary_day_crews').delete().eq('vehicle_id', auto);
    await svc().from('vehicles').delete().eq('id', auto);
  });

  it.each(['owner', 'admin'] as const)('%s registra el service a su nombre y la visita queda hecha', async (actor) => {
    await actAs(actor);
    expect(((await register(item1)) as ActionResult).success).toBe(true);
    const [log] = await logsOf(item1);
    expect(log.employee_id).toBe(actor === 'owner' ? ids.owner : ids.admin);
    expect((await state(item1)).status).toBe('done');
  });

  it('el dueño saltea una visita y queda como quien la cerró; al volver a pendiente se limpia', async () => {
    await actAs('owner');
    expect((await mark(item1, 'skipped')).success).toBe(true);
    expect(await state(item1)).toMatchObject({ status: 'skipped', completed_by: ids.owner });
    expect((await state(item1)).completed_at).not.toBeNull();
    expect((await mark(item1, 'pending')).success).toBe(true);
    expect(await state(item1)).toMatchObject({ status: 'pending', completed_by: null, completed_at: null });
  });

  it('el dueño corrige y borra solo sus registros', async () => {
    await actAs('owner');
    await register(item1);
    const [log] = await logsOf(item1);
    expect(((await editarRegistroAction(log.id as string, data({ notes: 'campo-edit' }))) as ActionResult).success).toBe(true);
    expect(((await borrarRegistroAction(log.id as string)) as ActionResult).success).toBe(true);
    expect(await logsOf(item1)).toEqual([]);
  });

  it('se sube a un auto hoy y se baja', async () => {
    await actAs('owner');
    expect(((await sumarmeAAutoAction(auto)) as ActionResult).success).toBe(true);
    const day = (await svc().from('itinerary_days').select('id').eq('date', TODAY).single()).data!.id;
    const crew = async () => (await svc().from('itinerary_day_crews').select('vehicle_id').eq('itinerary_day_id', day).eq('employee_id', ids.owner).maybeSingle()).data;
    expect((await crew())?.vehicle_id).toBe(auto);
    expect(((await sumarmeAAutoAction(null)) as ActionResult).success).toBe(true);
    expect(await crew()).toBeNull();
  });

  it('agrega una pileta a su día: hoy, a su nombre, en el auto en el que va', async () => {
    await actAs('owner');
    await sumarmeAAutoAction(auto);
    const r = (await agregarAMiDiaAction([poolExtra], 'desagote')) as ActionResult;
    expect(r).toMatchObject({ success: true, count: 1, skipped: 0 });
    const { data: it } = await svc()
      .from('itinerary_items')
      .select('vehicle_id, assigned_employee_id, service_type, itinerary_days(date)')
      .eq('pool_id', poolExtra)
      .single();
    expect(it).toMatchObject({ vehicle_id: auto, assigned_employee_id: ids.owner, service_type: 'desagote', itinerary_days: { date: TODAY } });
    expect(((await agregarAMiDiaAction([poolExtra])) as ActionResult).error).toBe('Esas piletas ya están en el itinerario de hoy');
    await sumarmeAAutoAction(null);
  });

  it('rechaza datos inválidos', async () => {
    await actAs('owner');
    expect(((await agregarAMiDiaAction([])) as ActionResult).error).toBe('Datos inválidos');
    expect(((await agregarAMiDiaAction(['nope'])) as ActionResult).error).toBe('Datos inválidos');
    expect(((await sumarmeAAutoAction('nope')) as ActionResult).error).toBe('Datos inválidos');
  });

  it.each(except(['owner', 'admin']))('%s no puede usar las acciones del modo campo', async (actor) => {
    await actAs(actor);
    expect(((await sumarmeAAutoAction(auto)) as ActionResult).error).toBeTruthy();
    expect(((await agregarAMiDiaAction([poolExtra])) as ActionResult).error).toBeTruthy();
  });
});
