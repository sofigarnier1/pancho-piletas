/**
 * Migración 34: depósito de cloro, movimientos, venta rápida (mostrador y granel) y reporte del cloro.
 *  - un depósito por tipo (litros, kilos, pastillas); nunca negativo: queda en 0 y se anota el faltante
 *  - ingreso (a granel, presentación con contenido u otro producto), conteo, merma, precio y aviso: solo el dueño
 *  - venta: granel y presentaciones salen del depósito; segmento service/cloro/mostrador lo fija la base
 *  - service: el cloro que registra el empleado sale del depósito (granulado en gramos → kilos); corregir o borrar devuelve
 *  - pedidos online de presentaciones: descuentan al pagarse y devuelven al cancelarse
 *  - reporte_cloro: por tipo y canal; solo el dueño
 */
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { TestUserKey } from '../../e2e/support/env';
import { FIXTURE } from '../../e2e/support/seed';
import { as, rand, signInAs, svc, tempUser, userIds, type Actor } from '../support/clients';
import { todayInArgentina } from '@/lib/dates';

type Tipo = 'liquido' | 'granulado' | 'pastilla';
type Dep = { quantity: number; bulk_price_cents: number | null; low_alert: number | null };

const HOY = todayInArgentina();
const START = new Date(Date.now() - 1000).toISOString();
let ids: Record<TestUserKey, string>;
let original: Record<Tipo, Dep>;
const productos: string[] = [];
const ventas: string[] = [];

const dep = async (t: Tipo) => Number((await svc().from('chlorine_stock').select('quantity').eq('chlorine_type', t).single()).data!.quantity);
const setDep = async (t: Tipo, quantity: number, extra: Partial<Dep> = {}) => {
  const { error } = await svc().from('chlorine_stock').update({ quantity, ...extra }).eq('chlorine_type', t);
  if (error) throw error;
};
const lastMov = async (filter: Record<string, string>) => {
  let q = svc().from('stock_movements').select('*').gte('created_at', START);
  for (const [k, v] of Object.entries(filter)) q = q.eq(k, v);
  return (await q.order('created_at', { ascending: false }).limit(1)).data?.[0] as Record<string, unknown> | undefined;
};
const mkProduct = async (row: Record<string, unknown>) => {
  const { data, error } = await svc().from('products')
    .insert({ name: rand('Prod'), price_cents: 100_000, unit: 'unidad', ...row }).select('id, name, category, chlorine_content').single();
  if (error) throw error;
  productos.push(data.id as string);
  return data as { id: string; name: string; category: string; chlorine_content: number | null };
};
const sell = async (actor: Actor, client: string | null, items: Record<string, unknown>[], walkin: string | null = null) => {
  const c = await as(actor);
  const r = await c.rpc('crear_venta_manual', { p_client_id: client, p_notes: rand('venta'), p_sold_at: null, p_items: items, p_walkin_name: walkin });
  if (r.data?.sale_id) ventas.push(r.data.sale_id as string);
  return r;
};

beforeAll(async () => {
  ids = await userIds();
  const { data } = await svc().from('chlorine_stock').select('chlorine_type, quantity, bulk_price_cents, low_alert');
  original = Object.fromEntries((data ?? []).map((d) => [d.chlorine_type, { quantity: Number(d.quantity), bulk_price_cents: d.bulk_price_cents, low_alert: d.low_alert }])) as Record<Tipo, Dep>;
});

afterAll(async () => {
  for (const id of ventas) await svc().from('manual_sales').delete().eq('id', id);
  for (const id of productos) await svc().from('products').delete().eq('id', id);
  for (const [t, d] of Object.entries(original)) await setDep(t as Tipo, d.quantity, { bulk_price_cents: d.bulk_price_cents, low_alert: d.low_alert });
  await svc().from('stock_movements').delete().gte('created_at', START);
});

