import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
vi.mock('@/lib/supabase/server', async () => (await import('../support/session')).serverMock);
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));

import type { TestUserKey } from '../../e2e/support/env';
import {
  assignPointsAction, createLevelAction, createRuleAction, deleteLevelAction, deleteRuleAction,
  searchClientsAction, toggleRuleAction, updateLevelAction,
} from '@/app/admin/puntos/actions';
import { FIXTURE } from '../../e2e/support/seed';
import { actAs, except, fd, resetRevalidated, revalidated, type ActionResult } from '../support/session';
import { rand, restoreClientPoints, svc, userIds, type Actor } from '../support/clients';

const CMS: Actor[] = ['marketing', 'admin'];         // reglas de puntos: marketing y super_admin (owner no)
const STAFF: Actor[] = ['marketing', 'admin']; // niveles, asignación y búsqueda: también solo marketing (migración 25; el dueño mira)
let ids: Record<TestUserKey, string>;
beforeAll(async () => { ids = await userIds(); });
beforeEach(() => resetRevalidated());

describe('reglas de puntos', () => {
  const made: string[] = [];
  afterEach(async () => { for (const id of made.splice(0)) await svc().from('point_rules').delete().eq('id', id); });
  const create = (f: Record<string, string | undefined>) => createRuleAction(undefined, fd(f)) as Promise<ActionResult>;
  const byName = async (name: string) => (await svc().from('point_rules').select('*').eq('name', name)).data ?? [];
  const mkRule = async () => {
    const { data } = await svc().from('point_rules').insert({ name: rand('regla'), trigger_type: 'service', points_per_100_ars: 1 }).select('id').single();
    return data!.id as string;
  };

  describe('createRuleAction', () => {
    it.each(CMS)('%s crea una regla con todos sus datos', async (actor) => {
      await actAs(actor);
      const name = rand('Regla');
      const r = await create({ name: `  ${name} `, description: ' Doble ', trigger_type: 'purchase_online', points_per_100_ars: '3', min_amount: '50.5', starts_at: '2026-10-01', ends_at: '2026-12-31' });
      expect(r.success).toBe(true);
      const [row] = await byName(name);
      made.push(row.id);
      expect(row).toMatchObject({ description: 'Doble', trigger_type: 'purchase_online', points_per_100_ars: 3, min_amount_cents: 5050, is_active: true, created_by: ids[actor as TestUserKey] });
      expect(new Date(row.starts_at).toISOString().slice(0, 10)).toBe('2026-10-01');
      expect(revalidated()).toContain('/admin/puntos');
    });

    it('los puntos por defecto son 1 si se deja vacío o es inválido', async () => {
      await actAs('marketing');
      for (const points of ['', 'abc', '0']) {
        const name = rand('Regla');
        await create({ name, trigger_type: 'service', points_per_100_ars: points });
        const [row] = await byName(name); made.push(row.id);
        expect(row.points_per_100_ars, `puntos "${points}"`).toBe(1);
      }
    });

    it.each(['purchase_online', 'purchase_manual', 'service', 'manual_grant'])('acepta el disparador %s', async (trigger_type) => {
      await actAs('marketing');
      const name = rand('Regla');
      expect((await create({ name, trigger_type })).success).toBe(true);
      made.push((await byName(name))[0].id);
    });

    it.each(except(CMS))('%s NO puede crear reglas (owner tampoco)', async (actor) => {
      await actAs(actor);
      const name = rand('Regla');
      expect((await create({ name, trigger_type: 'service' })).error).toBeTruthy();
      expect(await byName(name)).toEqual([]);
    });

    it.each([
      ['sin nombre', { trigger_type: 'service' }],
      ['nombre en blanco', { name: '  ', trigger_type: 'service' }],
      ['sin disparador', { name: 'X' }],
      ['disparador inválido', { name: 'X', trigger_type: 'magia' }],
    ])('rechaza: %s', async (_l, f) => {
      await actAs('marketing');
      expect((await create(f as Record<string, string>)).error).toBe('Nombre y tipo de trigger son requeridos');
    });
  });

  describe('toggleRuleAction / deleteRuleAction', () => {
    it.each(CMS)('%s activa, desactiva y borra una regla', async (actor) => {
      const id = await mkRule();
      await actAs(actor);
      expect(((await toggleRuleAction(id, false)) as ActionResult).success).toBe(true);
      expect((await svc().from('point_rules').select('is_active').eq('id', id).single()).data?.is_active).toBe(false);
      expect(((await toggleRuleAction(id, true)) as ActionResult).success).toBe(true);
      expect((await svc().from('point_rules').select('is_active').eq('id', id).single()).data?.is_active).toBe(true);
      expect(((await deleteRuleAction(id)) as ActionResult).success).toBe(true);
      expect((await svc().from('point_rules').select('id').eq('id', id)).data).toEqual([]);
    });

    it.each(except(CMS))('%s NO puede activar, desactivar ni borrar reglas', async (actor) => {
      const id = await mkRule(); made.push(id);
      await actAs(actor);
      expect(((await toggleRuleAction(id, false)) as ActionResult).error).toBeTruthy();
      expect(((await deleteRuleAction(id)) as ActionResult).error).toBeTruthy();
      expect((await svc().from('point_rules').select('is_active').eq('id', id).single()).data?.is_active).toBe(true);
    });

    it('rechaza ids inválidos', async () => {
      await actAs('marketing');
      expect(((await toggleRuleAction('x', true)) as ActionResult).error).toBe('Regla inválida');
      expect(((await deleteRuleAction('x')) as ActionResult).error).toBe('Regla inválida');
    });
  });
});

