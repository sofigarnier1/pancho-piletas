import { todayInArgentina } from '../../src/lib/dates';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
vi.mock('@/lib/supabase/server', async () => (await import('../support/session')).serverMock);
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));

import type { TestUserKey } from '../../e2e/support/env';
import { adjustStockAction, createProductAction, setInStockAction, toggleProductActiveAction, updateProductAction } from '@/app/admin/stock/actions';
import { createManualSaleAction } from '@/app/admin/ventas/actions';
import { FIXTURE } from '../../e2e/support/seed';
import { actAs, except, fd, resetRevalidated, revalidated, type ActionResult } from '../support/session';
import { rand, svc, userIds, type Actor } from '../support/clients';

const OWNER_UP: Actor[] = ['owner', 'admin'];
let ids: Record<TestUserKey, string>;
beforeAll(async () => { ids = await userIds(); });
beforeEach(() => resetRevalidated());

const stockOf = async (id: string) => (await svc().from('products').select('stock_units').eq('id', id).single()).data!.stock_units as number;

describe('createProductAction', () => {
  const made: string[] = [];
  afterEach(async () => { for (const id of made.splice(0)) await svc().from('products').delete().eq('id', id); });
  const call = (f: Record<string, string | number | undefined>) => createProductAction(undefined, fd(f)) as Promise<ActionResult>;
  const base = () => ({ name: rand('Prod'), chlorine_type: 'pastilla', price: '125.50', unit: 'kg', stock_units: '12' });

  it.each(OWNER_UP)('%s crea un producto: el precio se guarda en centavos', async (actor) => {
    await actAs(actor);
    const f = { ...base(), description: ' Pastillas ', weight_kg: '2.5', promo_label: 'OFERTA', image_url: 'https://x.test/a.png', is_featured: 'on' };
    const r = await call(f);
    expect(r.success).toBe(true);
    made.push(r.productId as string);
    const { data } = await svc().from('products').select('name, description, chlorine_type, price_cents, stock_units, unit, weight_kg, promo_label, image_url, is_featured, is_active').eq('id', r.productId as string).single();
    expect(data).toEqual({ name: f.name, description: 'Pastillas', chlorine_type: 'pastilla', price_cents: 12550, stock_units: 12, unit: 'kg', weight_kg: 2.5, promo_label: 'OFERTA', image_url: 'https://x.test/a.png', is_featured: true, is_active: true });
    expect(revalidated()).toContain('/admin/stock');
  });

  it('sin tildar "destacado" el producto no queda destacado; los opcionales vacíos son null', async () => {
    await actAs('owner');
    const r = await call(base());
    made.push(r.productId as string);
    const { data } = await svc().from('products').select('is_featured, description, weight_kg, promo_label, image_url').eq('id', r.productId as string).single();
    expect(data).toEqual({ is_featured: false, description: null, weight_kg: null, promo_label: null, image_url: null });
  });

  it.each([['0.01', 1], ['0', 0], ['1999.99', 199999], ['0.1', 10]])('el precio %s se guarda como %i centavos', async (price, cents) => {
    await actAs('owner');
    const r = await call({ ...base(), price });
    made.push(r.productId as string);
    expect((await svc().from('products').select('price_cents').eq('id', r.productId as string).single()).data?.price_cents).toBe(cents);
  });

  it.each(['pastilla', 'granulado', 'liquido', 'combo', 'otro'])('acepta el tipo %s', async (chlorine_type) => {
    await actAs('owner');
    const r = await call({ ...base(), chlorine_type });
    expect(r.success).toBe(true);
    made.push(r.productId as string);
  });

  it('marketing crea un producto, pero con stock 0 aunque mande otro número', async () => {
    await actAs('marketing');
    const r = await call(base());
    expect(r.success).toBe(true);
    made.push(r.productId as string);
    expect((await svc().from('products').select('stock_units').eq('id', r.productId as string).single()).data?.stock_units).toBe(0);
  });

  it.each(except(['owner', 'admin', 'marketing'] as Actor[]))('%s NO puede crear productos', async (actor) => {
    await actAs(actor);
    const f = base();
    expect((await call(f)).error).toBeTruthy();
    expect((await svc().from('products').select('id').eq('name', f.name)).data).toEqual([]);
  });

  it.each([
    ['sin nombre', { name: '' }, 'Nombre, tipo y precio son requeridos'],
    ['nombre en blanco', { name: '   ' }, 'Nombre, tipo y precio son requeridos'],
    ['tipo inválido', { chlorine_type: 'gas' }, 'Nombre, tipo y precio son requeridos'],
    ['sin precio', { price: '' }, 'Nombre, tipo y precio son requeridos'],
    ['precio no numérico', { price: 'abc' }, 'Nombre, tipo y precio son requeridos'],
    ['precio negativo', { price: '-5' }, 'Nombre, tipo y precio son requeridos'],
    ['unidad inválida', { unit: 'tonelada' }, 'Unidad inválida'],
    ['stock negativo', { stock_units: '-1' }, 'El stock no puede ser negativo'],
    ['imagen javascript:', { image_url: 'javascript:alert(1)' }, 'La imagen debe ser una URL http(s)'],
    ['imagen sin protocolo', { image_url: 'x.test/a.png' }, 'La imagen debe ser una URL http(s)'],
  ])('rechaza: %s', async (_l, over, msg) => {
    await actAs('owner');
    const f = { ...base(), ...over };
    expect((await call(f)).error).toBe(msg);
    expect((await svc().from('products').select('id').eq('name', f.name)).data).toEqual([]);
  });
});