describe('productos: categoría y contenido', () => {
  it('la categoría sale del tipo; solo "otro" elige entre químicos, accesorios u otros', async () => {
    expect((await mkProduct({ chlorine_type: 'liquido', category: 'accesorios' })).category).toBe('cloro');
    expect((await mkProduct({ chlorine_type: 'combo' })).category).toBe('combos');
    expect((await mkProduct({ chlorine_type: 'otro', category: 'accesorios' })).category).toBe('accesorios');
    expect((await mkProduct({ chlorine_type: 'otro', category: 'cloro' })).category).toBe('otros');
  });

  it('el contenido solo vale para cloro (en un combo se borra)', async () => {
    expect(Number((await mkProduct({ chlorine_type: 'liquido', chlorine_content: 5 })).chlorine_content)).toBe(5);
    expect((await mkProduct({ chlorine_type: 'combo', chlorine_content: 5 })).chlorine_content).toBeNull();
  });

  it('marketing no cambia el contenido de cloro; el dueño sí', async () => {
    const p = await mkProduct({ chlorine_type: 'liquido', chlorine_content: 5 });
    const mkt = await as('marketing');
    expect((await mkt.from('products').update({ chlorine_content: 10 }).eq('id', p.id)).error?.message).toBe('Marketing no puede cambiar el contenido de cloro');
    expect((await mkt.from('products').update({ promo_label: 'OFERTA' }).eq('id', p.id)).error).toBeNull();
    expect((await (await as('owner')).from('products').update({ chlorine_content: 10 }).eq('id', p.id)).error).toBeNull();
  });
});

