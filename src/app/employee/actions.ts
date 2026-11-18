'use server';

import { revalidatePath } from 'next/cache';
import { requireRole, isUuid } from '@/lib/auth/require-role';
import { chlorineColumns, type RegistroData } from '@/lib/service-log';
import { FIELD_ROLES } from '@/lib/campo';
import { parsePriceCents } from '@/lib/precios';

export type MarcarStatus = 'skipped' | 'no_client' | 'pending';

export type { RegistroData } from '@/lib/service-log';

const VISIT_DONE = 'Esta visita ya está hecha: para corregirla, editá o borrá sus registros';
const LOG_LOCKED = 'Ese registro ya no se puede cambiar (es de otra persona o de hace más de 7 días)';
const ASSIGNED_OTHER = 'Esta pileta le toca a otra persona: solo ella la puede marcar';

const revalidateEmployee = (itemId?: string | null) => {
  revalidatePath('/employee/itinerario');
  if (itemId) revalidatePath(`/employee/piletas/${itemId}`);
};

const MAX_NOTA = 500;

/**
 * Salteada, no estaba el cliente, o volver a pendiente. "Hecha" se da registrando el service.
 * Con "No se pudo" (salteada o no estaba) se puede dejar una nota con el motivo; al volver a pendiente la base la borra.
 */
export async function marcarPiletaAction(itineraryItemId: string, status: MarcarStatus, nota?: string | null) {
  const auth = await requireRole(FIELD_ROLES);
  if (!auth.ok) return { error: auth.error };
  const { supabase } = auth;

  if (!isUuid(itineraryItemId) || !['skipped', 'no_client', 'pending'].includes(status)) {
    return { error: 'Datos inválidos' };
  }
  if (nota !== undefined && nota !== null && typeof nota !== 'string') return { error: 'Datos inválidos' };
  const statusNote = status === 'pending' ? null : (nota ?? '').trim().slice(0, MAX_NOTA) || null;

  // Quién y cuándo la cerró lo fija la base para el empleado. En modo campo (dueño), lo pone la acción. Una visita hecha no se toca por acá.
  const cierre = auth.role === 'employee'
    ? {}
    : status === 'pending'
      ? { completed_by: null, completed_at: null }
      : { completed_by: auth.user.id, completed_at: new Date().toISOString() };
  const { data: updated, error } = await supabase
    .from('itinerary_items')
    .update({ status, status_note: statusNote, ...cierre })
    .eq('id', itineraryItemId)
    .neq('status', 'done')
    .select('id');
  if (error) return { error: error.message };

  if (!updated || updated.length === 0) {
    const { data: item } = await supabase
      .from('itinerary_items')
      .select('status, assigned_employee_id')
      .eq('id', itineraryItemId)
      .maybeSingle();
    revalidateEmployee(itineraryItemId);
    if (!item) return { error: 'Pileta no encontrada' };
    if (item.assigned_employee_id && item.assigned_employee_id !== auth.user.id) return { error: ASSIGNED_OTHER };
    return { error: VISIT_DONE, alreadyDone: true };
  }

  revalidateEmployee(itineraryItemId);
  return { success: true };
}

/** Registra el service de una visita (la da por hecha). Se pueden sumar varios registros a la misma visita. */
export async function registrarServiceAction(itineraryItemId: string, requestId: string, data: RegistroData) {
  const auth = await requireRole(FIELD_ROLES);
  if (!auth.ok) return { error: auth.error };
  const { supabase, user } = auth;

  if (!isUuid(itineraryItemId) || !isUuid(requestId) || !data || typeof data !== 'object') {
    return { error: 'Datos inválidos' };
  }
  const cols = chlorineColumns(data);
  if ('error' in cols) return { error: cols.error };

  // Pileta y cliente salen de la visita (RLS: solo si el empleado puede verla)
  const { data: item, error: itemError } = await supabase
    .from('itinerary_items')
    .select('id, pool_id, pools(client_id)')
    .eq('id', itineraryItemId)
    .maybeSingle();
  if (itemError) return { error: itemError.message };
  const clientId = (item?.pools as unknown as { client_id: string } | null)?.client_id;
  if (!item || !clientId) return { error: 'Pileta no encontrada' };

  // Fecha, tipo de visita y cierre de la visita los fija la base
  const { error } = await supabase.from('service_logs').insert({
    itinerary_item_id: itineraryItemId,
    employee_id: user.id,
    pool_id: item.pool_id,
    client_id: clientId,
    request_id: requestId,
    ...cols,
  });
  // 23505: este mismo envío ya se guardó (doble toque o reintento): no se duplica
  // 42501: la visita tiene encargado y no es este empleado (RLS)
  if (error?.code === '42501') return { error: ASSIGNED_OTHER };
  if (error && error.code !== '23505') return { error: error.message };

  revalidateEmployee(itineraryItemId);
  return { success: true };
}

