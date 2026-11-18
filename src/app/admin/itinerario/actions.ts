'use server';

import { revalidatePath } from 'next/cache';
import { requireRole, isUuid, isIsoDate, OWNER_ROLES } from '@/lib/auth/require-role';
import type { ServiceType } from '@/lib/chlorine';

const isServiceType = (v: unknown): v is ServiceType => v === 'service' || v === 'desagote';

const revalidateDay = (fecha: string) => {
  revalidatePath(`/admin/itinerario/${fecha}`);
  revalidatePath('/admin/itinerario');
};

/** Agrega una pileta al día. Opcional: en qué auto va (null = sin auto) y si es service o desagote. */
export async function addPoolToItineraryAction(
  fecha: string,
  poolId: string,
  opts: { vehicleId?: string | null; serviceType?: ServiceType } = {}
) {
  const auth = await requireRole(OWNER_ROLES);
  if (!auth.ok) return { error: auth.error };
  const vehicleId = opts?.vehicleId ?? null;
  const serviceType = opts?.serviceType ?? 'service';
  if (!isIsoDate(fecha) || !isUuid(poolId) || (vehicleId !== null && !isUuid(vehicleId)) || !isServiceType(serviceType)) {
    return { error: 'Datos inválidos' };
  }
  const { supabase, user } = auth;

  // Upsert el día
  const { data: day, error: dayError } = await supabase
    .from('itinerary_days')
    .upsert({ date: fecha, created_by: user.id }, { onConflict: 'date' })
    .select('id')
    .single();

  if (dayError) return { error: dayError.message };

  // Obtener el próximo sort_order
  const { count } = await supabase
    .from('itinerary_items')
    .select('*', { count: 'exact', head: true })
    .eq('itinerary_day_id', day.id);

  const { error } = await supabase.from('itinerary_items').insert({
    itinerary_day_id: day.id,
    pool_id: poolId,
    sort_order: (count ?? 0),
    vehicle_id: vehicleId,
    service_type: serviceType,
  });

  if (error) {
    if (error.code === '23505') return { error: 'Esa pileta ya está en el itinerario de ese día' };
    // 23503: el auto no existe
    if (error.code === '23503') return { error: 'Auto no encontrado' };
    return { error: error.message };
  }

  revalidatePath(`/admin/itinerario/${fecha}`);
  revalidatePath('/admin/itinerario');
  return { success: true };
}

export async function removeItemFromItineraryAction(itemId: string, fecha: string) {
  const auth = await requireRole(OWNER_ROLES);
  if (!auth.ok) return { error: auth.error };
  if (!isUuid(itemId) || !isIsoDate(fecha)) return { error: 'Datos inválidos' };

  const { error } = await auth.supabase.from('itinerary_items').delete().eq('id', itemId);
  if (error) {
    // 23503: la pileta ya tiene un registro de service (no se puede borrar el historial)
    if (error.code === '23503') return { error: 'No se puede quitar: esta pileta ya tiene un service registrado' };
    return { error: error.message };
  }
  revalidatePath(`/admin/itinerario/${fecha}`);
  return { success: true };
}

