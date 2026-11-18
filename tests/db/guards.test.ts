/**
 * Guardianes de columnas y reglas finas de acceso agregadas en la migración de seguridad:
 * quién puede cambiar role / puntos / nivel / estado, qué puede tocar marketing en productos,
 * qué puede cambiar el empleado en el itinerario, y qué puede registrar en service_logs.
 */
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import type { TestUserKey } from '../../e2e/support/env';
import { FIXTURE } from '../../e2e/support/seed';
import { TEST_USERS } from '../../e2e/support/env';
import { as, rand, svc, tempUser, uniqueDate, userIds, type Actor } from '../support/clients';
import { createClient } from '@supabase/supabase-js';
import { getLocalSupabase } from '../../e2e/support/env';
import { todayInArgentina } from '../../src/lib/dates';

type Json = Record<string, unknown>;
let ids: Record<TestUserKey, string>;
beforeAll(async () => { ids = await userIds(); });

const row = async (table: string, id: string, cols: string) => {
  const { data, error } = await svc().from(table).select(cols).eq('id', id).single();
  if (error) throw new Error(error.message);
  return data as unknown as Json;
};

/** Intenta un update como `actor` y devuelve si la fila cambió realmente (verificado con service role). */
async function tryUpdate(actor: Actor, table: string, id: string, patch: Json) {
  const cols = Object.keys(patch).join(',');
  const before = await row(table, id, cols);
  const client = await as(actor);
  const { error } = await client.from(table).update(patch).eq('id', id);
  const after = await row(table, id, cols);
  return { error, changed: JSON.stringify(before) !== JSON.stringify(after), before };
}

const goldLevel = async () => (await svc().from('client_levels').select('id').order('min_points', { ascending: false }).limit(1).single()).data!.id as string;

// ── profiles ──────────────────────────────────────────────────────────────────────────────────

