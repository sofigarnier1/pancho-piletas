// Etapa 3b: el dueño registra, corrige y borra visitas desde /admin (cualquier fecha pasada, a nombre de alguien del equipo)
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
vi.mock('@/lib/supabase/server', async () => (await import('../support/session')).serverMock);
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));

import {
  borrarRegistroDuenoAction,
  editarRegistroDuenoAction,
  marcarVisitaDuenoAction,
  registrarVisitaDuenoAction,
} from '@/app/admin/itinerario/visita/actions';
import { FIXTURE } from '../../e2e/support/seed';
import { actAs, except, resetRevalidated, revalidated, type ActionResult } from '../support/session';
import { svc, userIds, type Actor } from '../support/clients';
import { addDays, todayInArgentina } from '@/lib/dates';

const OWNER_UP: Actor[] = ['owner', 'admin'];
const P2 = FIXTURE.pools.pool2.id; // pileta de client2
const BAD = '00000000-0000-4000-8000-000000000000';
const SIN_CLORO = { chlorineType: null, chlorineAmount: null };
const FUTURE = 'No se pueden registrar visitas de días que todavía no llegaron';

let ids: Awaited<ReturnType<typeof userIds>>;
let n = 0;
const days: string[] = [];
const uuid = () => crypto.randomUUID();

const items: string[] = [];
const pools: string[] = [];

/** Una visita a P2 en un día pasado de 2025 (nunca choca con otros tests) o en la fecha pedida.
 *  Si el día ya existe (por ejemplo hoy, que tiene visitas del seed), se reutiliza y solo se borra lo creado acá. */
async function visita(fecha = new Date(Date.UTC(2025, 0, 1 + n++)).toISOString().slice(0, 10)) {
  let { data: day } = await svc().from('itinerary_days').select('id').eq('date', fecha).maybeSingle();
  if (!day) {
    day = (await svc().from('itinerary_days').insert({ date: fecha }).select('id').single()).data;
    days.push(fecha);
  }
  // Si el día ya existía (hoy tiene a P2 en el seed), la visita es a una pileta temporal de client2
  let pool: string = P2;
  if (!days.includes(fecha)) {
    const { data: tmp } = await svc().from('pools').insert({ client_id: ids.client2, address: 'Pileta temporal de test' }).select('id').single();
    pool = tmp!.id as string;
    pools.push(pool);
  }
  const { data: item, error } = await svc().from('itinerary_items').insert({ itinerary_day_id: day!.id, pool_id: pool, sort_order: 99 }).select('id').single();
  if (error) throw error;
  items.push(item!.id as string);
  return { itemId: item!.id as string, fecha };
}
const logsOf = async (itemId: string) =>
  (await svc().from('service_logs').select('id, employee_id, chlorine_type, chlorine_amount, notes, date').eq('itinerary_item_id', itemId).order('created_at')).data ?? [];
const itemOf = async (itemId: string) =>
  (await svc().from('itinerary_items').select('status, completed_by, completed_at').eq('id', itemId).single()).data!;

beforeAll(async () => {
  ids = await userIds();
});
beforeEach(() => resetRevalidated());
afterEach(async () => {
  const mine = items.splice(0);
  if (mine.length) {
    await svc().from('service_logs').delete().in('itinerary_item_id', mine);
    await svc().from('itinerary_items').delete().in('id', mine);
  }
  for (const d of days.splice(0)) await svc().from('itinerary_days').delete().eq('date', d);
  for (const p of pools.splice(0)) await svc().from('pools').delete().eq('id', p);
});

