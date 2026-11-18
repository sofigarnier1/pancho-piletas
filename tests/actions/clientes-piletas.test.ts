import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
vi.mock('@/lib/supabase/server', async () => (await import('../support/session')).serverMock);
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));

import type { TestUserKey } from '../../e2e/support/env';
import { createClientAction, enableClientAccessAction, updateClientAction, updateClientStatusAction } from '@/app/admin/clientes/actions';
import { addPoolClientAction, createPoolAction, removePoolClientAction, setPoolPrimaryClientAction, togglePoolActiveAction, updatePoolAction } from '@/app/admin/piletas/actions';
import { actAs, except, fd, resetRevalidated, revalidated, type ActionResult } from '../support/session';
import { rand, svc, tempUser, userIds, type Actor } from '../support/clients';

const OWNER_UP: Actor[] = ['owner', 'admin'];
let ids: Record<TestUserKey, string>;
beforeAll(async () => { ids = await userIds(); });
beforeEach(() => resetRevalidated());

const findUserByEmail = async (email: string) =>
  (await svc().auth.admin.listUsers({ perPage: 200 })).data.users.find((u) => u.email === email);

/** Borra clientes creados en el test (sus piletas como titular se borran en cascada). */
const dropClients = async (list: string[]) => {
  for (const id of list.splice(0)) {
    await svc().from('profiles').delete().eq('id', id);
    await svc().auth.admin.deleteUser(id).catch(() => undefined);
  }
};