describe('niveles de cliente', () => {
  const made: string[] = [];
  afterEach(async () => { for (const id of made.splice(0)) await svc().from('client_levels').delete().eq('id', id); });
  const create = (f: Record<string, string | undefined>) => createLevelAction(undefined, fd(f)) as Promise<ActionResult>;
  const update = (f: Record<string, string | undefined>) => updateLevelAction(undefined, fd(f)) as Promise<ActionResult>;
  const byName = async (name: string) => (await svc().from('client_levels').select('*').eq('name', name)).data ?? [];
  const mkLevel = async (min = 777_000) => {
    const { data } = await svc().from('client_levels').insert({ name: rand('Nivel'), min_points: min }).select('id').single();
    made.push(data!.id); return data!.id as string;
  };

  it.each(STAFF)('%s crea un nivel (los beneficios son una línea por beneficio)', async (actor) => {
    await actAs(actor);
    const name = rand('Platino');
    const r = await create({ name: ` ${name} `, min_points: '5000', color: '#112233', sort_order: '4', benefits: ' 15% descuento \n\n Envío gratis \n   ' });
    expect(r.success).toBe(true);
    const [row] = await byName(name); made.push(row.id);
    expect(row).toMatchObject({ min_points: 5000, color: '#112233', sort_order: 4, benefits: ['15% descuento', 'Envío gratis'] });
    expect(revalidated()).toContain('/admin/puntos/niveles');
  });

  it('usa el color por defecto y 0 puntos si faltan', async () => {
    await actAs('marketing');
    const name = rand('Nivel');
    await create({ name });
    const [row] = await byName(name); made.push(row.id);
    expect(row).toMatchObject({ color: '#1B5FA8', min_points: 0, benefits: [] });
  });

  it.each(except(STAFF))('%s NO puede crear niveles', async (actor) => {
    await actAs(actor);
    const name = rand('Nivel');
    expect((await create({ name })).error).toBeTruthy();
    expect(await byName(name)).toEqual([]);
  });

  it.each([['rojo'], ['#12'], ['#GGGGGG'], ['123456'], ['#1234567']])('rechaza el color inválido %j', async (color) => {
    await actAs('marketing');
    const name = rand('Nivel');
    expect((await create({ name, color })).error).toBe('Color inválido');
    expect(await byName(name)).toEqual([]);
  });

  it('rechaza un nivel sin nombre', async () => {
    await actAs('marketing');
    expect((await create({ name: '  ' })).error).toBe('El nombre es requerido');
  });

  it.each(STAFF)('%s edita un nivel', async (actor) => {
    const id = await mkLevel();
    await actAs(actor);
    const r = await update({ id, name: 'Editado', min_points: '123', color: '#abcdef', sort_order: '9', benefits: 'A\nB' });
    expect(r.success).toBe(true);
    expect((await svc().from('client_levels').select('name, min_points, color, sort_order, benefits').eq('id', id).single()).data)
      .toEqual({ name: 'Editado', min_points: 123, color: '#abcdef', sort_order: 9, benefits: ['A', 'B'] });
  });

  it.each(except(STAFF))('%s NO puede editar niveles', async (actor) => {
    const id = await mkLevel();
    await actAs(actor);
    expect((await update({ id, name: 'Hack' })).error).toBeTruthy();
    expect((await svc().from('client_levels').select('name').eq('id', id).single()).data?.name).not.toBe('Hack');
  });

  it.each([
    ['sin id', { name: 'X' }],
    ['id inválido', { id: 'x', name: 'X' }],
    ['sin nombre', { id: '00000000-0000-4000-8000-000000000000', name: ' ' }],
  ])('editar rechaza: %s', async (_l, f) => {
    await actAs('marketing');
    expect((await update(f as Record<string, string>)).error).toBe('Datos incompletos');
  });

  it.each(STAFF)('%s borra un nivel sin uso', async (actor) => {
    const id = await mkLevel();
    await actAs(actor);
    expect(((await deleteLevelAction(id)) as ActionResult).success).toBe(true);
    expect((await svc().from('client_levels').select('id').eq('id', id)).data).toEqual([]);
  });

  it('no permite borrar un nivel que algún cliente tiene asignado (y avisa)', async () => {
    const levelId = (await svc().from('profiles').select('client_level_id').eq('id', ids.client).single()).data!.client_level_id as string;
    await actAs('marketing');
    const r = (await deleteLevelAction(levelId)) as ActionResult;
    expect(r.error).toBeTruthy();
    expect((await svc().from('client_levels').select('id').eq('id', levelId)).data).toHaveLength(1);
  });

  it.each(except(STAFF))('%s NO puede borrar niveles', async (actor) => {
    const id = await mkLevel();
    await actAs(actor);
    expect(((await deleteLevelAction(id)) as ActionResult).error).toBeTruthy();
    expect((await svc().from('client_levels').select('id').eq('id', id)).data).toHaveLength(1);
  });

  it('rechaza un id inválido', async () => {
    await actAs('marketing');
    expect(((await deleteLevelAction('x')) as ActionResult).error).toBe('Nivel inválido');
  });
});

