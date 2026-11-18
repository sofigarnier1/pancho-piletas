/**
 * Acciones del depósito de cloro y de la venta rápida (migración 34): validación del lado del servidor,
 * permisos (solo dueño y súper admin) y lo que llega a la base.
 */
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
vi.mock('@/lib/supabase/server', async () => (await import('../support/session')).serverMock);
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));

import type { TestUserKey } from '../../e2e/support/env';
import { configurarDepositoAction, contarCloroAction, ingresarStockAction, sacarMermaAction } from '@/app/admin/stock/deposito-actions';
import { createProductAction, updateProductAction } from '@/app/admin/stock/actions';
import { createManualSaleAction } from '@/app/admin/ventas/actions';
import { actAs, except, fd, resetRevalidated, revalidated, type ActionResult } from '../support/session';
import { rand, svc, userIds, type Actor } from '../support/clients';

type Tipo = 'liquido' | 'granulado' | 'pastilla';
const OWNER_UP: Actor[] = ['owner', 'admin'];
let ids: Record<TestUserKey, string>;
let original: { chlorine_type: Tipo; quantity: number; bulk_price_cents: number | null; low_alert: number | null }[] = [];
const START = new Date(Date.now() - 1000).toISOString();
const productos: string[] = [];
const ventas: string[] = [];

const dep = async (t: Tipo) => Number((await svc().from('chlorine_stock').select('quantity').eq('chlorine_type', t).single()).data!.quantity);
const setDep = (t: Tipo, quantity: number) => svc().from('chlorine_stock').update({ quantity }).eq('chlorine_type', t);

beforeAll(async () => {
  ids = await userIds();
  original = ((await svc().from('chlorine_stock').select('chlorine_type, quantity, bulk_price_cents, low_alert')).data ?? []) as typeof original;
});
beforeEach(async () => {
  resetRevalidated();
  await setDep('liquido', 10);
  await setDep('pastilla', 10);
});
afterAll(async () => {
  for (const id of ventas) await svc().from('manual_sales').delete().eq('id', id);
  for (const id of productos) await svc().from('products').delete().eq('id', id);
  for (const o of original) await svc().from('chlorine_stock').update({ quantity: o.quantity, bulk_price_cents: o.bulk_price_cents, low_alert: o.low_alert }).eq('chlorine_type', o.chlorine_type);
  await svc().from('stock_movements').delete().gte('created_at', START);
});

describe('ingresarStockAction', () => {
  it.each(OWNER_UP)('%s carga a granel con coma, costo argentino y proveedor', async (actor) => {
    await actAs(actor);
    const r = (await ingresarStockAction({ tipo: 'liquido', cantidad: '12,5', costo: '85.000', proveedor: ' Prov ', nota: '' })) as ActionResult;
    expect(r.success).toBe(true);
    expect(await dep('liquido')).toBe(22.5);
    const mov = (await svc().from('stock_movements').select('cost_cents, supplier, note').eq('kind', 'ingreso').order('created_at', { ascending: false }).limit(1).single()).data;
    expect(mov).toEqual({ cost_cents: 8_500_000, supplier: 'Prov', note: null });
    expect(revalidated()).toEqual(expect.arrayContaining(['/admin/stock', '/admin/stock/movimientos']));
  });

  it('presentación: unidades enteras × contenido', async () => {
    const { data: p } = await svc().from('products').insert({ name: rand('Bidón'), chlorine_type: 'liquido', chlorine_content: 5, price_cents: 1, unit: 'unidad' }).select('id').single();
    productos.push(p!.id as string);
    await actAs('owner');
    expect(((await ingresarStockAction({ productId: p!.id as string, cantidad: '2' })) as ActionResult).success).toBe(true);
    expect(await dep('liquido')).toBe(20);
    expect(((await ingresarStockAction({ productId: p!.id as string, cantidad: '1,5' })) as ActionResult).error).toBe('Escribí cuántas unidades llegaron (un número entero)');
  });

  it.each([
    [{ cantidad: '5' }, 'Elegí qué cloro llegó'],
    [{ tipo: 'liquido', cantidad: '0' }, 'Escribí cuánto llegó (por ejemplo 20 o 2,5)'],
    [{ tipo: 'liquido', cantidad: 'mucho' }, 'Escribí cuánto llegó (por ejemplo 20 o 2,5)'],
    [{ tipo: 'pastilla', cantidad: '2,25' }, 'Escribí cuánto llegó (por ejemplo 20 o 2,5)'],
    [{ tipo: 'liquido', cantidad: '5', costo: 'abc' }, 'El costo no es válido'],
    [{ tipo: 'cloro', cantidad: '5' }, 'Datos inválidos'],
    [{ productId: 'no-uuid', cantidad: '5' }, 'Datos inválidos'],
  ])('%j → "%s"', async (input, msg) => {
    await actAs('owner');
    expect(((await ingresarStockAction(input as Parameters<typeof ingresarStockAction>[0])) as ActionResult).error).toBe(msg);
    expect(await dep('liquido')).toBe(10);
  });

  it.each(except(OWNER_UP))('%s NO puede cargar mercadería', async (actor) => {
    await actAs(actor);
    expect(((await ingresarStockAction({ tipo: 'liquido', cantidad: '5' })) as ActionResult).error).toBeTruthy();
    expect(await dep('liquido')).toBe(10);
  });
});