describe('guardián de perfiles', () => {
  const restore: (() => Promise<unknown>)[] = [];
  afterEach(async () => { for (const r of restore.splice(0)) await r(); });

  const own = (a: TestUserKey) => ids[a];

  it.each(['client', 'client2', 'employee', 'marketing'] as TestUserKey[])('%s NO puede ascenderse a super_admin', async (actor) => {
    const { error, changed } = await tryUpdate(actor, 'profiles', own(actor), { role: 'super_admin' });
    expect(changed).toBe(false);
    expect(error?.code).toBe('42501');
  });

  it('owner tampoco puede cambiar roles (solo super_admin)', async () => {
    for (const target of [ids.owner, ids.client2]) {
      const { error, changed } = await tryUpdate('owner', 'profiles', target, { role: 'super_admin' });
      expect(changed, `owner cambió el rol de ${target}`).toBe(false);
      expect(error?.code).toBe('42501');
    }
  });

  it.each(['client', 'employee', 'marketing'] as TestUserKey[])('%s NO puede darse puntos', async (actor) => {
    const { changed, error } = await tryUpdate(actor, 'profiles', own(actor), { points_balance: 99_999 });
    expect(changed).toBe(false);
    expect(error?.code).toBe('42501');
  });

  it('el cliente NO puede cambiarse el nivel', async () => {
    const { changed, error } = await tryUpdate('client', 'profiles', ids.client, { client_level_id: await goldLevel() });
    expect(changed).toBe(false);
    expect(error?.code).toBe('42501');
  });

  it.each(['client', 'employee', 'marketing'] as TestUserKey[])('%s NO puede cambiar su propio estado (ej. reactivarse si lo bloquearon)', async (actor) => {
    const { changed, error } = await tryUpdate(actor, 'profiles', own(actor), { status: 'blocked' });
    expect(changed).toBe(false);
    expect(error?.code).toBe('42501');
  });

  it.each(['client', 'employee', 'marketing', 'owner'] as TestUserKey[])('%s SÍ puede editar sus datos personales', async (actor) => {
    const { changed, error, before } = await tryUpdate(actor, 'profiles', own(actor), { full_name: rand('Nombre'), phone: '1155550000' });
    expect(error).toBeNull();
    expect(changed).toBe(true);
    restore.push(async () => { await svc().from('profiles').update({ full_name: TEST_USERS[actor].email.split('@')[0], phone: null }).eq('id', own(actor)); void before; });
  });

  it('owner SÍ puede cambiar estado y puntos de un cliente', async () => {
    const t = await tempUser();
    restore.push(t.cleanup);
    const a = await tryUpdate('owner', 'profiles', t.id, { status: 'inactive' });
    expect(a.error).toBeNull(); expect(a.changed).toBe(true);
    const b = await tryUpdate('owner', 'profiles', t.id, { points_balance: 40 });
    expect(b.error).toBeNull(); expect(b.changed).toBe(true);
  });

  it('super_admin SÍ puede cambiar el rol y llega a app_metadata', async () => {
    const t = await tempUser();
    restore.push(t.cleanup);
    const r = await tryUpdate('admin', 'profiles', t.id, { role: 'marketing' });
    expect(r.error).toBeNull(); expect(r.changed).toBe(true);
    expect((await svc().auth.admin.getUserById(t.id)).data.user?.app_metadata?.role).toBe('marketing');
  });

  it('el intento de escalada no deja rastro: tras volver a iniciar sesión el rol sigue siendo client', async () => {
    await tryUpdate('client', 'profiles', ids.client, { role: 'super_admin', points_balance: 5_000 });
    const { url, anonKey } = getLocalSupabase();
    const fresh = createClient(url, anonKey, { auth: { persistSession: false } });
    const { data } = await fresh.auth.signInWithPassword({ email: TEST_USERS.client.email, password: TEST_USERS.client.password });
    expect(data.user?.app_metadata?.role).toBe('client');
    expect((await row('profiles', ids.client, 'role')).role).toBe('client');
  });

  it('una sola sentencia con un campo permitido y uno prohibido se rechaza completa', async () => {
    const { changed, error } = await tryUpdate('client', 'profiles', ids.client, { phone: '1100000000', role: 'owner' });
    expect(error?.code).toBe('42501');
    expect(changed).toBe(false);
  });

  it('al crear un perfil, un owner no puede fijar rol, puntos ni estado: se fuerzan los valores seguros', async () => {
    const t = await tempUser();
    restore.push(t.cleanup);
    await svc().from('profiles').delete().eq('id', t.id);
    const owner = await as('owner');
    const { error } = await owner.from('profiles').insert({ id: t.id, full_name: 'X', role: 'super_admin', points_balance: 999, status: 'blocked' });
    expect(error).toBeNull();
    const p = await row('profiles', t.id, 'role, points_balance, status');
    expect(p).toEqual({ role: 'client', points_balance: 0, status: 'active' });
  });

  it('al crear un perfil, un super_admin sí puede fijar el rol', async () => {
    const t = await tempUser();
    restore.push(t.cleanup);
    await svc().from('profiles').delete().eq('id', t.id);
    const admin = await as('admin');
    const { error } = await admin.from('profiles').insert({ id: t.id, full_name: 'X', role: 'employee' });
    expect(error).toBeNull();
    expect((await row('profiles', t.id, 'role')).role).toBe('employee');
  });

  it('los cambios hechos por triggers internos (puntos) pasan el guardián', async () => {
    const m = await as('marketing');
    const { error } = await m.from('point_transactions').insert({ client_id: ids.client2, points: 3, source_type: 'manual_grant', created_by: ids.marketing });
    expect(error).toBeNull();
    expect((await row('profiles', ids.client2, 'points_balance')).points_balance).toBe(3);
    await svc().from('point_transactions').delete().eq('client_id', ids.client2);
    await svc().from('profiles').update({ points_balance: 0 }).eq('id', ids.client2);
  });
});

// ── products ──────────────────────────────────────────────────────────────────────────────────

