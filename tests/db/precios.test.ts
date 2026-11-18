/**
 * Migración 31: precios por cliente.
 *  - precio_vigente: el de fecha "desde" más nueva que no pasa del día
 *  - solo para clientes; created_by lo fija la base; el cliente del precio no se cambia
 *  - montos fuera de rango y tipos inventados se rechazan
 *  - fuera del dueño, precio_vigente no ve nada (RLS)
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { TestUserKey } from '../../e2e/support/env';
import { as, svc, userIds, type Actor } from '../support/clients';

let ids: Record<TestUserKey, string>;
beforeAll(async () => {
  ids = await userIds();
  await svc().from('client_prices').delete().eq('client_id', ids.client2);
  const owner = await as('owner');
  const { error } = await owner.from('client_prices').insert([
    { client_id: ids.client2, kind: 'service', price_cents: 1_000_000, valid_from: '2031-01-01' },
    { client_id: ids.client2, kind: 'service', price_cents: 1_200_000, valid_from: '2031-06-01' },
  ]);
  if (error) throw error;
});
afterAll(async () => { await svc().from('client_prices').delete().eq('client_id', ids.client2); });

const vigente = async (date: string, actor: Actor = 'owner', kind = 'service') =>
  (await (await as(actor)).rpc('precio_vigente', { p_client: ids.client2, p_kind: kind, p_date: date })).data;

describe('precio_vigente', () => {
  it('rige el más nuevo que no pasa del día', async () => {
    expect(await vigente('2030-12-31')).toBeNull();
    expect(Number(await vigente('2031-01-01'))).toBe(1_000_000);
    expect(Number(await vigente('2031-05-31'))).toBe(1_000_000);
    expect(Number(await vigente('2031-06-01'))).toBe(1_200_000);
    expect(await vigente('2031-06-01', 'owner', 'desagote')).toBeNull();
  });
  it.each(['employee', 'marketing', 'client2'] as Actor[])('%s no ve ningún precio', async (actor) => {
    expect(await vigente('2031-06-01', actor)).toBeNull();
  });
});

describe('reglas de escritura', () => {
  it('created_by lo pone la base', async () => {
    const owner = await as('owner');
    const { data, error } = await owner
      .from('client_prices')
      .insert({ client_id: ids.client2, kind: 'cloro_liquido', price_cents: 50_000, valid_from: '2031-02-01', created_by: ids.employee })
      .select('created_by')
      .single();
    expect(error).toBeNull();
    expect(data!.created_by).toBe(ids.owner);
  });

  it('solo para clientes', async () => {
    const owner = await as('owner');
    const { error } = await owner.from('client_prices').insert({ client_id: ids.employee, kind: 'service', price_cents: 1, valid_from: '2031-01-01' });
    expect(error?.code).toBe('22023');
  });

  it('no se cambia el cliente de un precio', async () => {
    const owner = await as('owner');
    const { data } = await owner.from('client_prices').select('id').eq('client_id', ids.client2).eq('valid_from', '2031-01-01').single();
    const { error } = await owner.from('client_prices').update({ client_id: ids.client }).eq('id', data!.id);
    expect(error?.code).toBe('42501');
  });

  it.each([[-1], [10_000_000_001]])('rechaza el monto %i', async (cents) => {
    const owner = await as('owner');
    const { error } = await owner.from('client_prices').insert({ client_id: ids.client2, kind: 'desagote', price_cents: cents, valid_from: '2031-03-01' });
    expect(error?.code).toBe('23514');
  });

  it('rechaza un tipo inventado y un precio duplicado (mismo tipo y fecha)', async () => {
    const owner = await as('owner');
    expect((await owner.from('client_prices').insert({ client_id: ids.client2, kind: 'pintura', price_cents: 1, valid_from: '2031-03-01' })).error?.code).toBe('23514');
    expect((await owner.from('client_prices').insert({ client_id: ids.client2, kind: 'service', price_cents: 1, valid_from: '2031-01-01' })).error?.code).toBe('23505');
  });
});
