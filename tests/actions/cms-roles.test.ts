import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
vi.mock('@/lib/supabase/server', async () => (await import('../support/session')).serverMock);
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));

import type { TestUserKey } from '../../e2e/support/env';
import { saveSectionAction } from '@/app/admin/landing-cms/actions';
import { changeRoleAction } from '@/app/admin/roles/actions';
import { actAs, except, resetRevalidated, revalidated, type ActionResult } from '../support/session';
import { rand, svc, tempUser, userIds, type Actor } from '../support/clients';

const CMS: Actor[] = ['marketing', 'admin'];
let ids: Record<TestUserKey, string>;
beforeAll(async () => { ids = await userIds(); });
beforeEach(() => resetRevalidated());

describe('saveSectionAction (CMS de la landing)', () => {
  const snapshot = new Map<string, unknown>();
  const created: string[] = [];
  afterEach(async () => {
    for (const [k, v] of snapshot) { const [section, key] = k.split('.'); await svc().from('landing_content').update({ value: v }).eq('section', section).eq('key', key); }
    snapshot.clear();
    for (const key of created.splice(0)) await svc().from('landing_content').delete().eq('section', 'zz_test').eq('key', key);
  });
  const valueOf = async (section: string, key: string) => (await svc().from('landing_content').select('value').eq('section', section).eq('key', key).maybeSingle()).data?.value;
  const keep = async (section: string, key: string) => { snapshot.set(`${section}.${key}`, await valueOf(section, key)); };
  const save = (section: string, updates: Record<string, string | number>) => saveSectionAction(section, updates) as Promise<ActionResult>;

  it.each(CMS)('%s guarda textos y números del CMS', async (actor) => {
    await keep('hero', 'headline'); await keep('config', 'shipping_cost_cents');
    await actAs(actor);
    const headline = rand('Titulo');
    const r = await save('hero', { headline });
    expect(r.success).toBe(true);
    expect(await valueOf('hero', 'headline')).toBe(headline);
    expect((await save('config', { shipping_cost_cents: 150000 })).success).toBe(true);
    expect(await valueOf('config', 'shipping_cost_cents')).toBe(150000);
    expect(revalidated()).toEqual(expect.arrayContaining(['/', '/admin/landing-cms']));
  });

  it('guardar varias claves a la vez, incluso nuevas, y repetir es idempotente', async () => {
    await actAs('marketing');
    const a = rand('k').replace(/-/g, '_'), b = rand('k').replace(/-/g, '_'); created.push(a, b);
    expect((await save('zz_test', { [a]: 'uno', [b]: 'dos' })).success).toBe(true);
    expect((await save('zz_test', { [a]: 'uno', [b]: 'dos' })).success).toBe(true);
    expect(await valueOf('zz_test', a)).toBe('uno');
    expect(await valueOf('zz_test', b)).toBe('dos');
    expect((await svc().from('landing_content').select('id').eq('section', 'zz_test').in('key', [a, b])).data).toHaveLength(2);
  });

  it('un texto vacío es válido (borra el contenido)', async () => {
    await keep('hero', 'subheadline');
    await actAs('marketing');
    expect((await save('hero', { subheadline: '' })).success).toBe(true);
    expect(await valueOf('hero', 'subheadline')).toBe('');
  });

  it('acepta tildes, ñ y emojis', async () => {
    await keep('hero', 'headline');
    await actAs('marketing');
    const text = 'Cloro y piletas · ñandú 🌊 ¡Hola!';
    await save('hero', { headline: text });
    expect(await valueOf('hero', 'headline')).toBe(text);
  });

  it('registra quién lo editó', async () => {
    await keep('hero', 'headline');
    await actAs('marketing');
    await save('hero', { headline: rand('t') });
    expect((await svc().from('landing_content').select('updated_by').eq('section', 'hero').eq('key', 'headline').single()).data?.updated_by).toBe(ids.marketing);
  });

  it.each(except(CMS))('%s NO puede editar el CMS (owner tampoco)', async (actor) => {
    await keep('hero', 'headline');
    const before = await valueOf('hero', 'headline');
    await actAs(actor);
    expect((await save('hero', { headline: 'HACK' })).error).toBeTruthy();
    expect(await valueOf('hero', 'headline')).toBe(before);
    expect(revalidated()).toEqual([]);
  });

  it.each([
    ['sección con mayúsculas', 'Hero', { a: 'x' }, 'Sección inválida'],
    ['sección con espacios', 'mi seccion', { a: 'x' }, 'Sección inválida'],
    ['sección vacía', '', { a: 'x' }, 'Sección inválida'],
    ['clave con espacios', 'hero', { 'mala clave': 'x' }, 'Clave inválida: mala clave'],
    ['clave con comillas', 'hero', { "a'b": 'x' }, "Clave inválida: a'b"],
    ['clave vacía', 'hero', { '': 'x' }, 'Clave inválida: '],
  ])('rechaza: %s', async (_l, section, updates, msg) => {
    await actAs('marketing');
    expect((await save(section, updates as Record<string, string>)).error).toBe(msg);
  });

  it('rechaza textos de más de 2000 caracteres, pero acepta exactamente 2000', async () => {
    await keep('nosotros', 'cuerpo');
    await actAs('marketing');
    expect((await save('nosotros', { cuerpo: 'a'.repeat(2001) })).error).toContain('demasiado largo');
    expect((await save('nosotros', { cuerpo: 'a'.repeat(2000) })).success).toBe(true);
  });

  it('rechaza valores que no son texto ni número', async () => {
    await actAs('marketing');
    const r = await save('hero', { headline: { evil: true } as unknown as string });
    expect(r.error).toBe('Valor inválido para headline');
  });

  it('es todo o nada: si una clave es inválida no se guarda ninguna', async () => {
    await keep('hero', 'headline');
    const before = await valueOf('hero', 'headline');
    await actAs('marketing');
    const r = await save('hero', { headline: 'NO DEBERÍA GUARDARSE', 'clave mala': 'x' });
    expect(r.error).toBeTruthy();
    expect(await valueOf('hero', 'headline')).toBe(before);
  });

  it('un texto con HTML/script se guarda tal cual (se escapa al mostrarlo, no se interpreta)', async () => {
    await keep('hero', 'headline');
    await actAs('marketing');
    const evil = '<script>alert(1)</script><img src=x onerror=alert(2)>';
    await save('hero', { headline: evil });
    expect(await valueOf('hero', 'headline')).toBe(evil);
  });
});