describe('createClientAction · alta sin cuenta web, con su pileta', () => {
  const created: string[] = [];
  afterEach(async () => { await dropClients(created); });

  const call = async (f: Record<string, string>) => {
    const r = (await createClientAction(undefined, fd(f))) as ActionResult;
    if (r.userId) created.push(r.userId as string);
    return r;
  };

  it.each(OWNER_UP)('%s da de alta un cliente con una pileta nueva: queda como titular y sin cuenta web', async (actor) => {
    await actAs(actor);
    const address = rand('Calle');
    const r = await call({
      full_name: '  Ana Pérez ', client_number: String(800000 + Math.floor(Math.random() * 99999)), phone: '1144445555', notes: 'Paga en efectivo',
      pool_mode: 'new', address: ` ${address} `, neighborhood: 'Tigre', nickname: 'Casa', pool_type: 'liner', pool_notes: 'Perro bravo',
    });
    expect(r.error).toBeUndefined();
    expect(r.success).toBe(true);
    const id = r.userId as string;

    const { data: p } = await svc().from('profiles').select('full_name, phone, role, has_account, status').eq('id', id).single();
    expect(p).toEqual({ full_name: 'Ana Pérez', phone: '1144445555', role: 'client', has_account: false, status: 'active' });
    const { data: cp } = await svc().from('client_profiles').select('notes, client_number').eq('id', id).single();
    expect(cp?.notes).toBe('Paga en efectivo');
    expect(cp?.client_number).toBeGreaterThan(0);

    const { data: pool } = await svc().from('pools').select('client_id, address, neighborhood, nickname, pool_type, notes, created_by').eq('id', r.poolId as string).single();
    expect(pool).toEqual({ client_id: id, address, neighborhood: 'Tigre', nickname: 'Casa', pool_type: 'liner', notes: 'Perro bravo', created_by: ids[actor as TestUserKey] });
    const { data: links } = await svc().from('pool_clients').select('client_id, is_primary').eq('pool_id', r.poolId as string);
    expect(links).toEqual([{ client_id: id, is_primary: true }]);
    expect(revalidated()).toEqual(expect.arrayContaining(['/admin/clientes', '/admin/piletas']));
  });

  it('solo con el nombre: sin N°, sin pileta y los opcionales en null', async () => {
    await actAs('owner');
    const r = await call({ full_name: 'Solo Nombre', pool_mode: 'none', address: 'se ignora' });
    expect(r.success).toBe(true);
    expect(r.poolId).toBeNull();
    const { data: cp } = await svc().from('client_profiles').select('client_number, notes').eq('id', r.userId as string).single();
    expect(cp).toEqual({ client_number: null, notes: null });
    expect((await svc().from('pool_clients').select('id').eq('client_id', r.userId as string)).data).toEqual([]);
  });

  it('sin indicar la pileta, no crea ninguna', async () => {
    await actAs('owner');
    const r = await call({ full_name: 'Sin modo' });
    expect(r.success).toBe(true);
    expect(r.poolId).toBeNull();
  });

  it('la pileta nueva puede no tener dirección', async () => {
    await actAs('owner');
    const r = await call({ full_name: 'Sin dirección', pool_mode: 'new', nickname: 'La de la esquina' });
    expect(r.success).toBe(true);
    const { data } = await svc().from('pools').select('address, nickname').eq('id', r.poolId as string).single();
    expect(data).toEqual({ address: null, nickname: 'La de la esquina' });
  });

  it('con una pileta que ya existe: se suma como co-cliente y el titular no cambia', async () => {
    const { data: pool } = await svc().from('pools').insert({ client_id: ids.client, address: rand('Compartida') }).select('id').single();
    await actAs('owner');
    const r = await call({ full_name: 'Hermana', pool_mode: 'existing', pool_id: pool!.id, address: 'se ignora' });
    expect(r.success).toBe(true);
    expect(r.poolId).toBe(pool!.id);
    const { data: links } = await svc().from('pool_clients').select('client_id, is_primary').eq('pool_id', pool!.id).order('is_primary', { ascending: false });
    expect(links).toEqual([{ client_id: ids.client, is_primary: true }, { client_id: r.userId, is_primary: false }]);
    expect((await svc().from('pools').select('client_id, address').eq('id', pool!.id).single()).data?.client_id).toBe(ids.client);
    await svc().from('pools').delete().eq('id', pool!.id);
  });

  it('el N° de cliente repetido da un aviso claro y no crea nada', async () => {
    await actAs('owner');
    const n = String(700000 + Math.floor(Math.random() * 99999));
    expect((await call({ full_name: 'Primero', client_number: n })).success).toBe(true);
    const name = rand('Segundo');
    const r = await call({ full_name: name, client_number: n, pool_mode: 'new', address: rand('Calle') });
    expect(r.error).toBe(`Ya hay un cliente con el N° ${n}`);
    expect((await svc().from('profiles').select('id').eq('full_name', name)).data).toEqual([]);
  });

  it('un nombre repetido NO impide el alta', async () => {
    await actAs('owner');
    expect((await call({ full_name: 'test-client' })).success).toBe(true);
  });

  it.each(except(OWNER_UP))('%s NO puede crear clientes (y no se crea nada)', async (actor) => {
    await actAs(actor);
    const name = rand('Intruso');
    const r = await call({ full_name: name, pool_mode: 'new', address: rand('Calle') });
    expect(r.error).toBeTruthy();
    expect(r.success).toBeUndefined();
    expect((await svc().from('profiles').select('id').eq('full_name', name)).data).toEqual([]);
    expect(revalidated()).toEqual([]);
  });

  it.each([
    ['sin nombre', {}, 'El nombre es obligatorio'],
    ['nombre en blanco', { full_name: '   ' }, 'El nombre es obligatorio'],
    ['nombre larguísimo', { full_name: 'x'.repeat(201) }, 'El nombre es demasiado largo'],
    ['N° cero', { full_name: 'Ana', client_number: '0' }, 'El N° de cliente tiene que ser un número entero mayor que 0'],
    ['N° con letras', { full_name: 'Ana', client_number: '12a' }, 'El N° de cliente tiene que ser un número entero mayor que 0'],
    ['opción de pileta desconocida', { full_name: 'Ana', pool_mode: 'todas' }, 'Datos inválidos'],
    ['pileta existente sin elegir', { full_name: 'Ana', pool_mode: 'existing' }, 'Elegí la pileta a la que se suma el cliente'],
    ['pileta existente con id inválido', { full_name: 'Ana', pool_mode: 'existing', pool_id: 'abc' }, 'Elegí la pileta a la que se suma el cliente'],
    ['tipo de pileta inválido', { full_name: 'Ana', pool_mode: 'new', pool_type: 'olimpica' }, 'Tipo de pileta inválido'],
  ])('rechaza datos inválidos: %s', async (_label, fields, msg) => {
    await actAs('owner');
    const r = await call(fields as Record<string, string>);
    expect(r.error).toBe(msg);
    expect(revalidated()).toEqual([]);
  });

  it('una pileta existente que no existe da error y no crea el cliente', async () => {
    await actAs('owner');
    const name = rand('Fantasma');
    const r = await call({ full_name: name, pool_mode: 'existing', pool_id: '00000000-0000-4000-8000-000000000000' });
    expect(r.error).toBe('La pileta elegida no existe');
    expect((await svc().from('profiles').select('id').eq('full_name', name)).data).toEqual([]);
  });
});

