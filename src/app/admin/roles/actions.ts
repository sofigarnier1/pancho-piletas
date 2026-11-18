'use server';

import { revalidatePath } from 'next/cache';
import { requireRole, isUuid } from '@/lib/auth/require-role';

const VALID_ROLES = ['super_admin', 'owner', 'marketing', 'employee', 'client'];

export async function changeRoleAction(userId: string, newRole: string) {
  const auth = await requireRole(['super_admin']);
  if (!auth.ok) return { error: 'Solo los super_admin pueden cambiar roles' };

  if (!isUuid(userId)) return { error: 'Usuario inválido' };
  if (!VALID_ROLES.includes(newRole)) return { error: 'Rol inválido' };
  if (userId === auth.user.id) return { error: 'No podés cambiar tu propio rol' };

  const { error } = await auth.supabase
    .from('profiles')
    .update({ role: newRole })
    .eq('id', userId);

  if (error) return { error: error.message };
  revalidatePath('/admin/roles');
  return { success: true };
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Alta de una cuenta por el súper admin (nadie se registra solo). La persona elige su contraseña con "¿Olvidaste tu contraseña?". */
export async function createUserAction(_prevState: unknown, formData: FormData) {
  const auth = await requireRole(['super_admin']);
  if (!auth.ok) return { error: 'Solo los super_admin pueden crear usuarios' };

  const fullName = (formData.get('full_name') as string | null)?.trim() ?? '';
  const email = ((formData.get('email') as string | null)?.trim() ?? '').toLowerCase();
  const role = (formData.get('role') as string | null) ?? '';

  if (!fullName || !email) return { error: 'Nombre y email son requeridos' };
  if (!EMAIL_RE.test(email)) return { error: 'El email no es válido' };
  if (!VALID_ROLES.includes(role)) return { error: 'Rol inválido' };

  // Service role: solo se llega acá después de verificar que quien llama es super_admin.
  const { createClient } = await import('@supabase/supabase-js');
  const adminClient = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  const { data, error } = await adminClient.auth.admin.createUser({
    email,
    email_confirm: true,
    user_metadata: { full_name: fullName },
    app_metadata: { role: 'client' },
  });
  if (error) {
    if (error.message.includes('already been registered') || error.message.includes('already exists')) {
      return { error: 'Ya existe un usuario con ese email' };
    }
    return { error: error.message };
  }

  if (role !== 'client') {
    const { error: roleError } = await auth.supabase.from('profiles').update({ role }).eq('id', data.user.id);
    if (roleError) {
      await adminClient.auth.admin.deleteUser(data.user.id);
      return { error: `No se pudo crear el usuario: ${roleError.message}` };
    }
  }

  revalidatePath('/admin/roles');
  return { success: true };
}

/** Da de baja (bloquea) o vuelve a habilitar una cuenta. Bloqueada no puede entrar ni operar; no se borra nada. */
export async function setUserBlockedAction(userId: string, blocked: boolean) {
  const auth = await requireRole(['super_admin']);
  if (!auth.ok) return { error: 'Solo los super_admin pueden bloquear usuarios' };

  if (!isUuid(userId)) return { error: 'Usuario inválido' };
  if (userId === auth.user.id) return { error: 'No podés bloquear tu propia cuenta' };

  const { error } = await auth.supabase
    .from('profiles')
    .update({ status: blocked ? 'blocked' : 'active' })
    .eq('id', userId);

  if (error) return { error: error.message };
  revalidatePath('/admin/roles');
  return { success: true };
}