export async function copyLastWeekAction(fecha: string) {
  const auth = await requireRole(OWNER_ROLES);
  if (!auth.ok) return { error: auth.error };
  if (!isIsoDate(fecha)) return { error: 'Fecha inválida' };
  const { supabase, user } = auth;

  // Calcular la fecha de hace 7 días (mediodía UTC para evitar saltos de día)
  const targetDate = new Date(`${fecha}T12:00:00Z`);
  targetDate.setUTCDate(targetDate.getUTCDate() - 7);
  const lastWeekStr = targetDate.toISOString().split('T')[0];

  // Buscar el día de hace 7 días
  const { data: lastWeekDay } = await supabase
    .from('itinerary_days')
    .select('id, itinerary_items(pool_id, sort_order, vehicle_id, service_type, assigned_employee_id), itinerary_day_crews(vehicle_id, employee_id)')
    .eq('date', lastWeekStr)
    .maybeSingle();

  if (!lastWeekDay || !(lastWeekDay.itinerary_items as unknown[]).length) {
    return { error: 'No hay itinerario de la semana anterior para copiar' };
  }

  // Upsert el día destino
  const { data: day, error: dayError } = await supabase
    .from('itinerary_days')
    .upsert({ date: fecha, created_by: user.id }, { onConflict: 'date' })
    .select('id')
    .single();

  if (dayError) return { error: dayError.message };

  // El encargado de cada visita se copia si sigue en el equipo (si no, la visita queda para cualquiera del auto)
  const { data: equipo } = await supabase.from('profiles').select('id').in('role', ['employee', 'owner']).neq('status', 'blocked');
  const enEquipo = new Set((equipo ?? []).map((p) => p.id as string));

  // Insertar los items; UNIQUE(itinerary_day_id, pool_id) evita duplicados al repetir la copia
  const items = (
    lastWeekDay.itinerary_items as {
      pool_id: string; sort_order: number; vehicle_id: string | null; service_type: ServiceType; assigned_employee_id: string | null;
    }[]
  ).map((item) => ({
    itinerary_day_id: day.id,
    pool_id: item.pool_id,
    sort_order: item.sort_order,
    vehicle_id: item.vehicle_id,
    service_type: item.service_type,
    assigned_employee_id: item.assigned_employee_id && enEquipo.has(item.assigned_employee_id) ? item.assigned_employee_id : null,
  }));

  // UNIQUE(itinerary_day_id, pool_id) evita duplicados al repetir la copia
  const { error } = await supabase.from('itinerary_items').upsert(items, {
    onConflict: 'itinerary_day_id,pool_id',
    ignoreDuplicates: true,
  });
  if (error) return { error: error.message };

  // Los equipos de cada auto también se copian (quien ya tiene auto ese día lo conserva)
  const crews = (lastWeekDay.itinerary_day_crews as { vehicle_id: string; employee_id: string }[] | null) ?? [];
  if (crews.length) {
    const { error: crewError } = await supabase.from('itinerary_day_crews').upsert(
      crews.map((c) => ({ itinerary_day_id: day.id, vehicle_id: c.vehicle_id, employee_id: c.employee_id })),
      { onConflict: 'itinerary_day_id,employee_id', ignoreDuplicates: true }
    );
    if (crewError) return { error: crewError.message };
  }

  revalidateDay(fecha);
  return { success: true, count: items.length };
}

export async function reorderItemAction(itemId: string, newOrder: number, fecha: string) {
  const auth = await requireRole(OWNER_ROLES);
  if (!auth.ok) return { error: auth.error };
  if (!isUuid(itemId) || !isIsoDate(fecha) || !Number.isInteger(newOrder)) return { error: 'Datos inválidos' };

  const { error } = await auth.supabase
    .from('itinerary_items')
    .update({ sort_order: newOrder })
    .eq('id', itemId);
  if (error) return { error: error.message };
  revalidatePath(`/admin/itinerario/${fecha}`);
  return { success: true };
}

/** Fija el orden del día: `orderedIds` es la lista completa de items en el orden deseado. */
export async function reorderItineraryAction(fecha: string, orderedIds: string[]) {
  const auth = await requireRole(OWNER_ROLES);
  if (!auth.ok) return { error: auth.error };
  if (
    !isIsoDate(fecha) ||
    !Array.isArray(orderedIds) ||
    orderedIds.length === 0 ||
    orderedIds.length > 500 ||
    !orderedIds.every(isUuid) ||
    new Set(orderedIds).size !== orderedIds.length
  ) {
    return { error: 'Datos inválidos' };
  }

  const { data: day, error: dayError } = await auth.supabase.from('itinerary_days').select('id').eq('date', fecha).maybeSingle();
  if (dayError) return { error: dayError.message };
  if (!day) return { error: 'Itinerario no encontrado' };

  // Solo se toca sort_order, y solo de items de ese día
  const results = await Promise.all(
    orderedIds.map((id, index) =>
      auth.supabase.from('itinerary_items').update({ sort_order: index }).eq('id', id).eq('itinerary_day_id', day.id)
    )
  );
  const failed = results.find((r) => r.error);
  if (failed?.error) return { error: failed.error.message };

  revalidatePath(`/admin/itinerario/${fecha}`);
  return { success: true };
}

/** Pasa una visita a otro auto (null = sin auto). Queda última en la ruta de ese auto. */
export async function setItemVehicleAction(itemId: string, vehicleId: string | null, fecha: string) {
  const auth = await requireRole(OWNER_ROLES);
  if (!auth.ok) return { error: auth.error };
  if (!isUuid(itemId) || !isIsoDate(fecha) || (vehicleId !== null && !isUuid(vehicleId))) return { error: 'Datos inválidos' };
  const { supabase } = auth;

  const { data: item, error: itemError } = await supabase
    .from('itinerary_items')
    .select('itinerary_day_id')
    .eq('id', itemId)
    .maybeSingle();
  if (itemError) return { error: itemError.message };
  if (!item) return { error: 'Visita no encontrada' };

  const { data: last } = await supabase
    .from('itinerary_items')
    .select('sort_order')
    .eq('itinerary_day_id', item.itinerary_day_id)
    .order('sort_order', { ascending: false })
    .limit(1)
    .maybeSingle();

  const { error } = await supabase
    .from('itinerary_items')
    .update({ vehicle_id: vehicleId, sort_order: (last?.sort_order ?? 0) + 1 })
    .eq('id', itemId);
  if (error) {
    if (error.code === '23503') return { error: 'Auto no encontrado' };
    return { error: error.message };
  }
  revalidateDay(fecha);
  return { success: true };
}

