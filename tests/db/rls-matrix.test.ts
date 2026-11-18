/**
 * Matriz de permisos (RLS): 20 tablas × 7 actores × leer / crear / editar / borrar.
 *
 * Cada fila de `SPECS` declara lo que cada rol DEBE poder hacer según el diseño del negocio.
 * Los tests ejecutan la operación con una sesión real de ese rol y verifican con el service role
 * que el efecto en la base sea exactamente el esperado (ni más ni menos).
 *
 * Roles: admin = super_admin, owner, marketing, employee, client (dueño de pool1) y client2 (de pool2).
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { TestUserKey } from '../../e2e/support/env';
import { FIXTURE } from '../../e2e/support/seed';
import { ACTORS, NIL_UUID, as, rand, restoreClientPoints, svc, tempUser, uniqueDate, userIds, type Actor, type TempUser } from '../support/clients';

type Json = Record<string, unknown>;

type Ctx = {
  ids: Record<TestUserKey, string>;
  dayId: string;
  item1: string;
  item2: string;
  extraPoolId: string;
  orderItemId: string;
  saleItemId: string;
  zeroSaleId: string;
  txId: string;
  levelIds: string[];
  ctaRowId: string;
  vehicleId: string;
  crewId: string;
  historyId: string;
  /** Titulares de las piletas del seed (filas de pool_clients). */
  poolClient1: string;
  poolClient2: string;
  /** Nota del mes de la pileta extra (migración 27); se borra con la pileta. */
  noteId: string;
  priceId: string;
  paymentId: string;
  /** Depósito de cloro líquido y un movimiento del historial (migración 34). */
  stockId: string;
  movementId: string;
};

type UpdateCase = {
  name: string;
  allowed: Actor[];
  /** Fila objetivo, el cambio a intentar y (si es descartable) cómo limpiarla. */
  make: (c: Ctx) => Promise<{ id: string; patch: Json; cleanup?: () => Promise<void> }>;
};

type Spec = {
  table: string;
  select: { rows: (c: Ctx) => Record<string, string>; visible: Partial<Record<Actor, string[]>> };
  insert?: {
    allowed: Actor[];
    payload: (actorId: string, c: Ctx, tmp: TempUser) => Json;
    /** Columnas con las que se busca la fila creada (omitir si el insert puede chocar por constraint tras pasar RLS). */
    match?: string[];
    after?: (c: Ctx) => Promise<void>;
  };
  update?: UpdateCase[];
  delete?: {
    allowed: Actor[];
    make: (c: Ctx) => Promise<{ id: string; cleanup?: () => Promise<void> }>;
  };
};

const ALL_ADMIN: Actor[] = ['marketing', 'owner', 'admin'];
const OWNER_UP: Actor[] = ['owner', 'admin'];
const CMS: Actor[] = ['marketing', 'admin'];

const pick = (o: Json, cols: string[]): Json => Object.fromEntries(cols.map((k) => [k, o[k]]));

let ctx: Ctx;