describe('assignPointsAction', () => {
  afterEach(async () => { await restoreClientPoints(ids.client, FIXTURE.clientPoints); });
  const assign = (f: Record<string, string | undefined>) => assignPointsAction(undefined, fd(f)) as Promise<ActionResult>;
  const balance = async () => (await svc().from('profiles').select('points_balance').eq('id', ids.client).single()).data!.points_balance as number;

  it.each(STAFF)('%s suma puntos: queda el movimiento y se actualiza el saldo', async (actor) => {
    await actAs(actor);
    const notes = rand('Promo');
    const r = await assign({ client_id: ids.client, points: '40', notes: ` ${notes} ` });
    expect(r.success).toBe(true);
    expect(await balance()).toBe(FIXTURE.clientPoints + 40);
    const { data } = await svc().from('point_transactions').select('points, source_type, notes, created_by').eq('notes', notes).single();
    expect(data).toEqual({ points: 40, source_type: 'manual_grant', notes, created_by: ids[actor as TestUserKey] });
    expect(revalidated()).toContain('/admin/puntos/asignar');
  });

  it('también resta puntos', async () => {
    await actAs('marketing');
    expect((await assign({ client_id: ids.client, points: '-4' })).success).toBe(true);
    expect(await balance()).toBe(FIXTURE.clientPoints - 4);
  });

  it('sube de nivel al cruzar el umbral', async () => {
    await actAs('marketing');
    const r = await assign({ client_id: ids.client, points: '490' });
    expect(r.success, JSON.stringify(r)).toBe(true);
    const lvl = (await svc().from('profiles').select('client_levels(name)').eq('id', ids.client).single()).data as unknown as { client_levels: { name: string } };
    expect(lvl.client_levels.name).toBe('Plata');
  });

  it.each(except(STAFF))('%s NO puede asignar puntos', async (actor) => {
    await actAs(actor);
    expect((await assign({ client_id: ids.client, points: '500' })).error).toBeTruthy();
    expect(await balance()).toBe(FIXTURE.clientPoints);
  });

  it.each([
    ['sin cliente', { points: '5' }, 'Seleccioná un cliente'],
    ['cliente inválido', { client_id: 'x', points: '5' }, 'Seleccioná un cliente'],
    ['0 puntos', { client_id: 'C', points: '0' }, 'Ingresá una cantidad de puntos distinta de 0'],
    ['puntos vacíos', { client_id: 'C', points: '' }, 'Ingresá una cantidad de puntos distinta de 0'],
    ['puntos no numéricos', { client_id: 'C', points: 'muchos' }, 'Ingresá una cantidad de puntos distinta de 0'],
    ['más del máximo', { client_id: 'C', points: '100001' }, 'Máximo 100000 puntos por asignación'],
    ['menos del mínimo', { client_id: 'C', points: '-100001' }, 'Máximo 100000 puntos por asignación'],
  ])('rechaza: %s', async (_l, f, msg) => {
    await actAs('marketing');
    const fields = Object.fromEntries(Object.entries(f).map(([k, v]) => [k, v === 'C' ? ids.client : v])) as Record<string, string>;
    expect((await assign(fields)).error).toBe(msg);
    expect(await balance()).toBe(FIXTURE.clientPoints);
  });

  it('el máximo exacto (100000) sí se permite', async () => {
    await actAs('marketing');
    expect((await assign({ client_id: ids.client, points: '100000' })).success).toBe(true);
  });
});

