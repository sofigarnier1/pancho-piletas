/**
 * Triggers y funciones de la base: puntos y nivel, stock, cierre de itinerario, sincronización de rol,
 * alta de perfil, updated_at, unicidad, restricciones CHECK y adjust_stock (incluido concurrente).
 * Cada test deja la base como la encontró.
 */
import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { TestUserKey } from '../../e2e/support/env';
import { FIXTURE } from '../../e2e/support/seed';
import { as, rand, restoreClientPoints, svc, tempUser, uniqueDate, userIds } from '../support/clients';

let ids: Record<TestUserKey, string>;
beforeAll(async () => { ids = await userIds(); });

const one = async <T>(q: PromiseLike<{ data: T; error: { message: string } | null }>): Promise<NonNullable<T>> => {
  const { data, error } = await q;
  if (error || data === null || data === undefined) throw new Error(`consulta falló: ${error?.message}`);
  return data as NonNullable<T>;
};
const profile = (id: string) => one(svc().from('profiles').select('points_balance, client_level_id, role, full_name, status').eq('id', id).single());
const levelName = async (levelId: string | null) =>
  levelId ? (await one(svc().from('client_levels').select('name').eq('id', levelId).single())).name : null;
const stockOf = async (productId: string) => (await one(svc().from('products').select('stock_units').eq('id', productId).single())).stock_units as number;
const setStock = (productId: string, n: number) => svc().from('products').update({ stock_units: n }).eq('id', productId);

// ── Puntos y nivel ────────────────────────────────────────────────────────────────────────────

describe('trigger · puntos y nivel del cliente', () => {
  beforeEach(() => restoreClientPoints(ids.client, FIXTURE.clientPoints));
  afterEach(() => restoreClientPoints(ids.client, FIXTURE.clientPoints));

  const grant = (points: number, actor: 'admin' | 'marketing' | 'owner' = 'admin', client = ids.client) =>
    as(actor).then((c) => c.from('point_transactions').insert({ client_id: client, points, source_type: 'manual_grant', notes: rand('pts'), created_by: ids[actor] }));

  it('el seed deja al cliente con sus puntos y nivel Bronce', async () => {
    const p = await profile(ids.client);
    expect(p.points_balance).toBe(FIXTURE.clientPoints);
    expect(await levelName(p.client_level_id)).toBe('Bronce');
  });

  it('suma los puntos al saldo', async () => {
    expect((await grant(100)).error).toBeNull();
    expect((await profile(ids.client)).points_balance).toBe(FIXTURE.clientPoints + 100);
  });

  it('acumula varias transacciones', async () => {
    await grant(30); await grant(20); await grant(5);
    expect((await profile(ids.client)).points_balance).toBe(FIXTURE.clientPoints + 55);
  });

  it.each([
    [489, 'Bronce'], // 499 en total: un punto menos que Plata
    [490, 'Plata'],  // 500 en total: el umbral es inclusivo
    [1489, 'Plata'], // 1499
    [1490, 'Oro'],   // 1500
  ])('con %i puntos extra el nivel es %s', async (extra, level) => {
    await grant(extra);
    const p = await profile(ids.client);
    expect(p.points_balance).toBe(FIXTURE.clientPoints + extra);
    expect(await levelName(p.client_level_id)).toBe(level);
  });

  it('restar puntos baja el saldo y vuelve a calcular el nivel', async () => {
    await grant(1490); // 1500 → Oro
    expect(await levelName((await profile(ids.client)).client_level_id)).toBe('Oro');
    await grant(-1100); // 400 → Bronce
    const p = await profile(ids.client);
    expect(p.points_balance).toBe(400);
    expect(await levelName(p.client_level_id)).toBe('Bronce');
  });

  it('marketing también actualiza el saldo (el recálculo corre con permisos de sistema)', async () => {
    expect((await grant(7, 'marketing')).error).toBeNull();
    expect((await profile(ids.client)).points_balance).toBe(FIXTURE.clientPoints + 7);
  });

  it('el dueño ya no carga puntos (solo los mira; migración 25) y el saldo no cambia', async () => {
    const before = (await profile(ids.client)).points_balance;
    expect((await grant(3, 'owner')).error).not.toBeNull();
    expect((await profile(ids.client)).points_balance).toBe(before);
  });

  it('no afecta a otros clientes', async () => {
    const before = await profile(ids.client2);
    await grant(900);
    const after = await profile(ids.client2);
    expect(after.points_balance).toBe(before.points_balance);
    expect(after.client_level_id).toBe(before.client_level_id);
  });
});

