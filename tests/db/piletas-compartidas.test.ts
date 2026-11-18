/**
 * Migración 24 (Etapa 3c): piletas con varios clientes y alta de cliente + pileta en un paso.
 *  - pools.client_id es el titular y la base lo mantiene sincronizado con pool_clients
 *  - desde la API solo se suman co-clientes (con rol cliente) o se quitan; el titular no se quita
 *  - el co-cliente ve la pileta y sus services; no ve los clientes de piletas ajenas
 *  - create_client_with_pool: solo el dueño, todo o nada
 */
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import type { TestUserKey } from '../../e2e/support/env';
import { FIXTURE } from '../../e2e/support/seed';
import { as, rand, svc, userIds, type Actor } from '../support/clients';

let ids: Record<TestUserKey, string>;
beforeAll(async () => { ids = await userIds(); });

const pools: string[] = [];
const profiles: string[] = [];
afterEach(async () => {
  for (const id of pools.splice(0)) await svc().from('pools').delete().eq('id', id);
  for (const id of profiles.splice(0)) await svc().from('profiles').delete().eq('id', id);
});

const newPool = async (clientId = ids.client) => {
  const { data, error } = await svc().from('pools').insert({ client_id: clientId, address: rand('Compartida') }).select('id').single();
  if (error) throw new Error(error.message);
  pools.push(data.id);
  return data.id as string;
};
const links = async (poolId: string) =>
  (await svc().from('pool_clients').select('client_id, is_primary').eq('pool_id', poolId).order('is_primary', { ascending: false }).order('created_at')).data;

describe('pool_clients · sincronización con el titular', () => {
  it('al crear una pileta, su cliente queda como titular', async () => {
    const id = await newPool();
    expect(await links(id)).toEqual([{ client_id: ids.client, is_primary: true }]);
  });

  it('las piletas del seed tienen su titular', async () => {
    expect(await links(FIXTURE.pools.pool1.id)).toEqual([{ client_id: ids.client, is_primary: true }]);
    expect(await links(FIXTURE.pools.pool2.id)).toEqual([{ client_id: ids.client2, is_primary: true }]);
  });

  it('cambiar pools.client_id cambia el titular; el anterior queda como co-cliente', async () => {
    const id = await newPool();
    const owner = await as('owner');
    expect((await owner.from('pools').update({ client_id: ids.client2 }).eq('id', id)).error).toBeNull();
    expect(await links(id)).toEqual([{ client_id: ids.client2, is_primary: true }, { client_id: ids.client, is_primary: false }]);
    // y volver: el co-cliente pasa a titular sin duplicarse
    expect((await owner.from('pools').update({ client_id: ids.client }).eq('id', id)).error).toBeNull();
    expect(await links(id)).toEqual([{ client_id: ids.client, is_primary: true }, { client_id: ids.client2, is_primary: false }]);
  });

  it('cambiar otros datos de la pileta no toca a sus clientes', async () => {
    const id = await newPool();
    await (await as('owner')).from('pools').update({ nickname: 'Casa' }).eq('id', id);
    expect(await links(id)).toEqual([{ client_id: ids.client, is_primary: true }]);
  });

  it('borrar la pileta borra sus clientes', async () => {
    const id = await newPool();
    await (await as('owner')).from('pool_clients').insert({ pool_id: id, client_id: ids.client2 });
    expect((await svc().from('pools').delete().eq('id', id)).error).toBeNull();
    expect(await links(id)).toEqual([]);
  });
});

describe('pool_clients · guardián', () => {
  it('desde la API el que se suma es co-cliente aunque pida ser titular, y queda quién lo sumó', async () => {
    const id = await newPool();
    const { error } = await (await as('owner')).from('pool_clients').insert({ pool_id: id, client_id: ids.client2, is_primary: true, created_by: ids.client });
    expect(error).toBeNull();
    const { data } = await svc().from('pool_clients').select('is_primary, created_by').eq('pool_id', id).eq('client_id', ids.client2).single();
    expect(data).toEqual({ is_primary: false, created_by: ids.owner });
  });

  it('solo se suman clientes (no gente del equipo)', async () => {
    const id = await newPool();
    for (const who of ['employee', 'owner', 'marketing'] as const) {
      const { error } = await (await as('owner')).from('pool_clients').insert({ pool_id: id, client_id: ids[who] });
      expect(error?.code, who).toBe('23514');
    }
  });

  it('un cliente no se repite en la misma pileta', async () => {
    const id = await newPool();
    expect((await (await as('owner')).from('pool_clients').insert({ pool_id: id, client_id: ids.client })).error?.code).toBe('23505');
  });

  it('las filas no se editan (ni para hacerse titular)', async () => {
    const id = await newPool();
    const owner = await as('owner');
    await owner.from('pool_clients').insert({ pool_id: id, client_id: ids.client2 });
    const { error } = await owner.from('pool_clients').update({ is_primary: true }).eq('pool_id', id).eq('client_id', ids.client2);
    expect(error?.code).toBe('42501');
    expect(await links(id)).toEqual([{ client_id: ids.client, is_primary: true }, { client_id: ids.client2, is_primary: false }]);
  });

  it('al titular no se lo quita; a un co-cliente sí', async () => {
    const id = await newPool();
    const owner = await as('owner');
    await owner.from('pool_clients').insert({ pool_id: id, client_id: ids.client2 });
    expect((await owner.from('pool_clients').delete().eq('pool_id', id).eq('client_id', ids.client)).error?.code).toBe('42501');
    expect((await owner.from('pool_clients').delete().eq('pool_id', id).eq('client_id', ids.client2)).error).toBeNull();
    expect(await links(id)).toEqual([{ client_id: ids.client, is_primary: true }]);
  });
});

