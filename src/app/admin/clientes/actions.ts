'use server';

import { revalidatePath } from 'next/cache';
import { clientWebEnabled } from '@/lib/client-web';
import { requireRole, isUuid, OWNER_ROLES } from '@/lib/auth/require-role';
import { POOL_TYPES, parseClientNumber } from '@/lib/clients';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const VALID_STATUS = ['active', 'inactive', 'blocked'];
const POOL_MODES = ['new', 'existing', 'none'];

const text = (formData: FormData, key: string): string | null =>
  (formData.get(key) as string | null)?.trim() || null;

type DbError = { code?: string; message: string };

const duplicateNumber = (e: DbError, n: number | null) =>
  e.code === '23505' && e.message.includes('ux_client_profiles_number') && n !== null;

/**
 * Alta de un cliente SIN cuenta web, en un solo paso: el cliente y, si se pide, una pileta
 * nueva (queda como titular) o una pileta que ya existe (se suma como co-cliente).
 * Todo en una transacción de la base: se guarda todo o nada.
 */
export async function createClientAction(_prevState: unknown, formData: FormData) {
  const auth = await requireRole(OWNER_ROLES);
  if (!auth.ok) return { error: auth.error };

  const fullName = text(formData, 'full_name');
  if (!fullName) return { error: 'El nombre es obligatorio' };
  if (fullName.length > 200) return { error: 'El nombre es demasiado largo' };

  const clientNumber = parseClientNumber(formData.get('client_number') as string | null);
  if (clientNumber === 'invalid') return { error: 'El N° de cliente tiene que ser un número entero mayor que 0' };

  const poolMode = (formData.get('pool_mode') as string | null) || 'none';
  if (!POOL_MODES.includes(poolMode)) return { error: 'Datos inválidos' };

  const poolId = text(formData, 'pool_id');
  if (poolMode === 'existing' && (!poolId || !isUuid(poolId))) return { error: 'Elegí la pileta a la que se suma el cliente' };

  const poolType = poolMode === 'new' ? text(formData, 'pool_type') : null;
  if (poolType && !(POOL_TYPES as readonly string[]).includes(poolType)) return { error: 'Tipo de pileta inválido' };

  const isNew = poolMode === 'new';
  const { data, error } = await auth.supabase.rpc('create_client_with_pool', {
    p_full_name: fullName,
    p_client_number: clientNumber,
    p_phone: text(formData, 'phone'),
    p_notes: text(formData, 'notes'),
    p_pool_mode: poolMode,
    p_pool_id: poolMode === 'existing' ? poolId : null,
    p_address: isNew ? text(formData, 'address') : null,
    p_neighborhood: isNew ? text(formData, 'neighborhood') : null,
    p_nickname: isNew ? text(formData, 'nickname') : null,
    p_pool_type: poolType,
    p_pool_notes: isNew ? text(formData, 'pool_notes') : null,
  });

  if (error) {
    if (duplicateNumber(error, clientNumber)) return { error: `Ya hay un cliente con el N° ${clientNumber}` };
    if (error.code === '23503') return { error: 'La pileta elegida no existe' };
    return { error: `No se pudo crear el cliente: ${error.message}` };
  }

  const result = data as { client_id: string; pool_id: string | null };
  revalidatePath('/admin/clientes');
  revalidatePath('/admin/piletas');
  if (result.pool_id) revalidatePath(`/admin/piletas/${result.pool_id}`);
  return { success: true, userId: result.client_id, poolId: result.pool_id };
}