describe('updateClientAction', () => {
  const created: string[] = [];
  afterEach(async () => { await dropClients(created); });
  const newClient = async () => {
    await actAs('owner');
    const r = (await createClientAction(undefined, fd({ full_name: rand('Editable') }))) as ActionResult;
    created.push(r.userId as string);
    return r.userId as string;
  };
  const call = (id: string, f: Record<string, string>) => updateClientAction(id, undefined, fd(f)) as Promise<ActionResult>;

  it.each(OWNER_UP)('%s edita nombre, N°, teléfono y notas', async (actor) => {
    const id = await newClient();
    await actAs(actor);
    const n = 600000 + Math.floor(Math.random() * 99999);
    const r = await call(id, { full_name: ' Nuevo Nombre ', client_number: String(n), phone: '1100', notes: 'Nota' });
    expect(r.success).toBe(true);
    expect((await svc().from('profiles').select('full_name, phone').eq('id', id).single()).data).toEqual({ full_name: 'Nuevo Nombre', phone: '1100' });
    expect((await svc().from('client_profiles').select('client_number, notes').eq('id', id).single()).data).toEqual({ client_number: n, notes: 'Nota' });
    expect(revalidated()).toContain(`/admin/clientes/${id}`);
    // vaciar los opcionales
    expect((await call(id, { full_name: 'Nuevo Nombre' })).success).toBe(true);
    expect((await svc().from('client_profiles').select('client_number, notes').eq('id', id).single()).data).toEqual({ client_number: null, notes: null });
  });

  it('el N° repetido avisa y no cambia nada', async () => {
    const a = await newClient();
    const b = await newClient();
    const n = String(500000 + Math.floor(Math.random() * 99999));
    expect((await call(a, { full_name: 'A', client_number: n })).success).toBe(true);
    expect((await call(b, { full_name: 'B cambiado', client_number: n })).error).toBe(`Ya hay un cliente con el N° ${n}`);
    expect((await svc().from('profiles').select('full_name').eq('id', b).single()).data?.full_name).not.toBe('B cambiado');
  });

  it.each([
    ['sin nombre', { full_name: ' ' }, 'El nombre es obligatorio'],
    ['nombre larguísimo', { full_name: 'x'.repeat(201) }, 'El nombre es demasiado largo'],
    ['N° negativo', { full_name: 'A', client_number: '-1' }, 'El N° de cliente tiene que ser un número entero mayor que 0'],
  ])('rechaza: %s', async (_l, f, msg) => {
    const id = await newClient();
    expect((await call(id, f)).error).toBe(msg);
  });

  it('solo edita clientes: no toca a alguien del equipo ni ids inválidos', async () => {
    await actAs('owner');
    expect((await call(ids.employee, { full_name: 'Hackeado' })).error).toBe('Cliente no encontrado');
    expect((await call('nope', { full_name: 'X' })).error).toBe('Datos inválidos');
  });

  it.each(except(OWNER_UP))('%s NO puede editar clientes', async (actor) => {
    const id = await newClient();
    await actAs(actor);
    expect((await call(id, { full_name: 'Intruso' })).error).toBeTruthy();
    expect((await svc().from('profiles').select('full_name').eq('id', id).single()).data?.full_name).not.toBe('Intruso');
  });
});

