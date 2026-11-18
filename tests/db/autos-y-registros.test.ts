/**
 * Migración 22 (spec dueño/empleado del 2026-11-04):
 *  - clientes sin cuenta web (perfil sin usuario de Auth; se le habilita la cuenta después)
 *  - autos y equipos por día: el empleado ve y registra solo las visitas de su auto
 *  - historial de registros de service (quién, qué, cuándo, antes/después), solo para el dueño
 */
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import type { TestUserKey } from '../../e2e/support/env';
import { FIXTURE } from '../../e2e/support/seed';
import { todayInArgentina } from '../../src/lib/dates';
import { as, rand, svc, userIds } from '../support/clients';

type Json = Record<string, unknown>;
let ids: Record<TestUserKey, string>;
beforeAll(async () => { ids = await userIds(); });

const must = async <T>(q: PromiseLike<{ data: T; error: { message: string } | null }>): Promise<NonNullable<T>> => {
  const { data, error } = await q;
  if (error || data == null) throw new Error(error?.message ?? 'sin datos');
  return data as NonNullable<T>;
};

// ── Clientes sin cuenta ──────────────────────────────────────────────────────────────────────

describe('clientes sin cuenta web', () => {
  const created: string[] = [];
  afterEach(async () => {
    for (const id of created.splice(0)) {
      await svc().from('pools').delete().eq('client_id', id);
      await svc().from('profiles').delete().eq('id', id);
      await svc().auth.admin.deleteUser(id).catch(() => undefined);
    }
  });

  const newClient = async (extra: Json = {}) => {
    const owner = await as('owner');
    const { data, error } = await owner.from('profiles').insert({ full_name: rand('Cliente'), ...extra }).select('id, role, has_account').single();
    if (data) created.push(data.id as string);
    return { data, error };
  };

  it('el dueño da de alta un cliente solo con el nombre: queda como cliente y sin cuenta', async () => {
    const { data, error } = await newClient({ role: 'owner', has_account: true });
    expect(error).toBeNull();
    expect(data).toMatchObject({ role: 'client', has_account: false });

    const owner = await as('owner');
    const id = data!.id as string;
    expect((await owner.from('client_profiles').insert({ id, client_number: 9001, notes: 'Portón gris' })).error).toBeNull();
    // la pileta puede no tener dirección todavía
    expect((await owner.from('pools').insert({ client_id: id, nickname: 'La de la esquina' })).error).toBeNull();
  });

  it('el nombre es obligatorio', async () => {
    const { error } = await newClient({ full_name: '   ' });
    expect(error?.code).toBe('23514');
  });

  it('el N° de cliente no se repite y es positivo', async () => {
    const owner = await as('owner');
    const a = (await newClient()).data!.id as string;
    const b = (await newClient()).data!.id as string;
    expect((await owner.from('client_profiles').insert({ id: a, client_number: 9002 })).error).toBeNull();
    expect((await owner.from('client_profiles').insert({ id: b, client_number: 9002 })).error?.code).toBe('23505');
    expect((await owner.from('client_profiles').insert({ id: b, client_number: 0 })).error?.code).toBe('23514');
  });

  it('nadie marca a mano que un perfil tiene cuenta', async () => {
    const id = (await newClient()).data!.id as string;
    for (const actor of ['owner', 'admin'] as const) {
      const { error } = await (await as(actor)).from('profiles').update({ has_account: true }).eq('id', id);
      expect(error?.code, actor).toBe('42501');
    }
  });

  it('al habilitarle la cuenta se usa el mismo id: conserva nombre y rol, y borrar la cuenta borra el perfil', async () => {
    const { data } = await newClient({ full_name: 'Cliente Habilitado' });
    const id = data!.id as string;
    const email = `${rand('habilitado')}@piletaspancho.test`;
    const { data: user, error } = await svc().auth.admin.createUser({ id, email, password: 'TmpPass123!', email_confirm: true, user_metadata: { full_name: 'Otro nombre' } });
    expect(error).toBeNull();
    expect(user.user?.id).toBe(id);
    // el rol del perfil se copia a la cuenta (lo escribe el trigger: se relee)
    expect((await svc().auth.admin.getUserById(id)).data.user?.app_metadata?.role).toBe('client');
    expect(await must(svc().from('profiles').select('full_name, has_account, role').eq('id', id).single()))
      .toEqual({ full_name: 'Cliente Habilitado', has_account: true, role: 'client' });

    await svc().auth.admin.deleteUser(id);
    expect((await svc().from('profiles').select('id').eq('id', id)).data).toEqual([]);
  });

  it('los perfiles de usuarios registrados quedan con cuenta', async () => {
    expect(await must(svc().from('profiles').select('has_account').eq('id', ids.client).single())).toEqual({ has_account: true });
  });
});

