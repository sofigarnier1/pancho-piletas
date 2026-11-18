/**
 * Migración 32: cobros y deuda.
 *  - deuda = visitas hechas × precio vigente ese día + cloro × su precio − pagos (los "con_empleado" también cuentan)
 *  - sin precio: cargo 0 y aviso
 *  - el empleado anota solo el monto desde una visita suya de los últimos 7 días; la base pone cliente, fecha y estado
 *  - el dueño confirma (la base pone quién y cuándo); un recibido no vuelve atrás; cliente y visita no se cambian
 *  - marketing y el cliente no ven nada; las funciones de cuenta son solo del dueño
 */
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { TestUserKey } from '../../e2e/support/env';
import { as, svc, userIds, type Actor } from '../support/clients';
import { addDays, todayInArgentina } from '@/lib/dates';

const HOY = todayInArgentina();
let ids: Record<TestUserKey, string>;
let poolHist: string;   // pileta con la historia de 2034 (cargos y un pago)
let poolHoy: string;    // pileta con visitas de hoy y de hace 10 días (para el empleado)
let itemHoy: string;
let itemViejo: string;
let itemAjeno: string;  // de hoy, pero le toca al dueño
const pagos: string[] = [];

const day = async (date: string) =>
  (await svc().from('itinerary_days').upsert({ date }, { onConflict: 'date' }).select('id').single()).data!.id as string;
const item = async (pool: string, date: string, extra: Record<string, unknown> = {}) =>
  (await svc().from('itinerary_items').insert({ itinerary_day_id: await day(date), pool_id: pool, sort_order: 970, ...extra }).select('id').single()).data!.id as string;

beforeAll(async () => {
  ids = await userIds();
  await svc().from('client_prices').delete().eq('client_id', ids.client2);
  const mkPool = async (a: string) =>
    (await svc().from('pools').insert({ client_id: ids.client2, address: `${a} ${Date.now()}` }).select('id').single()).data!.id as string;
  poolHist = await mkPool('Cobros historia');
  poolHoy = await mkPool('Cobros hoy');
  const poolAjeno = await mkPool('Cobros ajena');

  // Precios: el service sube en febrero; el cloro líquido no tiene precio
  await svc().from('client_prices').insert([
    { client_id: ids.client2, kind: 'service', price_cents: 1_000_000, valid_from: '2034-01-01' },
    { client_id: ids.client2, kind: 'service', price_cents: 1_200_000, valid_from: '2034-02-01' },
    { client_id: ids.client2, kind: 'desagote', price_cents: 3_000_000, valid_from: '2034-01-01' },
    { client_id: ids.client2, kind: 'cloro_granulado', price_cents: 500_000, valid_from: '2034-01-01' },
  ]);

  const v1 = await item(poolHist, '2034-01-10');
  const v2 = await item(poolHist, '2034-02-10');
  await item(poolHist, '2034-01-20', { service_type: 'desagote', status: 'done' });
  await item(poolHist, '2034-01-25', { status: 'skipped' }); // salteada: no se cobra
  for (const [it, date, type, amount] of [[v1, '2034-01-10', 'granulado', 500], [v2, '2034-02-10', 'liquido', 2]] as const) {
    const { error } = await svc().from('service_logs').insert({
      itinerary_item_id: it, employee_id: ids.employee, pool_id: poolHist, client_id: ids.client2, date,
      chlorine_applied: true, chlorine_type: type, chlorine_amount: amount, request_id: randomUUID(),
    });
    if (error) throw error;
  }
  const { data: p, error } = await svc().from('payments')
    .insert({ client_id: ids.client2, amount_cents: 500_000, paid_at: '2034-01-31', status: 'recibido' }).select('id').single();
  if (error) throw error;
  pagos.push(p.id as string);

  itemHoy = await item(poolHoy, HOY);
  itemViejo = await item(poolHoy, addDays(HOY, -10));
  itemAjeno = await item(poolAjeno, HOY, { assigned_employee_id: ids.owner });
});