// ── Stock ─────────────────────────────────────────────────────────────────────────────────────

describe('trigger · stock por venta manual', () => {
  const P = FIXTURE.products.combo.id;
  let initial: number;
  const saleIds: string[] = [];
  beforeEach(async () => { initial = await stockOf(P); });
  afterEach(async () => {
    for (const id of saleIds.splice(0)) await svc().from('manual_sales').delete().eq('id', id);
    await setStock(P, initial);
  });

  const sell = async (qty: number, productId: string | null) => {
    const { data: sale } = await svc().from('manual_sales').insert({ client_id: ids.client, sold_by: ids.owner, total_cents: qty }).select('id').single();
    saleIds.push(sale!.id);
    return svc().from('manual_sale_items').insert({ manual_sale_id: sale!.id, product_id: productId, product_name: 'x', quantity: qty, unit_price_cents: 1 });
  };

  it('descuenta la cantidad vendida', async () => {
    expect((await sell(3, P)).error).toBeNull();
    expect(await stockOf(P)).toBe(initial - 3);
  });

  it('no deja el stock negativo: se detiene en 0', async () => {
    expect((await sell(initial + 500, P)).error).toBeNull();
    expect(await stockOf(P)).toBe(0);
  });

  it('un ítem sin producto no toca ningún stock', async () => {
    const other = await stockOf(FIXTURE.products.granulado.id);
    expect((await sell(5, null)).error).toBeNull();
    expect(await stockOf(P)).toBe(initial);
    expect(await stockOf(FIXTURE.products.granulado.id)).toBe(other);
  });

  it('no toca el stock de otros productos', async () => {
    const other = await stockOf(FIXTURE.products.granulado.id);
    await sell(2, P);
    expect(await stockOf(FIXTURE.products.granulado.id)).toBe(other);
  });
});

describe('trigger · stock por pedido online pagado', () => {
  const P = FIXTURE.products.granulado.id;
  let initial: number;
  const orders: string[] = [];
  beforeEach(async () => { initial = await stockOf(P); });
  afterEach(async () => {
    for (const id of orders.splice(0)) await svc().from('orders').delete().eq('id', id);
    await setStock(P, initial);
  });

  const makeOrder = async (qty: number, status = 'pending') => {
    const { data: o } = await svc().from('orders').insert({ client_id: ids.client, status, subtotal_cents: 1, total_cents: 1 }).select('id').single();
    orders.push(o!.id);
    await svc().from('order_items').insert({ order_id: o!.id, product_id: P, product_name: 'x', quantity: qty, unit_price_cents: 1 });
    return o!.id;
  };
  const setStatus = (id: string, status: string) => svc().from('orders').update({ status }).eq('id', id);

  it('pendiente → pagado descuenta el stock', async () => {
    const id = await makeOrder(4);
    expect(await stockOf(P)).toBe(initial); // crear el pedido no descuenta
    expect((await setStatus(id, 'paid')).error).toBeNull();
    expect(await stockOf(P)).toBe(initial - 4);
  });

  it('pagado → pagado no descuenta dos veces', async () => {
    const id = await makeOrder(2);
    await setStatus(id, 'paid');
    await setStatus(id, 'paid');
    expect(await stockOf(P)).toBe(initial - 2);
  });

  it('pagado → preparado → enviado → entregado no vuelve a descontar', async () => {
    const id = await makeOrder(2);
    await setStatus(id, 'paid');
    for (const s of ['preparing', 'shipped', 'delivered']) await setStatus(id, s);
    expect(await stockOf(P)).toBe(initial - 2);
  });

  it('cancelar un pedido pendiente no toca el stock', async () => {
    const id = await makeOrder(3);
    await setStatus(id, 'cancelled');
    expect(await stockOf(P)).toBe(initial);
  });

  it('se detiene en 0 si el stock no alcanza', async () => {
    const id = await makeOrder(initial + 100);
    await setStatus(id, 'paid');
    expect(await stockOf(P)).toBe(0);
  });

  it('descuenta cada ítem del pedido', async () => {
    const id = await makeOrder(2);
    const other = FIXTURE.products.pastilla.id;
    const otherInitial = await stockOf(other);
    await svc().from('order_items').insert({ order_id: id, product_id: other, product_name: 'y', quantity: 5, unit_price_cents: 1 });
    await setStatus(id, 'paid');
    expect(await stockOf(P)).toBe(initial - 2);
    expect(await stockOf(other)).toBe(otherInitial - 5);
    await setStock(other, otherInitial);
  });
});

