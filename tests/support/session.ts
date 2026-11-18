/**
 * Soporte para probar server actions fuera de Next.
 *
 * Cada archivo de test debe declarar (vitest los iza antes de los imports):
 *   vi.mock('@/lib/supabase/server', async () => (await import('../support/session')).serverMock);
 *   vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));
 *
 * `actAs('owner')` hace que las acciones vean una sesión real de ese rol, por lo que tanto la
 * verificación de rol de la acción como las reglas de la base (RLS) se evalúan de verdad.
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import { vi } from 'vitest';
import { revalidatePath } from 'next/cache';
import { getLocalSupabase } from '../../e2e/support/env';
import { ACTORS, as, type Actor } from './clients';

// createClientAction usa el service role leyendo estas variables
const sb = getLocalSupabase();
Object.assign(process.env, {
  NEXT_PUBLIC_SUPABASE_URL: sb.url,
  NEXT_PUBLIC_SUPABASE_ANON_KEY: sb.anonKey,
  SUPABASE_SERVICE_ROLE_KEY: sb.serviceKey,
});

let current: SupabaseClient | undefined;

export const serverMock = {
  createSupabaseServerClient: async () => {
    if (!current) throw new Error('Falta llamar a actAs(<rol>) antes de ejecutar la acción');
    return current;
  },
};

export const actAs = async (actor: Actor): Promise<void> => { current = await as(actor); };
/** Igual que actAs, pero con un cliente ya autenticado (p. ej. un usuario temporal). */
export const actAsClient = (client: SupabaseClient): void => { current = client; };

export const revalidated = (): string[] => vi.mocked(revalidatePath).mock.calls.map((c) => c[0] as string);
export const resetRevalidated = (): void => { vi.mocked(revalidatePath).mockClear(); };

/** Todos los actores salvo los permitidos (los que deben ser rechazados). */
export const except = (allowed: Actor[]): Actor[] => ACTORS.filter((a) => !allowed.includes(a));

export const fd = (fields: Record<string, string | number | boolean | null | undefined>): FormData => {
  const f = new FormData();
  for (const [k, v] of Object.entries(fields)) if (v !== undefined && v !== null) f.set(k, String(v));
  return f;
};

export type ActionResult = { error?: string; success?: boolean; [k: string]: unknown };