describe('searchClientsAction', () => {
  const search = (q: string) => searchClientsAction(q) as Promise<{ id: string; full_name: string; points_balance: number }[]>;

  it.each(STAFF)('%s busca clientes por nombre, sin distinguir mayúsculas', async (actor) => {
    await actAs(actor);
    const names = (await search('TEST-CLIENT')).map((c) => c.full_name).sort();
    expect(names).toEqual(['test-client', 'test-client2']);
  });

  it('solo devuelve clientes (no empleados ni administradores)', async () => {
    await actAs('admin');
    expect(await search('test-')).toHaveLength(2);
    expect(await search('test-owner')).toEqual([]);
    expect(await search('test-employee')).toEqual([]);
  });

  it('devuelve el saldo de puntos', async () => {
    await actAs('admin');
    const [c] = await search('test-client2');
    expect(c).toMatchObject({ id: ids.client2, points_balance: 0 });
  });

  it.each([['%'], ['_'], ['\\'], ["x' or '1'='1"]])('los comodines y comillas (%j) se buscan literalmente', async (q) => {
    await actAs('admin');
    expect(await search(q)).toEqual([]);
  });

  it('limita a 8 resultados', async () => {
    await actAs('admin');
    const temps = await Promise.all(Array.from({ length: 10 }, async (_, i) => (await svc().auth.admin.createUser({ email: `${rand('lim')}@piletaspancho.test`, password: 'TmpPass123!', email_confirm: true, user_metadata: { full_name: `Limite ${i}` } })).data.user!.id));
    expect(await search('Limite')).toHaveLength(8);
    for (const id of temps) await svc().auth.admin.deleteUser(id);
  });

  it.each(except(STAFF))('%s recibe una lista vacía', async (actor) => {
    await actAs(actor);
    expect(await search('test')).toEqual([]);
  });

  it('tolera una búsqueda larguísima', async () => {
    await actAs('admin');
    expect(await search('a'.repeat(5000))).toEqual([]);
  });
});