describe('pool_clients · lo que ve cada uno', () => {
  it('el co-cliente ve la pileta compartida y sus services; el titular sigue viéndola', async () => {
    // pileta de client2 compartida con client
    const id = await newPool(ids.client2);
    await (await as('owner')).from('pool_clients').insert({ pool_id: id, client_id: ids.client });
    const { data: log } = await svc().from('service_logs').insert({ employee_id: ids.employee, pool_id: id, client_id: ids.client2, date: '2025-03-03', notes: rand('svc') }).select('id').single();

    const client = await as('client');
    expect((await client.from('pools').select('id').eq('id', id)).data).toEqual([{ id }]);
    expect((await client.from('service_logs').select('id').eq('id', log!.id)).data).toEqual([{ id: log!.id }]);
    expect((await (await as('client2')).from('pools').select('id').eq('id', id)).data).toEqual([{ id }]);
    await svc().from('service_logs').delete().eq('id', log!.id);
  });

  it('un cliente solo ve sus propias filas de pool_clients', async () => {
    const id = await newPool(ids.client2);
    await (await as('owner')).from('pool_clients').insert({ pool_id: id, client_id: ids.client });
    const { data } = await (await as('client')).from('pool_clients').select('client_id').eq('pool_id', id);
    expect(data).toEqual([{ client_id: ids.client }]);
    // y no ve la pileta 2 del seed, donde no figura
    expect((await (await as('client')).from('pools').select('id').eq('id', FIXTURE.pools.pool2.id)).data).toEqual([]);
  });

  it.each<Actor>(['anon', 'employee', 'client'])('%s no ve los clientes de una pileta ajena', async (actor) => {
    const { data } = await (await as(actor)).from('pool_clients').select('id').eq('pool_id', FIXTURE.pools.pool2.id);
    expect(data ?? []).toEqual([]);
  });
});

describe('create_client_with_pool', () => {
  const rpc = async (actor: Actor, args: Record<string, unknown>) => {
    const r = await (await as(actor)).rpc('create_client_with_pool', args);
    const out = r.data as { client_id: string; pool_id: string | null } | null;
    if (out?.client_id) profiles.push(out.client_id);
    if (out?.pool_id && args.p_pool_mode === 'new') pools.push(out.pool_id);
    return r;
  };

  it.each<Actor>(['owner', 'admin'])('%s crea cliente sin cuenta + pileta en un paso', async (actor) => {
    const { data, error } = await rpc(actor, { p_full_name: ' Ana ', p_phone: ' ', p_pool_mode: 'new', p_address: ' Calle 1 ', p_pool_type: 'fibra' });
    expect(error).toBeNull();
    const out = data as { client_id: string; pool_id: string };
    expect((await svc().from('profiles').select('full_name, phone, role, has_account').eq('id', out.client_id).single()).data)
      .toEqual({ full_name: 'Ana', phone: null, role: 'client', has_account: false });
    expect((await svc().from('pools').select('client_id, address, pool_type').eq('id', out.pool_id).single()).data)
      .toEqual({ client_id: out.client_id, address: 'Calle 1', pool_type: 'fibra' });
    expect(await links(out.pool_id)).toEqual([{ client_id: out.client_id, is_primary: true }]);
  });

  it.each<Actor>(['anon', 'client', 'employee', 'marketing'])('%s no puede usarla y no queda nada', async (actor) => {
    const name = rand('Intruso');
    const { error } = await rpc(actor, { p_full_name: name, p_pool_mode: 'new', p_address: 'x' });
    expect(error).toBeTruthy();
    expect((await svc().from('profiles').select('id').eq('full_name', name)).data).toEqual([]);
  });

  it('es todo o nada: si falla la pileta existente, no queda el cliente', async () => {
    const name = rand('Huérfano');
    const { error } = await rpc('owner', { p_full_name: name, p_pool_mode: 'existing', p_pool_id: '00000000-0000-4000-8000-000000000000' });
    expect(error?.code).toBe('23503');
    expect((await svc().from('profiles').select('id').eq('full_name', name)).data).toEqual([]);
  });

  it('valida la opción de pileta, el tipo y el nombre', async () => {
    expect((await rpc('owner', { p_full_name: 'A', p_pool_mode: 'todas' })).error?.code).toBe('22023');
    expect((await rpc('owner', { p_full_name: 'A', p_pool_mode: 'new', p_pool_type: 'olimpica' })).error?.code).toBe('22023');
    expect((await rpc('owner', { p_full_name: '   ' })).error?.code).toBe('23514');
  });
});