describe('guardián de productos: marketing arma el catálogo, pero no toca el stock', () => {
  const P = FIXTURE.products.pastilla.id;
  let snapshot: Json;
  beforeAll(async () => { snapshot = await row('products', P, '*'); });
  afterEach(async () => { await svc().from('products').update(snapshot).eq('id', P); });

  it.each([
    ['stock_units', 9999],
  ])('marketing NO puede cambiar %s', async (col, value) => {
    const { changed, error } = await tryUpdate('marketing', 'products', P, { [col]: value });
    expect(changed, `marketing cambió ${col}`).toBe(false);
    expect(error?.code).toBe('42501');
  });

  it.each([
    ['promo_label', 'OFERTA'], ['is_featured', false], ['display_order', 7], ['image_url', 'https://x.test/a.png'],
    ['name', 'Otro nombre'], ['description', 'otra'], ['chlorine_type', 'otro'], ['price_cents', 1],
    ['unit', 'unidad'], ['weight_kg', 99], ['in_stock', false], ['is_active', false],
  ])('marketing SÍ puede cambiar %s', async (col, value) => {
    const { changed, error } = await tryUpdate('marketing', 'products', P, { [col]: value });
    expect(error).toBeNull();
    expect(changed).toBe(true);
  });

  it('un cambio mixto (visual + stock) se rechaza completo', async () => {
    const { changed, error } = await tryUpdate('marketing', 'products', P, { promo_label: 'X', stock_units: 1 });
    expect(error?.code).toBe('42501');
    expect(changed).toBe(false);
  });

  it('owner SÍ puede cambiar el precio y el stock', async () => {
    const { changed, error } = await tryUpdate('owner', 'products', P, { price_cents: 1_300_000 });
    expect(error).toBeNull();
    expect(changed).toBe(true);
  });

  it.each(['employee', 'client'] as const)('%s NO puede cambiar el precio', async (who) => {
    const { changed } = await tryUpdate(who, 'products', P, { price_cents: 1 });
    expect(changed).toBe(false);
  });
});

// ── itinerary_items ───────────────────────────────────────────────────────────────────────────

describe('guardián del itinerario: el empleado solo marca estado', () => {
  let itemId: string;
  let otherDayId: string;
  beforeAll(async () => {
    itemId = (await svc().from('itinerary_items').select('id').eq('pool_id', FIXTURE.pools.pool2.id).single()).data!.id;
    otherDayId = (await svc().from('itinerary_days').insert({ date: uniqueDate() }).select('id').single()).data!.id;
  });
  afterAll(async () => { await svc().from('itinerary_days').delete().eq('id', otherDayId); });
  afterEach(async () => {
    await svc().from('itinerary_items').update({ status: 'pending', completed_by: null, completed_at: null, assigned_employee_id: null, sort_order: 1 }).eq('id', itemId);
  });

  it('puede marcar la pileta como salteada o sin cliente; "hecha" solo se da registrando el service', async () => {
    for (const status of ['skipped', 'no_client']) {
      const r = await tryUpdate('employee', 'itinerary_items', itemId, { status });
      expect(r.error, status).toBeNull();
      expect(r.changed, status).toBe(true);
      await svc().from('itinerary_items').update({ status: 'pending', completed_by: null, completed_at: null }).eq('id', itemId);
    }
    const done = await tryUpdate('employee', 'itinerary_items', itemId, { status: 'done' });
    expect(done.changed).toBe(false);
    expect(done.error?.code).toBe('42501');
  });

  it.each([
    ['sort_order', 99], ['pool_id', FIXTURE.pools.pool1.id], ['assigned_employee_id', 'SELF'], ['itinerary_day_id', 'OTHER_DAY'],
  ])('NO puede cambiar %s', async (col, value) => {
    const v = col === 'itinerary_day_id' ? otherDayId : col === 'assigned_employee_id' ? ids.employee : value;
    const { changed, error } = await tryUpdate('employee', 'itinerary_items', itemId, { [col]: v });
    expect(changed, `el empleado cambió ${col}`).toBe(false);
    expect(error?.code).toBe('42501');
  });

  it('NO puede atribuirle la tarea completada a otro empleado: quién la cerró lo fija la base', async () => {
    const { error } = await (await as('employee')).from('itinerary_items').update({ status: 'skipped', completed_by: ids.admin }).eq('id', itemId);
    expect(error).toBeNull();
    const row = (await svc().from('itinerary_items').select('completed_by').eq('id', itemId).single()).data!;
    expect(row.completed_by).toBe(ids.employee);
  });

  it('NO puede tocar un item asignado a otro empleado (la fila no es visible para él)', async () => {
    await svc().from('itinerary_items').update({ assigned_employee_id: ids.owner }).eq('id', itemId);
    const { changed } = await tryUpdate('employee', 'itinerary_items', itemId, { status: 'done', completed_by: ids.employee });
    expect(changed).toBe(false);
  });

  it('SÍ puede tocar un item asignado a él', async () => {
    await svc().from('itinerary_items').update({ assigned_employee_id: ids.employee }).eq('id', itemId);
    const { changed, error } = await tryUpdate('employee', 'itinerary_items', itemId, { status: 'skipped' });
    expect(error).toBeNull();
    expect(changed).toBe(true);
  });

  it('owner SÍ puede reordenar y reasignar', async () => {
    const a = await tryUpdate('owner', 'itinerary_items', itemId, { sort_order: 5 });
    expect(a.changed).toBe(true);
    const b = await tryUpdate('owner', 'itinerary_items', itemId, { assigned_employee_id: ids.employee });
    expect(b.changed).toBe(true);
  });
});