describe('contar, merma y configurar', () => {
  it('contar acepta 0 y coma; merma exige motivo', async () => {
    await actAs('owner');
    expect(((await contarCloroAction('liquido', '7,5')) as ActionResult).stock).toBe(7.5);
    expect(((await contarCloroAction('liquido', '0')) as ActionResult).stock).toBe(0);
    expect(((await contarCloroAction('liquido', '-1')) as ActionResult).error).toBe('Escribí cuánto contaste (0 o más, por ejemplo 35 o 12,5)');
    await setDep('liquido', 10);
    expect(((await sacarMermaAction('liquido', '2', '  ')) as ActionResult).error).toBe('Contá por qué sale ese cloro');
    expect(((await sacarMermaAction('liquido', '0', 'x')) as ActionResult).error).toBe('Escribí cuánto salió (por ejemplo 2 o 0,5)');
    expect(((await sacarMermaAction('liquido', '2', 'Se rompió')) as ActionResult).stock).toBe(8);
    expect(((await sacarMermaAction('otro', '2', 'x')) as ActionResult).error).toBe('Datos inválidos');
  });

  it('precio y aviso: formato argentino, vacíos = sin valor', async () => {
    await actAs('owner');
    expect(((await configurarDepositoAction('granulado', '4.500,50', '20,5')) as ActionResult).success).toBe(true);
    expect((await svc().from('chlorine_stock').select('bulk_price_cents, low_alert').eq('chlorine_type', 'granulado').single()).data).toEqual({ bulk_price_cents: 450_050, low_alert: 20.5 });
    expect(((await configurarDepositoAction('granulado', '', '')) as ActionResult).success).toBe(true);
    expect((await svc().from('chlorine_stock').select('bulk_price_cents, low_alert').eq('chlorine_type', 'granulado').single()).data).toEqual({ bulk_price_cents: null, low_alert: null });
    expect(((await configurarDepositoAction('granulado', 'abc', '')) as ActionResult).error).toBe('El precio no es válido (por ejemplo 1.500 o 1.500,50)');
    expect(((await configurarDepositoAction('granulado', '', '-3')) as ActionResult).error).toBe('El aviso no es válido (por ejemplo 20 o 2,5)');
  });

  it.each(except(OWNER_UP))('%s NO puede contar, sacar merma ni configurar', async (actor) => {
    await actAs(actor);
    expect(((await contarCloroAction('liquido', '99')) as ActionResult).error).toBeTruthy();
    expect(((await sacarMermaAction('liquido', '1', 'x')) as ActionResult).error).toBeTruthy();
    expect(((await configurarDepositoAction('liquido', '1', '1')) as ActionResult).error).toBeTruthy();
    expect(await dep('liquido')).toBe(10);
  });
});