describe('ingreso, conteo, merma y precio (dueño)', () => {
  beforeEach(async () => { await setDep('liquido', 10); await setDep('pastilla', 10); });

  it('a granel: suma litros con decimales y queda en el historial con costo y proveedor', async () => {
    const owner = await as('owner');
    const { data, error } = await owner.rpc('ingresar_stock', {
      p_chlorine_type: 'liquido', p_product_id: null, p_quantity: 20.5, p_cost_cents: 8_500_000, p_supplier: ' Proveedor X ', p_note: null,
    });
    expect(error).toBeNull();
    expect(Number(data.stock)).toBe(30.5);
    expect(await lastMov({ kind: 'ingreso' })).toMatchObject({ chlorine_type: 'liquido', product_name: 'A granel', cost_cents: 8_500_000, supplier: 'Proveedor X', created_by: ids.owner });
  });

  it('presentación: 3 bidones de 5 L suman 15 L al depósito y no tocan el stock propio', async () => {
    const p = await mkProduct({ chlorine_type: 'liquido', chlorine_content: 5, stock_units: 7 });
    const owner = await as('owner');
    expect((await owner.rpc('ingresar_stock', { p_chlorine_type: null, p_product_id: p.id, p_quantity: 3 })).error).toBeNull();
    expect(await dep('liquido')).toBe(25);
    expect((await svc().from('products').select('stock_units').eq('id', p.id).single()).data!.stock_units).toBe(7);
    expect((await owner.rpc('ingresar_stock', { p_chlorine_type: null, p_product_id: p.id, p_quantity: 1.5 })).error?.message).toBe('Los productos se cargan por unidad entera');
  });

  it('otro producto (sin contenido): suma a su stock propio', async () => {
    const p = await mkProduct({ chlorine_type: 'otro', stock_units: 2 });
    const owner = await as('owner');
    const { data, error } = await owner.rpc('ingresar_stock', { p_chlorine_type: null, p_product_id: p.id, p_quantity: 4 });
    expect(error).toBeNull();
    expect(data.stock).toBe(6);
    expect(await lastMov({ kind: 'ingreso', product_id: p.id })).toMatchObject({ chlorine_type: null, quantity: 4 });
  });

  it('valida: cantidad, tipo y pastillas por mitades', async () => {
    const owner = await as('owner');
    const r = (t: string | null, q: number) => owner.rpc('ingresar_stock', { p_chlorine_type: t, p_product_id: null, p_quantity: q });
    expect((await r('liquido', 0)).error?.message).toBe('La cantidad tiene que ser mayor a 0');
    expect((await r('liquido', 1.0001)).error?.message).toBe('La cantidad tiene que ser mayor a 0');
    expect((await r(null, 1)).error?.message).toBe('Elegí qué cloro llegó');
    expect((await r('pastilla', 2.25)).error?.message).toBe('Las pastillas se cargan enteras o por mitades');
    expect((await r('pastilla', 2.5)).error).toBeNull();
  });

  it('contar ajusta la diferencia; contar lo mismo no deja movimiento', async () => {
    const owner = await as('owner');
    expect(Number((await owner.rpc('contar_cloro', { p_chlorine_type: 'liquido', p_quantity: 7.5, p_note: null })).data)).toBe(7.5);
    expect(await lastMov({ kind: 'ajuste', chlorine_type: 'liquido' })).toMatchObject({ quantity: -2.5, note: 'Conteo del depósito' });
    const antes = (await svc().from('stock_movements').select('id').eq('kind', 'ajuste').gte('created_at', START)).data!.length;
    await owner.rpc('contar_cloro', { p_chlorine_type: 'liquido', p_quantity: 7.5, p_note: null });
    expect((await svc().from('stock_movements').select('id').eq('kind', 'ajuste').gte('created_at', START)).data!.length).toBe(antes);
  });

  it('merma: con motivo; si sale más de lo que hay, queda en 0 con faltante', async () => {
    const owner = await as('owner');
    expect((await owner.rpc('sacar_merma', { p_chlorine_type: 'liquido', p_quantity: 1, p_note: ' ' })).error?.message).toBe('Contá por qué sale ese cloro');
    expect(Number((await owner.rpc('sacar_merma', { p_chlorine_type: 'liquido', p_quantity: 12, p_note: 'Se rompió un bidón' })).data)).toBe(0);
    expect(await lastMov({ kind: 'merma' })).toMatchObject({ quantity: -10, consumed: 12, shortfall: 2, note: 'Se rompió un bidón' });
  });

  it('precio a granel y aviso; vacíos los borran', async () => {
    const owner = await as('owner');
    expect((await owner.rpc('configurar_deposito', { p_chlorine_type: 'granulado', p_bulk_price_cents: 450_000, p_low_alert: 20 })).error).toBeNull();
    expect((await svc().from('chlorine_stock').select('bulk_price_cents, low_alert').eq('chlorine_type', 'granulado').single()).data).toEqual({ bulk_price_cents: 450_000, low_alert: 20 });
    expect((await owner.rpc('configurar_deposito', { p_chlorine_type: 'granulado', p_bulk_price_cents: -1, p_low_alert: null })).error?.message).toBe('El precio o el aviso no son válidos');
    expect((await owner.rpc('configurar_deposito', { p_chlorine_type: 'granulado', p_bulk_price_cents: null, p_low_alert: null })).error).toBeNull();
    expect((await owner.rpc('configurar_deposito', { p_chlorine_type: 'otro', p_bulk_price_cents: null, p_low_alert: null })).error?.message).toBe('Tipo de cloro inválido');
  });
});

