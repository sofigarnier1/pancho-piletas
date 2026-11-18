import { describe, expect, it } from 'vitest';
import type { User } from '@supabase/supabase-js';
import { mapSupabaseUserToAppUser } from './user';

const user = (over: Partial<User>): User =>
  ({ id: 'u1', email: 'ana@example.com', app_metadata: {}, user_metadata: {}, aud: 'authenticated', created_at: '', ...over }) as User;

describe('mapSupabaseUserToAppUser — rol', () => {
  it.each(['super_admin', 'owner', 'marketing', 'employee', 'client'])('respeta el rol %s', (role) => {
    expect(mapSupabaseUserToAppUser(user({ app_metadata: { role } })).role).toBe(role);
  });

  it.each([[undefined], [null], [''], ['admin'], ['SUPER_ADMIN'], [123], [{}]])(
    'un rol desconocido (%j) cae en client, nunca en un rol con privilegios',
    (role) => {
      expect(mapSupabaseUserToAppUser(user({ app_metadata: { role } })).role).toBe('client');
    },
  );

  it('ignora un rol puesto en user_metadata (editable por el usuario)', () => {
    const u = mapSupabaseUserToAppUser(user({ user_metadata: { role: 'super_admin' }, app_metadata: {} }));
    expect(u.role).toBe('client');
  });
});

describe('mapSupabaseUserToAppUser — nombre', () => {
  it('prioriza full_name, luego nombre, luego la parte local del email', () => {
    expect(mapSupabaseUserToAppUser(user({ user_metadata: { full_name: 'Ana Pérez', nombre: 'X' } })).fullName).toBe('Ana Pérez');
    expect(mapSupabaseUserToAppUser(user({ user_metadata: { nombre: 'Ana' } })).fullName).toBe('Ana');
    expect(mapSupabaseUserToAppUser(user({})).fullName).toBe('ana');
  });

  it('sin email ni nombre usa "Usuario"', () => {
    expect(mapSupabaseUserToAppUser(user({ email: undefined })).fullName).toBe('Usuario');
  });

  it('tolera metadata nula', () => {
    const u = mapSupabaseUserToAppUser(user({ app_metadata: null as never, user_metadata: null as never }));
    expect(u.role).toBe('client');
  });

  it('avatar opcional', () => {
    expect(mapSupabaseUserToAppUser(user({ user_metadata: { avatar_url: 'https://x/y.png' } })).avatarUrl).toBe('https://x/y.png');
    expect(mapSupabaseUserToAppUser(user({})).avatarUrl).toBeUndefined();
  });
});