// ── Autos y equipos ──────────────────────────────────────────────────────────────────────────

describe('autos y equipos: el empleado ve y registra las visitas de su auto', () => {
  let dayId: string;
  let carA: string;
  let carB: string;
  let poolA: string;
  let poolB: string;
  let itemA: string;
  let itemB: string;
  let crewId: string;

  beforeAll(async () => {
    const s = svc();
    dayId = (await must(s.from('itinerary_days').select('id').eq('date', todayInArgentina()).single())).id as string;
    carA = (await must(s.from('vehicles').insert({ name: rand('Auto A') }).select('id').single())).id as string;
    carB = (await must(s.from('vehicles').insert({ name: rand('Auto B') }).select('id').single())).id as string;
    poolA = (await must(s.from('pools').insert({ client_id: ids.client, address: rand('dir-a') }).select('id').single())).id as string;
    poolB = (await must(s.from('pools').insert({ client_id: ids.client2, address: rand('dir-b') }).select('id').single())).id as string;
    itemA = (await must(s.from('itinerary_items').insert({ itinerary_day_id: dayId, pool_id: poolA, vehicle_id: carA, service_type: 'desagote', sort_order: 10 }).select('id').single())).id as string;
    itemB = (await must(s.from('itinerary_items').insert({ itinerary_day_id: dayId, pool_id: poolB, vehicle_id: carB, sort_order: 11 }).select('id').single())).id as string;
    crewId = (await must(s.from('itinerary_day_crews').insert({ itinerary_day_id: dayId, vehicle_id: carA, employee_id: ids.employee }).select('id').single())).id as string;
  });

  afterAll(async () => {
    const s = svc();
    await s.from('service_logs').delete().in('itinerary_item_id', [itemA, itemB]);
    await s.from('itinerary_items').delete().in('id', [itemA, itemB]);
    await s.from('itinerary_day_crews').delete().eq('itinerary_day_id', dayId).in('vehicle_id', [carA, carB]);
    await s.from('pools').delete().in('id', [poolA, poolB]);
    await s.from('vehicles').delete().in('id', [carA, carB]);
  });

  it('ve la visita de su auto y no la del otro; las visitas sin auto las siguen viendo todos', async () => {
    const emp = await as('employee');
    const { data } = await emp.from('itinerary_items').select('id').eq('itinerary_day_id', dayId);
    const seen = (data ?? []).map((r) => r.id as string);
    expect(seen).toContain(itemA);
    expect(seen).not.toContain(itemB);
    const seed = await must(svc().from('itinerary_items').select('id').eq('itinerary_day_id', dayId).is('vehicle_id', null));
    for (const r of seed) expect(seen).toContain(r.id);
  });

  it('registra el service de la visita de su auto, pero no el del otro auto', async () => {
    const emp = await as('employee');
    const ok = await emp.from('service_logs').insert({ itinerary_item_id: itemA, employee_id: ids.employee, pool_id: poolA, client_id: ids.client, notes: rand('auto') });
    expect(ok.error).toBeNull();
    const no = await emp.from('service_logs').insert({ itinerary_item_id: itemB, employee_id: ids.employee, pool_id: poolB, client_id: ids.client2, notes: rand('auto') });
    expect(no.error?.code).toBe('42501');
  });

  it('si el dueño lo pasa al otro auto, ve las visitas del otro auto', async () => {
    await svc().from('itinerary_day_crews').update({ vehicle_id: carB }).eq('id', crewId);
    try {
      const { data } = await (await as('employee')).from('itinerary_items').select('id').in('id', [itemA, itemB]);
      expect((data ?? []).map((r) => r.id)).toEqual([itemB]);
    } finally {
      await svc().from('itinerary_day_crews').update({ vehicle_id: carA }).eq('id', crewId);
    }
  });

  it('el empleado no cambia el auto ni el tipo de una visita', async () => {
    const emp = await as('employee');
    for (const patch of [{ vehicle_id: carB }, { service_type: 'service' }]) {
      const { error } = await emp.from('itinerary_items').update(patch).eq('id', itemA);
      expect(error?.code, JSON.stringify(patch)).toBe('42501');
    }
  });

  it('el tipo de visita es service o desagote', async () => {
    const { error } = await svc().from('itinerary_items').update({ service_type: 'pintado' }).eq('id', itemA);
    expect(error?.code).toBe('23514');
  });

  it('en un auto va gente del equipo, una sola vez por día; created_by lo fija la base', async () => {
    const owner = await as('owner');
    const client = await owner.from('itinerary_day_crews').insert({ itinerary_day_id: dayId, vehicle_id: carA, employee_id: ids.client });
    expect(client.error?.code).toBe('22023');
    const twice = await owner.from('itinerary_day_crews').insert({ itinerary_day_id: dayId, vehicle_id: carB, employee_id: ids.employee });
    expect(twice.error?.code).toBe('23505');
    const self = await owner.from('itinerary_day_crews').insert({ itinerary_day_id: dayId, vehicle_id: carB, employee_id: ids.owner, created_by: ids.admin }).select('created_by').single();
    expect(self.error).toBeNull();
    expect(self.data?.created_by).toBe(ids.owner);
  });
});