describe('permisos del depósito', () => {
  it.each(['employee', 'marketing', 'client'] as Actor[])('%s no carga, cuenta, saca merma, configura ni ve el reporte', async (actor) => {
    const c = await as(actor);
    const antes = await dep('liquido');
    expect((await c.rpc('ingresar_stock', { p_chlorine_type: 'liquido', p_product_id: null, p_quantity: 5 })).error?.code).toBe('42501');
    expect((await c.rpc('contar_cloro', { p_chlorine_type: 'liquido', p_quantity: 999 })).error?.code).toBe('42501');
    expect((await c.rpc('sacar_merma', { p_chlorine_type: 'liquido', p_quantity: 1, p_note: 'x' })).error?.code).toBe('42501');
    expect((await c.rpc('configurar_deposito', { p_chlorine_type: 'liquido', p_bulk_price_cents: 1, p_low_alert: 1 })).error?.code).toBe('42501');
    expect((await c.rpc('reporte_cloro', { p_desde: HOY, p_hasta: HOY })).error?.code).toBe('42501');
    expect(await dep('liquido')).toBe(antes);
  });

  it('marketing ve el depósito pero no el historial; el empleado y el cliente no ven ninguno', async () => {
    expect(((await (await as('marketing')).from('chlorine_stock').select('chlorine_type')).data ?? []).length).toBe(3);
    expect((await (await as('marketing')).from('stock_movements').select('id').limit(1)).data ?? []).toEqual([]);
    for (const actor of ['employee', 'client'] as Actor[]) {
      const c = await as(actor);
      expect((await c.from('chlorine_stock').select('chlorine_type')).data ?? [], actor).toEqual([]);
      expect((await c.from('stock_movements').select('id').limit(1)).data ?? [], actor).toEqual([]);
    }
  });

  it('nadie escribe el depósito ni el historial directo (ni el dueño)', async () => {
    const owner = await as('owner');
    await owner.from('chlorine_stock').update({ quantity: 123456 }).eq('chlorine_type', 'liquido');
    expect(await dep('liquido')).not.toBe(123456);
    const name = rand('mov');
    await owner.from('stock_movements').insert({ kind: 'ingreso', chlorine_type: 'liquido', product_name: name, quantity: 1 });
    expect((await svc().from('stock_movements').select('id').eq('product_name', name)).data).toEqual([]);
  });

  it('una cuenta de dueño bloqueada no carga ni lee', async () => {
    const u = await tempUser('owner');
    try {
      const session = await signInAs(u.email);
      expect(((await session.from('chlorine_stock').select('chlorine_type')).data ?? []).length).toBe(3);
      await svc().from('profiles').update({ status: 'blocked' }).eq('id', u.id);
      expect((await session.from('chlorine_stock').select('chlorine_type')).data ?? []).toEqual([]);
      expect((await session.rpc('ingresar_stock', { p_chlorine_type: 'liquido', p_product_id: null, p_quantity: 5 })).error?.code).toBe('42501');
      expect((await session.rpc('reporte_cloro', { p_desde: HOY, p_hasta: HOY })).error?.code).toBe('42501');
    } finally {
      await u.cleanup();
    }
  });
});