// ── Itinerario ────────────────────────────────────────────────────────────────────────────────

describe('trigger · el registro de service cierra el item del itinerario', () => {
  let itemId: string;
  const logs: string[] = [];
  beforeEach(async () => {
    const items = await one(svc().from('itinerary_items').select('id').eq('pool_id', FIXTURE.pools.pool2.id));
    itemId = items[0].id;
  });
  afterEach(async () => {
    for (const id of logs.splice(0)) await svc().from('service_logs').delete().eq('id', id);
    await svc().from('itinerary_items').update({ status: 'pending', completed_by: null, completed_at: null }).eq('id', itemId);
  });

  const log = async (employeeId: string, item: string | null) => {
    const { data, error } = await svc().from('service_logs').insert({
      employee_id: employeeId, pool_id: FIXTURE.pools.pool2.id, client_id: ids.client2, itinerary_item_id: item, notes: rand('svc'),
    }).select('id').single();
    if (data) logs.push(data.id);
    return error;
  };
  const item = () => one(svc().from('itinerary_items').select('status, completed_by, completed_at').eq('id', itemId).single());

  it('marca el item como hecho, con quién y cuándo', async () => {
    expect(await log(ids.employee, itemId)).toBeNull();
    const it = await item();
    expect(it.status).toBe('done');
    expect(it.completed_by).toBe(ids.employee);
    expect(it.completed_at).not.toBeNull();
  });

  it('el primero que la cierra la cierra para el equipo: un segundo registro no pisa a quién la completó', async () => {
    await log(ids.employee, itemId);
    const first = await item();
    await log(ids.admin, itemId);
    const second = await item();
    expect(second.completed_by).toBe(ids.employee);
    expect(second.completed_at).toBe(first.completed_at);
  });

  it('un registro sin item de itinerario no falla ni toca otros items', async () => {
    expect(await log(ids.employee, null)).toBeNull();
    expect((await item()).status).toBe('pending');
  });

  it('un registro sobre una visita salteada la da por hecha (migración 22: el registro manda)', async () => {
    await svc().from('itinerary_items').update({ status: 'skipped', completed_by: ids.employee, completed_at: new Date().toISOString() }).eq('id', itemId);
    expect(await log(ids.admin, itemId)).toBeNull();
    const it = await item();
    expect(it.status).toBe('done');
    expect(it.completed_by).toBe(ids.admin);
  });

  it('borrar el último registro de una visita la vuelve a pendiente', async () => {
    await log(ids.employee, itemId);
    await svc().from('service_logs').delete().in('id', logs.splice(0));
    expect(await item()).toMatchObject({ status: 'pending', completed_by: null, completed_at: null });
  });
});

describe('restricción · una pileta no puede repetirse en el mismo día', () => {
  it('el segundo insert falla con clave duplicada (23505)', async () => {
    const day = (await one(svc().from('itinerary_days').select('id').limit(1)))[0].id;
    const { error } = await svc().from('itinerary_items').insert({ itinerary_day_id: day, pool_id: FIXTURE.pools.pool1.id });
    expect(error?.code).toBe('23505');
  });

  it('la misma pileta sí puede estar en otro día', async () => {
    const { data: day } = await svc().from('itinerary_days').insert({ date: uniqueDate() }).select('id').single();
    const { error } = await svc().from('itinerary_items').insert({ itinerary_day_id: day!.id, pool_id: FIXTURE.pools.pool1.id });
    expect(error).toBeNull();
    await svc().from('itinerary_days').delete().eq('id', day!.id);
  });

  it('el upsert de "copiar semana" con onConflict no duplica ni falla', async () => {
    const { data: day } = await svc().from('itinerary_days').insert({ date: uniqueDate() }).select('id').single();
    const rows = [{ itinerary_day_id: day!.id, pool_id: FIXTURE.pools.pool1.id, sort_order: 0 }, { itinerary_day_id: day!.id, pool_id: FIXTURE.pools.pool2.id, sort_order: 1 }];
    for (let i = 0; i < 2; i++) {
      const { error } = await svc().from('itinerary_items').upsert(rows, { onConflict: 'itinerary_day_id,pool_id', ignoreDuplicates: true });
      expect(error).toBeNull();
    }
    const { count } = await svc().from('itinerary_items').select('*', { count: 'exact', head: true }).eq('itinerary_day_id', day!.id);
    expect(count).toBe(2);
    await svc().from('itinerary_days').delete().eq('id', day!.id);
  });

  it('una fecha de itinerario es única', async () => {
    const date = uniqueDate();
    await svc().from('itinerary_days').insert({ date });
    const { error } = await svc().from('itinerary_days').insert({ date });
    expect(error?.code).toBe('23505');
    await svc().from('itinerary_days').delete().eq('date', date);
  });
});