beforeAll(async () => {
  const ids = await userIds();
  const s = svc();
  const one = async <T>(q: PromiseLike<{ data: T; error: unknown }>): Promise<NonNullable<T>> => {
    const { data, error } = await q;
    if (error || data === null || data === undefined) throw new Error(`Contexto de la matriz: ${JSON.stringify(error)}`);
    return data as NonNullable<T>;
  };
  const items = await one(s.from('itinerary_items').select('id, pool_id, itinerary_day_id').order('sort_order'));
  const extra = await one(s.from('pools').insert({ client_id: ids.client, address: rand('extra-pool') }).select('id').single());
  const orderItem = await one(s.from('order_items').select('id').eq('order_id', FIXTURE.order.id).limit(1).single());
  const saleItem = await one(s.from('manual_sale_items').select('id').eq('manual_sale_id', FIXTURE.manualSale.id).limit(1).single());
  const zeroSale = await one(s.from('manual_sales').insert({ client_id: ids.client, sold_by: ids.owner, total_cents: 0 }).select('id').single());
  const tx = await one(s.from('point_transactions').select('id').eq('notes', 'Puntos de prueba').single());
  const levels = await one(s.from('client_levels').select('id'));
  const cta = await one(s.from('landing_content').select('id').eq('section', 'hero').eq('key', 'cta_text').single());
  const vehicle = await one(s.from('vehicles').insert({ name: rand('auto-matriz') }).select('id').single());
  const crew = await one(s.from('itinerary_day_crews').insert({ itinerary_day_id: items[0].itinerary_day_id, vehicle_id: vehicle.id, employee_id: ids.employee }).select('id').single());
  const history = await one(s.from('service_log_history').select('id').eq('service_log_id', FIXTURE.serviceLog.id).eq('action', 'insert').single());
  const pc1 = await one(s.from('pool_clients').select('id').eq('pool_id', FIXTURE.pools.pool1.id).eq('is_primary', true).single());
  const pc2 = await one(s.from('pool_clients').select('id').eq('pool_id', FIXTURE.pools.pool2.id).eq('is_primary', true).single());
  const note = await one(s.from('pool_month_notes').insert({ pool_id: extra.id, month: '2030-01-01', notes: rand('nota') }).select('id').single());
  const payment = await one(s.from('payments').insert({ client_id: ids.client, amount_cents: 1000, paid_at: '2030-01-01' }).select('id').single());
  const price = await one(s.from('client_prices').insert({ client_id: ids.client, kind: 'service', price_cents: 1500000, valid_from: '2030-01-01' }).select('id').single());
  const stock = await one(s.from('chlorine_stock').select('id').eq('chlorine_type', 'liquido').single());
  const movement = await one(s.from('stock_movements').insert({ kind: 'ajuste', chlorine_type: 'liquido', product_name: rand('mov'), quantity: 0 }).select('id').single());
  ctx = {
    ids,
    dayId: items[0].itinerary_day_id,
    item1: items.find((i) => i.pool_id === FIXTURE.pools.pool1.id)!.id,
    item2: items.find((i) => i.pool_id === FIXTURE.pools.pool2.id)!.id,
    extraPoolId: extra.id,
    orderItemId: orderItem.id,
    saleItemId: saleItem.id,
    zeroSaleId: zeroSale.id,
    txId: tx.id,
    levelIds: levels.map((l) => l.id),
    ctaRowId: cta.id,
    vehicleId: vehicle.id,
    crewId: crew.id,
    historyId: history.id,
    poolClient1: pc1.id,
    poolClient2: pc2.id,
    noteId: note.id,
    priceId: price.id,
    paymentId: payment.id,
    stockId: stock.id,
    movementId: movement.id,
  };
});

afterAll(async () => {
  if (ctx?.extraPoolId) await svc().from('pools').delete().eq('id', ctx.extraPoolId);
  await svc().from('client_prices').delete().eq('client_id', ctx?.ids.client);
  await svc().from('payments').delete().eq('client_id', ctx?.ids.client);
  if (ctx?.movementId) await svc().from('stock_movements').delete().eq('id', ctx.movementId);
  if (ctx?.zeroSaleId) await svc().from('manual_sales').delete().eq('id', ctx.zeroSaleId);
  if (ctx?.crewId) await svc().from('itinerary_day_crews').delete().eq('id', ctx.crewId);
  if (ctx?.vehicleId) await svc().from('vehicles').delete().eq('id', ctx.vehicleId);
});

// ── Fábricas de filas descartables (service role) ───────────────────────────────────────────

const mk = async (table: string, row: Json): Promise<string> => {
  const { data, error } = await svc().from(table).insert(row).select('id').single();
  if (error) throw new Error(`Fábrica ${table}: ${error.message}`);
  return data.id as string;
};
const rm = (table: string, id: string) => async () => { await svc().from(table).delete().eq('id', id); };

const disposableLog = (c: Ctx) =>
  mk('service_logs', { employee_id: c.ids.employee, pool_id: FIXTURE.pools.pool1.id, client_id: c.ids.client, notes: rand() });
const disposableOrder = (c: Ctx) =>
  mk('orders', { client_id: c.ids.client, status: 'pending', subtotal_cents: 1, total_cents: 1 });
const disposableSale = (c: Ctx) =>
  mk('manual_sales', { client_id: c.ids.client, sold_by: c.ids.owner, total_cents: 1 });

// ── Tabla de expectativas ────────────────────────────────────────────────────────────────────