describe('venta rápida: granel, presentaciones, mostrador y segmento', () => {
  beforeEach(async () => { await setDep('liquido', 10); await setDep('pastilla', 10); });

  it('mostrador a granel: 2,5 L con nombre; total redondeado y movimiento con importe', async () => {
    const r = await sell('owner', null, [{ chlorine_type: 'liquido', product_name: 'Cloro líquido a granel', quantity: 2.5, unit_price_cents: 133_333 }], '  Juan  ');
    expect(r.error).toBeNull();
    expect(r.data).toMatchObject({ segment: 'mostrador', total_cents: 333_333, shortages: [] });
    expect((await svc().from('manual_sales').select('client_id, walkin_name, segment').eq('id', r.data.sale_id).single()).data)
      .toEqual({ client_id: null, walkin_name: 'Juan', segment: 'mostrador' });
    expect(await dep('liquido')).toBe(7.5);
    expect(await lastMov({ kind: 'venta', manual_sale_id: r.data.sale_id })).toMatchObject({ quantity: -2.5, consumed: 2.5, segment: 'mostrador', amount_cents: 333_333 });
  });

  it('segmento: cliente con pileta activa = service; sin pileta = cloro (y el nombre de mostrador se ignora)', async () => {
    const r1 = await sell('owner', ids.client, [{ product_name: 'X', quantity: 1, unit_price_cents: 1 }], 'No va');
    expect(r1.data.segment).toBe('service');
    expect((await svc().from('manual_sales').select('walkin_name').eq('id', r1.data.sale_id).single()).data!.walkin_name).toBeNull();
    const u = await tempUser();
    try {
      const r2 = await sell('owner', u.id, [{ product_name: 'X', quantity: 1, unit_price_cents: 1 }]);
      expect(r2.data.segment).toBe('cloro');
    } finally {
      await svc().from('manual_sales').delete().eq('client_id', u.id);
      await u.cleanup();
    }
  });

  it('presentación con faltante: depósito en 0 y el faltante en bidones y en litros', async () => {
    const p = await mkProduct({ chlorine_type: 'liquido', chlorine_content: 4 });
    await setDep('liquido', 6);
    const r = await sell('owner', ids.client, [{ product_id: p.id, product_name: 'Bidón 4 L', quantity: 2, unit_price_cents: 500_000 }]);
    expect(r.error).toBeNull();
    expect(r.data.shortages).toEqual([{ product_name: 'Bidón 4 L', quantity: 2, missing: 0.5, chlorine_type: 'liquido', missing_chlorine: 2 }]);
    expect(await dep('liquido')).toBe(0);
    expect((await svc().from('manual_sale_items').select('chlorine_type, chlorine_amount, stock_shortfall').eq('manual_sale_id', r.data.sale_id).single()).data)
      .toEqual({ chlorine_type: 'liquido', chlorine_amount: 8, stock_shortfall: 0.5 });
  });

  it('una presentación o un producto común no se venden con decimales; pastillas a granel por mitades', async () => {
    const p = await mkProduct({ chlorine_type: 'liquido', chlorine_content: 5 });
    expect((await sell('owner', null, [{ product_id: p.id, product_name: 'B', quantity: 1.5, unit_price_cents: 1 }])).error?.message).toBe('Ítem de venta inválido');
    expect((await sell('owner', null, [{ product_name: 'Libre', quantity: 1.5, unit_price_cents: 1 }])).error?.message).toBe('Ítem de venta inválido');
    expect((await sell('owner', null, [{ chlorine_type: 'pastilla', product_name: 'P', quantity: 1.25, unit_price_cents: 1 }])).error?.message).toBe('Las pastillas se venden enteras o por mitades');
    expect((await sell('owner', null, [{ chlorine_type: 'pastilla', product_name: 'P', quantity: 1.5, unit_price_cents: 1 }])).error).toBeNull();
    expect(await dep('pastilla')).toBe(8.5);
  });

  it('nombre de mostrador muy largo; marketing y el empleado no venden', async () => {
    expect((await sell('owner', null, [{ product_name: 'X', quantity: 1, unit_price_cents: 1 }], 'x'.repeat(81))).error?.message).toBe('El nombre del comprador es demasiado largo');
    for (const actor of ['marketing', 'employee'] as Actor[]) {
      expect((await sell(actor, null, [{ chlorine_type: 'liquido', product_name: 'X', quantity: 1, unit_price_cents: 1 }])).error, actor).toBeTruthy();
    }
    expect(await dep('liquido')).toBe(10);
  });

  it('el segmento no se puede cambiar después', async () => {
    const r = await sell('owner', null, [{ product_name: 'X', quantity: 1, unit_price_cents: 1 }]);
    const owner = await as('owner');
    expect((await owner.from('manual_sales').update({ segment: 'service' }).eq('id', r.data.sale_id)).error?.code).toBe('42501');
  });
});