// ── Usuarios y perfiles ───────────────────────────────────────────────────────────────────────

describe('trigger · alta de usuario y sincronización de rol', () => {
  it('un usuario nuevo recibe perfil de cliente con el nombre de su metadata', async () => {
    const t = await tempUser();
    const p = await profile(t.id);
    expect(p.role).toBe('client');
    expect(p.full_name).toBe('Temporal');
    expect(p.points_balance).toBe(0);
    await t.cleanup();
  });

  it('sin nombre en la metadata usa la parte local del email', async () => {
    const email = `${rand('sinnombre')}@piletaspancho.test`;
    const { data } = await svc().auth.admin.createUser({ email, password: 'TmpPass123!', email_confirm: true });
    expect((await profile(data.user!.id)).full_name).toBe(email.split('@')[0]);
    await svc().auth.admin.deleteUser(data.user!.id);
  });

  it('acepta "nombre" como alternativa a "full_name"', async () => {
    const { data } = await svc().auth.admin.createUser({
      email: `${rand('nom')}@piletaspancho.test`, password: 'TmpPass123!', email_confirm: true, user_metadata: { nombre: 'Ana Gómez' },
    });
    expect((await profile(data.user!.id)).full_name).toBe('Ana Gómez');
    await svc().auth.admin.deleteUser(data.user!.id);
  });

  it('aunque el registro mande role en la metadata, el perfil nace como cliente', async () => {
    const { data } = await svc().auth.admin.createUser({
      email: `${rand('hack')}@piletaspancho.test`, password: 'TmpPass123!', email_confirm: true,
      user_metadata: { role: 'super_admin', full_name: 'X' },
    });
    expect((await profile(data.user!.id)).role).toBe('client');
    await svc().auth.admin.deleteUser(data.user!.id);
  });

  it('cambiar el rol del perfil actualiza app_metadata del usuario (lo que lee el middleware)', async () => {
    const t = await tempUser();
    for (const role of ['owner', 'marketing', 'employee', 'client']) {
      await svc().from('profiles').update({ role }).eq('id', t.id);
      const { data } = await svc().auth.admin.getUserById(t.id);
      expect(data.user?.app_metadata?.role, `rol ${role}`).toBe(role);
    }
    await t.cleanup();
  });

  it('el perfil del usuario creado tiene el rol en app_metadata desde el alta', async () => {
    const t = await tempUser();
    const { data } = await svc().auth.admin.getUserById(t.id);
    // el trigger de alta inserta el perfil, y de ahí se sincroniza el rol
    expect(data.user?.app_metadata?.role).toBe('client');
    await t.cleanup();
  });

  it('borrar el usuario borra su perfil y sus datos asociados (cascada)', async () => {
    const t = await tempUser();
    await svc().from('client_profiles').insert({ id: t.id });
    await t.cleanup();
    expect((await svc().from('profiles').select('id').eq('id', t.id)).data).toEqual([]);
    expect((await svc().from('client_profiles').select('id').eq('id', t.id)).data).toEqual([]);
  });
});