describe('enableClientAccessAction · bloqueada en el MVP', () => {
  const created: string[] = [];
  afterEach(async () => { delete process.env.CLIENT_WEB_ACCESS; await dropClients(created); });
  const newClient = async () => {
    await actAs('owner');
    const r = (await createClientAction(undefined, fd({ full_name: rand('Acceso') }))) as ActionResult;
    created.push(r.userId as string);
    return r.userId as string;
  };

  it('hoy nadie puede darle acceso a la web a un cliente', async () => {
    const id = await newClient();
    for (const actor of OWNER_UP) {
      await actAs(actor);
      const email = `${rand('acc')}@piletaspancho.test`;
      expect(((await enableClientAccessAction(id, email)) as ActionResult).error).toBe('El acceso web de los clientes todavía no está habilitado');
      expect(await findUserByEmail(email)).toBeUndefined();
    }
  });

  it.each(except(OWNER_UP))('%s ni siquiera llega al bloqueo (no tiene permiso)', async (actor) => {
    await actAs(actor);
    const r = (await enableClientAccessAction(ids.client, 'x@y.com')) as ActionResult;
    expect(r.error).toBeTruthy();
    expect(r.error).not.toBe('El acceso web de los clientes todavía no está habilitado');
  });

  it('el día que se habilite: crea la cuenta con el mismo id y conserva nombre y rol', async () => {
    process.env.CLIENT_WEB_ACCESS = 'enabled';
    const id = await newClient();
    const email = `${rand('habilitado')}@piletaspancho.test`;
    expect(((await enableClientAccessAction(id, 'no-es-email')) as ActionResult).error).toBe('El email no es válido');
    const r = (await enableClientAccessAction(id, ` ${email.toUpperCase()} `)) as ActionResult;
    expect(r.success).toBe(true);
    const user = await findUserByEmail(email);
    expect(user?.id).toBe(id);
    expect((await svc().from('profiles').select('role, has_account').eq('id', id).single()).data).toEqual({ role: 'client', has_account: true });
    expect(((await enableClientAccessAction(id, `otro-${email}`)) as ActionResult).error).toBe('Ese cliente ya tiene cuenta web');
    expect(((await enableClientAccessAction(ids.employee, `x-${email}`)) as ActionResult).error).toBe('Cliente no encontrado');
    expect(((await enableClientAccessAction('nope', email)) as ActionResult).error).toBe('Datos inválidos');
  });

  it('el día que se habilite: un email ya usado se avisa', async () => {
    process.env.CLIENT_WEB_ACCESS = 'enabled';
    const id = await newClient();
    expect(((await enableClientAccessAction(id, 'test-client@piletaspancho.test')) as ActionResult).error).toBe('Ya existe un usuario con ese email');
  });
});

describe('updateClientStatusAction', () => {
  it.each(OWNER_UP)('%s cambia el estado del cliente', async (actor) => {
    const t = await tempUser();
    await actAs(actor);
    for (const status of ['inactive', 'blocked', 'active']) {
      const r = (await updateClientStatusAction(t.id, status)) as ActionResult;
      expect(r.success, status).toBe(true);
      expect((await svc().from('profiles').select('status').eq('id', t.id).single()).data?.status).toBe(status);
    }
    expect(revalidated()).toContain(`/admin/clientes/${t.id}`);
    await t.cleanup();
  });

  it.each(except(OWNER_UP))('%s NO puede cambiar el estado', async (actor) => {
    const t = await tempUser();
    await actAs(actor);
    const r = (await updateClientStatusAction(t.id, 'blocked')) as ActionResult;
    expect(r.error).toBeTruthy();
    expect((await svc().from('profiles').select('status').eq('id', t.id).single()).data?.status).toBe('active');
    await t.cleanup();
  });

  it.each([['vip'], [''], ['ACTIVE']])('rechaza el estado inválido %j', async (status) => {
    await actAs('owner');
    expect(((await updateClientStatusAction(ids.client2, status)) as ActionResult).error).toBe('Datos inválidos');
  });

  it('rechaza un id que no es UUID', async () => {
    await actAs('owner');
    expect(((await updateClientStatusAction("x' or 1=1 --", 'active')) as ActionResult).error).toBe('Datos inválidos');
  });
});

