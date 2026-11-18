/**
 * Integridad de datos (migraciones 14, 15 y 16):
 *  - varios registros de service por visita (migración 22; antes, uno solo)
 *  - una cuenta bloqueada no accede a nada privado y pierde sus sesiones
 *  - venta manual atómica y faltante de stock registrado
 */
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import type { TestUserKey } from '../../e2e/support/env';
import { FIXTURE } from '../../e2e/support/seed';
import { as, rand, signInAs, svc, tempUser, userIds, type TempUser } from '../support/clients';

let ids: Record<TestUserKey, string>;
beforeAll(async () => { ids = await userIds(); });

// ── Service: varios registros por visita ──────────────────────────────────────────────────────────

describe('service_logs · varios registros por visita (migración 22)', () => {
  let itemId: string;
  const extra: TempUser[] = [];
  beforeAll(async () => {
    const { data } = await svc().from('itinerary_items').select('id').eq('pool_id', FIXTURE.pools.pool2.id);
    itemId = data![0].id;
  });
  afterEach(async () => {
    await svc().from('service_logs').delete().eq('itinerary_item_id', itemId);
    await svc().from('itinerary_items').update({ status: 'pending', completed_by: null, completed_at: null, assigned_employee_id: null }).eq('id', itemId);
    for (const u of extra.splice(0)) await u.cleanup();
  });

  const payload = (employeeId: string, notes = rand('dup')) => ({
    itinerary_item_id: itemId, employee_id: employeeId, pool_id: FIXTURE.pools.pool2.id, client_id: ids.client2, notes,
  });
  const logs = async () => (await svc().from('service_logs').select('id, employee_id').eq('itinerary_item_id', itemId)).data ?? [];
  const item = async () => (await svc().from('itinerary_items').select('status, completed_by').eq('id', itemId).single()).data!;

  it('un segundo registro sobre la misma visita se guarda; la visita conserva quién la cerró primero', async () => {
    expect((await svc().from('service_logs').insert(payload(ids.employee))).error).toBeNull();
    expect((await svc().from('service_logs').insert(payload(ids.admin))).error).toBeNull();
    expect(await logs()).toHaveLength(2);
    expect(await item()).toEqual({ status: 'done', completed_by: ids.employee });
  });

  it('dos empleados registrando al mismo tiempo: quedan los dos registros y la visita hecha', async () => {
    const second = await tempUser('employee'); extra.push(second);
    const [a, b] = await Promise.all([as('employee'), signInAs(second.email)]);
    const results = await Promise.all([
      a.from('service_logs').insert(payload(ids.employee, 'a')),
      b.from('service_logs').insert(payload(second.id, 'b')),
    ]);
    expect(results.map((r) => r.error)).toEqual([null, null]);
    const all = await logs();
    expect(all).toHaveLength(2);
    const it2 = await item();
    expect(it2.status).toBe('done');
    expect(all.map((l) => l.employee_id)).toContain(it2.completed_by);
  });

  it('registrar el service de una visita salteada o "no estaba el cliente" la da por hecha', async () => {
    for (const status of ['skipped', 'no_client']) {
      await svc().from('itinerary_items').update({ status, completed_by: ids.admin, completed_at: new Date().toISOString() }).eq('id', itemId);
      expect((await (await as('employee')).from('service_logs').insert(payload(ids.employee))).error, status).toBeNull();
      expect(await item(), status).toEqual({ status: 'done', completed_by: ids.employee });
      await svc().from('service_logs').delete().eq('itinerary_item_id', itemId);
    }
  });

  it('borrar uno de dos registros deja la visita hecha; borrar el último la vuelve a pendiente', async () => {
    const emp = await as('employee');
    const first = (await emp.from('service_logs').insert(payload(ids.employee)).select('id').single()).data!.id as string;
    const second = (await svc().from('service_logs').insert(payload(ids.admin)).select('id').single()).data!.id as string;
    expect((await svc().from('service_logs').delete().eq('id', second)).error).toBeNull();
    expect((await item()).status).toBe('done');
    expect((await emp.from('service_logs').delete().eq('id', first).select('id')).data).toHaveLength(1);
    expect(await item()).toEqual({ status: 'pending', completed_by: null });
  });

  it('un empleado no cambia a mano el estado de una visita hecha (se corrige con sus registros); el owner sí', async () => {
    await svc().from('itinerary_items').update({ status: 'done', completed_by: ids.admin, completed_at: new Date().toISOString() }).eq('id', itemId);
    const emp = await as('employee');
    for (const status of ['pending', 'skipped', 'no_client']) {
      const { error } = await emp.from('itinerary_items').update({ status }).eq('id', itemId);
      expect(error?.code, status).toBe('42501');
    }
    expect((await item()).status).toBe('done');

    const owner = await as('owner');
    expect((await owner.from('itinerary_items').update({ status: 'pending', completed_by: null, completed_at: null }).eq('id', itemId)).error).toBeNull();
    expect((await item()).status).toBe('pending');
  });

  it('el empleado puede corregir una visita salteada (volver a pendiente o "no estaba")', async () => {
    const emp = await as('employee');
    expect((await emp.from('itinerary_items').update({ status: 'skipped' }).eq('id', itemId)).error).toBeNull();
    expect((await emp.from('itinerary_items').update({ status: 'no_client' }).eq('id', itemId)).error).toBeNull();
    expect(await item()).toEqual({ status: 'no_client', completed_by: ids.employee });
    expect((await emp.from('itinerary_items').update({ status: 'pending' }).eq('id', itemId)).error).toBeNull();
    expect(await item()).toEqual({ status: 'pending', completed_by: null });
  });

  it('un item pendiente sigue pudiendo cerrarse (el cambio no rompe el camino normal)', async () => {
    expect((await (await as('employee')).from('service_logs').insert(payload(ids.employee))).error).toBeNull();
    expect((await item()).status).toBe('done');
  });
});

