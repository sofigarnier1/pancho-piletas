/**
 * Regresiones de la ronda de equipo rojo (2026-10-19). Cada bloque reproduce un hallazgo tal como se
 * explotó contra la copia aislada; con el arreglo (migración 17) todos deben pasar.
 *
 *   M1  un empleado cerraba visitas de cualquier día, sin registro y con datos falsos
 *       (migración 22: la ventana pasó de "hoy o ayer" a "los últimos 7 días")
 *   M2  marketing escribía el itinerario y los registros de service
 *   B1  un pedido que vuelve a "pagado" descontaba el stock otra vez
 *   B2  marketing se podía dar puntos sin tope ni trazabilidad
 *   B3  ventas manuales a no-clientes, con fechas/importes absurdos y totales reescribibles
 */
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import type { TestUserKey } from '../../e2e/support/env';
import { FIXTURE } from '../../e2e/support/seed';
import { todayInArgentina } from '../../src/lib/dates';
import { as, NIL_UUID as NIL, rand, restoreClientPoints, svc, tempUser, signInAs, userIds } from '../support/clients';

let ids: Record<TestUserKey, string>;
beforeAll(async () => { ids = await userIds(); });

const POOL = FIXTURE.pools.pool1.id;
const shift = (date: string, days: number) => {
  const d = new Date(`${date}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
};

// ── Fábricas (service role) ───────────────────────────────────────────────────────────────────

const createdDays: string[] = [];
/** Un día de itinerario con una visita pendiente a la pileta 1. Devuelve ids. */
async function visitOn(date: string) {
  const { data: existing } = await svc().from('itinerary_days').select('id').eq('date', date).maybeSingle();
  let dayId = existing?.id as string | undefined;
  if (!dayId) {
    const { data, error } = await svc().from('itinerary_days').insert({ date }).select('id').single();
    if (error) throw new Error(error.message);
    dayId = data.id as string;
    createdDays.push(dayId);
  }
  const { data: item, error } = await svc().from('itinerary_items').insert({ itinerary_day_id: dayId, pool_id: POOL, sort_order: 0 }).select('id').single();
  if (error) throw new Error(error.message);
  return { dayId, itemId: item.id as string };
}
afterEach(async () => {
  for (const dayId of createdDays.splice(0)) {
    const { data: items } = await svc().from('itinerary_items').select('id').eq('itinerary_day_id', dayId);
    const itemIds = (items ?? []).map((i) => i.id as string);
    if (itemIds.length) await svc().from('service_logs').delete().in('itinerary_item_id', itemIds);
    await svc().from('itinerary_days').delete().eq('id', dayId);
  }
});

const logPayload = (itemId: string, extra: Record<string, unknown> = {}) => ({
  itinerary_item_id: itemId, employee_id: ids.employee, pool_id: POOL, client_id: ids.client,
  date: todayInArgentina(), ...extra,
});
const itemRow = async (id: string) =>
  (await svc().from('itinerary_items').select('status, completed_by, completed_at').eq('id', id).single()).data!;

const TODAY = todayInArgentina();
// Fechas alejadas de hoy para no chocar con el día del seed (UNIQUE por fecha)
const FUTURE = shift(TODAY, 40);
const OLD = shift(TODAY, -40);

// ── M1 · el empleado solo registra visitas de los últimos 7 días ──────────────────────────────────

describe('M1 · el empleado solo cierra visitas de los últimos 7 días (nunca futuras)', () => {
  it('no puede registrar el service de una visita futura', async () => {
    const { itemId } = await visitOn(FUTURE);
    const employee = await as('employee');
    const { error } = await employee.from('service_logs').insert(logPayload(itemId));
    expect(error?.code, 'el insert tendría que fallar').toBe('PA002');
    expect((await itemRow(itemId)).status).toBe('pending');
  });

  it('tampoco el de hace 8 días; el de hace 7 sí', async () => {
    const employee = await as('employee');
    const eight = await visitOn(shift(TODAY, -8));
    expect((await employee.from('service_logs').insert(logPayload(eight.itemId))).error?.code).toBe('PA002');
    const seven = await visitOn(shift(TODAY, -7));
    expect((await employee.from('service_logs').insert(logPayload(seven.itemId))).error).toBeNull();
    expect((await itemRow(seven.itemId)).status).toBe('done');
  });

  it('el owner registra visitas de cualquier fecha pasada, pero no futuras', async () => {
    const owner = await as('owner');
    const old = await visitOn(OLD);
    expect((await owner.from('service_logs').insert(logPayload(old.itemId, { employee_id: ids.owner }))).error).toBeNull();
    expect((await itemRow(old.itemId)).status).toBe('done');
    const future = await visitOn(FUTURE);
    expect((await owner.from('service_logs').insert(logPayload(future.itemId, { employee_id: ids.owner }))).error?.code).toBe('PA002');
  });

  it('tampoco el de una visita de hace 40 días', async () => {
    const { itemId } = await visitOn(OLD);
    const employee = await as('employee');
    const { error } = await employee.from('service_logs').insert(logPayload(itemId));
    expect(error?.code).toBe('PA002');
    expect((await itemRow(itemId)).status).toBe('pending');
  });

  it('sí puede registrar la de ayer (si se olvidó anoche)', async () => {
    const { itemId } = await visitOn(shift(TODAY, -1));
    const employee = await as('employee');
    const { error } = await employee.from('service_logs').insert(logPayload(itemId));
    expect(error).toBeNull();
    expect((await itemRow(itemId)).status).toBe('done');
  });

  it('sí puede registrar la de hoy (la visita del seed)', async () => {
    const { data: seedItem } = await svc().from('itinerary_items').select('id, itinerary_days!inner(date)').eq('pool_id', POOL).eq('itinerary_days.date', TODAY).single();
    const itemId = seedItem!.id as string;
    const employee = await as('employee');
    try {
      const { error } = await employee.from('service_logs').insert(logPayload(itemId));
      expect(error).toBeNull();
      expect((await itemRow(itemId)).status).toBe('done');
    } finally {
      await svc().from('service_logs').delete().eq('itinerary_item_id', itemId);
      await svc().from('itinerary_items').update({ status: 'pending', completed_by: null, completed_at: null }).eq('id', itemId);
    }
  });

  it('la fecha del registro la fija la base: no se puede falsificar', async () => {
    const date = shift(TODAY, -1);
    const { itemId } = await visitOn(date);
    const employee = await as('employee');
    const { data, error } = await employee.from('service_logs').insert(logPayload(itemId, { date: '2000-01-01' })).select('date').single();
    expect(error).toBeNull();
    expect(data?.date).toBe(date);
  });

  it('no puede marcar "hecha" por PATCH directo (sin registro) ni falsificar la hora de cierre', async () => {
    const { itemId } = await visitOn(shift(TODAY, -1));
    const employee = await as('employee');
    const res = await employee.from('itinerary_items').update({ status: 'done', completed_at: '2000-01-01T00:00:00Z' }).eq('id', itemId);
    expect(res.error, 'marcar done a mano tendría que fallar').not.toBeNull();
    expect((await itemRow(itemId)).status).toBe('pending');
  });

  it('"salteada" de una visita reciente sí, pero la hora y quién la cerró las fija la base', async () => {
    const { itemId } = await visitOn(shift(TODAY, -1));
    const employee = await as('employee');
    const before = Date.now();
    const { error } = await employee.from('itinerary_items')
      .update({ status: 'skipped', completed_by: ids.owner, completed_at: '2000-01-01T00:00:00Z' }).eq('id', itemId);
    expect(error).toBeNull();
    const row = await itemRow(itemId);
    expect(row.status).toBe('skipped');
    expect(row.completed_by).toBe(ids.employee);
    expect(new Date(row.completed_at as string).getTime()).toBeGreaterThan(before - 60_000);
  });

  it('no puede saltear ni dar "no estaba" una visita futura ni una de hace más de 7 días', async () => {
    const employee = await as('employee');
    for (const date of [FUTURE, shift(TODAY, -8)]) {
      const { itemId } = await visitOn(date);
      for (const status of ['skipped', 'no_client']) {
        const { error } = await employee.from('itinerary_items').update({ status }).eq('id', itemId);
        expect(error?.code, `${date} ${status}`).toBe('PA002');
      }
      expect((await itemRow(itemId)).status).toBe('pending');
    }
  });

  it('la cantidad de cloro no puede ser negativa ni desproporcionada (ni siquiera con service role)', async () => {
    const { itemId } = await visitOn(shift(TODAY, -1));
    for (const amount of [-50, 600]) {
      const { error } = await svc().from('service_logs').insert(logPayload(itemId, { chlorine_applied: true, chlorine_type: 'liquido', chlorine_amount: amount }));
      expect(error?.code, `litros=${amount}`).toBe('23514');
    }
  });

  it('cloro por unidad: litros, gramos enteros y pastillas de a media, con topes (ni siquiera con service role)', async () => {
    const { itemId } = await visitOn(shift(TODAY, -1));
    const bad: [string, number][] = [
      ['liquido', 0], ['liquido', -1], ['liquido', 501], ['granulado', 0.5], ['granulado', 50001],
      ['pastilla', 0.3], ['pastilla', 101], ['', 2],
    ];
    for (const [type, amount] of bad) {
      const { error } = await svc().from('service_logs').insert(logPayload(itemId, { chlorine_type: type || null, chlorine_amount: amount }));
      expect(error?.code, `${type || 'sin tipo'}=${amount}`).toBe('23514');
    }
    const good: [string, number, string][] = [['liquido', 2.5, 'l'], ['granulado', 300, 'g'], ['pastilla', 1.5, 'u']];
    for (const [type, amount, unit] of good) {
      const { data, error } = await svc().from('service_logs').insert(logPayload(itemId, { chlorine_type: type, chlorine_amount: amount })).select('chlorine_amount, chlorine_unit').single();
      expect(error, type).toBeNull();
      expect(data, type).toEqual({ chlorine_amount: amount, chlorine_unit: unit });
    }
  });

  it('las columnas viejas (kg, limpieza, barrefondo, pintado) ya no existen (migración 23)', async () => {
    const { itemId } = await visitOn(shift(TODAY, -1));
    for (const col of ['chlorine_amount_kg', 'cleaning_done', 'vacuum_done', 'painting_done']) {
      const { error } = await svc().from('service_logs').insert(logPayload(itemId, { [col]: col === 'chlorine_amount_kg' ? 1 : true }));
      expect(error?.code, col).toBe('PGRST204');
    }
  });
});

// ── M2 · marketing no toca el itinerario ni el historial de service ──────────────────────────

describe('M2 · marketing no escribe el itinerario ni los registros de service', () => {
  it('no puede crear días ni visitas', async () => {
    const marketing = await as('marketing');
    const day = await marketing.from('itinerary_days').insert({ date: shift(TODAY, 90) });
    expect(day.error?.code).toBe('42501');
    const item = await marketing.from('itinerary_items').insert({ itinerary_day_id: (await svc().from('itinerary_days').select('id').eq('date', TODAY).single()).data!.id, pool_id: FIXTURE.pools.pool2.id });
    expect(item.error?.code).toBe('42501');
  });

  it('no puede reabrir una visita cerrada', async () => {
    const { itemId } = await visitOn(shift(TODAY, -2));
    await svc().from('itinerary_items').update({ status: 'done', completed_by: ids.employee, completed_at: new Date().toISOString() }).eq('id', itemId);
    const marketing = await as('marketing');
    await marketing.from('itinerary_items').update({ status: 'pending' }).eq('id', itemId);
    expect((await itemRow(itemId)).status).toBe('done');
  });

  it('no ve, no edita y no borra los registros de service', async () => {
    const marketing = await as('marketing');
    const seen = await marketing.from('service_logs').select('id');
    expect(seen.data ?? []).toHaveLength(0);

    await marketing.from('service_logs').update({ chlorine_amount: 99, notes: 'falsificado' }).eq('id', FIXTURE.serviceLog.id);
    await marketing.from('service_logs').delete().eq('id', FIXTURE.serviceLog.id);
    const after = (await svc().from('service_logs').select('chlorine_amount, notes').eq('id', FIXTURE.serviceLog.id).maybeSingle()).data;
    expect(after, 'el registro del seed tiene que seguir ahí').not.toBeNull();
    expect(after?.notes).not.toBe('falsificado');
  });

  it('sigue viendo el itinerario (lo usa el tablero) y owner conserva el control total', async () => {
    const marketing = await as('marketing');
    const days = await marketing.from('itinerary_days').select('id').eq('date', TODAY);
    expect(days.data).toHaveLength(1);

    const owner = await as('owner');
    const ok = await owner.from('itinerary_days').insert({ date: shift(TODAY, 91) }).select('id').single();
    expect(ok.error).toBeNull();
    await svc().from('itinerary_days').delete().eq('id', ok.data!.id);
  });
});

// ── B2 · los puntos manuales tienen tope y quedan a nombre de quien los dio ──────────────────

describe('B2 · puntos manuales con tope y trazabilidad', () => {
  afterEach(async () => { await restoreClientPoints(ids.client, FIXTURE.clientPoints); });

  const grant = async (actor: 'marketing' | 'owner', row: Record<string, unknown>) =>
    (await as(actor)).from('point_transactions').insert({ source_type: 'manual_grant', ...row }).select('id, created_by').maybeSingle();

  it('marketing no puede darse puntos a sí mismo (no es cliente)', async () => {
    const { error } = await grant('marketing', { client_id: ids.marketing, points: 100000 });
    expect(error?.code).toBe('42501');
  });

  it.each([0, 100001, 2_000_000_000, -100001])('rechaza %i puntos', async (points) => {
    const { error } = await grant('marketing', { client_id: ids.client, points });
    expect(error?.code, `points=${points}`).toBe('42501');
  });

  it('solo se permite el origen manual_grant (no se simulan puntos "de compra")', async () => {
    const { error } = await grant('marketing', { client_id: ids.client, points: 10, source_type: 'order' });
    expect(error?.code).toBe('42501');
  });

  it('un cliente que no existe como cliente (empleado) no recibe puntos', async () => {
    const { error } = await grant('owner', { client_id: ids.employee, points: 10 });
    expect(error?.code).toBe('42501');
  });

  it('un alta válida queda registrada a nombre de quien la hizo, aunque mande otro created_by', async () => {
    const { data, error } = await grant('marketing', { client_id: ids.client, points: 50, created_by: ids.owner });
    expect(error).toBeNull();
    expect(data?.created_by).toBe(ids.marketing);
  });
});

// ── B3 · ventas manuales coherentes ──────────────────────────────────────────────────────────

describe('B3 · ventas manuales: cliente real, fecha razonable, importes acotados, total = suma de ítems', () => {
  const sales: string[] = [];
  afterEach(async () => { for (const id of sales.splice(0)) await svc().from('manual_sales').delete().eq('id', id); });

  const item = (extra: Record<string, unknown> = {}) => ({ product_name: 'RT venta', quantity: 1, unit_price_cents: 1000, ...extra });
  const sell = async (over: { client?: string; soldAt?: string | null; items?: unknown[] } = {}) => {
    const owner = await as('owner');
    const res = await owner.rpc('crear_venta_manual', {
      p_client_id: over.client ?? ids.client, p_notes: 'rt', p_sold_at: over.soldAt ?? null, p_items: over.items ?? [item()],
    });
    if (!res.error) sales.push((res.data as { sale_id: string }).sale_id);
    return res;
  };

  it('una venta normal funciona', async () => {
    const res = await sell();
    expect(res.error).toBeNull();
    expect((res.data as { total_cents: number }).total_cents).toBe(1000);
  });

  it('no se puede vender a una cuenta que no es cliente (empleado, marketing, dueño)', async () => {
    for (const client of [ids.employee, ids.marketing, ids.owner]) {
      const res = await sell({ client });
      expect(res.error, client).not.toBeNull();
    }
  });

  it('la fecha no puede ser futura ni de hace más de un año', async () => {
    expect((await sell({ soldAt: '9999-01-01T00:00:00Z' })).error).not.toBeNull();
    expect((await sell({ soldAt: new Date(Date.now() + 7 * 86400_000).toISOString() })).error).not.toBeNull();
    expect((await sell({ soldAt: new Date(Date.now() - 400 * 86400_000).toISOString() })).error).not.toBeNull();
    expect((await sell({ soldAt: new Date(Date.now() - 30 * 86400_000).toISOString() })).error).toBeNull(); // atrasada razonable
  });

  it('el total de una venta tiene tope', async () => {
    const huge = Array.from({ length: 100 }, () => item({ quantity: 100000, unit_price_cents: 100_000_000_000 }));
    expect((await sell({ items: huge })).error).not.toBeNull();
  });

  it('el total de una venta ya creada no se puede reescribir', async () => {
    const res = await sell();
    const saleId = (res.data as { sale_id: string }).sale_id;
    const owner = await as('owner');
    const patch = await owner.from('manual_sales').update({ total_cents: 1 }).eq('id', saleId);
    expect(patch.error).not.toBeNull();
    expect((await svc().from('manual_sales').select('total_cents').eq('id', saleId).single()).data?.total_cents).toBe(1000);
  });

  it('no se pueden agregar ni quitar ítems de una venta ya creada (el total dejaría de coincidir)', async () => {
    const res = await sell({ items: [item(), item({ product_name: 'otro' })] });
    const saleId = (res.data as { sale_id: string }).sale_id;
    const owner = await as('owner');

    const add = await owner.from('manual_sale_items').insert({ manual_sale_id: saleId, product_id: null, product_name: 'extra', quantity: 1, unit_price_cents: 5 });
    expect(add.error).not.toBeNull();

    const { data: items } = await svc().from('manual_sale_items').select('id').eq('manual_sale_id', saleId);
    const del = await owner.from('manual_sale_items').delete().eq('id', items![0].id);
    expect(del.error).not.toBeNull();
    expect((await svc().from('manual_sale_items').select('id').eq('manual_sale_id', saleId)).data).toHaveLength(2);
  });

  it('la fecha de una venta existente tampoco se puede mover al año 9999', async () => {
    const res = await sell();
    const saleId = (res.data as { sale_id: string }).sale_id;
    const owner = await as('owner');
    const patch = await owner.from('manual_sales').update({ sold_at: '9999-01-01T00:00:00Z' }).eq('id', saleId);
    expect(patch.error).not.toBeNull();
  });

  it('las notas sí se pueden corregir', async () => {
    const res = await sell();
    const saleId = (res.data as { sale_id: string }).sale_id;
    const owner = await as('owner');
    expect((await owner.from('manual_sales').update({ notes: 'corregida' }).eq('id', saleId)).error).toBeNull();
  });
});

// ── B1 · el stock de un pedido se descuenta una sola vez y se repone al cancelar ─────────────

describe('B1 · pedidos: stock descontado una vez, estados sin marcha atrás', () => {
  let productId: string;
  const orders: string[] = [];
  beforeAll(async () => {
    const { data } = await svc().from('products').insert({ name: rand('RT producto'), chlorine_type: 'pastilla', price_cents: 100, stock_units: 10 }).select('id').single();
    productId = data!.id as string;
  });
  afterAll(async () => {
    for (const id of orders.splice(0)) await svc().from('orders').delete().eq('id', id);
    await svc().from('products').delete().eq('id', productId);
  });

  const stock = async () => (await svc().from('products').select('stock_units').eq('id', productId).single()).data!.stock_units as number;
  const makeOrder = async (qty: number) => {
    const { data: o } = await svc().from('orders').insert({ client_id: ids.client, status: 'pending', subtotal_cents: 1, total_cents: 1 }).select('id').single();
    orders.push(o!.id);
    await svc().from('order_items').insert({ order_id: o!.id, product_id: productId, product_name: 'x', quantity: qty, unit_price_cents: 1 });
    return o!.id as string;
  };
  const owner = async (id: string, status: string) => (await as('owner')).from('orders').update({ status }).eq('id', id);

  it('pasar a "pagado" varias veces descuenta una sola vez', async () => {
    await svc().from('products').update({ stock_units: 10 }).eq('id', productId);
    const id = await makeOrder(2);
    expect((await owner(id, 'paid')).error).toBeNull();
    expect(await stock()).toBe(8);
    expect((await owner(id, 'pending')).error, 'volver de pagado a pendiente tendría que fallar').not.toBeNull();
    expect(await stock()).toBe(8);
    await owner(id, 'paid');
    expect(await stock()).toBe(8);
  });

  it('cancelar un pedido pagado repone el stock', async () => {
    await svc().from('products').update({ stock_units: 10 }).eq('id', productId);
    const id = await makeOrder(3);
    await owner(id, 'paid');
    expect(await stock()).toBe(7);
    expect((await owner(id, 'cancelled')).error).toBeNull();
    expect(await stock()).toBe(10);
  });

  it('un pedido cancelado no se puede reactivar (no vuelve a descontar)', async () => {
    await svc().from('products').update({ stock_units: 10 }).eq('id', productId);
    const id = await makeOrder(1);
    await owner(id, 'paid');
    await owner(id, 'cancelled');
    expect((await owner(id, 'paid')).error).not.toBeNull();
    expect(await stock()).toBe(10);
  });

  it('si se vendió más que el stock, cancelar repone solo lo que realmente se descontó', async () => {
    await svc().from('products').update({ stock_units: 4 }).eq('id', productId);
    const id = await makeOrder(10);
    await owner(id, 'paid');
    expect(await stock()).toBe(0);
    await owner(id, 'cancelled');
    expect(await stock()).toBe(4);
  });

  it('el avance normal sigue funcionando: pagado → preparando → enviado → entregado', async () => {
    await svc().from('products').update({ stock_units: 10 }).eq('id', productId);
    const id = await makeOrder(2);
    for (const s of ['paid', 'preparing', 'shipped', 'delivered']) expect((await owner(id, s)).error, s).toBeNull();
    expect(await stock()).toBe(8);
  });
});

// ── Verificación de lo que el equipo rojo dio por posible y no era ───────────────────────────

describe('el rol que ve la app sigue a la tabla profiles (no a un JWT viejo)', () => {
  it('al degradar a un dueño, getUser() ya devuelve el rol nuevo con la misma sesión', async () => {
    const u = await tempUser('owner');
    try {
      const session = await signInAs(u.email);
      const before = (await session.auth.getUser()).data.user?.app_metadata?.role;
      expect(before).toBe('owner');
      await svc().from('profiles').update({ role: 'client' }).eq('id', u.id);
      const after = (await session.auth.getUser()).data.user?.app_metadata?.role;
      expect(after).toBe('client');
    } finally {
      await u.cleanup();
    }
  });
});

describe('precios por cliente (migración 31): nadie fuera del dueño los ve, ni de costado', () => {
  let ids: Record<TestUserKey, string>;
  beforeAll(async () => {
    ids = await userIds();
    await svc().from('client_prices').insert({ client_id: ids.client, kind: 'service', price_cents: 777_00, valid_from: '2032-01-01' });
  });
  afterAll(async () => { await svc().from('client_prices').delete().eq('client_id', ids.client).eq('valid_from', '2032-01-01'); });

  it.each(['employee', 'marketing', 'client'] as const)('%s no los lee ni embebidos desde profiles', async (actor) => {
    const c = await as(actor);
    expect((await c.from('client_prices').select('id')).data ?? []).toEqual([]);
    const { data } = await c.from('profiles').select('id, client_prices(price_cents)').eq('id', ids.client);
    for (const row of (data ?? []) as { client_prices?: unknown[] }[]) expect(row.client_prices ?? []).toEqual([]);
  });

  it('una cuenta de dueño bloqueada no los lee', async () => {
    const u = await tempUser('owner');
    try {
      const session = await signInAs(u.email);
      expect(((await session.from('client_prices').select('id')).data ?? []).length).toBeGreaterThan(0);
      await svc().from('profiles').update({ status: 'blocked' }).eq('id', u.id);
      expect((await session.from('client_prices').select('id')).data ?? []).toEqual([]);
    } finally {
      await u.cleanup();
    }
  });
});

describe('cobros (migración 32): ronda corta de equipo rojo', () => {
  let ids: Record<TestUserKey, string>;
  let pagoId: string;
  beforeAll(async () => {
    ids = await userIds();
    pagoId = (await svc().from('payments').insert({ client_id: ids.client, amount_cents: 123_00, paid_at: '2032-01-01' }).select('id').single()).data!.id as string;
  });
  afterAll(async () => { await svc().from('payments').delete().eq('id', pagoId); });

  it.each(['employee', 'marketing', 'client'] as const)('%s no ve pagos ajenos ni embebidos desde profiles o itinerary_items', async (actor) => {
    const c = await as(actor);
    expect(((await c.from('payments').select('id').eq('id', pagoId)).data ?? [])).toEqual([]);
    const { data: prof } = await c.from('profiles').select('id, payments!payments_client_id_fkey(amount_cents)').eq('id', ids.client);
    for (const row of (prof ?? []) as { payments?: unknown[] }[]) expect(row.payments ?? []).toEqual([]);
    const { data: items } = await c.from('itinerary_items').select('id, payments(amount_cents)').limit(50);
    for (const row of (items ?? []) as { payments?: { amount_cents: number }[] }[]) expect(row.payments ?? []).toEqual([]);
  });

  it('el empleado no puede marcar como "recibido" ni cambiar el monto de un pago ajeno', async () => {
    const emp = await as('employee');
    expect((await emp.from('payments').update({ status: 'recibido', amount_cents: 1 }).eq('id', pagoId).select('id')).data ?? []).toEqual([]);
    expect((await emp.from('payments').delete().eq('id', pagoId).select('id')).data ?? []).toEqual([]);
    const { data } = await svc().from('payments').select('amount_cents, status').eq('id', pagoId).single();
    expect(data).toMatchObject({ amount_cents: 123_00, status: 'recibido' });
  });

  it.each(['guard_payment_write', 'guard_client_price_write'])('nadie llama %s por la API', async (fn) => {
    const emp = await as('employee');
    expect((await emp.rpc(fn)).error).not.toBeNull();
  });
});

describe('stock de cloro y ventas (migración 34): ronda corta de equipo rojo', () => {
  let ids: Record<TestUserKey, string>;
  let movId: string;
  beforeAll(async () => {
    ids = await userIds();
    movId = (await svc().from('stock_movements').insert({
      kind: 'venta', chlorine_type: 'liquido', product_name: rand('rt'), quantity: -1, consumed: 1, amount_cents: 999, segment: 'service', client_id: ids.client,
    }).select('id').single()).data!.id as string;
  });
  afterAll(async () => { await svc().from('stock_movements').delete().eq('id', movId); });

  it.each(['employee', 'marketing', 'client'] as const)('%s no ve movimientos ni embebidos desde profiles o products', async (actor) => {
    const c = await as(actor);
    expect((await c.from('stock_movements').select('id').eq('id', movId)).data ?? []).toEqual([]);
    const { data: prof } = await c.from('profiles').select('id, stock_movements!stock_movements_client_id_fkey(amount_cents)').eq('id', ids.client);
    for (const row of (prof ?? []) as { stock_movements?: unknown[] }[]) expect(row.stock_movements ?? []).toEqual([]);
    const { data: prods } = await c.from('products').select('id, stock_movements(amount_cents)').limit(50);
    for (const row of (prods ?? []) as { stock_movements?: unknown[] }[]) expect(row.stock_movements ?? []).toEqual([]);
  });

  it.each([
    ['sacar_del_deposito', { p_type: 'liquido', p_amount: 1 }],
    ['sumar_al_deposito', { p_type: 'liquido', p_amount: 1000 }],
    ['segmento_cliente', { p_client: NIL }],
    ['stock_por_service', {}],
    ['deduct_stock_on_manual_sale', {}],
    ['set_product_category', {}],
  ] as const)('nadie llama %s por la API (ni el dueño)', async (fn, args) => {
    const antes = (await svc().from('chlorine_stock').select('quantity').eq('chlorine_type', 'liquido').single()).data!.quantity;
    for (const actor of ['owner', 'employee'] as const) {
      expect((await (await as(actor)).rpc(fn, args)).error, `${actor} → ${fn}`).not.toBeNull();
    }
    expect((await svc().from('chlorine_stock').select('quantity').eq('chlorine_type', 'liquido').single()).data!.quantity).toBe(antes);
  });

  it('el empleado no infla el depósito con un service de cloro negativo', async () => {
    const itemId = (await svc().from('itinerary_items').select('id').eq('pool_id', FIXTURE.pools.pool2.id).single()).data!.id as string;
    const antes = (await svc().from('chlorine_stock').select('quantity').eq('chlorine_type', 'liquido').single()).data!.quantity;
    const emp = await as('employee');
    const { error } = await emp.from('service_logs').insert({
      itinerary_item_id: itemId, employee_id: ids.employee, pool_id: FIXTURE.pools.pool2.id, client_id: ids.client2,
      chlorine_applied: true, chlorine_type: 'liquido', chlorine_amount: -50,
    });
    expect(error).not.toBeNull();
    expect((await svc().from('chlorine_stock').select('quantity').eq('chlorine_type', 'liquido').single()).data!.quantity).toBe(antes);
  });

  it('una venta de mostrador no se puede pasar a un cliente ni cambiar de segmento', async () => {
    const owner = await as('owner');
    const { data } = await owner.rpc('crear_venta_manual', { p_client_id: null, p_notes: rand('rt'), p_sold_at: null, p_items: [{ product_name: 'X', quantity: 1, unit_price_cents: 1 }], p_walkin_name: 'A' });
    try {
      expect((await owner.from('manual_sales').update({ client_id: ids.client }).eq('id', data.sale_id)).error?.code).toBe('42501');
      expect((await owner.from('manual_sales').update({ walkin_name: 'B' }).eq('id', data.sale_id)).error?.code).toBe('42501');
      expect((await owner.from('manual_sales').update({ segment: 'cloro' }).eq('id', data.sale_id)).error?.code).toBe('42501');
    } finally {
      await svc().from('manual_sales').delete().eq('id', data.sale_id);
    }
  });
});