describe('cloro de los services (lo registra el empleado)', () => {
  let itemId: string;
  const logs: string[] = [];
  beforeAll(async () => {
    itemId = (await svc().from('itinerary_items').select('id').eq('pool_id', FIXTURE.pools.pool2.id).single()).data!.id as string;
    await svc().from('client_prices').insert({ client_id: ids.client2, kind: 'cloro_liquido', price_cents: 100_000, valid_from: '2020-01-01' });
  });
  afterAll(async () => {
    for (const id of logs) await svc().from('service_logs').delete().eq('id', id);
    await svc().from('itinerary_items').update({ status: 'pending', completed_by: null, completed_at: null }).eq('id', itemId);
    await svc().from('client_prices').delete().eq('client_id', ids.client2).eq('kind', 'cloro_liquido').eq('valid_from', '2020-01-01');
  });
  beforeEach(async () => { await setDep('liquido', 10); await setDep('granulado', 10); });

  const registrar = async (type: Tipo, amount: number) => {
    const emp = await as('employee');
    const { data, error } = await emp.from('service_logs').insert({
      itinerary_item_id: itemId, employee_id: ids.employee, pool_id: FIXTURE.pools.pool2.id, client_id: ids.client2,
      chlorine_applied: true, chlorine_type: type, chlorine_amount: amount, request_id: randomUUID(),
    }).select('id').single();
    expect(error).toBeNull();
    logs.push(data!.id as string);
    return data!.id as string;
  };

  it('descuenta del depósito, con el precio del cliente, como movimiento "service"', async () => {
    const id = await registrar('liquido', 2);
    expect(await dep('liquido')).toBe(8);
    expect(await lastMov({ service_log_id: id })).toMatchObject({ kind: 'service', segment: 'service', client_id: ids.client2, quantity: -2, consumed: 2, amount_cents: 200_000 });
  });

  it('granulado en gramos: 500 g = 0,5 kg; sin precio, sin importe', async () => {
    const id = await registrar('granulado', 500);
    expect(await dep('granulado')).toBe(9.5);
    expect(await lastMov({ service_log_id: id })).toMatchObject({ kind: 'service', quantity: -0.5, amount_cents: null });
  });

  it('corregir devuelve lo anterior y descuenta lo nuevo; borrar devuelve todo', async () => {
    const id = await registrar('liquido', 2);
    const emp = await as('employee');
    expect((await emp.from('service_logs').update({ chlorine_amount: 3 }).eq('id', id)).error).toBeNull();
    expect(await dep('liquido')).toBe(7);
    expect((await emp.from('service_logs').update({ notes: rand('nota') }).eq('id', id)).error).toBeNull(); // sin cambio de cloro
    expect(await dep('liquido')).toBe(7);
    expect((await emp.from('service_logs').update({ chlorine_type: 'granulado', chlorine_amount: 1000 }).eq('id', id)).error).toBeNull();
    expect(await dep('liquido')).toBe(10);
    expect(await dep('granulado')).toBe(9);
    expect((await emp.from('service_logs').delete().eq('id', id)).error).toBeNull();
    expect(await dep('granulado')).toBe(10);
    const movs = (await svc().from('stock_movements').select('kind, quantity').eq('service_log_id', id).order('created_at')).data!;
    expect(movs.reduce((n, m) => n + Number(m.quantity), 0)).toBe(0);
    expect(movs.filter((m) => m.kind === 'service_corregido')).toHaveLength(3);
  });

  it('si no alcanza, el depósito queda en 0 y el service se guarda igual', async () => {
    await setDep('liquido', 1);
    const id = await registrar('liquido', 3);
    expect(await dep('liquido')).toBe(0);
    expect(await lastMov({ service_log_id: id })).toMatchObject({ quantity: -1, consumed: 3, shortfall: 2 });
  });
});