/** Cambia si la visita es service o desagote (también sus registros, si ya los tiene). */
export async function setItemServiceTypeAction(itemId: string, serviceType: ServiceType, fecha: string) {
  const auth = await requireRole(OWNER_ROLES);
  if (!auth.ok) return { error: auth.error };
  if (!isUuid(itemId) || !isIsoDate(fecha) || !isServiceType(serviceType)) return { error: 'Datos inválidos' };

  const { data, error } = await auth.supabase
    .from('itinerary_items')
    .update({ service_type: serviceType })
    .eq('id', itemId)
    .select('id');
  if (error) return { error: error.message };
  if (!data || data.length === 0) return { error: 'Visita no encontrada' };
  revalidateDay(fecha);
  return { success: true };
}

/** Sube a alguien del equipo a un auto ese día. Si ya iba en otro auto, se cambia. */
export async function assignCrewAction(fecha: string, vehicleId: string, employeeId: string) {
  const auth = await requireRole(OWNER_ROLES);
  if (!auth.ok) return { error: auth.error };
  if (!isIsoDate(fecha) || !isUuid(vehicleId) || !isUuid(employeeId)) return { error: 'Datos inválidos' };
  const { supabase, user } = auth;

  const { data: day, error: dayError } = await supabase
    .from('itinerary_days')
    .upsert({ date: fecha, created_by: user.id }, { onConflict: 'date' })
    .select('id')
    .single();
  if (dayError) return { error: dayError.message };

  // Una persona va en un solo auto por día: si ya tenía uno, se cambia
  const { error } = await supabase
    .from('itinerary_day_crews')
    .upsert(
      { itinerary_day_id: day.id, vehicle_id: vehicleId, employee_id: employeeId },
      { onConflict: 'itinerary_day_id,employee_id' }
    );
  if (error) {
    if (error.code === '22023') return { error: 'En un auto solo puede ir alguien del equipo' };
    if (error.code === '23503') return { error: 'Auto no encontrado' };
    return { error: error.message };
  }
  revalidateDay(fecha);
  return { success: true };
}

/** Baja a una persona del auto ese día. */
export async function removeCrewAction(crewId: string, fecha: string) {
  const auth = await requireRole(OWNER_ROLES);
  if (!auth.ok) return { error: auth.error };
  if (!isUuid(crewId) || !isIsoDate(fecha)) return { error: 'Datos inválidos' };

  const { data, error } = await auth.supabase.from('itinerary_day_crews').delete().eq('id', crewId).select('id');
  if (error) return { error: error.message };
  if (!data || data.length === 0) return { error: 'Esa persona ya no estaba en el auto' };
  revalidateDay(fecha);
  return { success: true };
}

/**
 * Agrega varias piletas de una vez a un auto (null = sin auto), todas como service o todas como desagote.
 * Quedan al final de la ruta de ese auto, en el orden en que se eligieron. Las que ya estaban ese día se saltean.
 */