describe('createPoolAction', () => {
  const created: string[] = [];
  afterEach(async () => { for (const id of created.splice(0)) await svc().from('pools').delete().eq('id', id); });
  const call = (f: Record<string, string | undefined>) => createPoolAction(undefined, fd(f)) as Promise<ActionResult>;

  it.each(OWNER_UP)('%s crea una pileta con todos sus datos', async (actor) => {
    await actAs(actor);
    const address = rand('Calle');
    const r = await call({ client_id: ids.client, address: `  ${address} `, nickname: 'Casa', neighborhood: 'Pacheco', pool_type: 'liner', notes: 'Perro bravo' });
    expect(r.success).toBe(true);
    created.push(r.poolId as string);
    const { data } = await svc().from('pools').select('client_id, address, nickname, neighborhood, pool_type, notes, created_by, is_active').eq('id', r.poolId as string).single();
    expect(data).toEqual({ client_id: ids.client, address, nickname: 'Casa', neighborhood: 'Pacheco', pool_type: 'liner', notes: 'Perro bravo', created_by: ids[actor as TestUserKey], is_active: true });
    expect(revalidated()).toEqual(expect.arrayContaining(['/admin/piletas', `/admin/clientes/${ids.client}`]));
  });

  it('los datos opcionales vacíos quedan en null', async () => {
    await actAs('owner');
    const r = await call({ client_id: ids.client, address: rand('Calle'), nickname: '', pool_type: '' });
    created.push(r.poolId as string);
    const { data } = await svc().from('pools').select('nickname, pool_type, notes').eq('id', r.poolId as string).single();
    expect(data).toEqual({ nickname: null, pool_type: null, notes: null });
  });

  it.each(['fibra', 'hormigon', 'liner', 'otro'])('acepta el tipo %s', async (pool_type) => {
    await actAs('owner');
    const r = await call({ client_id: ids.client, address: rand('Calle'), pool_type });
    expect(r.success).toBe(true);
    created.push(r.poolId as string);
  });

  it.each(except(OWNER_UP))('%s NO puede crear piletas', async (actor) => {
    await actAs(actor);
    const address = rand('Calle');
    const r = await call({ client_id: ids.client, address });
    expect(r.error).toBeTruthy();
    expect((await svc().from('pools').select('id').eq('address', address)).data).toEqual([]);
  });

  it('la dirección es opcional (vacía queda en null) y el cliente queda como titular', async () => {
    await actAs('owner');
    const r = await call({ client_id: ids.client, address: '   ', nickname: rand('Sin dir') });
    expect(r.success).toBe(true);
    created.push(r.poolId as string);
    expect((await svc().from('pools').select('address').eq('id', r.poolId as string).single()).data?.address).toBeNull();
    expect((await svc().from('pool_clients').select('client_id, is_primary').eq('pool_id', r.poolId as string)).data).toEqual([{ client_id: ids.client, is_primary: true }]);
  });

  it.each([
    ['sin cliente', { address: 'X' }, 'Elegí un cliente'],
    ['cliente que no es UUID', { client_id: 'abc', address: 'X' }, 'Elegí un cliente'],
    ['tipo de pileta inválido', { client_id: 'CLIENT', address: 'X', pool_type: 'olimpica' }, 'Tipo de pileta inválido'],
  ])('rechaza: %s', async (_l, fields, msg) => {
    await actAs('owner');
    const f = Object.fromEntries(Object.entries(fields).map(([k, v]) => [k, v === 'CLIENT' ? ids.client : v]));
    expect((await call(f)).error).toBe(msg);
  });

  it('un cliente inexistente da error de la base y no deja datos', async () => {
    await actAs('owner');
    const address = rand('Calle');
    const r = await call({ client_id: '00000000-0000-4000-8000-000000000000', address });
    expect(r.error).toBeTruthy();
    expect((await svc().from('pools').select('id').eq('address', address)).data).toEqual([]);
  });
});

