/**
 * Etapa 3d: pantalla Empleados e historial de cambios de los registros de service.
 *  - las consultas del historial (por visita y por mes/persona) funcionan contra la base real
 *  - el historial anota a quien hizo el cambio (el dueño, aunque el registro sea de otro) y guarda los borrados
 *  - solo el dueño y el súper admin lo leen; los totales del mes cuentan bien
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { TestUserKey } from '../../e2e/support/env';
import { FIXTURE } from '../../e2e/support/seed';
import { as, svc, userIds, type Actor } from '../support/clients';
import { cambiosDeLaVisita, cambiosDelMes } from '@/app/admin/empleados/data';
import { parseMes, summarizeWork, type WorkLog } from '@/lib/staff-work';
import { todayInArgentina } from '@/lib/dates';

let ids: Record<TestUserKey, string>;
const FECHA = '2024-03-12'; // un día pasado que no usa ningún otro test
let dayId: string;
let itemId: string;
let itemB: string;
let kept: string;
let removed: string;

beforeAll(async () => {
  ids = await userIds();
  await svc().from('itinerary_days').delete().eq('date', FECHA);
  dayId = (await svc().from('itinerary_days').insert({ date: FECHA }).select('id').single()).data!.id as string;
  const { data: its, error } = await svc()
    .from('itinerary_items')
    .insert([
      { itinerary_day_id: dayId, pool_id: FIXTURE.pools.pool1.id, sort_order: 1, service_type: 'service' },
      { itinerary_day_id: dayId, pool_id: FIXTURE.pools.pool2.id, sort_order: 2, service_type: 'desagote' },
    ])
    .select('id, sort_order')
    .order('sort_order');
  if (error) throw error;
  [itemId, itemB] = its!.map((i) => i.id as string);

  // El dueño carga dos registros a nombre del empleado, corrige uno y borra el otro
  const owner = await as('owner');
  const ins = async (item: string, pool: string, client: string, extra: object) => {
    const { data, error: e } = await owner
      .from('service_logs')
      .insert({ itinerary_item_id: item, employee_id: ids.employee, pool_id: pool, client_id: client, request_id: crypto.randomUUID(), ...extra })
      .select('id')
      .single();
    if (e) throw e;
    return data!.id as string;
  };
  kept = await ins(itemId, FIXTURE.pools.pool1.id, ids.client, { chlorine_applied: true, chlorine_type: 'pastilla', chlorine_amount: 2 });
  removed = await ins(itemId, FIXTURE.pools.pool1.id, ids.client, { notes: 'Duplicado' });
  expect((await owner.from('service_logs').update({ chlorine_amount: 2.5, notes: 'Agua verde' }).eq('id', kept)).error).toBeNull();
  expect((await owner.from('service_logs').delete().eq('id', removed)).error).toBeNull();
  // El empleado y el dueño fueron juntos al desagote
  await ins(itemB, FIXTURE.pools.pool2.id, ids.client2, { chlorine_applied: true, chlorine_type: 'liquido', chlorine_amount: 3 });
  await owner.from('service_logs').insert({
    itinerary_item_id: itemB, employee_id: ids.owner, pool_id: FIXTURE.pools.pool2.id, client_id: ids.client2, request_id: crypto.randomUUID(),
  });
});

afterAll(async () => {
  await svc().from('service_logs').delete().in('itinerary_item_id', [itemId, itemB]);
  await svc().from('service_log_history').delete().in('new_data->>itinerary_item_id', [itemId, itemB]);
  await svc().from('service_log_history').delete().in('old_data->>itinerary_item_id', [itemId, itemB]);
  await svc().from('itinerary_items').delete().eq('itinerary_day_id', dayId);
  await svc().from('itinerary_days').delete().eq('id', dayId);
});

describe('historial de una visita', () => {
  it('trae alta, edición y borrado en orden, a nombre de quien hizo el cambio, con el antes y el después', async () => {
    const { entries, ctx } = await cambiosDeLaVisita(await as('owner'), itemId);
    expect(entries.map((e) => [e.serviceLogId, e.action])).toEqual([
      [kept, 'insert'],
      [removed, 'insert'],
      [kept, 'update'],
      [removed, 'delete'],
    ]);
    expect(entries.every((e) => e.changedBy === ids.owner)).toBe(true);
    expect(entries.every((e) => e.employeeId === ids.employee && e.poolId === FIXTURE.pools.pool1.id)).toBe(true);
    expect(entries[2].changes).toEqual([
      { field: 'Cloro', before: 'Pastillas · 2', after: 'Pastillas · 2,5' },
      { field: 'Observaciones', before: '—', after: 'Agua verde' },
    ]);
    expect(entries[3].snapshot.find((f) => f.field === 'Observaciones')?.after).toBe('Duplicado');
    expect(ctx.names[ids.owner]).toBeTruthy();
    expect(ctx.names[ids.employee]).toBeTruthy();
    expect(ctx.pools?.[FIXTURE.pools.pool1.id]).toBeTruthy();
  });

  it('no mezcla visitas', async () => {
    const { entries } = await cambiosDeLaVisita(await as('owner'), itemB);
    expect(entries).toHaveLength(2);
    expect(entries.every((e) => e.itemId === itemB)).toBe(true);
  });

  it.each(['admin'] as Actor[])('%s también lo ve', async (who) => {
    expect((await cambiosDeLaVisita(await as(who), itemId)).entries).toHaveLength(4);
  });

  it.each(['employee', 'marketing', 'client', 'anon'] as Actor[])('%s no ve nada', async (who) => {
    expect((await cambiosDeLaVisita(await as(who), itemId)).entries).toEqual([]);
  });
});

describe('historial del mes', () => {
  const mes = () => parseMes(null, todayInArgentina()); // los cambios se hicieron hoy

  it('filtra por persona: lo que hizo y lo de sus registros', async () => {
    const owner = await as('owner');
    const { from, to } = mes();
    const delEmpleado = (await cambiosDelMes(owner, from, to, ids.employee)).entries.filter((e) => [itemId, itemB].includes(e.itemId!));
    expect(delEmpleado).toHaveLength(5); // 4 de la primera visita + su registro del desagote (el del dueño no es suyo)
    const delDueno = (await cambiosDelMes(owner, from, to, ids.owner)).entries.filter((e) => [itemId, itemB].includes(e.itemId!));
    expect(delDueno).toHaveLength(6); // los hizo todos
    const deOtro = (await cambiosDelMes(owner, from, to, ids.client2)).entries.filter((e) => [itemId, itemB].includes(e.itemId!));
    expect(deOtro).toEqual([]);
  });

  it('del más nuevo al más viejo, y un mes sin cambios viene vacío', async () => {
    const owner = await as('owner');
    const { from, to } = mes();
    const { entries, error } = await cambiosDelMes(owner, from, to, null);
    expect(error).toBeNull();
    const t = entries.map((e) => e.changedAt);
    expect([...t].sort().reverse()).toEqual(t);
    expect((await cambiosDelMes(owner, '2001-01-01', '2001-01-31', null)).entries).toEqual([]);
  });

  it('respeta el límite y avisa que hay más', async () => {
    const { from, to } = mes();
    const r = await cambiosDelMes(await as('owner'), from, to, null, 2);
    expect(r.entries).toHaveLength(2);
    expect(r.more).toBe(true);
  });

  it('el empleado no ve el historial', async () => {
    const { from, to } = mes();
    expect((await cambiosDelMes(await as('employee'), from, to, null)).entries).toEqual([]);
  });
});

describe('totales del mes (lo que lee la pantalla Empleados)', () => {
  it('cada persona suma las visitas a las que fue y el cloro de sus registros', async () => {
    const { data } = await (await as('owner'))
      .from('service_logs')
      .select('id, employee_id, itinerary_item_id, date, service_type, chlorine_type, chlorine_amount')
      .in('itinerary_item_id', [itemId, itemB]);
    const w = summarizeWork((data ?? []) as WorkLog[]);
    expect(w.get(ids.employee)).toMatchObject({ visits: 2, service: 1, desagote: 1, days: 1, logs: 2 });
    expect(w.get(ids.employee)!.chlorine.pastilla.amount).toBe(2.5);
    expect(w.get(ids.employee)!.chlorine.liquido.amount).toBe(3);
    expect(w.get(ids.owner)).toMatchObject({ visits: 1, service: 0, desagote: 1, logs: 1 });
  });
});