/** Corrige un registro propio de los últimos 7 días (cloro y observaciones). */
export async function editarRegistroAction(serviceLogId: string, data: RegistroData) {
  const auth = await requireRole(FIELD_ROLES);
  if (!auth.ok) return { error: auth.error };
  const { supabase, user } = auth;

  if (!isUuid(serviceLogId) || !data || typeof data !== 'object') return { error: 'Datos inválidos' };
  const cols = chlorineColumns(data);
  if ('error' in cols) return { error: cols.error };

  const { data: updated, error } = await supabase
    .from('service_logs')
    .update(cols)
    .eq('id', serviceLogId)
    .eq('employee_id', user.id)
    .select('itinerary_item_id');
  if (error) return { error: error.message };
  if (!updated || updated.length === 0) return { error: LOG_LOCKED };

  revalidateEmployee(updated[0].itinerary_item_id as string | null);
  return { success: true };
}

/** Borra un registro propio de los últimos 7 días. Si era el último de la visita, la visita vuelve a pendiente. */
export async function borrarRegistroAction(serviceLogId: string) {
  const auth = await requireRole(FIELD_ROLES);
  if (!auth.ok) return { error: auth.error };
  const { supabase, user } = auth;

  if (!isUuid(serviceLogId)) return { error: 'Datos inválidos' };

  const { data: deleted, error } = await supabase
    .from('service_logs')
    .delete()
    .eq('id', serviceLogId)
    .eq('employee_id', user.id)
    .select('itinerary_item_id');
  if (error) return { error: error.message };
  if (!deleted || deleted.length === 0) return { error: LOG_LOCKED };

  revalidateEmployee(deleted[0].itinerary_item_id as string | null);
  return { success: true };
}

const COBRO_INVALIDO = 'Escribí cuánto te dieron, en pesos (por ejemplo 15000 o 15.000)';
const COBRO_LOCKED = 'Ese cobro ya no se puede borrar (ya se lo entregaste al dueño, o no es tuyo)';

/**
 * "Cobré": anota cuánta plata le dio el cliente en esta visita. Solo el monto: el empleado no ve precios ni deuda.
 * La base pone el cliente (el titular de la pileta), la fecha (la de la visita) y "con el empleado" hasta que el dueño
 * confirme que la recibió. En modo campo (dueño), queda directamente recibido.
 */
export async function anotarCobroAction(itineraryItemId: string, requestId: string, monto: string, nota?: string | null) {
  const auth = await requireRole(FIELD_ROLES);
  if (!auth.ok) return { error: auth.error };
  const { supabase, user } = auth;
  if (!isUuid(itineraryItemId) || !isUuid(requestId)) return { error: 'Datos inválidos' };
  if (nota !== undefined && nota !== null && typeof nota !== 'string') return { error: 'Datos inválidos' };
  const cents = parsePriceCents(monto);
  if (cents === null || cents <= 0) return { error: COBRO_INVALIDO };

  const { data: item, error: itemError } = await supabase
    .from('itinerary_items')
    .select('id, pools(client_id)')
    .eq('id', itineraryItemId)
    .maybeSingle();
  if (itemError) return { error: itemError.message };
  const clientId = (item?.pools as unknown as { client_id: string | null } | null)?.client_id;
  if (!item || !clientId) return { error: 'Pileta no encontrada' };

  const { error } = await supabase.from('payments').insert({
    itinerary_item_id: itineraryItemId,
    client_id: clientId,
    amount_cents: cents,
    notes: (nota ?? '').trim().slice(0, MAX_NOTA) || null,
    request_id: requestId,
    received_by: user.id,
    status: auth.role === 'employee' ? 'con_empleado' : 'recibido',
  });
  // 23505: este mismo envío ya se guardó (doble toque o reintento): no se duplica
  if (error?.code === 'PA002') return { error: 'Solo se anotan cobros de visitas de los últimos 7 días' };
  if (error?.code === '42501') return { error: ASSIGNED_OTHER };
  if (error && error.code !== '23505') return { error: error.message };

  revalidateEmployee(itineraryItemId);
  revalidatePath('/admin/cobros');
  return { success: true };
}

/** Borra un cobro propio que todavía no se le entregó al dueño (por ejemplo, si se anotó mal el monto). */
export async function borrarCobroAction(paymentId: string) {
  const auth = await requireRole(FIELD_ROLES);
  if (!auth.ok) return { error: auth.error };
  if (!isUuid(paymentId)) return { error: 'Datos inválidos' };

  let q = auth.supabase.from('payments').delete().eq('id', paymentId).eq('received_by', auth.user.id);
  if (auth.role === 'employee') q = q.eq('status', 'con_empleado');
  const { data, error } = await q.select('itinerary_item_id');
  if (error) return { error: error.message };
  if (!data || data.length === 0) return { error: COBRO_LOCKED };

  revalidateEmployee(data[0].itinerary_item_id as string | null);
  revalidatePath('/admin/cobros');
  return { success: true };
}