// ── Cuentas bloqueadas ───────────────────────────────────────────────────────────────────────

describe('cuentas bloqueadas', () => {
  const users: TempUser[] = [];
  afterEach(async () => { for (const u of users.splice(0)) await u.cleanup(); });
  const block = (id: string, status = 'blocked') => svc().from('profiles').update({ status }).eq('id', id);
  const make = async (role?: string) => { const u = await tempUser(role); users.push(u); return u; };

  it('my_account_status devuelve el estado de la cuenta; sin sesión no se puede llamar', async () => {
    const u = await make();
    const client = await signInAs(u.email);
    expect((await client.rpc('my_account_status')).data).toBe('active');
    await block(u.id);
    expect((await client.rpc('my_account_status')).data).toBe('blocked');
    expect((await (await as('anon')).rpc('my_account_status')).error).not.toBeNull();
  });

  it('una cuenta bloqueada no lee su perfil ni sus datos privados; al desbloquearla vuelve todo', async () => {
    const u = await make();
    const client = await signInAs(u.email);
    expect((await client.from('profiles').select('id').eq('id', u.id)).data).toHaveLength(1);

    await block(u.id);
    expect((await client.from('profiles').select('id').eq('id', u.id)).data).toEqual([]);
    expect((await client.from('point_transactions').select('id')).data).toEqual([]);
    expect((await client.from('orders').select('id')).data).toEqual([]);

    await block(u.id, 'active');
    expect((await client.from('profiles').select('id').eq('id', u.id)).data).toHaveLength(1);
  });

  it('una cuenta "inactive" NO está bloqueada (sigue operando)', async () => {
    const u = await make();
    const client = await signInAs(u.email);
    await block(u.id, 'inactive');
    expect((await client.from('profiles').select('id').eq('id', u.id)).data).toHaveLength(1);
    expect((await client.rpc('my_account_status')).data).toBe('inactive');
  });

  it('un empleado bloqueado no puede registrar service', async () => {
    const u = await make('employee');
    const client = await signInAs(u.email);
    await block(u.id);
    const { data: items } = await svc().from('itinerary_items').select('id').eq('pool_id', FIXTURE.pools.pool2.id);
    const { error } = await client.from('service_logs').insert({
      itinerary_item_id: items![0].id, employee_id: u.id, pool_id: FIXTURE.pools.pool2.id, client_id: ids.client2,
    });
    expect(error).not.toBeNull();
    expect((await svc().from('service_logs').select('id').eq('itinerary_item_id', items![0].id)).data).toEqual([]);
  });

  it('un owner bloqueado deja de leer y escribir datos de gestión', async () => {
    const u = await make('owner');
    const client = await signInAs(u.email);
    expect(((await client.from('profiles').select('id')).data ?? []).length).toBeGreaterThan(1);
    await block(u.id);
    expect((await client.from('profiles').select('id')).data).toEqual([]);
    expect((await client.from('manual_sales').select('id')).data).toEqual([]);
  });

  it('lo público de la landing sigue funcionando para una cuenta bloqueada', async () => {
    const u = await make();
    const client = await signInAs(u.email);
    await block(u.id);
    expect(((await client.from('products').select('id').eq('is_active', true)).data ?? []).length).toBeGreaterThan(0);
    expect(((await client.from('landing_content').select('*')).data ?? []).length).toBeGreaterThan(0);
    expect(((await client.from('client_levels').select('id')).data ?? []).length).toBeGreaterThan(0);
  });

  it('bloquear cierra las sesiones: el refresh token deja de servir', async () => {
    const u = await make();
    const client = await signInAs(u.email);
    expect((await client.auth.refreshSession()).error).toBeNull();
    await block(u.id);
    expect((await client.auth.refreshSession()).error).not.toBeNull();
  });

  it('un cambio de rol se ve en la siguiente consulta, sin esperar a que venza la sesión', async () => {
    const u = await make();
    const client = await signInAs(u.email);
    expect((await client.from('manual_sales').select('id')).data).toEqual([]);
    expect(((await client.from('profiles').select('id')).data ?? []).length).toBe(1);
    await svc().from('profiles').update({ role: 'owner' }).eq('id', u.id);
    expect(((await client.from('profiles').select('id')).data ?? []).length).toBeGreaterThan(1);
    await svc().from('profiles').update({ role: 'client' }).eq('id', u.id);
    expect(((await client.from('profiles').select('id')).data ?? []).length).toBe(1);
  });
});