describe('pedidos online de presentaciones', () => {
  it('descuentan al pagarse y devuelven al cancelarse', async () => {
    await setDep('liquido', 20);
    const p = await mkProduct({ chlorine_type: 'liquido', chlorine_content: 5 });
    const { data: o } = await svc().from('orders').insert({ client_id: ids.client, status: 'pending', subtotal_cents: 1_000_000, total_cents: 1_000_000, shipping_address: 'x' }).select('id').single();
    try {
      await svc().from('order_items').insert({ order_id: o!.id, product_id: p.id, product_name: 'Bidón 5 L', quantity: 2, unit_price_cents: 500_000 });
      await svc().from('orders').update({ status: 'paid' }).eq('id', o!.id);
      expect(await dep('liquido')).toBe(10);
      expect(await lastMov({ kind: 'pedido' })).toMatchObject({ chlorine_type: 'liquido', consumed: 10, segment: 'service', amount_cents: 1_000_000 });
      await svc().from('orders').update({ status: 'cancelled' }).eq('id', o!.id);
      expect(await dep('liquido')).toBe(20);
      expect(await lastMov({ kind: 'pedido_cancelado' })).toMatchObject({ quantity: 10, consumed: -10, amount_cents: -1_000_000 });
    } finally {
      await svc().from('orders').delete().eq('id', o!.id);
    }
  });
});

describe('reporte_cloro', () => {
  type Fila = { chlorine_type: string | null; category: string; product_name: string | null; canal: string; origen: string; cantidad: number; importe_cents: number };
  const reporte = async () => ((await (await as('owner')).rpc('reporte_cloro', { p_desde: HOY, p_hasta: HOY })).data ?? []) as Fila[];
  const suma = (rows: Fila[], tipo: string | null, canal: string, campo: 'cantidad' | 'importe_cents' = 'cantidad') =>
    rows.filter((r) => r.chlorine_type === tipo && r.canal === canal).reduce((n, r) => n + Number(r[campo]), 0);

  it('separa mostrador, clientes de service y clientes solo de cloro; otros productos por categoría', async () => {
    await setDep('granulado', 100);
    const antes = await reporte();
    const otro = await mkProduct({ chlorine_type: 'otro', category: 'quimicos', stock_units: 10, name: rand('Alguicida') });
    await sell('owner', null, [{ chlorine_type: 'granulado', product_name: 'G', quantity: 2, unit_price_cents: 100_000 }]);
    await sell('owner', ids.client, [{ chlorine_type: 'granulado', product_name: 'G', quantity: 3, unit_price_cents: 100_000 }, { product_id: otro.id, product_name: 'Alguicida', quantity: 2, unit_price_cents: 50_000 }]);
    const u = await tempUser();
    try {
      await sell('owner', u.id, [{ chlorine_type: 'granulado', product_name: 'G', quantity: 4, unit_price_cents: 100_000 }]);
      const despues = await reporte();
      expect(suma(despues, 'granulado', 'mostrador') - suma(antes, 'granulado', 'mostrador')).toBe(2);
      expect(suma(despues, 'granulado', 'venta_service') - suma(antes, 'granulado', 'venta_service')).toBe(3);
      expect(suma(despues, 'granulado', 'venta_cloro') - suma(antes, 'granulado', 'venta_cloro')).toBe(4);
      expect(suma(despues, 'granulado', 'venta_cloro', 'importe_cents') - suma(antes, 'granulado', 'venta_cloro', 'importe_cents')).toBe(400_000);
      // Otros productos: con su categoría y el nombre del catálogo (no el de la línea)
      expect(despues.filter((r) => r.chlorine_type === null && r.product_name === otro.name))
        .toEqual([expect.objectContaining({ category: 'quimicos', canal: 'venta_service', cantidad: 2, importe_cents: 100_000 })]);
    } finally {
      await svc().from('manual_sales').delete().eq('client_id', u.id);
      await u.cleanup();
    }
  });

  it('valida el período', async () => {
    const owner = await as('owner');
    expect((await owner.rpc('reporte_cloro', { p_desde: '2026-02-01', p_hasta: '2026-01-01' })).error?.message).toBe('El período no es válido');
    expect((await owner.rpc('reporte_cloro', { p_desde: '2024-01-01', p_hasta: '2026-01-01' })).error?.message).toBe('El período no es válido');
  });
});