describe('togglePoolActiveAction', () => {
  it.each(OWNER_UP)('%s desactiva y reactiva una pileta', async (actor) => {
    const { data: pool } = await svc().from('pools').insert({ client_id: ids.client, address: rand('Calle') }).select('id').single();
    await actAs(actor);
    expect(((await togglePoolActiveAction(pool!.id, false)) as ActionResult).success).toBe(true);
    expect((await svc().from('pools').select('is_active').eq('id', pool!.id).single()).data?.is_active).toBe(false);
    expect(((await togglePoolActiveAction(pool!.id, true)) as ActionResult).success).toBe(true);
    expect((await svc().from('pools').select('is_active').eq('id', pool!.id).single()).data?.is_active).toBe(true);
    await svc().from('pools').delete().eq('id', pool!.id);
  });

  it.each(except(OWNER_UP))('%s NO puede desactivar piletas', async (actor) => {
    const { data: pool } = await svc().from('pools').insert({ client_id: ids.client, address: rand('Calle') }).select('id').single();
    await actAs(actor);
    expect(((await togglePoolActiveAction(pool!.id, false)) as ActionResult).error).toBeTruthy();
    expect((await svc().from('pools').select('is_active').eq('id', pool!.id).single()).data?.is_active).toBe(true);
    await svc().from('pools').delete().eq('id', pool!.id);
  });

  it('rechaza un id inválido', async () => {
    await actAs('owner');
    expect(((await togglePoolActiveAction('nope', false)) as ActionResult).error).toBe('Pileta inválida');
  });
});

describe('clientes de una pileta: agregar, quitar y hacer titular', () => {
  let poolId: string;
  beforeEach(async () => {
    poolId = (await svc().from('pools').insert({ client_id: ids.client, address: rand('Compartida') }).select('id').single()).data!.id;
  });
  afterEach(async () => { await svc().from('pools').delete().eq('id', poolId); });
  const links = async () =>
    (await svc().from('pool_clients').select('client_id, is_primary').eq('pool_id', poolId).order('is_primary', { ascending: false })).data;

  it.each(OWNER_UP)('%s suma un co-cliente, lo hace titular y quita al anterior', async (actor) => {
    await actAs(actor);
    expect(((await addPoolClientAction(poolId, ids.client2)) as ActionResult).success).toBe(true);
    expect(await links()).toEqual([{ client_id: ids.client, is_primary: true }, { client_id: ids.client2, is_primary: false }]);

    expect(((await setPoolPrimaryClientAction(poolId, ids.client2)) as ActionResult).success).toBe(true);
    expect(await links()).toEqual([{ client_id: ids.client2, is_primary: true }, { client_id: ids.client, is_primary: false }]);
    expect((await svc().from('pools').select('client_id').eq('id', poolId).single()).data?.client_id).toBe(ids.client2);

    expect(((await removePoolClientAction(poolId, ids.client)) as ActionResult).success).toBe(true);
    expect(await links()).toEqual([{ client_id: ids.client2, is_primary: true }]);
    expect(revalidated()).toEqual(expect.arrayContaining([`/admin/piletas/${poolId}`, `/admin/clientes/${ids.client}`]));
  });

  it('no se suma dos veces al mismo cliente ni a alguien que no es cliente', async () => {
    await actAs('owner');
    expect(((await addPoolClientAction(poolId, ids.client)) as ActionResult).error).toBe('Ese cliente ya está en esta pileta');
    expect(((await addPoolClientAction(poolId, ids.employee)) as ActionResult).error).toBe('Solo se pueden sumar clientes a una pileta');
    expect(((await addPoolClientAction('00000000-0000-4000-8000-000000000000', ids.client2)) as ActionResult).error).toBe('La pileta o el cliente no existen');
    expect(await links()).toEqual([{ client_id: ids.client, is_primary: true }]);
  });

  it('al titular no se lo quita, y hacer titular exige que ya esté en la pileta', async () => {
    await actAs('owner');
    expect(((await removePoolClientAction(poolId, ids.client)) as ActionResult).error).toBe('No se puede quitar al titular de la pileta: primero hacé titular a otro cliente');
    expect(((await removePoolClientAction(poolId, ids.client2)) as ActionResult).error).toBe('Ese cliente no está en esta pileta');
    expect(((await setPoolPrimaryClientAction(poolId, ids.client2)) as ActionResult).error).toBe('Ese cliente no está en esta pileta');
    expect(((await setPoolPrimaryClientAction(poolId, ids.client)) as ActionResult).success).toBe(true); // ya es titular: no cambia nada
    expect(((await setPoolPrimaryClientAction('00000000-0000-4000-8000-000000000000', ids.client)) as ActionResult).error).toBe('Pileta inválida');
    expect(await links()).toEqual([{ client_id: ids.client, is_primary: true }]);
  });

  it.each([
    ['agregar', () => addPoolClientAction('x', 'y')],
    ['quitar', () => removePoolClientAction('x', 'y')],
    ['hacer titular', () => setPoolPrimaryClientAction('x', 'y')],
  ])('%s rechaza ids inválidos', async (_l, fn) => {
    await actAs('owner');
    expect(((await fn()) as ActionResult).error).toBe('Datos inválidos');
  });

  it.each(except(OWNER_UP))('%s NO puede cambiar los clientes de una pileta', async (actor) => {
    await actAs('owner');
    await addPoolClientAction(poolId, ids.client2);
    await actAs(actor);
    expect(((await addPoolClientAction(poolId, ids.client2)) as ActionResult).error).toBeTruthy();
    expect(((await setPoolPrimaryClientAction(poolId, ids.client2)) as ActionResult).error).toBeTruthy();
    expect(((await removePoolClientAction(poolId, ids.client2)) as ActionResult).error).toBeTruthy();
    expect(await links()).toEqual([{ client_id: ids.client, is_primary: true }, { client_id: ids.client2, is_primary: false }]);
  });
});