// ── Ventas manuales atómicas ─────────────────────────────────────────────────────────────────

describe('crear_venta_manual · transacción y faltante de stock', () => {
  const P = FIXTURE.products.pastilla.id;
  const Q = FIXTURE.products.combo.id;
  const sales: string[] = [];
  const stock = new Map<string, number>();
  const stockOf = async (id: string) => (await svc().from('products').select('stock_units').eq('id', id).single()).data!.stock_units as number;
  const setStock = async (id: string, n: number) => { if (!stock.has(id)) stock.set(id, await stockOf(id)); await svc().from('products').update({ stock_units: n }).eq('id', id); };
  afterEach(async () => {
    for (const id of sales.splice(0)) await svc().from('manual_sales').delete().eq('id', id);
    for (const [id, n] of stock) await svc().from('products').update({ stock_units: n }).eq('id', id);
    stock.clear();
  });

  const item = (productId: string | null, name: string, quantity: number, price: number) =>
    ({ product_id: productId, product_name: name, quantity, unit_price_cents: price });
  const sell = async (items: unknown, notes: string | null = rand('rpc'), actor: 'owner' | 'client' = 'owner') => {
    const r = await (await as(actor)).rpc('crear_venta_manual', { p_client_id: ids.client, p_notes: notes, p_sold_at: null, p_items: items });
    if (r.data?.sale_id) sales.push(r.data.sale_id);
    return r;
  };
  const itemsOf = async (saleId: string) => (await svc().from('manual_sale_items').select('product_id, quantity, stock_shortfall').eq('manual_sale_id', saleId)).data ?? [];

  it('crea venta + ítems + descuento de stock, y el total lo calcula la base', async () => {
    await setStock(P, 10); await setStock(Q, 5);
    const r = await sell([item(P, 'Pastillas', 3, 1000), item(Q, 'Combo', 2, 2500)]);
    expect(r.error).toBeNull();
    expect(r.data.total_cents).toBe(3 * 1000 + 2 * 2500);
    expect(r.data.shortages).toEqual([]);
    expect((await svc().from('manual_sales').select('total_cents, sold_by').eq('id', r.data.sale_id).single()).data).toEqual({ total_cents: 8000, sold_by: ids.owner });
    expect(await stockOf(P)).toBe(7);
    expect(await stockOf(Q)).toBe(3);
  });

  it('vender más de lo que hay: se guarda, el stock queda en 0 y el faltante queda registrado', async () => {
    await setStock(P, 2);
    const r = await sell([item(P, 'Pastillas', 5, 1000)]);
    expect(r.error).toBeNull();
    expect(r.data.shortages).toEqual([{ product_name: 'Pastillas', quantity: 5, missing: 3, chlorine_type: null, missing_chlorine: null }]);
    expect(await stockOf(P)).toBe(0);
    expect(await itemsOf(r.data.sale_id)).toEqual([{ product_id: P, quantity: 5, stock_shortfall: 3 }]);
  });

  it('sin faltante, stock_shortfall es 0 (justo el stock disponible)', async () => {
    await setStock(P, 4);
    const r = await sell([item(P, 'Pastillas', 4, 1)]);
    expect(r.data.shortages).toEqual([]);
    expect((await itemsOf(r.data.sale_id))[0].stock_shortfall).toBe(0);
    expect(await stockOf(P)).toBe(0);
  });

  it('el mismo producto dos veces en la venta descuenta ambas cantidades y el faltante cuenta lo acumulado', async () => {
    await setStock(P, 3);
    const r = await sell([item(P, 'Pastillas', 2, 1), item(P, 'Pastillas', 2, 1)]);
    expect(r.error).toBeNull();
    expect(await stockOf(P)).toBe(0);
    const shortfalls = (await itemsOf(r.data.sale_id)).map((i) => i.stock_shortfall).sort();
    expect(shortfalls).toEqual([0, 1]); // 3 de stock: 2 cubiertas por el primero, 1 de las 2 del segundo
  });

  it('un ítem libre (sin producto) no toca el stock', async () => {
    await setStock(P, 6);
    const r = await sell([item(null, 'Flete', 1, 3000)]);
    expect(r.error).toBeNull();
    expect(await stockOf(P)).toBe(6);
  });

  it('todo o nada: un ítem inexistente en el medio revierte la venta y el stock de los ítems anteriores', async () => {
    await setStock(P, 10);
    const notes = rand('atom');
    const r = await sell([item(P, 'Pastillas', 4, 100), item('00000000-0000-4000-8000-0000000000aa', 'No existe', 1, 100)], notes);
    expect(r.error).not.toBeNull();
    expect((await svc().from('manual_sales').select('id').eq('notes', notes)).data).toEqual([]);
    expect(await stockOf(P)).toBe(10);
  });

  it.each([
    ['cantidad 0', [item(null, 'X', 0, 1)]],
    ['cantidad negativa', [item(null, 'X', -1, 1)]],
    ['cantidad absurda', [item(null, 'X', 100001, 1)]],
    ['precio negativo', [item(null, 'X', 1, -5)]],
    ['precio absurdo', [item(null, 'X', 1, 100000000001)]],
    ['nombre vacío', [item(null, '   ', 1, 1)]],
    ['sin ítems', []],
    ['no es una lista', { a: 1 }],
    ['cantidad no numérica', [{ product_name: 'X', quantity: 'muchas', unit_price_cents: 1 }]],
    ['un ítem inválido entre ítems válidos', [item(null, 'OK', 1, 1), item(null, 'X', 0, 1)]],
  ])('rechaza: %s (no deja venta ni toca el stock)', async (_l, items) => {
    await setStock(P, 9);
    const notes = rand('bad');
    const r = await sell(items, notes);
    expect(r.error).not.toBeNull();
    expect((await svc().from('manual_sales').select('id').eq('notes', notes)).data).toEqual([]);
    expect(await stockOf(P)).toBe(9);
  });

  it('rechaza más de 100 ítems', async () => {
    const r = await sell(Array.from({ length: 101 }, (_, i) => item(null, `L${i}`, 1, 1)));
    expect(r.error).not.toBeNull();
  });

  it('un cliente no puede crear ventas (RLS) y no se toca el stock', async () => {
    await setStock(P, 8);
    const notes = rand('intruso');
    const r = await sell([item(P, 'Pastillas', 1, 1)], notes, 'client');
    expect(r.error).not.toBeNull();
    expect((await svc().from('manual_sales').select('id').eq('notes', notes)).data).toEqual([]);
    expect(await stockOf(P)).toBe(8);
  });

  it('sin sesión no se puede llamar', async () => {
    const r = await (await as('anon')).rpc('crear_venta_manual', { p_client_id: ids.client, p_notes: null, p_sold_at: null, p_items: [item(null, 'X', 1, 1)] });
    expect(r.error).not.toBeNull();
  });

  it('dos ventas simultáneas del último stock: no se pierde ni se inventa stock', async () => {
    await setStock(P, 3);
    const [a, b] = await Promise.all([sell([item(P, 'Pastillas', 2, 1)]), sell([item(P, 'Pastillas', 2, 1)])]);
    expect(a.error).toBeNull();
    expect(b.error).toBeNull();
    expect(await stockOf(P)).toBe(0);
    const missing = [a, b].reduce((n, r) => n + (r.data.shortages[0]?.missing ?? 0), 0);
    expect(missing).toBe(1); // 4 vendidas - 3 en stock
  });
});