const SPECS: Spec[] = [
  {
    table: 'profiles',
    select: {
      rows: (c) => ({ admin: c.ids.admin, owner: c.ids.owner, marketing: c.ids.marketing, employee: c.ids.employee, client: c.ids.client, client2: c.ids.client2 }),
      visible: {
        admin: ['admin', 'owner', 'marketing', 'employee', 'client', 'client2'],
        owner: ['admin', 'owner', 'marketing', 'employee', 'client', 'client2'],
        marketing: ['admin', 'owner', 'marketing', 'employee', 'client', 'client2'],
        employee: ['employee', 'client', 'client2'], // solo clientes con piletas en su itinerario
        client: ['client'],
        client2: ['client2'],
      },
    },
    insert: { allowed: OWNER_UP, payload: (_a, _c, t) => ({ id: t.id, full_name: 'x' }) }, // el perfil ya existe: pasar RLS = chocar por clave duplicada
    update: [{
      name: 'datos de otro usuario',
      allowed: ['client2', 'owner', 'admin'], // el propio usuario, owner o super_admin
      make: async (c) => ({ id: c.ids.client2, patch: { phone: rand('tel') } }),
    }],
    delete: { allowed: [], make: async () => { const t = await tempUser(); return { id: t.id, cleanup: t.cleanup }; } },
  },
  {
    table: 'client_profiles',
    select: {
      rows: (c) => ({ client: c.ids.client, client2: c.ids.client2 }),
      visible: { admin: ['client', 'client2'], owner: ['client', 'client2'], marketing: ['client', 'client2'], client: ['client'], client2: ['client2'] },
    },
    insert: { allowed: ALL_ADMIN, payload: (_a, _c, t) => ({ id: t.id, address: 'x' }), match: ['id'] },
    update: [{
      name: 'datos de otro cliente',
      allowed: ['client2', ...ALL_ADMIN],
      make: async (c) => ({ id: c.ids.client2, patch: { neighborhood: rand('barrio') } }),
    }],
    delete: {
      allowed: ALL_ADMIN,
      make: async () => { const t = await tempUser(); await svc().from('client_profiles').insert({ id: t.id }); return { id: t.id, cleanup: t.cleanup }; },
    },
  },
  {
    table: 'employee_profiles',
    select: {
      rows: (c) => ({ employee: c.ids.employee }),
      visible: { admin: ['employee'], owner: ['employee'], employee: ['employee'] }, // marketing no
    },
    insert: { allowed: OWNER_UP, payload: (_a, _c, t) => ({ id: t.id, vehicle: 'x' }), match: ['id'] },
    update: [{
      name: 'datos del empleado',
      allowed: ['employee', ...OWNER_UP],
      make: async (c) => ({ id: c.ids.employee, patch: { vehicle: rand('auto') } }),
    }],
    delete: {
      allowed: OWNER_UP,
      make: async () => { const t = await tempUser('employee'); await svc().from('employee_profiles').insert({ id: t.id }); return { id: t.id, cleanup: t.cleanup }; },
    },
  },
  {
    table: 'pools',
    select: {
      rows: () => ({ pool1: FIXTURE.pools.pool1.id, pool2: FIXTURE.pools.pool2.id }),
      visible: {
        admin: ['pool1', 'pool2'], owner: ['pool1', 'pool2'], marketing: ['pool1', 'pool2'],
        employee: ['pool1', 'pool2'], client: ['pool1'], client2: ['pool2'],
      },
    },
    insert: { allowed: OWNER_UP, payload: (_a, c) => ({ client_id: c.ids.client, address: rand('dir') }), match: ['address'] },
    update: [{ name: 'apodo', allowed: OWNER_UP, make: async () => ({ id: FIXTURE.pools.pool1.id, patch: { nickname: rand('apodo') } }) }],
    delete: { allowed: OWNER_UP, make: async (c) => ({ id: await mk('pools', { client_id: c.ids.client, address: rand('dir') }) }) },
  },
  {
    // Clientes de cada pileta (migración 24). El titular lo sincroniza la base desde pools.client_id.
    table: 'pool_clients',
    select: {
      rows: (c) => ({ pool1: c.poolClient1, pool2: c.poolClient2 }),
      visible: {
        admin: ['pool1', 'pool2'], owner: ['pool1', 'pool2'], marketing: ['pool1', 'pool2'],
        client: ['pool1'], client2: ['pool2'], // cada cliente, solo sus filas; el empleado no las necesita
      },
    },
    insert: { allowed: OWNER_UP, payload: (_a, c) => ({ pool_id: c.extraPoolId, client_id: c.ids.client2 }), match: ['pool_id', 'client_id'] },
    // Las filas no se editan (el guardián lo rechaza): se agregan o se quitan
    update: [{ name: 'cualquier dato (se agregan o se quitan)', allowed: [], make: async (c) => ({ id: c.poolClient2, patch: { client_id: c.ids.client } }) }],
    delete: {
      allowed: OWNER_UP,
      make: async (c) => ({ id: await mk('pool_clients', { pool_id: c.extraPoolId, client_id: c.ids.client2 }) }),
    },
  },
  {
    // Notas del dueño por pileta y mes (migración 27): solo el dueño y el súper admin, para todo
    table: 'pool_month_notes',
    select: {
      rows: (c) => ({ nota: c.noteId }),
      visible: { admin: ['nota'], owner: ['nota'] },
    },
    insert: { allowed: OWNER_UP, payload: (_a, c) => ({ pool_id: c.extraPoolId, month: uniqueDate().slice(0, 8) + '01', notes: rand('nota') }), match: ['notes'] },
    update: [{ name: 'texto de la nota', allowed: OWNER_UP, make: async (c) => ({ id: c.noteId, patch: { notes: rand('nota') } }) }],
    delete: {
      allowed: OWNER_UP,
      make: async (c) => ({ id: await mk('pool_month_notes', { pool_id: c.extraPoolId, month: uniqueDate().slice(0, 8) + '01', notes: rand('nota') }) }),
    },
  },
  {
    // Precios por cliente (migración 31): solo el dueño y el súper admin; ni el cliente ve los suyos
    table: 'client_prices',
    select: {
      rows: (c) => ({ precio: c.priceId }),
      visible: { admin: ['precio'], owner: ['precio'] },
    },
    insert: { allowed: OWNER_UP, payload: (_a, c) => ({ client_id: c.ids.client, kind: 'desagote', price_cents: 900000, valid_from: uniqueDate() }), match: ['price_cents'] },
    update: [{ name: 'monto', allowed: OWNER_UP, make: async (c) => ({ id: c.priceId, patch: { price_cents: 1600000 } }) }],
    delete: {
      allowed: OWNER_UP,
      make: async (c) => ({ id: await mk('client_prices', { client_id: c.ids.client, kind: 'cloro_pastilla', price_cents: 100, valid_from: uniqueDate() }) }),
    },
  },
  {
    // Cobros (migración 32): el dueño todo; el empleado solo lo suyo y desde una visita (tests/db/cobros.test.ts)
    table: 'payments',
    select: {
      rows: (c) => ({ pago: c.paymentId }),
      visible: { admin: ['pago'], owner: ['pago'] },
    },
    insert: { allowed: OWNER_UP, payload: (_a, c) => ({ client_id: c.ids.client, amount_cents: 2000, notes: rand('pago') }), match: ['notes'] },
    update: [{ name: 'nota', allowed: OWNER_UP, make: async (c) => ({ id: c.paymentId, patch: { notes: rand('pago') } }) }],
    delete: {
      allowed: OWNER_UP,
      make: async (c) => ({ id: await mk('payments', { client_id: c.ids.client, amount_cents: 1, paid_at: '2030-01-02' }) }),
    },
  },
  {
    table: 'itinerary_days',
    select: { rows: (c) => ({ today: c.dayId }), visible: { admin: ['today'], owner: ['today'], marketing: ['today'], employee: ['today'] } },
    insert: { allowed: OWNER_UP, payload: () => ({ date: uniqueDate() }), match: ['date'] }, // marketing solo lee el itinerario
    update: [{ name: 'notas', allowed: OWNER_UP, make: async (c) => ({ id: c.dayId, patch: { notes: rand('nota') } }) }],
    delete: { allowed: OWNER_UP, make: async () => ({ id: await mk('itinerary_days', { date: uniqueDate() }) }) },
  },
  {
    table: 'itinerary_items',
    select: { rows: (c) => ({ item1: c.item1, item2: c.item2 }), visible: { admin: ['item1', 'item2'], owner: ['item1', 'item2'], marketing: ['item1', 'item2'], employee: ['item1', 'item2'] } },
    insert: { allowed: OWNER_UP, payload: (_a, c) => ({ itinerary_day_id: c.dayId, pool_id: c.extraPoolId, sort_order: 5 }), match: ['itinerary_day_id', 'pool_id'] },
    update: [{ name: 'orden (el empleado solo puede marcar estado)', allowed: OWNER_UP, make: async (c) => ({ id: c.item1, patch: { sort_order: 9 } }) }],
    delete: {
      allowed: OWNER_UP,
      make: async (c) => {
        const dayId = await mk('itinerary_days', { date: uniqueDate() });
        const id = await mk('itinerary_items', { itinerary_day_id: dayId, pool_id: c.extraPoolId });
        return { id, cleanup: rm('itinerary_days', dayId) };
      },
    },
  },
  {
    table: 'service_logs',
    select: {
      rows: () => ({ log: FIXTURE.serviceLog.id }),
      visible: { admin: ['log'], owner: ['log'], employee: ['log'], client: ['log'] }, // marketing no ve el historial de service; el empleado ve los suyos; el cliente, los de sus piletas
    },
    insert: {
      allowed: [...OWNER_UP, 'employee'],
      payload: (actorId, c) => ({ employee_id: actorId, pool_id: FIXTURE.pools.pool1.id, client_id: c.ids.client, itinerary_item_id: c.item1, notes: rand('svc') }),
      match: ['notes'],
      // el trigger cierra el item del itinerario: se reabre para no alterar otros tests
      after: async (c) => { await svc().from('itinerary_items').update({ status: 'pending', completed_by: null, completed_at: null }).eq('id', c.item1); },
    },
    update: [{
      name: 'notas de un registro propio del empleado',
      allowed: [...OWNER_UP, 'employee'], // migración 22: el empleado corrige los suyos (últimos 7 días); marketing no
      make: async (c) => { const id = await disposableLog(c); return { id, patch: { notes: rand('edit') }, cleanup: rm('service_logs', id) }; },
    }],
    delete: { allowed: [...OWNER_UP, 'employee'], make: async (c) => ({ id: await disposableLog(c) }) },
  },
  {
    table: 'service_log_history',
    select: { rows: (c) => ({ alta: c.historyId }), visible: { admin: ['alta'], owner: ['alta'] } }, // solo el dueño ve el historial
    // Lo escribe únicamente el trigger de service_logs: nadie lo crea, edita ni borra desde la API
    insert: { allowed: [], payload: () => ({ service_log_id: crypto.randomUUID(), action: 'update', new_data: {} }), match: ['service_log_id'] },
    update: [{ name: 'datos de un cambio (el historial es inmutable)', allowed: [], make: async (c) => ({ id: c.historyId, patch: { action: 'delete' } }) }],
    delete: {
      allowed: [],
      make: async () => ({ id: await mk('service_log_history', { service_log_id: crypto.randomUUID(), action: 'update' }) }),
    },
  },
  {
    // Depósito de cloro (migración 34): lo ve el equipo de la oficina; se escribe solo con las funciones
    // (ingresar_stock, contar_cloro, sacar_merma, configurar_deposito: tests/db/stock-cloro.test.ts).
    // Sin caso de borrado: hay una fila fija por tipo y nadie tiene permiso de DELETE.
    table: 'chlorine_stock',
    select: { rows: (c) => ({ liquido: c.stockId }), visible: { admin: ['liquido'], owner: ['liquido'], marketing: ['liquido'] } },
    insert: { allowed: [], payload: () => ({ chlorine_type: 'granulado', quantity: 5 }) },
    update: [{ name: 'cantidad (solo por funciones)', allowed: [], make: async (c) => ({ id: c.stockId, patch: { quantity: 999 } }) }],
  },
  {
    // Historial de stock (migración 34): solo lo ve el dueño; lo escriben únicamente las funciones y triggers
    table: 'stock_movements',
    select: { rows: (c) => ({ mov: c.movementId }), visible: { admin: ['mov'], owner: ['mov'] } },
    insert: { allowed: [], payload: () => ({ kind: 'ingreso', chlorine_type: 'liquido', product_name: rand('mov'), quantity: 10 }), match: ['product_name'] },
    update: [{ name: 'cantidad (el historial es inmutable)', allowed: [], make: async (c) => ({ id: c.movementId, patch: { quantity: 50 } }) }],
    delete: {
      allowed: [],
      make: async () => ({ id: await mk('stock_movements', { kind: 'ajuste', chlorine_type: 'liquido', product_name: rand('mov'), quantity: 0 }) }),
    },
  },
  {
    table: 'vehicles',
    select: {
      rows: (c) => ({ auto: c.vehicleId }),
      visible: { admin: ['auto'], owner: ['auto'], marketing: ['auto'], employee: ['auto'] },
    },
    insert: { allowed: OWNER_UP, payload: () => ({ name: rand('auto') }), match: ['name'] },
    update: [{ name: 'patente', allowed: OWNER_UP, make: async (c) => ({ id: c.vehicleId, patch: { plate: rand('pat') } }) }],
    delete: { allowed: OWNER_UP, make: async () => ({ id: await mk('vehicles', { name: rand('auto') }) }) },
  },
  {
    table: 'itinerary_day_crews',
    select: {
      rows: (c) => ({ equipo: c.crewId }),
      visible: { admin: ['equipo'], owner: ['equipo'], marketing: ['equipo'], employee: ['equipo'] },
    },
    insert: {
      allowed: OWNER_UP,
      payload: (_a, c) => ({ itinerary_day_id: c.dayId, vehicle_id: c.vehicleId, employee_id: c.ids.owner }),
      match: ['itinerary_day_id', 'employee_id'],
    },
    update: [{
      name: 'cambiar de auto',
      allowed: OWNER_UP,
      make: async (c) => {
        const other = await mk('vehicles', { name: rand('auto') });
        return { id: c.crewId, patch: { vehicle_id: other }, cleanup: async () => { await svc().from('itinerary_day_crews').update({ vehicle_id: c.vehicleId }).eq('id', c.crewId); await svc().from('vehicles').delete().eq('id', other); } };
      },
    }],
    delete: {
      allowed: OWNER_UP,
      make: async (c) => ({ id: await mk('itinerary_day_crews', { itinerary_day_id: c.dayId, vehicle_id: c.vehicleId, employee_id: c.ids.admin }) }),
    },
  },
  {
    table: 'products',
    select: {
      rows: () => ({ pastilla: FIXTURE.products.pastilla.id, combo: FIXTURE.products.combo.id, granulado: FIXTURE.products.granulado.id, inactivo: FIXTURE.inactiveProduct.id }),
      visible: {
        anon: ['pastilla', 'combo', 'granulado'], client: ['pastilla', 'combo', 'granulado'], client2: ['pastilla', 'combo', 'granulado'], employee: ['pastilla', 'combo', 'granulado'],
        marketing: ['pastilla', 'combo', 'granulado', 'inactivo'], owner: ['pastilla', 'combo', 'granulado', 'inactivo'], admin: ['pastilla', 'combo', 'granulado', 'inactivo'],
      },
    },
    insert: { allowed: ALL_ADMIN, payload: () => ({ name: rand('prod'), chlorine_type: 'otro', price_cents: 1, unit: 'unidad' }), match: ['name'] },
    update: [
      { name: 'campo de visualización (promo)', allowed: ALL_ADMIN, make: async () => ({ id: FIXTURE.products.pastilla.id, patch: { promo_label: rand('promo') } }) },
      { name: 'precio', allowed: ALL_ADMIN, make: async () => ({ id: FIXTURE.products.pastilla.id, patch: { price_cents: 999 } }) },
      { name: 'stock', allowed: OWNER_UP, make: async () => ({ id: FIXTURE.products.pastilla.id, patch: { stock_units: 999 } }) },
    ],
    delete: { allowed: OWNER_UP, make: async () => ({ id: await mk('products', { name: rand('prod'), chlorine_type: 'otro', price_cents: 1, unit: 'unidad' }) }) },
  },
  {
    table: 'orders',
    select: { rows: () => ({ order: FIXTURE.order.id }), visible: { admin: ['order'], owner: ['order'], marketing: ['order'], client: ['order'] } },
    // El checkout se hace desde el servidor con service role: nadie crea pedidos desde la API pública
    insert: { allowed: [], payload: (_a, c) => ({ client_id: c.ids.client, status: 'paid', subtotal_cents: 1, total_cents: 1, shipping_address: rand('dir') }), match: ['shipping_address'] },
    update: [{ name: 'notas de envío', allowed: OWNER_UP, make: async () => ({ id: FIXTURE.order.id, patch: { shipping_notes: rand('nota') } }) }],
    delete: { allowed: [], make: async (c) => ({ id: await disposableOrder(c) }) },
  },
  {
    table: 'order_items',
    select: { rows: (c) => ({ item: c.orderItemId }), visible: { admin: ['item'], owner: ['item'], marketing: ['item'], client: ['item'] } },
    insert: { allowed: [], payload: () => ({ order_id: FIXTURE.order.id, product_id: FIXTURE.products.pastilla.id, product_name: rand('it'), quantity: 1, unit_price_cents: 1 }), match: ['product_name'] },
    update: [{ name: 'cantidad (los pedidos son inmutables)', allowed: [], make: async (c) => ({ id: c.orderItemId, patch: { quantity: 99 } }) }],
    delete: {
      allowed: [],
      make: async (c) => {
        const orderId = await disposableOrder(c);
        const id = await mk('order_items', { order_id: orderId, product_id: FIXTURE.products.pastilla.id, product_name: 'x', quantity: 1, unit_price_cents: 1 });
        return { id, cleanup: rm('orders', orderId) };
      },
    },
  },
  {
    table: 'manual_sales',
    select: { rows: () => ({ sale: FIXTURE.manualSale.id }), visible: { admin: ['sale'], owner: ['sale'], client: ['sale'] } }, // marketing no ve ventas
    insert: { allowed: OWNER_UP, payload: (actorId, c) => ({ client_id: c.ids.client, sold_by: actorId, total_cents: 1, notes: rand('venta') }), match: ['notes'] },
    update: [{ name: 'notas', allowed: OWNER_UP, make: async () => ({ id: FIXTURE.manualSale.id, patch: { notes: rand('nota') } }) }],
    delete: { allowed: OWNER_UP, make: async (c) => ({ id: await disposableSale(c) }) },
  },
  {
    table: 'manual_sale_items',
    select: { rows: (c) => ({ item: c.saleItemId }), visible: { admin: ['item'], owner: ['item'], client: ['item'] } },
    insert: { allowed: OWNER_UP, payload: (_a, c) => ({ manual_sale_id: c.zeroSaleId, product_id: null, product_name: rand('it'), quantity: 1, unit_price_cents: 0 }), match: ['product_name'] }, // venta de total 0: el total siempre es la suma de los ítems
    update: [{ name: 'nombre del producto', allowed: OWNER_UP, make: async (c) => ({ id: c.saleItemId, patch: { product_name: rand('nombre') } }) }],
    delete: {
      allowed: OWNER_UP,
      make: async (c) => {
        const saleId = await mk('manual_sales', { client_id: c.ids.client, sold_by: c.ids.owner, total_cents: 0 });
        const id = await mk('manual_sale_items', { manual_sale_id: saleId, product_id: null, product_name: 'x', quantity: 1, unit_price_cents: 0 });
        return { id, cleanup: rm('manual_sales', saleId) };
      },
    },
  },
  {
    table: 'client_levels',
    select: {
      rows: (c) => Object.fromEntries(c.levelIds.map((id, i) => [`nivel${i}`, id])),
      visible: Object.fromEntries(ACTORS.map((a) => [a, ['nivel0', 'nivel1', 'nivel2']])), // públicos, también para anónimos
    },
    // Migración 25: los niveles los maneja marketing; el dueño solo los mira
    insert: { allowed: CMS, payload: () => ({ name: rand('nivel'), min_points: 999_999 }), match: ['name'] },
    update: [{
      name: 'nombre de un nivel',
      allowed: CMS,
      make: async () => { const id = await mk('client_levels', { name: rand('nivel'), min_points: 888_888 }); return { id, patch: { name: rand('nuevo') }, cleanup: rm('client_levels', id) }; },
    }],
    delete: { allowed: CMS, make: async () => ({ id: await mk('client_levels', { name: rand('nivel'), min_points: 777_777 }) }) },
  },
  {
    table: 'point_rules',
    select: {
      rows: () => ({ activa: FIXTURE.pointRule.id, inactiva: FIXTURE.inactiveRule.id }),
      visible: {
        anon: ['activa'], client: ['activa'], client2: ['activa'], employee: ['activa'],
        marketing: ['activa', 'inactiva'], owner: ['activa', 'inactiva'], admin: ['activa', 'inactiva'],
      },
    },
    insert: { allowed: CMS, payload: () => ({ name: rand('regla'), trigger_type: 'service', points_per_100_ars: 1 }), match: ['name'] }, // owner NO administra reglas de puntos
    update: [{ name: 'descripción', allowed: CMS, make: async () => ({ id: FIXTURE.pointRule.id, patch: { description: rand('desc') } }) }],
    delete: { allowed: CMS, make: async () => ({ id: await mk('point_rules', { name: rand('regla'), trigger_type: 'service', points_per_100_ars: 1 }) }) },
  },
  {
    table: 'point_transactions',
    select: { rows: (c) => ({ tx: c.txId }), visible: { admin: ['tx'], owner: ['tx'], marketing: ['tx'], client: ['tx'] } },
    insert: {
      allowed: CMS, // migración 25: carga puntos marketing; el dueño solo los mira
      payload: (actorId, c) => ({ client_id: c.ids.client, points: 1, source_type: 'manual_grant', notes: rand('pts'), created_by: actorId }),
      match: ['notes'],
      after: async (c) => { await restoreClientPoints(c.ids.client, FIXTURE.clientPoints); },
    },
    update: [{ name: 'notas (el historial de puntos es inmutable)', allowed: [], make: async (c) => ({ id: c.txId, patch: { notes: rand('nota') } }) }],
    delete: {
      allowed: [],
      make: async (c) => {
        const id = await mk('point_transactions', { client_id: c.ids.client, points: 5, source_type: 'manual_grant', notes: rand('pts') });
        return { id, cleanup: async () => { await restoreClientPoints(c.ids.client, FIXTURE.clientPoints); } };
      },
    },
  },
  {
    table: 'landing_content',
    select: { rows: (c) => ({ cta: c.ctaRowId }), visible: Object.fromEntries(ACTORS.map((a) => [a, ['cta']])) },
    insert: { allowed: CMS, payload: () => ({ section: 'zz_test', key: rand('k'), value: 'x' }), match: ['key'] },
    update: [{ name: 'texto del CMS', allowed: CMS, make: async (c) => ({ id: c.ctaRowId, patch: { value: rand('texto') } }) }],
    delete: { allowed: CMS, make: async () => ({ id: await mk('landing_content', { section: 'zz_test', key: rand('k'), value: 'x' }) }) },
  },
];