/** Edita los datos del cliente: nombre, N° de cliente, teléfono y notas. */
export async function updateClientAction(clientId: string, _prevState: unknown, formData: FormData) {
  const auth = await requireRole(OWNER_ROLES);
  if (!auth.ok) return { error: auth.error };
  if (!isUuid(clientId)) return { error: 'Datos inválidos' };

  const fullName = text(formData, 'full_name');
  if (!fullName) return { error: 'El nombre es obligatorio' };
  if (fullName.length > 200) return { error: 'El nombre es demasiado largo' };
  const clientNumber = parseClientNumber(formData.get('client_number') as string | null);
  if (clientNumber === 'invalid') return { error: 'El N° de cliente tiene que ser un número entero mayor que 0' };

  const { data: target } = await auth.supabase.from('profiles').select('id').eq('id', clientId).eq('role', 'client').maybeSingle();
  if (!target) return { error: 'Cliente no encontrado' };

  // Primero la ficha (es la que puede chocar por el N° repetido), después el perfil
  const { error: cpError } = await auth.supabase
    .from('client_profiles')
    .upsert({ id: clientId, client_number: clientNumber, notes: text(formData, 'notes') });
  if (cpError) {
    if (duplicateNumber(cpError, clientNumber)) return { error: `Ya hay un cliente con el N° ${clientNumber}` };
    return { error: `No se pudieron guardar los datos: ${cpError.message}` };
  }

  const { error } = await auth.supabase
    .from('profiles')
    .update({ full_name: fullName, phone: text(formData, 'phone') })
    .eq('id', clientId);
  if (error) return { error: `No se pudieron guardar los datos: ${error.message}` };

  revalidatePath('/admin/clientes');
  revalidatePath(`/admin/clientes/${clientId}`);
  return { success: true };
}

/**
 * Darle acceso a la web a un cliente cargado sin cuenta: crea su usuario con el MISMO id del
 * perfil (la base marca has_account y conserva nombre y rol).
 *
 * BLOQUEADO: en el MVP los clientes no tienen acceso a la web. Solo funciona si el servidor
 * tiene CLIENT_WEB_ACCESS=enabled (src/lib/client-web.ts), que hoy solo se prende en los tests e2e.
 */
export async function enableClientAccessAction(clientId: string, email: string) {
  const auth = await requireRole(OWNER_ROLES);
  if (!auth.ok) return { error: auth.error };
  if (!clientWebEnabled()) return { error: 'El acceso web de los clientes todavía no está habilitado' };

  const normalized = email?.trim().toLowerCase() ?? '';
  if (!isUuid(clientId)) return { error: 'Datos inválidos' };
  if (!EMAIL_RE.test(normalized)) return { error: 'El email no es válido' };

  const { data: profile } = await auth.supabase
    .from('profiles')
    .select('id, full_name, has_account')
    .eq('id', clientId)
    .eq('role', 'client')
    .maybeSingle();
  if (!profile) return { error: 'Cliente no encontrado' };
  if (profile.has_account) return { error: 'Ese cliente ya tiene cuenta web' };

  // Service role: solo se llega acá después de verificar que quien llama es owner o super_admin.
  const { createClient } = await import('@supabase/supabase-js');
  const adminClient = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
  const { error } = await adminClient.auth.admin.createUser({
    id: clientId,
    email: normalized,
    email_confirm: true,
    user_metadata: { full_name: profile.full_name },
    app_metadata: { role: 'client' },
  });
  if (error) {
    if (error.message.includes('already been registered') || error.message.includes('already exists')) {
      return { error: 'Ya existe un usuario con ese email' };
    }
    return { error: error.message };
  }

  revalidatePath(`/admin/clientes/${clientId}`);
  return { success: true };
}

export async function updateClientStatusAction(userId: string, status: string) {
  const auth = await requireRole(OWNER_ROLES);
  if (!auth.ok) return { error: auth.error };
  if (!isUuid(userId) || !VALID_STATUS.includes(status)) return { error: 'Datos inválidos' };
  if (userId === auth.user.id) return { error: 'No podés cambiar el estado de tu propia cuenta' };

  // Solo un super_admin puede suspender a otro owner / marketing / super_admin
  if (auth.role !== 'super_admin') {
    const { data: target } = await auth.supabase.from('profiles').select('role').eq('id', userId).maybeSingle();
    if (target && ['super_admin', 'owner', 'marketing'].includes(target.role)) {
      return { error: 'No tenés permisos para cambiar el estado de esa cuenta' };
    }
  }

  const { error } = await auth.supabase
    .from('profiles')
    .update({ status })
    .eq('id', userId);
  if (error) return { error: error.message };
  revalidatePath('/admin/clientes');
  revalidatePath(`/admin/clientes/${userId}`);
  return { success: true };
}