describe('trigger · updated_at (set_updated_at) en todas las tablas que lo tienen', () => {
  // tabla → [fila de prueba, columna a modificar, valor nuevo]
  const CASES: [string, () => Record<string, string>, string, unknown][] = [
    ['profiles', () => ({ id: ids.client2 }), 'phone', '1100001111'],
    ['client_profiles', () => ({ id: ids.client2 }), 'neighborhood', 'Barrio nuevo'],
    ['employee_profiles', () => ({ id: ids.employee }), 'vehicle', 'Moto'],
    ['pools', () => ({ id: FIXTURE.pools.pool1.id }), 'nickname', 'Apodo nuevo'],
    ['products', () => ({ id: FIXTURE.products.granulado.id }), 'promo_label', 'PROMO'],
    ['orders', () => ({ id: FIXTURE.order.id }), 'shipping_notes', 'nota nueva'],
    ['point_rules', () => ({ id: FIXTURE.pointRule.id }), 'description', 'desc nueva'],
    ['landing_content', () => ({ id: '__cta__' }), 'value', 'texto nuevo'],
  ];

  it.each(CASES)('%s: se actualiza al modificar la fila', async (table, where, column, value) => {
    const [[key, rawId]] = Object.entries(where());
    const id = rawId === '__cta__' ? (await one(svc().from('landing_content').select('id').eq('section', 'hero').eq('key', 'cta_text').single())).id : rawId;
    const before = await one(svc().from(table).select(`updated_at, ${column}`).eq(key, id).single()) as unknown as Record<string, string>;
    await new Promise((r) => setTimeout(r, 25));
    expect((await svc().from(table).update({ [column]: value }).eq(key, id)).error).toBeNull();
    const after = await one(svc().from(table).select('updated_at').eq(key, id).single());
    expect(new Date(after.updated_at).getTime(), `${table}.updated_at no cambió`).toBeGreaterThan(new Date(before.updated_at).getTime());
    await svc().from(table).update({ [column]: before[column] }).eq(key, id);
  });

  it('niveles, días e ítems del itinerario también', async () => {
    const level = await one(svc().from('client_levels').select('id, updated_at').limit(1).single());
    const day = await one(svc().from('itinerary_days').select('id, updated_at').limit(1).single());
    const item = await one(svc().from('itinerary_items').select('id, updated_at, sort_order').limit(1).single());
    await new Promise((r) => setTimeout(r, 25));
    await svc().from('client_levels').update({ sort_order: 1 }).eq('id', level.id);
    await svc().from('itinerary_days').update({ notes: 'x' }).eq('id', day.id);
    await svc().from('itinerary_items').update({ sort_order: item.sort_order }).eq('id', item.id);
    for (const [table, row] of [['client_levels', level], ['itinerary_days', day], ['itinerary_items', item]] as const) {
      const after = await one(svc().from(table).select('updated_at').eq('id', row.id).single());
      expect(new Date(after.updated_at).getTime(), `${table}`).toBeGreaterThan(new Date(row.updated_at).getTime());
    }
    await svc().from('itinerary_days').update({ notes: null }).eq('id', day.id);
  });
});

// ── Restricciones CHECK ───────────────────────────────────────────────────────────────────────

describe('restricciones CHECK: los datos inválidos se rechazan en la base', () => {
  const CHECK = '23514';
  const day = () => one(svc().from('itinerary_days').select('id').limit(1)).then((r) => r[0].id as string);
  const base = {
    product: { name: 'x', chlorine_type: 'otro', price_cents: 1, unit: 'unidad' },
    order: { client_id: '', subtotal_cents: 1, total_cents: 1 },
  };

  const cases: [string, string, () => Record<string, unknown>][] = [
    ['products', 'precio negativo', () => ({ ...base.product, price_cents: -1 })],
    ['products', 'stock negativo', () => ({ ...base.product, stock_units: -1 })],
    ['products', 'tipo de cloro inválido', () => ({ ...base.product, chlorine_type: 'gas' })],
    ['products', 'unidad inválida', () => ({ ...base.product, unit: 'tonelada' })],
    ['orders', 'estado inválido', () => ({ ...base.order, client_id: ids.client, status: 'regalado' })],
    ['orders', 'total negativo', () => ({ ...base.order, client_id: ids.client, total_cents: -5 })],
    ['order_items', 'cantidad 0', () => ({ order_id: FIXTURE.order.id, product_id: FIXTURE.products.pastilla.id, product_name: 'x', quantity: 0, unit_price_cents: 1 })],
    ['order_items', 'precio unitario negativo', () => ({ order_id: FIXTURE.order.id, product_id: FIXTURE.products.pastilla.id, product_name: 'x', quantity: 1, unit_price_cents: -1 })],
    ['manual_sales', 'total negativo', () => ({ client_id: ids.client, sold_by: ids.owner, total_cents: -1 })],
    ['manual_sale_items', 'cantidad 0', () => ({ manual_sale_id: FIXTURE.manualSale.id, product_name: 'x', quantity: 0, unit_price_cents: 1 })],
    ['client_levels', 'puntos mínimos negativos', () => ({ name: rand('n'), min_points: -1 })],
    ['point_rules', 'puntos por 100 ARS = 0', () => ({ name: rand('r'), trigger_type: 'service', points_per_100_ars: 0 })],
    ['point_rules', 'tipo de disparador inválido', () => ({ name: rand('r'), trigger_type: 'magia', points_per_100_ars: 1 })],
    ['point_transactions', 'origen inválido', () => ({ client_id: ids.client, points: 1, source_type: 'robo' })],
    ['service_logs', 'tipo de cloro inválido', () => ({ employee_id: ids.employee, pool_id: FIXTURE.pools.pool1.id, client_id: ids.client, chlorine_type: 'agua' })],
  ];
  it.each(cases)('%s: %s', async (table, _label, build) => {
    const { error } = await svc().from(table).insert(build());
    expect(error?.code, error?.message).toBe(CHECK);
  });

  it('itinerary_items: estado inválido', async () => {
    const { error } = await svc().from('itinerary_items').insert({ itinerary_day_id: await day(), pool_id: FIXTURE.pools.pool1.id, status: 'volando' });
    // pool1 ya está en ese día (23505) o el estado es inválido (23514): cualquiera de los dos es un rechazo
    expect(['23514', '23505']).toContain(error?.code);
  });

  it('profiles: estado inválido', async () => {
    const { error } = await svc().from('profiles').update({ status: 'vip' }).eq('id', ids.client2);
    expect(error?.code).toBe(CHECK);
  });

  it('profiles: rol inválido (enum)', async () => {
    const { error } = await svc().from('profiles').update({ role: 'dios' }).eq('id', ids.client2);
    expect(error).not.toBeNull();
  });
});