describe('adjustStockAction', () => {
  const P = FIXTURE.products.pastilla.id;
  let initial: number;
  beforeEach(async () => { initial = await stockOf(P); });
  afterEach(async () => { await svc().from('products').update({ stock_units: initial }).eq('id', P); });

  it.each(OWNER_UP)('%s suma y resta stock', async (actor) => {
    await actAs(actor);
    const up = (await adjustStockAction(P, 5)) as ActionResult;
    expect(up).toMatchObject({ success: true, newStock: initial + 5 });
    const down = (await adjustStockAction(P, -2)) as ActionResult;
    expect(down).toMatchObject({ success: true, newStock: initial + 3 });
    expect(await stockOf(P)).toBe(initial + 3);
    expect(revalidated()).toContain('/admin/stock');
  });

  it('no baja de cero', async () => {
    await actAs('owner');
    expect(((await adjustStockAction(P, -(initial + 999))) as ActionResult).newStock).toBe(0);
  });

  it.each(except(OWNER_UP))('%s NO puede ajustar stock', async (actor) => {
    await actAs(actor);
    expect(((await adjustStockAction(P, 10)) as ActionResult).error).toBeTruthy();
    expect(await stockOf(P)).toBe(initial);
  });

  it.each([[1.5], [Number.NaN], [Infinity]])('rechaza el ajuste no entero %s', async (n) => {
    await actAs('owner');
    expect(((await adjustStockAction(P, n)) as ActionResult).error).toBe('Datos inválidos');
  });

  it('rechaza un id inválido y un producto inexistente', async () => {
    await actAs('owner');
    expect(((await adjustStockAction('x', 1)) as ActionResult).error).toBe('Datos inválidos');
    expect(((await adjustStockAction('00000000-0000-4000-8000-000000000000', 1)) as ActionResult).error).toBeTruthy();
  });

  it('dos ajustes simultáneos desde la acción no se pisan', async () => {
    await actAs('owner');
    await Promise.all(Array.from({ length: 8 }, () => adjustStockAction(P, 1)));
    expect(await stockOf(P)).toBe(initial + 8);
  });
});

