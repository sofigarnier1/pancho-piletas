/**
 * Integridad desde las server actions (lo que de verdad dispara la app):
 * doble envío / carrera entre empleados, cuentas bloqueadas, alta de cliente a medias y faltante de stock.
 */
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
vi.mock('@/lib/supabase/server', async () => (await import('../support/session')).serverMock);
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));

import pg from 'pg';
import type { TestUserKey } from '../../e2e/support/env';
import { getLocalSupabase } from '../../e2e/support/env';
import { FIXTURE } from '../../e2e/support/seed';
import { randomUUID } from 'node:crypto';
import { marcarPiletaAction, registrarServiceAction } from '@/app/employee/actions';
import { createClientAction, updateClientStatusAction } from '@/app/admin/clientes/actions';
import { createManualSaleAction } from '@/app/admin/ventas/actions';
import { actAs, actAsClient, fd, resetRevalidated, type ActionResult } from '../support/session';
import { rand, signInAs, svc, tempUser, userIds, type TempUser } from '../support/clients';

let ids: Record<TestUserKey, string>;
beforeAll(async () => { ids = await userIds(); });
beforeEach(() => resetRevalidated());

// ── Empleado: carreras y doble envío ─────────────────────────────────────────────────────────

describe('registrarServiceAction · varios registros por visita y doble envío', () => {
  let itemId: string;
  beforeAll(async () => {
    itemId = (await svc().from('itinerary_items').select('id').eq('pool_id', FIXTURE.pools.pool2.id)).data![0].id;
  });
  afterEach(async () => {
    await svc().from('service_logs').delete().eq('itinerary_item_id', itemId);
    await svc().from('itinerary_items').update({ status: 'pending', completed_by: null, completed_at: null, assigned_employee_id: null }).eq('id', itemId);
  });

  const work = () => ({ chlorineType: null, chlorineAmount: null, notes: rand('emp') });
  const logs = async () => (await svc().from('service_logs').select('id').eq('itinerary_item_id', itemId)).data ?? [];
  const register = (requestId = randomUUID()) => registrarServiceAction(itemId, requestId, work()) as Promise<ActionResult>;
  const mark = (status: 'skipped' | 'no_client') => marcarPiletaAction(itemId, status) as Promise<ActionResult>;

  // Migración 23: el formulario manda una clave por envío; repetirlo no duplica el registro.
  it('REGRESIÓN: el mismo envío dos veces a la vez guarda un solo registro y la visita queda hecha', async () => {
    await actAs('employee');
    const requestId = randomUUID();
    const [a, b] = await Promise.all([register(requestId), register(requestId)]);
    expect([a.success, b.success]).toEqual([true, true]);
    expect(await logs()).toHaveLength(1);
    expect((await svc().from('itinerary_items').select('status').eq('id', itemId).single()).data!.status).toBe('done');
  });

  it('dos envíos distintos a la vez (dos empleados) guardan dos registros', async () => {
    await actAs('employee');
    const [a, b] = await Promise.all([register(), register()]);
    expect([a.success, b.success]).toEqual([true, true]);
    expect(await logs()).toHaveLength(2);
  });

  it('si otro la cerró primero, el registro se suma y no pisa quién la cerró', async () => {
    await svc().from('itinerary_items').update({ status: 'done', completed_by: ids.admin, completed_at: new Date().toISOString() }).eq('id', itemId);
    await actAs('employee');
    expect((await register()).success).toBe(true);
    expect(await logs()).toHaveLength(1);
    expect((await svc().from('itinerary_items').select('completed_by').eq('id', itemId).single()).data!.completed_by).toBe(ids.admin);
  });

  it.each(['skipped', 'no_client'] as const)('"%s" sobre una visita ya hecha avisa y no la cambia', async (status) => {
    await svc().from('itinerary_items').update({ status: 'done', completed_by: ids.admin, completed_at: new Date().toISOString() }).eq('id', itemId);
    await actAs('employee');
    const r = await mark(status);
    expect(r.success).toBeUndefined();
    expect(r.alreadyDone).toBe(true);
    expect((await svc().from('itinerary_items').select('status').eq('id', itemId).single()).data!.status).toBe('done');
  });

  it('"salteada" dos veces seguidas no cambia quién la salteó', async () => {
    await actAs('employee');
    expect((await mark('skipped')).success).toBe(true);
    const first = (await svc().from('itinerary_items').select('completed_by, completed_at').eq('id', itemId).single()).data!;
    expect((await mark('skipped')).success).toBe(true);
    expect((await svc().from('itinerary_items').select('completed_by, completed_at').eq('id', itemId).single()).data).toEqual(first);
  });
});