// ── service_logs (alta por el empleado) ───────────────────────────────────────────────────────

describe('registro de service del empleado: solo sobre lo que le corresponde', () => {
  let itemId: string;
  const notes = () => rand('log');
  beforeAll(async () => { itemId = (await svc().from('itinerary_items').select('id').eq('pool_id', FIXTURE.pools.pool2.id).single()).data!.id; });
  afterEach(async () => {
    await svc().from('service_logs').delete().like('notes', 'log-%');
    await svc().from('itinerary_items').update({ status: 'pending', completed_by: null, completed_at: null, assigned_employee_id: null }).eq('id', itemId);
  });

  const valid = (): Json => ({ employee_id: ids.employee, pool_id: FIXTURE.pools.pool2.id, client_id: ids.client2, itinerary_item_id: itemId, notes: notes() });
  const insert = async (payload: Json) => (await (await as('employee')).from('service_logs').insert(payload)).error;

  it('con item, pileta y cliente coherentes: permitido', async () => {
    expect(await insert(valid())).toBeNull();
  });

  it('con el item asignado a él: permitido', async () => {
    await svc().from('itinerary_items').update({ assigned_employee_id: ids.employee }).eq('id', itemId);
    expect(await insert(valid())).toBeNull();
  });

  it.each([
    ['sin item de itinerario', () => ({ ...valid(), itinerary_item_id: null })],
    ['con un item inexistente', () => ({ ...valid(), itinerary_item_id: '00000000-0000-4000-9000-000000000000' })],
    ['con una pileta que no es la del item', () => ({ ...valid(), pool_id: FIXTURE.pools.pool1.id })],
    ['con un cliente que no es el dueño de la pileta', () => ({ ...valid(), client_id: ids.client })],
    ['a nombre de otro empleado', () => ({ ...valid(), employee_id: ids.admin })],
  ] as [string, () => Json][])('rechaza el registro %s', async (_label, build) => {
    const payload = build();
    const error = await insert(payload);
    expect(error?.code).toBe('42501');
    expect((await svc().from('service_logs').select('id').eq('notes', payload.notes as string)).data).toEqual([]);
  });

  it('rechaza el registro de un item asignado a otro empleado', async () => {
    await svc().from('itinerary_items').update({ assigned_employee_id: ids.owner }).eq('id', itemId);
    const error = await insert(valid());
    expect(error?.code).toBe('42501');
  });

  // Migración 22: el empleado edita y borra SUS registros de los últimos 7 días
  const daysAgo = (n: number) => {
    const d = new Date(`${todayInArgentina()}T12:00:00Z`);
    d.setUTCDate(d.getUTCDate() - n);
    return d.toISOString().slice(0, 10);
  };
  const looseLog = async (extra: Json = {}) =>
    (await svc().from('service_logs').insert({ ...valid(), itinerary_item_id: null, notes: notes(), ...extra }).select('id').single()).data!.id as string;

  it('el empleado edita y borra sus propios registros recientes', async () => {
    const id = await looseLog({ date: daysAgo(7) });
    const emp = await as('employee');
    const upd = await emp.from('service_logs').update({ notes: 'log-cambiado', chlorine_type: 'liquido', chlorine_amount: 2.5 }).eq('id', id).select('id');
    expect(upd.error).toBeNull();
    expect(upd.data).toHaveLength(1);
    expect(await row('service_logs', id, 'notes, chlorine_amount, chlorine_unit')).toEqual({ notes: 'log-cambiado', chlorine_amount: 2.5, chlorine_unit: 'l' });
    expect((await emp.from('service_logs').delete().eq('id', id).select('id')).data).toHaveLength(1);
  });

  it('no edita ni borra registros de más de 7 días ni los de otra persona', async () => {
    const old = await looseLog({ date: daysAgo(8) });
    const other = await looseLog({ employee_id: ids.admin });
    const emp = await as('employee');
    for (const id of [old, other]) {
      const upd = await emp.from('service_logs').update({ notes: 'log-cambiado' }).eq('id', id).select('id');
      const del = await emp.from('service_logs').delete().eq('id', id).select('id');
      expect(upd.data ?? []).toEqual([]);
      expect(del.data ?? []).toEqual([]);
      expect((await row('service_logs', id, 'notes')).notes).not.toBe('log-cambiado');
    }
  });

  it.each([
    ['quién lo hizo', { employee_id: 'ADMIN' }],
    ['la fecha', { date: 'YESTERDAY' }],
    ['la pileta', { pool_id: FIXTURE.pools.pool1.id }],
  ] as [string, Json][])('al editar no puede cambiar %s', async (_label, patch) => {
    const id = await looseLog();
    const p = Object.fromEntries(Object.entries(patch).map(([k, v]) => [k, v === 'ADMIN' ? ids.admin : v === 'YESTERDAY' ? daysAgo(1) : v]));
    const { error } = await (await as('employee')).from('service_logs').update(p).eq('id', id);
    expect(error?.code).toBe('42501');
  });

  it('el owner sí corrige quién hizo la visita y la fecha (nunca a futuro)', async () => {
    const id = await looseLog();
    const owner = await as('owner');
    expect((await owner.from('service_logs').update({ employee_id: ids.owner, date: daysAgo(30) }).eq('id', id)).error).toBeNull();
    expect(await row('service_logs', id, 'employee_id, date')).toEqual({ employee_id: ids.owner, date: daysAgo(30) });
    expect((await owner.from('service_logs').update({ date: daysAgo(-1) }).eq('id', id)).error?.code).toBe('PA002');
    // y el autor tiene que ser alguien del equipo
    expect((await owner.from('service_logs').update({ employee_id: ids.client }).eq('id', id)).error?.code).toBe('22023');
  });
});

