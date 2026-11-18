/**
 * Datos fijos de los tests e2e. Se cargan sobre una base recién reseteada (`supabase db reset`),
 * así cada corrida parte exactamente del mismo estado.
 *
 * Los IDs de negocio son constantes para que los tests puedan referirse a ellos.
 */
import { todayInArgentina } from '../../src/lib/dates';
import { TEST_USERS, getLocalSupabase, type TestUserKey } from './env';

export const FIXTURE = {
  products: {
    pastilla:  { id: '00000000-0000-4000-a000-000000000001', name: 'Pastillas de cloro 1 kg', priceCents: 1_250_000, stock: 50 },
    combo:     { id: '00000000-0000-4000-a000-000000000002', name: 'Combo semanal',            priceCents: 3_500_000, stock: 20 },
    granulado: { id: '00000000-0000-4000-a000-000000000003', name: 'Cloro granulado 5 kg',      priceCents: 4_200_000, stock: 10 },
  },
  pools: {
    // pileta del cliente 1 y del cliente 2: sirven para probar aislamiento entre clientes
    pool1: { id: '00000000-0000-4000-b000-000000000001', address: 'Av. Libertador 1234', neighborhood: 'San Isidro', client: 'client' as TestUserKey },
    pool2: { id: '00000000-0000-4000-b000-000000000002', address: 'Calle Falsa 742',     neighborhood: 'Tigre',      client: 'client2' as TestUserKey },
  },
  manualSale: { id: '00000000-0000-4000-c000-000000000001', totalCents: 2_500_000, qty: 2 },
  pointRule:  { id: '00000000-0000-4000-d000-000000000001', name: 'Compras manuales' },
  inactiveRule: { id: '00000000-0000-4000-d000-000000000002', name: 'Regla inactiva' },
  inactiveProduct: { id: '00000000-0000-4000-a000-000000000004', name: 'Producto inactivo' },
  order:      { id: '00000000-0000-4000-e000-000000000001', totalCents: 2_500_000, qty: 2 },
  serviceLog: { id: '00000000-0000-4000-f000-000000000001' },
  /** Puntos que el seed le da al cliente 1 (transacción manual de marketing). */
  clientPoints: 10,
} as const;

type Json = Record<string, unknown>;

const sb = () => getLocalSupabase();