// ── Historial de registros ───────────────────────────────────────────────────────────────────

describe('historial de registros de service', () => {
  let itemId: string;
  beforeAll(async () => {
    itemId = (await must(svc().from('itinerary_items').select('id').eq('pool_id', FIXTURE.pools.pool2.id).single())).id as string;
  });
  afterEach(async () => {
    await svc().from('service_logs').delete().eq('itinerary_item_id', itemId);
    await svc().from('itinerary_items').update({ status: 'pending', completed_by: null, completed_at: null }).eq('id', itemId);
  });

  const history = async (logId: string) =>
    must(svc().from('service_log_history').select('action, changed_by, old_data, new_data').eq('service_log_id', logId).order('changed_at'));

  it('guarda alta, edición y borrado con quién lo hizo y los valores antes/después', async () => {
    const emp = await as('employee');
    const id = (await must(emp.from('service_logs').insert({
      itinerary_item_id: itemId, employee_id: ids.employee, pool_id: FIXTURE.pools.pool2.id, client_id: ids.client2, notes: 'hist-1',
    }).select('id').single())).id as string;
    expect((await emp.from('service_logs').update({ notes: 'hist-2', chlorine_type: 'pastilla', chlorine_amount: 2 }).eq('id', id)).error).toBeNull();
    expect((await emp.from('service_logs').delete().eq('id', id)).error).toBeNull();

    const rows = await history(id);
    expect(rows.map((r) => r.action)).toEqual(['insert', 'update', 'delete']);
    expect(rows.every((r) => r.changed_by === ids.employee)).toBe(true);
    const [, upd, del] = rows as { old_data: Json; new_data: Json }[];
    expect(upd.old_data.notes).toBe('hist-1');
    expect(upd.new_data).toMatchObject({ notes: 'hist-2', chlorine_amount: 2, chlorine_unit: 'u' });
    expect(del.old_data.notes).toBe('hist-2');
  });

  it('una edición que no cambia nada no deja rastro', async () => {
    const id = (await must(svc().from('service_logs').insert({
      itinerary_item_id: itemId, employee_id: ids.employee, pool_id: FIXTURE.pools.pool2.id, client_id: ids.client2, notes: 'igual',
    }).select('id').single())).id as string;
    await (await as('owner')).from('service_logs').update({ notes: 'igual' }).eq('id', id);
    expect((await history(id)).map((r) => r.action)).toEqual(['insert']);
  });

  it('el dueño lo lee; el empleado y marketing no', async () => {
    const id = (await must(svc().from('service_logs').insert({
      itinerary_item_id: itemId, employee_id: ids.employee, pool_id: FIXTURE.pools.pool2.id, client_id: ids.client2, notes: 'visible',
    }).select('id').single())).id as string;
    expect((await (await as('owner')).from('service_log_history').select('id').eq('service_log_id', id)).data).toHaveLength(1);
    for (const actor of ['employee', 'marketing'] as const) {
      expect((await (await as(actor)).from('service_log_history').select('id').eq('service_log_id', id)).data ?? [], actor).toEqual([]);
    }
  });
});