describe('toggleProductActiveAction', () => {
  const P = FIXTURE.products.granulado.id;
  afterEach(async () => { await svc().from('products').update({ is_active: true }).eq('id', P); });
  const active = async () => (await svc().from('products').select('is_active').eq('id', P).single()).data!.is_active;

  it.each(['owner', 'admin', 'marketing'] as Actor[])('%s desactiva y reactiva', async (actor) => {
    await actAs(actor);
    expect(((await toggleProductActiveAction(P, false)) as ActionResult).success).toBe(true);
    expect(await active()).toBe(false);
    await toggleProductActiveAction(P, true);
    expect(await active()).toBe(true);
  });

  it.each(except(['owner', 'admin', 'marketing'] as Actor[]))('%s NO puede desactivar', async (actor) => {
    await actAs(actor);
    expect(((await toggleProductActiveAction(P, false)) as ActionResult).error).toBeTruthy();
    expect(await active()).toBe(true);
  });

  it('rechaza un id inválido', async () => {
    await actAs('owner');
    expect(((await toggleProductActiveAction('x', false)) as ActionResult).error).toBe('Producto inválido');
  });
});

describe('createManualSaleAction', () => {
  const sales: string[] = [];
  const touched = new Map<string, number>();
  afterEach(async () => {
    for (const id of sales.splice(0)) await svc().from('manual_sales').delete().eq('id', id);
    for (const [id, stock] of touched) await svc().from('products').update({ stock_units: stock }).eq('id', id);
    touched.clear();
  });
  const track = async (...productIds: string[]) => { for (const id of productIds) touched.set(id, await stockOf(id)); };
  const call = (f: Record<string, string | undefined>) => createManualSaleAction(fd(f)) as Promise<ActionResult>;
  const items = (...rows: [productId: string, name: string, qty: number | string, price: number | string][]) =>
    Object.fromEntries(rows.flatMap(([pid, name, qty, price], i) => [[`product_id_${i}`, pid], [`product_name_${i}`, name], [`quantity_${i}`, String(qty)], [`unit_price_${i}`, String(price)]]));

  it.each(OWNER_UP)('%s registra una venta con varios ítems: total, stock y quién la hizo', async (actor) => {
    const A = FIXTURE.products.pastilla.id, B = FIXTURE.products.combo.id;
    await track(A, B);
    const a0 = touched.get(A)!, b0 = touched.get(B)!;
    await actAs(actor);
    const notes = rand('venta');
    const r = await call({ client_id: ids.client, notes: ` ${notes} `, sold_at: '2026-09-15', ...items([A, 'Pastillas', 3, 12500.5], [B, 'Combo', 1, 35000]) });
    expect(r.success).toBe(true);
    sales.push(r.saleId as string);

    const { data: sale } = await svc().from('manual_sales').select('client_id, sold_by, notes, total_cents, sold_at').eq('id', r.saleId as string).single();
    expect(sale).toMatchObject({ client_id: ids.client, sold_by: ids[actor as TestUserKey], notes, total_cents: 3 * 1_250_050 + 3_500_000 });
    expect(new Date(sale!.sold_at).toISOString().slice(0, 10)).toBe('2026-09-15');
    const { data: its } = await svc().from('manual_sale_items').select('product_id, product_name, quantity, unit_price_cents').eq('manual_sale_id', r.saleId as string).order('product_name');
    expect(its).toEqual([
      { product_id: B, product_name: 'Combo', quantity: 1, unit_price_cents: 3_500_000 },
      { product_id: A, product_name: 'Pastillas', quantity: 3, unit_price_cents: 1_250_050 },
    ]);
    expect(await stockOf(A)).toBe(a0 - 3);
    expect(await stockOf(B)).toBe(b0 - 1);
    expect(revalidated()).toEqual(expect.arrayContaining(['/admin/ventas', '/admin/dashboard']));
  });

  const daysAgo = (n: number) => {
    const d = new Date(`${todayInArgentina()}T12:00:00Z`);
    d.setUTCDate(d.getUTCDate() - n);
    return d.toISOString().slice(0, 10);
  };
  it.each([[daysAgo(1)], [daysAgo(31)], [daysAgo(200)]])(
    'la fecha %s se guarda como ese mismo día en Argentina (no el día anterior)', async (input) => {
      const expected = input;
      await actAs('owner');
      const r = await call({ client_id: ids.client, sold_at: input, ...items(['', 'Fecha', 1, 1]) });
      sales.push(r.saleId as string);
      const { data } = await svc().from('manual_sales').select('sold_at').eq('id', r.saleId as string).single();
      const ar = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Argentina/Buenos_Aires' }).format(new Date(data!.sold_at));
      expect(ar).toBe(expected);
    },
  );

  it('un ítem sin producto del catálogo (venta libre) no toca el stock', async () => {
    const A = FIXTURE.products.pastilla.id;
    await track(A);
    await actAs('owner');
    const r = await call({ client_id: ids.client, ...items(['', 'Servicio especial', 1, 5000]) });
    sales.push(r.saleId as string);
    expect(r.success).toBe(true);
    expect(await stockOf(A)).toBe(touched.get(A));
    expect((await svc().from('manual_sale_items').select('product_id').eq('manual_sale_id', r.saleId as string)).data).toEqual([{ product_id: null }]);
  });

  it('un product_id que no es UUID se trata como venta libre (no rompe)', async () => {
    await actAs('owner');
    const r = await call({ client_id: ids.client, ...items(['no-es-uuid', 'X', 1, 1]) });
    sales.push(r.saleId as string);
    expect(r.success).toBe(true);
  });

  it('ignora las líneas vacías y conserva las válidas', async () => {
    await actAs('owner');
    const r = await call({ client_id: ids.client, ...items(['', 'Bueno', 2, 100], ['', '', '', '']) });
    sales.push(r.saleId as string);
    expect(r.success).toBe(true);
    expect((await svc().from('manual_sale_items').select('product_name').eq('manual_sale_id', r.saleId as string)).data).toEqual([{ product_name: 'Bueno' }]);
    expect((await svc().from('manual_sales').select('total_cents').eq('id', r.saleId as string).single()).data?.total_cents).toBe(20000);
  });

  // Antes se descartaban en silencio: ahora la venta no se guarda y el aviso dice qué línea revisar
  it.each([
    [['', 'Cantidad cero', 0, 100], 'Revisá la línea 2: la cantidad tiene que ser un número entero mayor a 0'],
    [['', 'Precio negativo', 1, -5], 'Revisá la línea 2: falta el nombre o el precio'],
    [['', '', 1, 1], 'Revisá la línea 2: falta el nombre o el precio'],
    [['', 'Cantidad rara', 'abc', 1], 'Revisá la línea 2: la cantidad tiene que ser un número entero mayor a 0'],
    [['', 'Decimal sin granel', '1,5', 1], 'Revisá la línea 2: la cantidad tiene que ser un número entero mayor a 0'],
  ] as [[string, string, number | string, number | string], string][])('una línea inválida (%j) frena la venta con un aviso', async (bad, msg) => {
    await actAs('owner');
    const notes = rand('mala');
    const r = await call({ client_id: ids.client, notes, ...items(['', 'Bueno', 2, 100], bad) });
    expect(r.error).toBe(msg);
    expect((await svc().from('manual_sales').select('id').eq('notes', notes)).data).toEqual([]);
  });

  it.each([['0.1', '3', 30], ['19.99', '3', 5997], ['0.015', '1', 2]])('el precio %s × %s se redondea bien a centavos (%i)', async (price, qty, cents) => {
    await actAs('owner');
    const r = await call({ client_id: ids.client, ...items(['', 'Redondeo', qty, price]) });
    sales.push(r.saleId as string);
    expect((await svc().from('manual_sales').select('total_cents').eq('id', r.saleId as string).single()).data?.total_cents).toBe(cents);
  });

  it.each(except(OWNER_UP))('%s NO puede registrar ventas', async (actor) => {
    await actAs(actor);
    const notes = rand('venta');
    const r = await call({ client_id: ids.client, notes, ...items(['', 'X', 1, 1]) });
    expect(r.error).toBeTruthy();
    expect((await svc().from('manual_sales').select('id').eq('notes', notes)).data).toEqual([]);
  });

  it.each([
    ['sin cliente', { ...items(['', 'X', 1, 1]) }, 'Seleccioná un cliente'],
    ['cliente que no es UUID', { client_id: 'abc', ...items(['', 'X', 1, 1]) }, 'Seleccioná un cliente'],
    ['sin ítems', { client_id: 'CLIENT' }, 'Agregá al menos un producto'],
    ['sin líneas completas', { client_id: 'CLIENT', ...items(['', '', '', '']) }, 'Agregá al menos un producto'],
    ['una línea inválida', { client_id: 'CLIENT', ...items(['', 'X', 0, 1]) }, 'Revisá la línea 1: la cantidad tiene que ser un número entero mayor a 0'],
    ['fecha inválida', { client_id: 'CLIENT', sold_at: 'ayer', ...items(['', 'X', 1, 1]) }, 'Fecha de venta inválida'],
  ])('rechaza: %s', async (_l, fields, msg) => {
    await actAs('owner');
    const f = Object.fromEntries(Object.entries(fields).map(([k, v]) => [k, v === 'CLIENT' ? ids.client : v])) as Record<string, string>;
    expect((await call(f)).error).toBe(msg);
  });

  it('si fallan los ítems (producto inexistente) no queda una venta huérfana ni se descuenta stock', async () => {
    const A = FIXTURE.products.pastilla.id;
    await track(A);
    await actAs('owner');
    const notes = rand('venta');
    const r = await call({
      client_id: ids.client, notes,
      ...items([A, 'Existe', 2, 100], ['00000000-0000-4000-8000-0000000000aa', 'No existe', 1, 100]),
    });
    expect(r.error).toBeTruthy();
    expect((await svc().from('manual_sales').select('id').eq('notes', notes)).data, 'quedó una venta sin ítems').toEqual([]);
    expect(await stockOf(A)).toBe(touched.get(A));
  });

  it('un cliente inexistente da error y no deja una venta huérfana', async () => {
    await actAs('owner');
    const notes = rand('venta');
    const r = await call({ client_id: '00000000-0000-4000-8000-000000000000', notes, ...items(['', 'X', 1, 1]) });
    expect(r.error).toBeTruthy();
    expect((await svc().from('manual_sales').select('id').eq('notes', notes)).data).toEqual([]);
  });
});