const api = async (path: string, init: { method?: string; body?: unknown; prefer?: string } = {}) => {
  const { url, serviceKey } = sb();
  const res = await fetch(`${url}${path}`, {
    method: init.method ?? 'GET',
    headers: {
      apikey: serviceKey,
      Authorization: `Bearer ${serviceKey}`,
      'Content-Type': 'application/json',
      ...(init.prefer ? { Prefer: init.prefer } : {}),
    },
    body: init.body === undefined ? undefined : JSON.stringify(init.body),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`Seed: ${init.method ?? 'GET'} ${path} → ${res.status} ${text.slice(0, 300)}`);
  return text ? (JSON.parse(text) as unknown) : null;
};

const insert = (table: string, rows: Json | Json[]) =>
  api(`/rest/v1/${table}`, { method: 'POST', body: rows, prefer: 'return=minimal' });

async function createUser(key: TestUserKey): Promise<string> {
  const u = TEST_USERS[key];
  const created = (await api('/auth/v1/admin/users', {
    method: 'POST',
    body: { email: u.email, password: u.password, email_confirm: true, user_metadata: { full_name: u.email.split('@')[0] } },
  })) as { id: string };

  // El trigger handle_new_user crea el perfil como 'client'; el service role puede cambiar el rol.
  await api(`/rest/v1/profiles?id=eq.${created.id}`, {
    method: 'PATCH',
    body: { role: u.role, full_name: u.email.split('@')[0] },
    prefer: 'return=minimal',
  });
  return created.id;
}

/** Siembra usuarios y datos de negocio. Asume una base recién reseteada. */
export async function seed(): Promise<Record<TestUserKey, string>> {
  const ids = {} as Record<TestUserKey, string>;
  for (const key of Object.keys(TEST_USERS) as TestUserKey[]) ids[key] = await createUser(key);

  // Nivel Bronce para el cliente 1 (los tests de cliente esperan ver "Bronce")
  const levels = (await api('/rest/v1/client_levels?min_points=eq.0&select=id')) as { id: string }[];
  if (levels[0]) {
    await api(`/rest/v1/profiles?id=eq.${ids.client}`, { method: 'PATCH', body: { client_level_id: levels[0].id }, prefer: 'return=minimal' });
  }

  const P = FIXTURE.products;
  const product = (x: { id: string; name: string; priceCents: number; stock: number }, type: string, unit: string, order: number, featured = false, promo: string | null = null, active = true) => ({
    id: x.id, name: x.name, chlorine_type: type, price_cents: x.priceCents, stock_units: x.stock,
    unit, is_featured: featured, promo_label: promo, display_order: order, is_active: active,
  });
  await insert('products', [
    product(P.pastilla,  'pastilla',  'kg',     1, true),
    product(P.combo,     'combo',     'unidad', 2, false, 'MÁS ELEGIDO'),
    product(P.granulado, 'granulado', 'kg',     3),
    product({ ...FIXTURE.inactiveProduct, priceCents: 100_000, stock: 5 }, 'otro', 'unidad', 4, false, null, false),
  ]);

  await insert('client_profiles', [
    { id: ids.client,  address: 'Av. Libertador 1234', neighborhood: 'San Isidro', shipping_notes: 'Portón verde' },
    { id: ids.client2, address: 'Calle Falsa 742',     neighborhood: 'Tigre', shipping_notes: null },
  ]);

  const Q = FIXTURE.pools;
  await insert('pools', [
    { id: Q.pool1.id, client_id: ids[Q.pool1.client], address: Q.pool1.address, neighborhood: Q.pool1.neighborhood, nickname: 'Casa de San Isidro', pool_type: 'fibra', created_by: ids.owner },
    { id: Q.pool2.id, client_id: ids[Q.pool2.client], address: Q.pool2.address, neighborhood: Q.pool2.neighborhood, nickname: 'Casa de Tigre',     pool_type: 'liner', created_by: ids.owner },
  ]);

  // Itinerario de hoy (hora de Argentina) con las dos piletas, sin asignar (= para todos los empleados)
  const day = (await api('/rest/v1/itinerary_days', {
    method: 'POST',
    body: { date: todayInArgentina(), created_by: ids.owner },
    prefer: 'return=representation',
  })) as { id: string }[];
  await insert('itinerary_items', [
    { itinerary_day_id: day[0].id, pool_id: Q.pool1.id, sort_order: 0 },
    { itinerary_day_id: day[0].id, pool_id: Q.pool2.id, sort_order: 1 },
  ]);

  // Venta manual del cliente 1 (el trigger descuenta stock: la pastilla queda en stock - qty)
  const S = FIXTURE.manualSale;
  await insert('manual_sales', { id: S.id, client_id: ids.client, sold_by: ids.owner, total_cents: S.totalCents, notes: 'Venta de prueba' });
  await insert('manual_sale_items', { manual_sale_id: S.id, product_id: P.pastilla.id, product_name: P.pastilla.name, quantity: S.qty, unit_price_cents: P.pastilla.priceCents });

  await insert('point_rules', [
    { id: FIXTURE.pointRule.id,     name: FIXTURE.pointRule.name,     trigger_type: 'purchase_manual', points_per_100_ars: 1, is_active: true,  created_by: ids.marketing },
    { id: FIXTURE.inactiveRule.id, name: FIXTURE.inactiveRule.name, trigger_type: 'service',         points_per_100_ars: 1, is_active: false, created_by: ids.marketing },
  ]);

  await insert('employee_profiles', { id: ids.employee, vehicle: 'Auto', zone: 'Zona Norte' });

  // Pedido online pendiente del cliente 1 (el stock solo se descuenta al pasar a "paid")
  const O = FIXTURE.order;
  await insert('orders', { id: O.id, client_id: ids.client, status: 'pending', subtotal_cents: O.totalCents, total_cents: O.totalCents, shipping_address: 'Av. Libertador 1234' });
  await insert('order_items', { order_id: O.id, product_id: P.pastilla.id, product_name: P.pastilla.name, quantity: O.qty, unit_price_cents: P.pastilla.priceCents });

  // Registro de service histórico (sin item de itinerario: no altera el itinerario de hoy)
  await insert('service_logs', {
    id: FIXTURE.serviceLog.id, employee_id: ids.employee, pool_id: Q.pool1.id, client_id: ids.client,
    date: todayInArgentina(), chlorine_applied: true, chlorine_type: 'pastilla', chlorine_amount: 1.5, notes: 'Service de prueba',
  });

  // Puntos del cliente 1 (el trigger recalcula saldo y nivel)
  await insert('point_transactions', { client_id: ids.client, points: FIXTURE.clientPoints, source_type: 'manual_grant', notes: 'Puntos de prueba', created_by: ids.marketing });

  return ids;
}