describe('updatePoolAction · editar la pileta desde Clientes y piletas', () => {
  let poolId: string;
  beforeAll(async () => {
    const { data } = await svc().from('pools').insert({ client_id: ids.client, address: rand('Calle vieja') }).select('id').single();
    poolId = data!.id as string;
  });
  afterEach(async () => undefined);
  const call = (id: string, f: Record<string, string | undefined>) => updatePoolAction(id, undefined, fd(f)) as Promise<ActionResult>;

  it.each(OWNER_UP)('%s corrige dirección, barrio, alias, tipo y notas (los vacíos quedan en null)', async (actor) => {
    await actAs(actor);
    const r = await call(poolId, { address: '  Nueva 123 ', neighborhood: 'Tigre', nickname: '', pool_type: 'fibra', notes: 'Llave en la garita' });
    expect(r.success).toBe(true);
    const { data } = await svc().from('pools').select('address, neighborhood, nickname, pool_type, notes, client_id').eq('id', poolId).single();
    expect(data).toEqual({ address: 'Nueva 123', neighborhood: 'Tigre', nickname: null, pool_type: 'fibra', notes: 'Llave en la garita', client_id: ids.client });
    expect(revalidated()).toEqual(expect.arrayContaining(['/admin/clientes', `/admin/piletas/${poolId}`]));
  });

  it('un tipo de pileta que no existe se rechaza', async () => {
    await actAs('owner');
    expect((await call(poolId, { pool_type: 'plastico' })).error).toBe('Tipo de pileta inválido');
  });

  it('una pileta que no existe o un id inválido dan "Pileta inválida"', async () => {
    await actAs('owner');
    expect((await call('00000000-0000-4000-8000-000000000999', { address: 'x' })).error).toBe('Pileta inválida');
    expect((await call('no-es-uuid', { address: 'x' })).error).toBe('Pileta inválida');
  });

  it.each(except(OWNER_UP))('%s no puede editar piletas', async (actor) => {
    await actAs(actor);
    const before = (await svc().from('pools').select('address').eq('id', poolId).single()).data;
    expect((await call(poolId, { address: 'Hackeada' })).error).toBeTruthy();
    expect((await svc().from('pools').select('address').eq('id', poolId).single()).data).toEqual(before);
  });

  it('al final se borra la pileta de prueba', async () => {
    await svc().from('pools').delete().eq('id', poolId);
  });
});
