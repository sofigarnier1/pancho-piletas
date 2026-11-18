/**
 * Reportes de error (migración 35): cualquiera anota (incluso sin sesión), solo el dueño y el súper admin leen
 * y marcan como resuelto, y la base fija quién escribió (no se puede falsear el usuario ni el rol).
 */
import { afterAll, describe, expect, it } from 'vitest';
import { ACTORS, as, rand, svc, userIds, type Actor } from '../support/clients';

const P = rand('err').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6).padEnd(6, 'X');
const codigo = (actor: Actor) => `${P}${ACTORS.indexOf(actor)}`;
const LEEN: Actor[] = ['owner', 'admin'];

afterAll(async () => { await svc().from('error_reports').delete().like('code', `${P}%`); });

describe('error_reports', () => {
  it.each(ACTORS)('%s puede anotar un error', async (actor: Actor) => {
    const c = await as(actor);
    const { error } = await c.from('error_reports').insert({ code: codigo(actor), message: 'falló algo', source: 'pantalla' });
    expect(error).toBeNull();
  });

  it.each(ACTORS)('%s lee los errores solo si es dueño o súper admin', async (actor: Actor) => {
    const c = await as(actor);
    const { data } = await c.from('error_reports').select('code').like('code', `${P}%`);
    expect((data ?? []).length > 0).toBe(LEEN.includes(actor));
  });

  it('la base fija el usuario y el rol aunque la app mande otros', async () => {
    const ids = await userIds();
    const c = await as('employee');
    const code = `${P}F`;
    const { error } = await c.from('error_reports').insert({ code, message: 'x', user_id: ids.owner, user_role: 'owner', created_at: '2000-01-01', resolved_at: '2000-01-01' });
    expect(error).toBeNull();
    const { data } = await svc().from('error_reports').select('user_id, user_role, created_at, resolved_at').eq('code', code).single();
    expect(data?.user_id).toBe(ids.employee);
    expect(data?.user_role).toBe('employee');
    expect(data?.resolved_at).toBeNull();
    expect(new Date(data!.created_at).getFullYear()).toBeGreaterThan(2020);
  });

  it('sin sesión no queda usuario ni rol', async () => {
    const { data } = await svc().from('error_reports').select('user_id, user_role').eq('code', codigo('anon')).single();
    expect(data).toEqual({ user_id: null, user_role: null });
  });

  it('no se aceptan mensajes vacíos, larguísimos ni códigos mal formados', async () => {
    const c = await as('anon');
    const base = { code: `${P}B`, source: 'pantalla' };
    expect((await c.from('error_reports').insert({ ...base, message: '' })).error).not.toBeNull();
    expect((await c.from('error_reports').insert({ ...base, message: 'x'.repeat(1001) })).error).not.toBeNull();
    expect((await c.from('error_reports').insert({ ...base, message: 'x', details: 'y'.repeat(6001) })).error).not.toBeNull();
    expect((await c.from('error_reports').insert({ ...base, message: 'x', code: 'abc' })).error).not.toBeNull();
    expect((await c.from('error_reports').insert({ ...base, message: 'x', source: 'otra' })).error).not.toBeNull();
  });

  it.each(['anon', 'client', 'employee', 'marketing'] as Actor[])('%s no puede marcar ni borrar errores', async (actor: Actor) => {
    const c = await as(actor);
    await c.from('error_reports').update({ resolved_at: new Date().toISOString() }).like('code', `${P}%`);
    await c.from('error_reports').delete().like('code', `${P}%`);
    const { data } = await svc().from('error_reports').select('code, resolved_at').like('code', `${P}%`);
    expect((data ?? []).length).toBeGreaterThan(0);
    expect((data ?? []).every((r) => r.resolved_at === null)).toBe(true);
  });

  it('el dueño puede marcar un error como resuelto', async () => {
    const c = await as('owner');
    const { error } = await c.from('error_reports').update({ resolved_at: new Date().toISOString() }).eq('code', codigo('owner'));
    expect(error).toBeNull();
    const { data } = await svc().from('error_reports').select('resolved_at').eq('code', codigo('owner')).single();
    expect(data?.resolved_at).not.toBeNull();
  });
});