export async function addPoolsToItineraryAction(
  fecha: string,
  poolIds: string[],
  opts: { vehicleId?: string | null; serviceType?: ServiceType } = {}
) {
  const auth = await requireRole(OWNER_ROLES);
  if (!auth.ok) return { error: auth.error };
  const vehicleId = opts?.vehicleId ?? null;
  const serviceType = opts?.serviceType ?? 'service';
  if (
    !isIsoDate(fecha) ||
    !Array.isArray(poolIds) ||
    poolIds.length === 0 ||
    poolIds.length > 200 ||
    !poolIds.every(isUuid) ||
    new Set(poolIds).size !== poolIds.length ||
    (vehicleId !== null && !isUuid(vehicleId)) ||
    !isServiceType(serviceType)
  ) {
    return { error: 'Datos inválidos' };
  }
  const { supabase, user } = auth;

  const { data: day, error: dayError } = await supabase
    .from('itinerary_days')
    .upsert({ date: fecha, created_by: user.id }, { onConflict: 'date' })
    .select('id')
    .single();
  if (dayError) return { error: dayError.message };

  const { data: existing, error: exError } = await supabase
    .from('itinerary_items')
    .select('pool_id, sort_order')
    .eq('itinerary_day_id', day.id);
  if (exError) return { error: exError.message };
  const yaEstan = new Set((existing ?? []).map((i) => i.pool_id as string));
  const nuevas = poolIds.filter((id) => !yaEstan.has(id));
  if (nuevas.length === 0) return { error: 'Esas piletas ya están en el itinerario de ese día' };
  const base = (existing ?? []).reduce((max, i) => Math.max(max, (i.sort_order as number) + 1), 0);

  const { error } = await supabase.from('itinerary_items').insert(
    nuevas.map((poolId, i) => ({
      itinerary_day_id: day.id,
      pool_id: poolId,
      sort_order: base + i,
      vehicle_id: vehicleId,
      service_type: serviceType,
    }))
  );
  if (error) {
    if (error.code === '23505') return { error: 'Esa pileta ya está en el itinerario de ese día' };
    if (error.code === '23503') return { error: 'Auto no encontrado' };
    return { error: error.message };
  }
  revalidateDay(fecha);
  return { success: true, count: nuevas.length, skipped: poolIds.length - nuevas.length };
}

/** Quién tiene que hacer la visita ("Lo tiene que hacer X"); null = cualquiera del auto. */
export async function setItemAssigneeAction(itemId: string, employeeId: string | null, fecha: string) {
  const auth = await requireRole(OWNER_ROLES);
  if (!auth.ok) return { error: auth.error };
  if (!isUuid(itemId) || !isIsoDate(fecha) || (employeeId !== null && !isUuid(employeeId))) return { error: 'Datos inválidos' };

  const { data, error } = await auth.supabase
    .from('itinerary_items')
    .update({ assigned_employee_id: employeeId })
    .eq('id', itemId)
    .select('id');
  if (error) {
    if (error.code === '23514' || error.code === '23503') {
      return { error: 'La visita solo se le puede asignar a alguien del equipo (empleado o dueño)' };
    }
    return { error: error.message };
  }
  if (!data || data.length === 0) return { error: 'Visita no encontrada' };
  revalidateDay(fecha);
  return { success: true };
}

/**
 * "Agregar" del recordatorio: vuelve a agendar una visita sin hacer de un día anterior en `fecha`.
 * Va al auto que tenía (si sigue activo) o sin auto, al final de la ruta, con el mismo tipo.
 * La base no deja reprogramar la misma visita dos veces, ni una hecha, ni hacia atrás.
 */
export async function reprogramarPendienteAction(fecha: string, itemId: string) {
  const auth = await requireRole(OWNER_ROLES);
  if (!auth.ok) return { error: auth.error };
  if (!isIsoDate(fecha) || !isUuid(itemId)) return { error: 'Datos inválidos' };
  const { supabase, user } = auth;

  const { data: src, error: srcError } = await supabase
    .from('itinerary_items')
    .select('pool_id, service_type, vehicle_id, vehicles (is_active)')
    .eq('id', itemId)
    .maybeSingle();
  if (srcError) return { error: srcError.message };
  if (!src) return { error: 'Visita no encontrada' };
  const veh = (Array.isArray(src.vehicles) ? src.vehicles[0] : src.vehicles) as { is_active: boolean } | null;
  const vehicleId = src.vehicle_id && veh?.is_active ? (src.vehicle_id as string) : null;

  const { data: day, error: dayError } = await supabase
    .from('itinerary_days')
    .upsert({ date: fecha, created_by: user.id }, { onConflict: 'date' })
    .select('id')
    .single();
  if (dayError) return { error: dayError.message };

  const { data: last } = await supabase
    .from('itinerary_items')
    .select('sort_order')
    .eq('itinerary_day_id', day.id)
    .order('sort_order', { ascending: false })
    .limit(1)
    .maybeSingle();

  const { error } = await supabase.from('itinerary_items').insert({
    itinerary_day_id: day.id,
    pool_id: src.pool_id,
    sort_order: (last?.sort_order ?? -1) + 1,
    vehicle_id: vehicleId,
    service_type: src.service_type,
    rescheduled_from_item_id: itemId,
  });
  if (error) {
    if (error.code === '23505') return { error: 'Esa visita ya se volvió a agendar, o la pileta ya está ese día' };
    if (error.code === '22023') return { error: error.message };
    return { error: error.message };
  }
  revalidateDay(fecha);
  return { success: true };
}