describe('productos: contenido, categoría y aviso', () => {
  const base = (extra: Record<string, string> = {}) => ({ name: rand('Prod'), price: '100', unit: 'unidad', ...extra });
  afterEach(async () => { for (const id of productos.splice(0)) await svc().from('products').delete().eq('id', id); });

  it('el dueño carga el contenido (con coma); marketing no lo puede poner', async () => {
    await actAs('owner');
    const r = (await createProductAction(undefined, fd(base({ chlorine_type: 'liquido', chlorine_content: '2,5', low_stock_alert: '3' })))) as ActionResult;
    productos.push(r.productId as string);
    expect((await svc().from('products').select('chlorine_content, category, low_stock_alert').eq('id', r.productId as string).single()).data)
      .toEqual({ chlorine_content: 2.5, category: 'cloro', low_stock_alert: 3 });

    await actAs('marketing');
    const m = (await createProductAction(undefined, fd(base({ chlorine_type: 'liquido', chlorine_content: '5' })))) as ActionResult;
    productos.push(m.productId as string);
    expect((await svc().from('products').select('chlorine_content').eq('id', m.productId as string).single()).data!.chlorine_content).toBeNull();
  });

  it('al editar, marketing no borra el contenido que puso el dueño', async () => {
    const { data: p } = await svc().from('products').insert({ name: rand('B'), chlorine_type: 'liquido', chlorine_content: 5, price_cents: 1, unit: 'unidad' }).select('id, name').single();
    productos.push(p!.id as string);
    await actAs('marketing');
    const r = (await updateProductAction(p!.id as string, undefined, fd({ name: p!.name as string, price: '2', chlorine_type: 'liquido', unit: 'unidad' }))) as ActionResult;
    expect(r.success).toBe(true);
    expect(Number((await svc().from('products').select('chlorine_content').eq('id', p!.id as string).single()).data!.chlorine_content)).toBe(5);
  });

  it.each([
    [{ chlorine_type: 'liquido', chlorine_content: '0' }, 'El contenido no es válido (por ejemplo 5 o 0,5)'],
    [{ chlorine_type: 'otro', category: 'cloro' }, 'Categoría inválida'],
    [{ chlorine_type: 'otro', low_stock_alert: '1,5' }, 'El aviso de stock bajo no es válido'],
  ])('%j → "%s"', async (extra, msg) => {
    await actAs('owner');
    expect(((await createProductAction(undefined, fd(base(extra)))) as ActionResult).error).toBe(msg);
  });

  it('tipo "otro" con categoría accesorios', async () => {
    await actAs('owner');
    const r = (await createProductAction(undefined, fd(base({ chlorine_type: 'otro', category: 'accesorios' })))) as ActionResult;
    productos.push(r.productId as string);
    expect((await svc().from('products').select('category').eq('id', r.productId as string).single()).data!.category).toBe('accesorios');
  });
});

describe('createManualSaleAction · mostrador y granel', () => {
  const call = (f: Record<string, string>) => createManualSaleAction(fd(f)) as Promise<ActionResult>;

  it('mostrador a granel con coma: sin cliente, con nombre, segmento mostrador', async () => {
    await actAs('owner');
    const r = await call({
      modo: 'mostrador', client_id: ids.client, walkin_name: ' Juan ',
      product_name_0: 'Cloro líquido a granel', chlorine_type_0: 'liquido', quantity_0: '2,5', unit_price_0: '1000',
    });
    expect(r.success).toBe(true);
    ventas.push(r.saleId as string);
    expect(r.segment).toBe('mostrador');
    expect((await svc().from('manual_sales').select('client_id, walkin_name, total_cents').eq('id', r.saleId as string).single()).data)
      .toEqual({ client_id: null, walkin_name: 'Juan', total_cents: 250_000 });
    expect(await dep('liquido')).toBe(7.5);
  });

  it('a granel con faltante: el aviso trae el tipo y la cantidad en litros', async () => {
    await actAs('owner');
    const r = await call({ client_id: ids.client, product_name_0: 'G', chlorine_type_0: 'liquido', quantity_0: '12', unit_price_0: '1' });
    ventas.push(r.saleId as string);
    expect(r.segment).toBe('service');
    expect(r.shortages).toEqual([{ product_name: 'G', quantity: 12, missing: 2, chlorine_type: 'liquido', missing_chlorine: 2 }]);
  });

  it('con modo cliente y sin cliente: pide el cliente', async () => {
    await actAs('owner');
    expect((await call({ product_name_0: 'X', quantity_0: '1', unit_price_0: '1' })).error).toBe('Seleccioná un cliente');
  });

  it('nombre de mostrador de más de 80 letras', async () => {
    await actAs('owner');
    expect((await call({ modo: 'mostrador', walkin_name: 'x'.repeat(81), product_name_0: 'X', quantity_0: '1', unit_price_0: '1' })).error)
      .toBe('El nombre del comprador es demasiado largo');
  });

  it('a granel: cantidad inválida o pastillas en cuartos', async () => {
    await actAs('owner');
    expect((await call({ modo: 'mostrador', product_name_0: 'P', chlorine_type_0: 'pastilla', quantity_0: '1,25', unit_price_0: '1' })).error)
      .toBe('Revisá la línea 1: la cantidad a granel tiene que ser mayor a 0 (por ejemplo 2,5)');
    expect(await dep('pastilla')).toBe(10);
  });
});