describe('changeRoleAction', () => {
  it('super_admin cambia el rol y queda reflejado en app_metadata', async () => {
    const t = await tempUser();
    await actAs('admin');
    for (const role of ['owner', 'marketing', 'employee', 'client']) {
      const r = (await changeRoleAction(t.id, role)) as ActionResult;
      expect(r.success, role).toBe(true);
      expect((await svc().from('profiles').select('role').eq('id', t.id).single()).data?.role).toBe(role);
      expect((await svc().auth.admin.getUserById(t.id)).data.user?.app_metadata?.role).toBe(role);
    }
    expect(revalidated()).toContain('/admin/roles');
    await t.cleanup();
  });

  it.each(except(['admin']))('%s NO puede cambiar roles (ni siquiera owner)', async (actor) => {
    const t = await tempUser();
    await actAs(actor);
    const r = (await changeRoleAction(t.id, 'super_admin')) as ActionResult;
    expect(r.error).toBe('Solo los super_admin pueden cambiar roles');
    expect((await svc().from('profiles').select('role').eq('id', t.id).single()).data?.role).toBe('client');
    await t.cleanup();
  });

  it('no puede cambiarse el propio rol (evita quedarse sin super_admin)', async () => {
    await actAs('admin');
    expect(((await changeRoleAction(ids.admin, 'client')) as ActionResult).error).toBe('No podés cambiar tu propio rol');
    expect((await svc().from('profiles').select('role').eq('id', ids.admin).single()).data?.role).toBe('super_admin');
  });

  it.each([['god'], ['SUPER_ADMIN'], [''], ["client'; drop table profiles; --"]])('rechaza el rol inválido %j', async (role) => {
    const t = await tempUser();
    await actAs('admin');
    expect(((await changeRoleAction(t.id, role)) as ActionResult).error).toBe('Rol inválido');
    await t.cleanup();
  });

  it('rechaza un usuario que no es UUID', async () => {
    await actAs('admin');
    expect(((await changeRoleAction('x', 'owner')) as ActionResult).error).toBe('Usuario inválido');
  });
});