// ── Migración 23: tipo de visita en el registro, envío repetido y nombres del equipo ─────────

describe('registros: tipo de visita, clave de envío y nombres del equipo (migración 23)', () => {
  let itemId: string;
  beforeAll(async () => {
    itemId = (await must(svc().from('itinerary_items').select('id').eq('pool_id', FIXTURE.pools.pool2.id).single())).id as string;
  });
  afterEach(async () => {
    await svc().from('service_logs').delete().eq('itinerary_item_id', itemId);
    await svc().from('itinerary_items').update({ status: 'pending', completed_by: null, completed_at: null, service_type: 'service' }).eq('id', itemId);
  });

  const insertAs = async (actor: 'employee' | 'owner', extra: Json = {}) =>
    (await as(actor)).from('service_logs').insert({
      itinerary_item_id: itemId, employee_id: ids[actor], pool_id: FIXTURE.pools.pool2.id, client_id: ids.client2, notes: rand('m20'), ...extra,
    }).select('id, service_type, request_id').single();

  it('el tipo de visita lo copia la base desde la visita, aunque el navegador mande otro', async () => {
    await svc().from('itinerary_items').update({ service_type: 'desagote' }).eq('id', itemId);
    const { data, error } = await insertAs('employee', { service_type: 'service' });
    expect(error).toBeNull();
    expect(data?.service_type).toBe('desagote');
    const upd = await (await as('employee')).from('service_logs').update({ service_type: 'service' }).eq('id', data!.id as string).select('service_type').single();
    expect(upd.data?.service_type).toBe('desagote');
  });

  it('si el dueño cambia el tipo de la visita, sus registros lo acompañan (tr_sync_service_type_to_logs)', async () => {
    const { data } = await insertAs('employee');
    expect(data?.service_type).toBe('service');
    expect((await (await as('owner')).from('itinerary_items').update({ service_type: 'desagote' }).eq('id', itemId)).error).toBeNull();
    const row = await must(svc().from('service_logs').select('service_type').eq('id', data!.id as string).single());
    expect(row.service_type).toBe('desagote');
  });

  it('un mismo envío (clave repetida) no crea dos registros, y la clave no se cambia después', async () => {
    const key = crypto.randomUUID();
    const first = await insertAs('employee', { request_id: key });
    expect(first.error).toBeNull();
    const again = await insertAs('employee', { request_id: key });
    expect(again.error?.code).toBe('23505');
    const upd = await (await as('employee')).from('service_logs').update({ request_id: crypto.randomUUID() }).eq('id', first.data!.id as string).select('request_id').single();
    expect(upd.data?.request_id).toBe(key);
  });

  it('team_names: el equipo ve los nombres del equipo, nunca los de clientes; los clientes no ven nada', async () => {
    const wanted = [ids.owner, ids.employee, ids.client, ids.marketing];
    const emp = await (await as('employee')).rpc('team_names', { p_ids: wanted });
    expect(emp.error).toBeNull();
    const got = (emp.data as { id: string; full_name: string }[]).map((r) => r.id).sort();
    expect(got).toEqual([ids.owner, ids.employee].sort());
    expect(Object.keys((emp.data as Json[])[0]).sort()).toEqual(['full_name', 'id']);

    for (const actor of ['client', 'marketing'] as const) {
      const r = await (await as(actor)).rpc('team_names', { p_ids: wanted });
      expect(r.data ?? [], actor).toEqual([]);
    }
    const anon = await (await as('anon')).rpc('team_names', { p_ids: wanted });
    expect(anon.data ?? []).toEqual([]);
  });
});
