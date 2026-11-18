import type { SupabaseClient, User } from '@supabase/supabase-js';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { mapSupabaseUserToAppUser, type UserRole } from '@/lib/supabase/user';

export const STAFF_ROLES: UserRole[] = ['super_admin', 'owner', 'marketing'];
export const OWNER_ROLES: UserRole[] = ['super_admin', 'owner'];
export const CMS_ROLES: UserRole[] = ['super_admin', 'marketing'];

type RoleCheck =
  | { ok: true; supabase: SupabaseClient; user: User; role: UserRole }
  | { ok: false; error: string };

/**
 * Las server actions son endpoints POST públicos: hay que validar sesión y rol
 * en cada una (el middleware solo protege las páginas, y RLS es la última barrera).
 */
export async function requireRole(allowed: UserRole[]): Promise<RoleCheck> {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: 'No autenticado' };

  const { role } = mapSupabaseUserToAppUser(user);
  if (!allowed.includes(role)) return { ok: false, error: 'No tenés permisos para esta acción' };

  // Una cuenta bloqueada no puede ejecutar nada, aunque su sesión siga abierta.
  // (RLS también lo niega en la base; esto da un mensaje claro y corta antes.)
  const { data: accountStatus } = await supabase.rpc('my_account_status');
  if (accountStatus === 'blocked') return { ok: false, error: 'Tu cuenta está bloqueada. Contactá a Pancho.' };

  return { ok: true, supabase, user, role };
}

export { isUuid, isIsoDate } from '@/lib/validators';

