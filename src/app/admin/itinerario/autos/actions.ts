'use server';

import { revalidatePath } from 'next/cache';
import { requireRole, isUuid, OWNER_ROLES } from '@/lib/auth/require-role';

export type VehicleData = { name: string; plate?: string | null };

const DUPLICATE = 'Ya hay un auto con ese nombre';

/** Nombre obligatorio (hasta 60 letras); patente opcional (hasta 15). */
function clean(data: VehicleData): { name: string; plate: string | null } | null {
  if (!data || typeof data !== 'object' || typeof data.name !== 'string') return null;
  const name = data.name.trim();
  const plate = typeof data.plate === 'string' ? data.plate.trim().toUpperCase() || null : null;
  if (!name || name.length > 60 || (plate && plate.length > 15)) return null;
  return { name, plate };
}

const revalidateVehicles = () => {
  revalidatePath('/admin/itinerario/autos');
  revalidatePath('/admin/itinerario', 'layout');
};

export async function createVehicleAction(data: VehicleData) {
  const auth = await requireRole(OWNER_ROLES);
  if (!auth.ok) return { error: auth.error };
  const v = clean(data);
  if (!v) return { error: 'Escribí el nombre del auto (hasta 60 letras)' };

  // Va al final de la lista
  const { data: last } = await auth.supabase
    .from('vehicles')
    .select('sort_order')
    .order('sort_order', { ascending: false })
    .limit(1)
    .maybeSingle();

  const { error } = await auth.supabase.from('vehicles').insert({ ...v, sort_order: (last?.sort_order ?? 0) + 1 });
  if (error) return { error: error.code === '23505' ? DUPLICATE : error.message };
  revalidateVehicles();
  return { success: true };
}

export async function updateVehicleAction(vehicleId: string, data: VehicleData) {
  const auth = await requireRole(OWNER_ROLES);
  if (!auth.ok) return { error: auth.error };
  if (!isUuid(vehicleId)) return { error: 'Datos inválidos' };
  const v = clean(data);
  if (!v) return { error: 'Escribí el nombre del auto (hasta 60 letras)' };

  const { data: updated, error } = await auth.supabase.from('vehicles').update(v).eq('id', vehicleId).select('id');
  if (error) return { error: error.code === '23505' ? DUPLICATE : error.message };
  if (!updated || updated.length === 0) return { error: 'Auto no encontrado' };
  revalidateVehicles();
  return { success: true };
}

/** Un auto inactivo no se ofrece para días nuevos; lo ya planificado no cambia. */
export async function setVehicleActiveAction(vehicleId: string, active: boolean) {
  const auth = await requireRole(OWNER_ROLES);
  if (!auth.ok) return { error: auth.error };
  if (!isUuid(vehicleId) || typeof active !== 'boolean') return { error: 'Datos inválidos' };

  const { data: updated, error } = await auth.supabase
    .from('vehicles')
    .update({ is_active: active })
    .eq('id', vehicleId)
    .select('id');
  if (error) return { error: error.message };
  if (!updated || updated.length === 0) return { error: 'Auto no encontrado' };
  revalidateVehicles();
  return { success: true };
}