// ── adjust_stock ──────────────────────────────────────────────────────────────────────────────

describe('función adjust_stock', () => {
  const P = FIXTURE.products.pastilla.id;
  let initial: number;
  beforeEach(async () => { initial = await stockOf(P); });
  afterEach(async () => { await setStock(P, initial); });

  const adjust = async (actor: Parameters<typeof as>[0], delta: number, product: string = P) =>
    (await as(actor)).rpc('adjust_stock', { p_product_id: product, p_delta: delta });

  it('suma y devuelve el stock nuevo', async () => {
    const { data, error } = await adjust('owner', 5);
    expect(error).toBeNull();
    expect(data).toBe(initial + 5);
    expect(await stockOf(P)).toBe(initial + 5);
  });

  it('resta', async () => {
    const { data } = await adjust('admin', -3);
    expect(data).toBe(initial - 3);
  });

  it('nunca deja el stock negativo', async () => {
    const { data, error } = await adjust('owner', -(initial + 1000));
    expect(error).toBeNull();
    expect(data).toBe(0);
    expect(await stockOf(P)).toBe(0);
  });

  it('delta 0 no cambia nada', async () => {
    expect((await adjust('owner', 0)).data).toBe(initial);
  });

  it('diez ajustes simultáneos de +1 suman exactamente 10 (sin pisarse)', async () => {
    const results = await Promise.all(Array.from({ length: 10 }, () => adjust('owner', 1)));
    expect(results.every((r) => !r.error)).toBe(true);
    expect(await stockOf(P)).toBe(initial + 10);
  });

  it('ajustes simultáneos de signo opuesto se compensan', async () => {
    await Promise.all([...Array.from({ length: 6 }, () => adjust('owner', 2)), ...Array.from({ length: 6 }, () => adjust('admin', -2))]);
    expect(await stockOf(P)).toBe(initial);
  });

  it('un producto inexistente da error', async () => {
    const { error } = await adjust('owner', 1, '00000000-0000-4000-a000-0000000000ff');
    expect(error?.code).toBe('P0002');
  });

  it.each(['anon', 'client', 'client2', 'employee'] as const)('%s no puede ajustar stock', async (actor) => {
    const { error } = await adjust(actor, 50);
    expect(error, 'debería fallar').not.toBeNull();
    expect(await stockOf(P)).toBe(initial);
  });

  it('marketing no puede ajustar stock (el stock es del dueño)', async () => {
    const { error } = await adjust('marketing', 50);
    expect(error).not.toBeNull();
    expect(await stockOf(P)).toBe(initial);
  });
});

describe('funciones internas no expuestas', () => {
  it.each(['update_client_points_and_level', 'sync_role_to_app_metadata', 'handle_new_user'])('%s no se puede llamar desde la API pública', async (fn) => {
    for (const actor of ['anon', 'client', 'owner', 'admin'] as const) {
      const { error } = await (await as(actor)).rpc(fn);
      expect(error, `${actor} pudo llamar a ${fn}`).not.toBeNull();
    }
  });
});