afterAll(async () => {
  const pools = [poolHist, poolHoy];
  await svc().from('payments').delete().eq('client_id', ids.client2);
  await svc().from('service_logs').delete().eq('pool_id', poolHist);
  const { data: ajena } = await svc().from('itinerary_items').select('pool_id').eq('id', itemAjeno).single();
  if (ajena) pools.push(ajena.pool_id as string);
  await svc().from('itinerary_items').delete().in('pool_id', pools);
  await svc().from('pools').delete().in('id', pools);
  await svc().from('client_prices').delete().eq('client_id', ids.client2);
});

type Mov = { fecha: string; tipo: string; cargo_cents: number; pago_cents: number; sin_precio: boolean; cantidad: number | null; precio_cents: number | null };

describe('movimientos y deuda', () => {
  it('cada visita hecha con el precio de ese día, el cloro por kilo / litro, y los pagos', async () => {
    const owner = await as('owner');
    const { data, error } = await owner.rpc('movimientos_cuenta', { p_client: ids.client2, p_hasta: '2034-12-31' });
    expect(error).toBeNull();
    const movs = ((data ?? []) as Mov[]).filter((m) => m.fecha >= '2034-01-01')
      .map((m) => [m.fecha, m.tipo, Number(m.cargo_cents), Number(m.pago_cents), m.sin_precio]);
    expect(movs).toEqual([
      ['2034-01-10', 'cloro_granulado', 250_000, 0, false], // 500 g = 0,5 kg × $5.000
      ['2034-01-10', 'service', 1_000_000, 0, false],
      ['2034-01-20', 'desagote', 3_000_000, 0, false],
      ['2034-01-31', 'pago', 0, 500_000, false],
      ['2034-02-10', 'cloro_liquido', 0, 0, true],          // sin precio: 0 y aviso
      ['2034-02-10', 'service', 1_200_000, 0, false],       // ya rige el aumento
    ]);
  });

  it('el saldo de la deuda es cargos − pagos; "hasta" corta en la fecha', async () => {
    const owner = await as('owner');
    const fila = async (hasta: string) =>
      ((await owner.rpc('deuda_clientes', { p_hasta: hasta })).data as { client_id: string; saldo_cents: number; services: number; sin_precio: number }[])
        .find((r) => r.client_id === ids.client2)!;
    const total = await fila('2034-12-31');
    expect(Number(total.saldo_cents)).toBe(5_450_000 - 500_000);
    expect(total.sin_precio).toBeGreaterThanOrEqual(1);
    expect(Number((await fila('2034-01-15')).saldo_cents)).toBe(1_250_000);
  });

  it.each(['employee', 'marketing', 'client2'] as Actor[])('%s no puede ver cuentas ni deudas', async (actor) => {
    const c = await as(actor);
    expect((await c.rpc('movimientos_cuenta', { p_client: ids.client2, p_hasta: '2034-12-31' })).error?.code).toBe('42501');
    expect((await c.rpc('deuda_clientes', { p_hasta: '2034-12-31' })).error?.code).toBe('42501');
  });
});