// ── Cuentas bloqueadas ───────────────────────────────────────────────────────────────────────

describe('cuentas bloqueadas · las acciones las rechazan', () => {
  const users: TempUser[] = [];
  afterEach(async () => { for (const u of users.splice(0)) await u.cleanup(); });

  it('un owner bloqueado que inicia sesión igual no puede ejecutar acciones (mensaje claro)', async () => {
    const u = await tempUser('owner'); users.push(u);
    await svc().from('profiles').update({ status: 'blocked' }).eq('id', u.id);
    actAsClient(await signInAs(u.email)); // el login funciona; lo que se corta es el uso
    const notes = rand('bloq');
    const r = (await createManualSaleAction(fd({ client_id: ids.client, notes, product_name_0: 'X', quantity_0: 1, unit_price_0: 1 }))) as ActionResult;
    expect(r.error).toBe('Tu cuenta está bloqueada. Contactá a Pancho.');
    expect((await svc().from('manual_sales').select('id').eq('notes', notes)).data).toEqual([]);
  });

  it('un empleado bloqueado no puede marcar piletas', async () => {
    const u = await tempUser('employee'); users.push(u);
    await svc().from('profiles').update({ status: 'blocked' }).eq('id', u.id);
    actAsClient(await signInAs(u.email));
    const itemId = (await svc().from('itinerary_items').select('id').eq('pool_id', FIXTURE.pools.pool2.id)).data![0].id;
    const r = (await marcarPiletaAction(itemId, 'skipped')) as ActionResult;
    expect(r.error).toBe('Tu cuenta está bloqueada. Contactá a Pancho.');
    expect((await svc().from('itinerary_items').select('status').eq('id', itemId).single()).data!.status).toBe('pending');
  });

  it('si la cuenta se bloquea con la sesión abierta, la acción siguiente falla', async () => {
    const u = await tempUser('owner'); users.push(u);
    const client = await signInAs(u.email);
    actAsClient(client);
    const ok = (await createManualSaleAction(fd({ client_id: ids.client, notes: rand('ok'), product_name_0: 'X', quantity_0: 1, unit_price_0: 1 }))) as ActionResult;
    expect(ok.success).toBe(true);
    await svc().from('manual_sales').delete().eq('id', ok.saleId as string);
    await svc().from('profiles').update({ status: 'blocked' }).eq('id', u.id);
    const r = (await createManualSaleAction(fd({ client_id: ids.client, notes: rand('no'), product_name_0: 'X', quantity_0: 1, unit_price_0: 1 }))) as ActionResult;
    expect(r.error).toBeTruthy();
    expect(r.success).toBeUndefined();
  });

  it('un owner degradado a cliente con la sesión abierta pierde los permisos en la siguiente acción', async () => {
    const u = await tempUser('owner'); users.push(u);
    actAsClient(await signInAs(u.email));
    await svc().from('profiles').update({ role: 'client' }).eq('id', u.id);
    const r = (await createManualSaleAction(fd({ client_id: ids.client, notes: rand('deg'), product_name_0: 'X', quantity_0: 1, unit_price_0: 1 }))) as ActionResult;
    expect(r.error).toBeTruthy();
    expect(r.success).toBeUndefined();
  });
});

describe('updateClientStatusAction · quién puede suspender a quién', () => {
  const users: TempUser[] = [];
  afterEach(async () => { for (const u of users.splice(0)) await u.cleanup(); });
  const status = async (id: string) => (await svc().from('profiles').select('status').eq('id', id).single()).data!.status;

  it('nadie cambia el estado de su propia cuenta', async () => {
    for (const actor of ['owner', 'admin'] as const) {
      await actAs(actor);
      const r = (await updateClientStatusAction(ids[actor], 'blocked')) as ActionResult;
      expect(r.error).toBe('No podés cambiar el estado de tu propia cuenta');
      expect(await status(ids[actor])).toBe('active');
    }
  });

  it('un owner no puede bloquear a otro owner, a marketing ni al super_admin', async () => {
    const other = await tempUser('owner'); users.push(other);
    await actAs('owner');
    for (const target of [other.id, ids.marketing, ids.admin]) {
      const r = (await updateClientStatusAction(target, 'blocked')) as ActionResult;
      expect(r.error, target).toBe('No tenés permisos para cambiar el estado de esa cuenta');
      expect(await status(target)).toBe('active');
    }
  });

  it('un owner sí puede bloquear a empleados y clientes; el super_admin puede con cualquiera', async () => {
    const emp = await tempUser('employee'); users.push(emp);
    const mk = await tempUser('marketing'); users.push(mk);
    await actAs('owner');
    expect(((await updateClientStatusAction(emp.id, 'blocked')) as ActionResult).success).toBe(true);
    expect(await status(emp.id)).toBe('blocked');
    await actAs('admin');
    expect(((await updateClientStatusAction(mk.id, 'blocked')) as ActionResult).success).toBe(true);
    expect(await status(mk.id)).toBe('blocked');
  });
});

