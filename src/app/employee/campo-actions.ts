'use server';

// Modo campo: lo que el dueño (o el súper admin) puede hacer desde la pantalla del empleado cuando sale a hacer piletas.
// Siempre sobre el día de hoy (hora de Argentina). El empleado no puede usar nada de esto.
import { revalidatePath } from 'next/cache';
import { requireRole, isUuid, OWNER_ROLES } from '@/lib/auth/require-role';
import { todayInArgentina } from '@/lib/dates';
import type { ServiceType } from '@/lib/chlorine';

const revalidate = () => {
  revalidatePath('/employee/itinerario');
  revalidatePath(`/admin/itinerario/${todayInArgentina()}`);
  revalidatePath('/admin/itinerario');
};

async function diaDeHoy(auth: Extract<Awaited<ReturnType<typeof requireRole>>, { ok: true }>) {
  return auth.supabase
    .from('itinerary_days')
    .upsert({ date: todayInArgentina(), created_by: auth.user.id }, { onConflict: 'date' })
    .select('id')
    .single();
}

/** "Sumarme a un auto": hoy voy en este auto (null = me bajo del que tenía). */
export async function sumarmeAAutoAction(vehicleId: string | null) {
  const auth = await requireRole(OWNER_ROLES);
  if (!auth.ok) return { error: auth.error };
  if (vehicleId !== null && !isUuid(vehicleId)) return { error: 'Datos inválidos' };

  const { data: day, error: dayError } = await diaDeHoy(auth);
  if (dayError) return { error: dayError.message };

  if (vehicleId === null) {
    const { error } = await auth.supabase.from('itinerary_day_crews').delete().eq('itinerary_day_id', day.id).eq('employee_id', auth.user.id);
    if (error) return { error: error.message };
  } else {
    // Una persona va en un solo auto por día: si ya tenía uno, se cambia
    const { error } = await auth.supabase
      .from('itinerary_day_crews')
      .upsert({ itinerary_day_id: day.id, vehicle_id: vehicleId, employee_id: auth.user.id }, { onConflict: 'itinerary_day_id,employee_id' });
    if (error) {
      if (error.code === '23503') return { error: 'Auto no encontrado' };
      return { error: error.message };
    }
  }
  revalidate();
  return { success: true };
}

/**
 * "Agregar a mi día": suma piletas al día de hoy, a nombre del dueño (le tocan a él), en el auto en el que va hoy
 * (o sin auto). Quedan al final de la ruta. Las que ya están hoy se saltean.
 */
export async function agregarAMiDiaAction(poolIds: string[], serviceType: ServiceType = 'service') {
  const auth = await requireRole(OWNER_ROLES);
  if (!auth.ok) return { error: auth.error };
  if (
    !Array.isArray(poolIds) || poolIds.length === 0 || poolIds.length > 50 || !poolIds.every(isUuid)
    || new Set(poolIds).size !== poolIds.length || (serviceType !== 'service' && serviceType !== 'desagote')
  ) {
    return { error: 'Datos inválidos' };
  }
  const { supabase, user } = auth;

  const { data: day, error: dayError } = await diaDeHoy(auth);
  if (dayError) return { error: dayError.message };

  const [{ data: crew }, { data: existing, error: exError }] = await Promise.all([
    supabase.from('itinerary_day_crews').select('vehicle_id').eq('itinerary_day_id', day.id).eq('employee_id', user.id).maybeSingle(),
    supabase.from('itinerary_items').select('pool_id, sort_order').eq('itinerary_day_id', day.id),
  ]);
  if (exError) return { error: exError.message };
  const yaEstan = new Set((existing ?? []).map((i) => i.pool_id as string));
  const nuevas = poolIds.filter((id) => !yaEstan.has(id));
  if (nuevas.length === 0) return { error: 'Esas piletas ya están en el itinerario de hoy' };
  const base = (existing ?? []).reduce((max, i) => Math.max(max, (i.sort_order as number) + 1), 0);

  const { error } = await supabase.from('itinerary_items').insert(
    nuevas.map((poolId, i) => ({
      itinerary_day_id: day.id,
      pool_id: poolId,
      sort_order: base + i,
      vehicle_id: (crew?.vehicle_id as string | undefined) ?? null,
      service_type: serviceType,
      assigned_employee_id: user.id,
    })),
  );
  if (error) {
    if (error.code === '23505') return { error: 'Esas piletas ya están en el itinerario de hoy' };
    return { error: error.message };
  }
  revalidate();
  return { success: true, count: nuevas.length, skipped: poolIds.length - nuevas.length };
}