describe('el empleado anota lo que cobró', () => {
  it('la base pone el cliente (titular), la fecha de la visita, quién cobró y "con_empleado"', async () => {
    const emp = await as('employee');
    const { data, error } = await emp.from('payments').insert({
      itinerary_item_id: itemHoy, amount_cents: 300_000, client_id: ids.client, status: 'recibido', paid_at: '2000-01-01',
      received_by: ids.owner, request_id: randomUUID(),
    }).select('id, client_id, paid_at, status, received_by, confirmed_by').single();
    expect(error).toBeNull();
    pagos.push(data!.id as string);
    expect(data).toMatchObject({ client_id: ids.client2, paid_at: HOY, status: 'con_empleado', received_by: ids.employee, confirmed_by: null });
  });

  it('ve solo los que anotó él', async () => {
    const emp = await as('employee');
    const { data } = await emp.from('payments').select('id');
    expect((data ?? []).map((p) => p.id)).toEqual([pagos[1]]);
  });

  it('no sin visita, no de hace más de 7 días, no de una visita que le toca a otro', async () => {
    const emp = await as('employee');
    expect((await emp.from('payments').insert({ client_id: ids.client2, amount_cents: 1 })).error?.code).toBe('42501');
    expect((await emp.from('payments').insert({ itinerary_item_id: itemViejo, client_id: ids.client2, amount_cents: 1 })).error?.code).toBe('PA002');
    expect((await emp.from('payments').insert({ itinerary_item_id: itemAjeno, client_id: ids.client2, amount_cents: 1 })).error?.code).toBe('42501');
  });

  it('no puede cambiar un pago (ni el monto)', async () => {
    const emp = await as('employee');
    const { data } = await emp.from('payments').update({ amount_cents: 1 }).eq('id', pagos[1]).select('id');
    expect(data ?? []).toEqual([]);
    expect(Number((await svc().from('payments').select('amount_cents').eq('id', pagos[1]).single()).data!.amount_cents)).toBe(300_000);
  });

  it('el mismo envío dos veces no se duplica', async () => {
    const emp = await as('employee');
    const rid = randomUUID();
    const first = await emp.from('payments').insert({ itinerary_item_id: itemHoy, client_id: ids.client2, amount_cents: 1000, request_id: rid }).select('id').single();
    expect(first.error).toBeNull();
    expect((await emp.from('payments').insert({ itinerary_item_id: itemHoy, client_id: ids.client2, amount_cents: 1000, request_id: rid })).error?.code).toBe('23505');
    // y lo puede borrar mientras lo tiene él
    const { data: del } = await emp.from('payments').delete().eq('id', first.data!.id).select('id');
    expect(del).toHaveLength(1);
  });
});

describe('el dueño confirma y carga pagos', () => {
  it('confirmar pone quién y cuándo; ya no vuelve atrás; el empleado ya no lo puede borrar', async () => {
    const owner = await as('owner');
    const { data, error } = await owner.from('payments').update({ status: 'recibido', confirmed_by: ids.employee }).eq('id', pagos[1]).select('status, confirmed_by, confirmed_at').single();
    expect(error).toBeNull();
    expect(data).toMatchObject({ status: 'recibido', confirmed_by: ids.owner });
    expect(data!.confirmed_at).not.toBeNull();
    expect((await owner.from('payments').update({ status: 'con_empleado' }).eq('id', pagos[1])).error?.code).toBe('42501');
    const emp = await as('employee');
    expect((await emp.from('payments').delete().eq('id', pagos[1]).select('id')).data ?? []).toEqual([]);
  });

  it('no se cambia el cliente ni la visita de un pago', async () => {
    const owner = await as('owner');
    expect((await owner.from('payments').update({ client_id: ids.client }).eq('id', pagos[0])).error?.code).toBe('42501');
    expect((await owner.from('payments').update({ itinerary_item_id: itemHoy }).eq('id', pagos[0])).error?.code).toBe('42501');
  });

  it('un pago directo del dueño queda recibido, a su nombre', async () => {
    const owner = await as('owner');
    const { data, error } = await owner.from('payments').insert({ client_id: ids.client2, amount_cents: 100, notes: '  Transferencia  ' })
      .select('id, status, received_by, confirmed_by, notes').single();
    expect(error).toBeNull();
    expect(data).toMatchObject({ status: 'recibido', received_by: ids.owner, confirmed_by: ids.owner, notes: 'Transferencia' });
  });

  it('solo a clientes, montos válidos', async () => {
    const owner = await as('owner');
    expect((await owner.from('payments').insert({ client_id: ids.employee, amount_cents: 100 })).error?.code).toBe('22023');
    expect((await owner.from('payments').insert({ client_id: ids.client2, amount_cents: 0 })).error?.code).toBe('23514');
    expect((await owner.from('payments').insert({ client_id: ids.client2, amount_cents: 10_000_000_001 })).error?.code).toBe('23514');
  });

  it.each(['marketing', 'client2'] as Actor[])('%s no ve pagos ni puede cargarlos', async (actor) => {
    const c = await as(actor);
    expect((await c.from('payments').select('id')).data ?? []).toEqual([]);
    expect((await c.from('payments').insert({ client_id: ids.client2, amount_cents: 100 })).error).not.toBeNull();
  });
});