describe('registrarVisitaDuenoAction', () => {
  it.each(OWNER_UP)('%s registra a nombre de un empleado: la visita queda hecha por él y el historial dice quién lo cargó', async (actor) => {
    const { itemId, fecha } = await visita();
    await actAs(actor);
    const r = (await registrarVisitaDuenoAction(itemId, uuid(), ids.employee, { chlorineType: 'pastilla', chlorineAmount: 1.5, notes: ' agua verde ' })) as ActionResult;
    expect(r.success).toBe(true);

    const [log] = await logsOf(itemId);
    expect(log).toMatchObject({ employee_id: ids.employee, chlorine_type: 'pastilla', notes: 'agua verde', date: fecha });
    expect(Number(log.chlorine_amount)).toBe(1.5);
    expect(await itemOf(itemId)).toMatchObject({ status: 'done', completed_by: ids.employee });

    const { data: hist } = await svc().from('service_log_history').select('action, changed_by').eq('service_log_id', log.id);
    expect(hist).toEqual([{ action: 'insert', changed_by: actor === 'owner' ? ids.owner : ids.admin }]);
    expect(revalidated()).toEqual(expect.arrayContaining([`/admin/itinerario/visita/${itemId}`, `/admin/itinerario/${fecha}`]));
  });

  it('el dueño puede registrar a su nombre y en cualquier fecha pasada (más de 7 días)', async () => {
    const { itemId } = await visita(addDays(todayInArgentina(), -40));
    await actAs('owner');
    expect(((await registrarVisitaDuenoAction(itemId, uuid(), ids.owner, SIN_CLORO)) as ActionResult).success).toBe(true);
    expect((await logsOf(itemId))[0].employee_id).toBe(ids.owner);
  });

  it('hoy se puede; un día que todavía no llegó, no', async () => {
    const hoy = await visita(todayInArgentina());
    const futuro = await visita(addDays(todayInArgentina(), 2));
    await actAs('owner');
    expect(((await registrarVisitaDuenoAction(hoy.itemId, uuid(), ids.employee, SIN_CLORO)) as ActionResult).success).toBe(true);
    expect(((await registrarVisitaDuenoAction(futuro.itemId, uuid(), ids.employee, SIN_CLORO)) as ActionResult).error).toBe(FUTURE);
    expect(await logsOf(futuro.itemId)).toEqual([]);
  });

  it('un registro a nombre de un cliente o de marketing se rechaza', async () => {
    const { itemId } = await visita();
    await actAs('owner');
    for (const who of [ids.client, ids.marketing]) {
      expect(((await registrarVisitaDuenoAction(itemId, uuid(), who, SIN_CLORO)) as ActionResult).error).toBe('El registro tiene que ser de alguien del equipo');
    }
    expect(await logsOf(itemId)).toEqual([]);
  });

  it('el mismo envío repetido no duplica; dos envíos distintos suman dos registros', async () => {
    const { itemId } = await visita();
    await actAs('owner');
    const req = uuid();
    await registrarVisitaDuenoAction(itemId, req, ids.employee, SIN_CLORO);
    expect(((await registrarVisitaDuenoAction(itemId, req, ids.employee, SIN_CLORO)) as ActionResult).success).toBe(true);
    expect(await logsOf(itemId)).toHaveLength(1);
    await registrarVisitaDuenoAction(itemId, uuid(), ids.owner, SIN_CLORO);
    expect((await logsOf(itemId)).map((l) => l.employee_id)).toEqual([ids.employee, ids.owner]);
  });

  it.each(except(OWNER_UP))('%s NO puede usar la acción del dueño', async (actor) => {
    const { itemId } = await visita();
    await actAs(actor);
    expect(((await registrarVisitaDuenoAction(itemId, uuid(), ids.employee, SIN_CLORO)) as ActionResult).error).toBeTruthy();
    expect(await logsOf(itemId)).toEqual([]);
  });

  it('valida datos, cloro y visita', async () => {
    const { itemId } = await visita();
    await actAs('owner');
    expect(((await registrarVisitaDuenoAction('x', uuid(), ids.employee, SIN_CLORO)) as ActionResult).error).toBe('Datos inválidos');
    expect(((await registrarVisitaDuenoAction(itemId, 'x', ids.employee, SIN_CLORO)) as ActionResult).error).toBe('Datos inválidos');
    expect(((await registrarVisitaDuenoAction(itemId, uuid(), 'x', SIN_CLORO)) as ActionResult).error).toBe('Datos inválidos');
    expect(((await registrarVisitaDuenoAction(itemId, uuid(), ids.employee, { chlorineType: 'acido', chlorineAmount: 1 })) as ActionResult).error).toBe('Tipo de cloro inválido');
    expect(((await registrarVisitaDuenoAction(itemId, uuid(), ids.employee, { chlorineType: 'pastilla', chlorineAmount: 0.3 })) as ActionResult).error).toBe('Cantidad de cloro inválida');
    expect(((await registrarVisitaDuenoAction(BAD, uuid(), ids.employee, SIN_CLORO)) as ActionResult).error).toBe('Visita no encontrada');
    expect(await logsOf(itemId)).toEqual([]);
  });
});