describe('updateProductAction y setInStockAction', () => {
  const P = FIXTURE.products.pastilla.id;
  let snapshot: Record<string, unknown>;
  beforeEach(async () => { snapshot = (await svc().from('products').select('*').eq('id', P).single()).data!; });
  afterEach(async () => { await svc().from('products').update(snapshot).eq('id', P); });
  const edit = (f: Record<string, string>) => updateProductAction(P, undefined, fd({ name: 'Editado', chlorine_type: 'pastilla', unit: 'kg', price: '10.50', ...f })) as Promise<ActionResult>;

  it.each(['owner', 'admin', 'marketing'] as Actor[])('%s edita nombre, precio y Hay/No hay', async (actor) => {
    await actAs(actor);
    expect((await edit({ in_stock: '' })).success).toBe(true);
    const { data } = await svc().from('products').select('name, price_cents, in_stock, stock_units').eq('id', P).single();
    expect(data).toEqual({ name: 'Editado', price_cents: 1050, in_stock: false, stock_units: snapshot.stock_units });
  });

  it.each(except(['owner', 'admin', 'marketing'] as Actor[]))('%s NO puede editar', async (actor) => {
    await actAs(actor);
    expect((await edit({})).error).toBeTruthy();
    expect((await svc().from('products').select('name').eq('id', P).single()).data?.name).toBe(snapshot.name);
  });

  it('marketing marca No hay con el interruptor', async () => {
    await actAs('marketing');
    expect((await setInStockAction(P, false)).success).toBe(true);
    expect((await svc().from('products').select('in_stock').eq('id', P).single()).data?.in_stock).toBe(false);
  });

  it.each([['sin nombre', { name: '' }, 'El nombre es requerido'], ['precio inválido', { price: '-1' }, 'Precio inválido'], ['tipo inválido', { chlorine_type: 'gas' }, 'Tipo inválido']])('rechaza: %s', async (_l, over, msg) => {
    await actAs('marketing');
    expect((await edit(over)).error).toBe(msg);
  });
});