// ── Ejecución ────────────────────────────────────────────────────────────────────────────────

const isRlsDenial = (e: { code?: string; message?: string } | null) =>
  !!e && (e.code === '42501' || /row-level security|permission denied/i.test(e.message ?? ''));

const actorId = (a: Actor) => (a === 'anon' ? NIL_UUID : ctx.ids[a]);
const verb = (allowed: boolean) => (allowed ? 'PUEDE' : 'NO puede');

describe.each(SPECS)('RLS · $table', (spec) => {
  describe('leer', () => {
    it.each(ACTORS)('%s', async (actor) => {
      const rows = spec.select.rows(ctx);
      const client = await as(actor);
      const { data, error } = await client.from(spec.table).select('id').in('id', Object.values(rows));
      const expectedNames = spec.select.visible[actor] ?? [];
      const expected = expectedNames.map((n) => rows[n]).sort();

      if (error) {
        // Sin permiso sobre la tabla (p. ej. anónimo): equivale a no ver nada
        expect(isRlsDenial(error), `error inesperado: ${error.message}`).toBe(true);
        expect(expected, `${actor} debería ver ${expectedNames.join(', ')} pero la consulta falló: ${error.message}`).toEqual([]);
        return;
      }
      const got = (data ?? []).map((r) => r.id as string).sort();
      expect(got, `${actor} en ${spec.table}: ve [${got.length}] filas, esperadas [${expected.length}] (${expectedNames.join(', ') || 'ninguna'})`).toEqual(expected);
    });
  });

  if (spec.insert) {
    const ins = spec.insert;
    describe('crear', () => {
      it.each(ACTORS)('%s', async (actor) => {
        const tmp = await tempUser();
        const allowed = ins.allowed.includes(actor);
        const payload = ins.payload(actorId(actor), ctx, tmp);
        try {
          const client = await as(actor);
          const { error } = await client.from(spec.table).insert(payload);

          if (allowed) {
            if (ins.match) expect(error, `${actor} ${verb(true)} crear en ${spec.table}: ${error?.message}`).toBeNull();
            else expect(isRlsDenial(error), `${actor} ${verb(true)} pasar las reglas de ${spec.table}: ${error?.message}`).toBe(false);
          } else {
            expect(isRlsDenial(error), `${actor} ${verb(false)} crear en ${spec.table}, pero respondió: ${error ? error.message : 'OK (¡creó la fila!)'}`).toBe(true);
          }
          if (ins.match) {
            const { data } = await svc().from(spec.table).select('id').match(pick(payload, ins.match));
            expect((data ?? []).length, `${actor} ${verb(allowed)} crear en ${spec.table}: filas encontradas`).toBe(allowed ? 1 : 0);
          }
        } finally {
          if (ins.match) await svc().from(spec.table).delete().match(pick(payload, ins.match));
          if (ins.after) await ins.after(ctx);
          await tmp.cleanup();
        }
      });
    });
  }

  for (const uc of spec.update ?? []) {
    describe(`editar · ${uc.name}`, () => {
      it.each(ACTORS)('%s', async (actor) => {
        const { id, patch, cleanup } = await uc.make(ctx);
        const cols = Object.keys(patch);
        const allowed = uc.allowed.includes(actor);
        const { data: before } = await svc().from(spec.table).select(cols.join(',')).eq('id', id).single();
        try {
          const client = await as(actor);
          const { data, error } = await client.from(spec.table).update(patch).eq('id', id).select('id');
          const touched = !error && (data ?? []).length > 0;
          const { data: after } = await svc().from(spec.table).select(cols.join(',')).eq('id', id).single();
          const changed = JSON.stringify(after) !== JSON.stringify(before);

          expect(changed, `${actor} ${verb(allowed)} editar (${uc.name}) en ${spec.table}: ${changed ? 'la fila CAMBIÓ' : 'la fila no cambió'}${error ? ` · error: ${error.message}` : ''}`).toBe(allowed);
          if (allowed) expect(touched, `${actor}: el update permitido no devolvió la fila`).toBe(true);
          else if (error) expect(isRlsDenial(error), `error inesperado al denegar: ${error.message}`).toBe(true);
        } finally {
          if (cleanup) await cleanup();
          else await svc().from(spec.table).update(before as unknown as Json).eq('id', id); // restaura el valor original
        }
      });
    });
  }

  if (spec.delete) {
    const del = spec.delete;
    describe('borrar', () => {
      it.each(ACTORS)('%s', async (actor) => {
        const { id, cleanup } = await del.make(ctx);
        const allowed = del.allowed.includes(actor);
        try {
          const client = await as(actor);
          const { error } = await client.from(spec.table).delete().eq('id', id);
          const { data: still } = await svc().from(spec.table).select('id').eq('id', id);
          const deleted = (still ?? []).length === 0;
          expect(deleted, `${actor} ${verb(allowed)} borrar en ${spec.table}: ${deleted ? 'la fila SE BORRÓ' : 'la fila sigue'}${error ? ` · error: ${error.message}` : ''}`).toBe(allowed);
        } finally {
          await svc().from(spec.table).delete().eq('id', id);
          if (cleanup) await cleanup();
        }
      });
    });
  }
});