describe('editarRegistroDuenoAction', () => {
  it.each(OWNER_UP)('%s corrige quién lo hizo y el cloro de un registro viejo; queda en el historial', async (actor) => {
    const { itemId } = await visita(addDays(todayInArgentina(), -60));
    await actAs('owner');
    await registrarVisitaDuenoAction(itemId, uuid(), ids.employee, SIN_CLORO);
    const [log] = await logsOf(itemId);
    await actAs(actor);
    const r = (await editarRegistroDuenoAction(log.id, ids.owner, { chlorineType: 'granulado', chlorineAmount: 300, notes: 'corregido' })) as ActionResult;
    expect(r.success).toBe(true);
    const [after] = await logsOf(itemId);
    expect(after).toMatchObject({ employee_id: ids.owner, chlorine_type: 'granulado', notes: 'corregido' });
    const { data: hist } = await svc().from('service_log_history').select('action').eq('service_log_id', log.id).order('changed_at');
    expect(hist!.map((h) => h.action)).toEqual(['insert', 'update']);
  });

  it('no se puede pasar el registro a alguien de fuera del equipo; registro inexistente avisa', async () => {
    const { itemId } = await visita();
    await actAs('owner');
    await registrarVisitaDuenoAction(itemId, uuid(), ids.employee, SIN_CLORO);
    const [log] = await logsOf(itemId);
    expect(((await editarRegistroDuenoAction(log.id, ids.client, SIN_CLORO)) as ActionResult).error).toBe('El registro tiene que ser de alguien del equipo');
    expect((await logsOf(itemId))[0].employee_id).toBe(ids.employee);
    expect(((await editarRegistroDuenoAction(BAD, ids.owner, SIN_CLORO)) as ActionResult).error).toBe('Registro no encontrado');
    expect(((await editarRegistroDuenoAction('x', ids.owner, SIN_CLORO)) as ActionResult).error).toBe('Datos inválidos');
  });

  it.each(except(OWNER_UP))('%s NO puede corregir con la acción del dueño', async (actor) => {
    const { itemId } = await visita();
    await actAs('owner');
    await registrarVisitaDuenoAction(itemId, uuid(), ids.employee, SIN_CLORO);
    const [log] = await logsOf(itemId);
    await actAs(actor);
    expect(((await editarRegistroDuenoAction(log.id, ids.employee, { chlorineType: 'liquido', chlorineAmount: 2 })) as ActionResult).error).toBeTruthy();
    expect((await logsOf(itemId))[0].chlorine_type).toBeNull();
  });
});

