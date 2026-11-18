/**
 * Clientes de Supabase local por rol, con sesión real (login con contraseña): las reglas de
 * acceso (RLS) se evalúan igual que en producción.
 */
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { TEST_USERS, getLocalSupabase, type TestUserKey } from '../../e2e/support/env';

export type Actor = TestUserKey | 'anon';
export const ACTORS: Actor[] = ['anon', 'client', 'client2', 'employee', 'marketing', 'owner', 'admin'];
export const STAFF: Actor[] = ['marketing', 'owner', 'admin'];
export const NIL_UUID = '00000000-0000-0000-0000-000000000000';

const opts = { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } };

let service: SupabaseClient | undefined;
/** Service role: se saltea RLS. Solo para preparar y verificar datos. */
export const svc = (): SupabaseClient => {
  if (!service) {
    const { url, serviceKey } = getLocalSupabase();
    service = createClient(url, serviceKey, opts);
  }
  return service;
};

const sessions = new Map<Actor, Promise<SupabaseClient>>();
/** Cliente autenticado como el rol indicado (o anónimo). Se reutiliza dentro del archivo. */
export const as = (actor: Actor): Promise<SupabaseClient> => {
  let p = sessions.get(actor);
  if (!p) {
    p = (async () => {
      const { url, anonKey } = getLocalSupabase();
      const client = createClient(url, anonKey, opts);
      if (actor !== 'anon') {
        const u = TEST_USERS[actor];
        const { error } = await client.auth.signInWithPassword({ email: u.email, password: u.password });
        if (error) throw new Error(`Login de ${actor} falló: ${error.message}`);
      }
      return client;
    })();
    sessions.set(actor, p);
  }
  return p;
};

let idsCache: Promise<Record<TestUserKey, string>> | undefined;
export const userIds = (): Promise<Record<TestUserKey, string>> => {
  idsCache ??= (async () => {
    const { data, error } = await svc().auth.admin.listUsers({ perPage: 200 });
    if (error) throw error;
    const out = {} as Record<TestUserKey, string>;
    for (const key of Object.keys(TEST_USERS) as TestUserKey[]) {
      const found = data.users.find((u) => u.email === TEST_USERS[key].email);
      if (!found) throw new Error(`No existe el usuario de prueba ${key}`);
      out[key] = found.id;
    }
    return out;
  })();
  return idsCache;
};

let counter = 0;
export const rand = (prefix = 'rls'): string => `${prefix}-${Date.now().toString(36)}-${(counter++).toString(36)}`;
/** Fecha futura única (para no chocar con el UNIQUE de itinerary_days.date). */
export const uniqueDate = (): string => new Date(Date.UTC(2040, 0, 1 + counter++)).toISOString().slice(0, 10);

export type TempUser = { id: string; email: string; cleanup: () => Promise<void> };
/** Usuario descartable (perfil 'client' creado por el trigger). */
export async function tempUser(role?: string): Promise<TempUser> {
  const email = `${rand('tmp')}@piletaspancho.test`;
  const { data, error } = await svc().auth.admin.createUser({
    email, password: 'TmpPass123!', email_confirm: true, user_metadata: { full_name: 'Temporal' },
  });
  if (error) throw error;
  if (role) await svc().from('profiles').update({ role }).eq('id', data.user.id);
  return { id: data.user.id, email, cleanup: async () => { await svc().auth.admin.deleteUser(data.user.id); } };
}

/** Deja al cliente 1 con exactamente los puntos del seed (borra transacciones extra y recalcula). */
export async function restoreClientPoints(clientId: string, seeded: number): Promise<void> {
  // Se conserva solo la transacción del seed. (Comparar por `notes` no alcanza: <> no incluye los NULL.)
  const { data: seedTx } = await svc().from('point_transactions').select('id').eq('client_id', clientId).eq('notes', 'Puntos de prueba').limit(1);
  const del = svc().from('point_transactions').delete().eq('client_id', clientId);
  await (seedTx?.[0] ? del.neq('id', seedTx[0].id) : del);
  const { data: lvl } = await svc().from('client_levels').select('id').lte('min_points', seeded).order('min_points', { ascending: false }).limit(1);
  await svc().from('profiles').update({ points_balance: seeded, client_level_id: lvl?.[0]?.id ?? null }).eq('id', clientId);
}

/** Cliente con sesión real de un usuario temporal (creado con tempUser). */
export async function signInAs(email: string, password = 'TmpPass123!'): Promise<SupabaseClient> {
  const { url, anonKey } = getLocalSupabase();
  const client = createClient(url, anonKey, opts);
  const { error } = await client.auth.signInWithPassword({ email, password });
  if (error) throw new Error(`Login de ${email} falló: ${error.message}`);
  return client;
}