// ── Alta de cliente: nunca "éxito" con datos a medias ────────────────────────────────────────

describe('createClientAction · el alta de cliente + pileta es todo o nada', () => {
  let db: pg.Client;
  beforeAll(async () => {
    db = new pg.Client({ connectionString: getLocalSupabase().dbUrl });
    await db.connect();
    // Trigger temporal que hace fallar la pileta (el último paso del alta); se quita en afterAll
    await db.query(`
      create or replace function public.tst_fail_pool() returns trigger language plpgsql as $$
      begin if new.address = 'FALLA-DIR' then raise exception 'dir invalida'; end if; return new; end; $$;
      create trigger tst_fail_pool before insert on public.pools for each row execute function public.tst_fail_pool();
    `);
  });
  afterAll(async () => {
    await db.query(`
      drop trigger if exists tst_fail_pool on public.pools;
      drop function if exists public.tst_fail_pool();
    `);
    await db.end();
  });

  const call = (f: Record<string, string>) => createClientAction(undefined, fd(f)) as Promise<ActionResult>;

  it('si falla la pileta: devuelve error y no queda ni el cliente ni su ficha', async () => {
    await actAs('owner');
    const name = rand('Falla');
    const r = await call({ full_name: name, client_number: '777001', pool_mode: 'new', address: 'FALLA-DIR' });
    expect(r.success).toBeUndefined();
    expect(r.error).toMatch(/^No se pudo crear el cliente/);
    expect((await svc().from('profiles').select('id').eq('full_name', name)).data, 'quedó un cliente a medias').toEqual([]);
    expect((await svc().from('client_profiles').select('id').eq('client_number', 777001)).data).toEqual([]);
  });

  it('el mismo N° de cliente se puede usar después del error (no quedó tomado)', async () => {
    await actAs('owner');
    expect((await call({ full_name: 'Reintento', client_number: '777002', pool_mode: 'new', address: 'FALLA-DIR' })).error).toBeTruthy();
    const ok = await call({ full_name: 'Reintento', client_number: '777002', pool_mode: 'new', address: rand('Calle') });
    expect(ok.success).toBe(true);
    await svc().from('profiles').delete().eq('id', ok.userId as string);
  });
});

// ── Venta: advertencia de stock ──────────────────────────────────────────────────────────────

describe('createManualSaleAction · stock insuficiente', () => {
  const P = FIXTURE.products.pastilla.id;
  let original = 0;
  const sales: string[] = [];
  beforeAll(async () => { original = (await svc().from('products').select('stock_units').eq('id', P).single()).data!.stock_units; });
  afterEach(async () => {
    for (const id of sales.splice(0)) await svc().from('manual_sales').delete().eq('id', id);
    await svc().from('products').update({ stock_units: original }).eq('id', P);
  });

  it('permite la venta, deja el stock en 0 y devuelve el faltante para avisar', async () => {
    await svc().from('products').update({ stock_units: 2 }).eq('id', P);
    await actAs('owner');
    const r = (await createManualSaleAction(fd({ client_id: ids.client, product_id_0: P, product_name_0: 'Pastillas', quantity_0: 5, unit_price_0: 10 }))) as ActionResult;
    sales.push(r.saleId as string);
    expect(r.success).toBe(true);
    expect(r.shortages).toEqual([{ product_name: 'Pastillas', quantity: 5, missing: 3, chlorine_type: null, missing_chlorine: null }]);
    expect((await svc().from('products').select('stock_units').eq('id', P).single()).data!.stock_units).toBe(0);
  });

  it('con stock suficiente no hay advertencias', async () => {
    await svc().from('products').update({ stock_units: 10 }).eq('id', P);
    await actAs('owner');
    const r = (await createManualSaleAction(fd({ client_id: ids.client, product_id_0: P, product_name_0: 'Pastillas', quantity_0: 5, unit_price_0: 10 }))) as ActionResult;
    sales.push(r.saleId as string);
    expect(r.shortages).toEqual([]);
  });
});