describe('borrarRegistroDuenoAction', () => {
  it.each(OWNER_UP)('%s borra registros; al borrar el último la visita vuelve a pendiente', async (actor) => {
    const { itemId } = await visita();
    await actAs('owner');
    await registrarVisitaDuenoAction(itemId, uuid(), ids.employee, SIN_CLORO);
    await registrarVisitaDuenoAction(itemId, uuid(), ids.owner, SIN_CLORO);
    const [a, b] = await logsOf(itemId);
    await actAs(actor);
    expect(((await borrarRegistroDuenoAction(a.id)) as ActionResult).success).toBe(true);
    expect((await itemOf(itemId)).status).toBe('done');
    expect(((await borrarRegistroDuenoAction(b.id)) as ActionResult).success).toBe(true);
    expect(await itemOf(itemId)).toMatchObject({ status: 'pending', completed_by: null });
    expect(((await borrarRegistroDuenoAction(b.id)) as ActionResult).error).toBe('Registro no encontrado');
  });

  it.each(except(OWNER_UP))('%s NO puede borrar con la acción del dueño', async (actor) => {
    const { itemId } = await visita();
    await actAs('owner');
    await registrarVisitaDuenoAction(itemId, uuid(), ids.employee, SIN_CLORO);
    const [log] = await logsOf(itemId);
    await actAs(actor);
    expect(((await borrarRegistroDuenoAction(log.id)) as ActionResult).error).toBeTruthy();
    expect(await logsOf(itemId)).toHaveLength(1);
  });

  it('rechaza un id inválido', async () => {
    await actAs('owner');
    expect(((await borrarRegistroDuenoAction('x')) as ActionResult).error).toBe('Datos inválidos');
  });
});

describe('marcarVisitaDuenoAction', () => {
  it.each(OWNER_UP)('%s saltea una visita (queda a su nombre) y la vuelve a pendiente', async (actor) => {
    const { itemId } = await visita();
    await actAs(actor);
    expect(((await marcarVisitaDuenoAction(itemId, 'skipped')) as ActionResult).success).toBe(true);
    const after = await itemOf(itemId);
    expect(after.status).toBe('skipped');
    expect(after.completed_by).toBe(actor === 'owner' ? ids.owner : ids.admin);
    expect(after.completed_at).toBeTruthy();

    expect(((await marcarVisitaDuenoAction(itemId, 'pending')) as ActionResult).success).toBe(true);
    expect(await itemOf(itemId)).toEqual({ status: 'pending', completed_by: null, completed_at: null });
  });

  it('no estaba el cliente; una visita hecha no se cambia por acá', async () => {
    const { itemId } = await visita();
    await actAs('owner');
    expect(((await marcarVisitaDuenoAction(itemId, 'no_client')) as ActionResult).success).toBe(true);
    expect((await itemOf(itemId)).status).toBe('no_client');

    await registrarVisitaDuenoAction(itemId, uuid(), ids.employee, SIN_CLORO);
    expect((await itemOf(itemId)).status).toBe('done');
    expect(((await marcarVisitaDuenoAction(itemId, 'skipped')) as ActionResult).error).toBe('Esta visita ya está hecha: para corregirla, editá o borrá sus registros');
    expect((await itemOf(itemId)).status).toBe('done');
  });

  it('una visita de un día que no llegó no se marca', async () => {
    const { itemId } = await visita(addDays(todayInArgentina(), 3));
    await actAs('owner');
    expect(((await marcarVisitaDuenoAction(itemId, 'skipped')) as ActionResult).error).toBe(FUTURE);
    expect((await itemOf(itemId)).status).toBe('pending');
  });

  it('"hecha" no se puede marcar directo y los datos inválidos se rechazan', async () => {
    const { itemId } = await visita();
    await actAs('owner');
    expect(((await marcarVisitaDuenoAction(itemId, 'done' as never)) as ActionResult).error).toBe('Datos inválidos');
    expect(((await marcarVisitaDuenoAction('x', 'skipped')) as ActionResult).error).toBe('Datos inválidos');
    expect(((await marcarVisitaDuenoAction(BAD, 'skipped')) as ActionResult).error).toBe('Visita no encontrada');
  });

  it.each(except(OWNER_UP))('%s NO puede marcar con la acción del dueño', async (actor) => {
    const { itemId } = await visita();
    await actAs(actor);
    expect(((await marcarVisitaDuenoAction(itemId, 'skipped')) as ActionResult).error).toBeTruthy();
    expect((await itemOf(itemId)).status).toBe('pending');
  });
});