// ── Alcance de datos del empleado ─────────────────────────────────────────────────────────────

describe('el empleado solo ve las piletas (y los clientes) de su itinerario', () => {
  const cleanups: (() => Promise<unknown>)[] = [];
  afterEach(async () => { for (const c of cleanups.splice(0)) await c(); });

  async function scenario(assigned: string | null | 'none') {
    const t = await tempUser();
    const pool = (await svc().from('pools').insert({ client_id: t.id, address: rand('dir') }).select('id').single()).data!.id as string;
    cleanups.push(t.cleanup, async () => { await svc().from('pools').delete().eq('id', pool); });
    if (assigned !== 'none') {
      const day = (await svc().from('itinerary_days').select('id').limit(1).single()).data!.id;
      const item = (await svc().from('itinerary_items').insert({ itinerary_day_id: day, pool_id: pool, assigned_employee_id: assigned }).select('id').single()).data!.id as string;
      cleanups.push(async () => { await svc().from('itinerary_items').delete().eq('id', item); });
    }
    const emp = await as('employee');
    const seesPool = ((await emp.from('pools').select('id').eq('id', pool)).data ?? []).length === 1;
    const seesClient = ((await emp.from('profiles').select('id').eq('id', t.id)).data ?? []).length === 1;
    return { seesPool, seesClient };
  }

  it('una pileta que no está en ningún itinerario: no la ve, ni a su cliente', async () => {
    expect(await scenario('none')).toEqual({ seesPool: false, seesClient: false });
  });

  it('en un itinerario sin asignar (para todos): la ve, y al cliente también', async () => {
    expect(await scenario(null)).toEqual({ seesPool: true, seesClient: true });
  });

  it('asignada a él: la ve', async () => {
    expect(await scenario(ids.employee)).toEqual({ seesPool: true, seesClient: true });
  });

  it('asignada a otro empleado: no la ve, ni a su cliente', async () => {
    expect(await scenario(ids.owner)).toEqual({ seesPool: false, seesClient: false });
  });
});
