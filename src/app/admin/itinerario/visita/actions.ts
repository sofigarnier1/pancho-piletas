'use server';

// El dueño también hace piletas y corrige lo que cargó el equipo: registra, edita y borra registros de
// cualquier fecha pasada (nunca a futuro) y a nombre de cualquiera del equipo. Cada cambio queda en el historial.
import { revalidatePath } from 'next/cache';
import { requireRole, isUuid, OWNER_ROLES } from '@/lib/auth/require-role';
import { chlorineColumns, type RegistroData } from '@/lib/service-log';
import { todayInArgentina } from '@/lib/dates';

type Supabase = Extract<Awaited<ReturnType<typeof requireRole>>, { ok: true }>['supabase'];

const FUTURE = 'No se pueden registrar visitas de días que todavía no llegaron';
const VISIT_DONE = 'Esta visita ya está hecha: para corregirla, editá o borrá sus registros';
const NOT_TEAM = 'El registro tiene que ser de alguien del equipo';

const revalidateVisit = (itemId: string, fecha?: string | null) => {
  revalidatePath(`/admin/itinerario/visita/${itemId}`);
  if (fecha) revalidatePath(`/admin/itinerario/${fecha}`);
  revalidatePath('/admin/itinerario');
};

/** La visita con su fecha y la pileta/cliente, o null si no existe. */
async function getItem(supabase: Supabase, itemId: string) {
  const { data } = await supabase
    .from('itinerary_items')
    .select('id, status, pool_id, itinerary_days(date), pools(client_id)')
    .eq('id', itemId)
    .maybeSingle();
  if (!data) return null;
  return {
    status: data.status as string,
    poolId: data.pool_id as string,
    date: (data.itinerary_days as unknown as { date: string }).date,
    clientId: (data.pools as unknown as { client_id: string } | null)?.client_id ?? null,
  };
}

const dbError = (error: { code?: string; message: string }) => {
  if (error.code === 'PA002') return FUTURE;
  if (error.code === '22023') return NOT_TEAM;
  return error.message;
};

/** Registra el service de una visita a nombre de alguien del equipo (la da por hecha). */
export async function registrarVisitaDuenoAction(itemId: string, requestId: string, employeeId: string, data: RegistroData) {
  const auth = await requireRole(OWNER_ROLES);
  if (!auth.ok) return { error: auth.error };
  const { supabase } = auth;
  if (!isUuid(itemId) || !isUuid(requestId) || !isUuid(employeeId) || !data || typeof data !== 'object') {
    return { error: 'Datos inválidos' };
  }
  const cols = chlorineColumns(data);
  if ('error' in cols) return { error: cols.error };

  const item = await getItem(supabase, itemId);
  if (!item || !item.clientId) return { error: 'Visita no encontrada' };
  if (item.date > todayInArgentina()) return { error: FUTURE };

  // Fecha, tipo de visita y cierre de la visita los fija la base
  const { error } = await supabase.from('service_logs').insert({
    itinerary_item_id: itemId,
    employee_id: employeeId,
    pool_id: item.poolId,
    client_id: item.clientId,
    request_id: requestId,
    ...cols,
  });
  // 23505: este mismo envío ya se guardó (doble toque o reintento): no se duplica
  if (error && error.code !== '23505') return { error: dbError(error) };

  revalidateVisit(itemId, item.date);
  return { success: true };
}

/** Corrige un registro: quién lo hizo, cloro y observaciones. */
export async function editarRegistroDuenoAction(serviceLogId: string, employeeId: string, data: RegistroData) {
  const auth = await requireRole(OWNER_ROLES);
  if (!auth.ok) return { error: auth.error };
  if (!isUuid(serviceLogId) || !isUuid(employeeId) || !data || typeof data !== 'object') return { error: 'Datos inválidos' };
  const cols = chlorineColumns(data);
  if ('error' in cols) return { error: cols.error };

  const { data: updated, error } = await auth.supabase
    .from('service_logs')
    .update({ ...cols, employee_id: employeeId })
    .eq('id', serviceLogId)
    .select('itinerary_item_id, date');
  if (error) return { error: dbError(error) };
  if (!updated || updated.length === 0) return { error: 'Registro no encontrado' };

  const itemId = updated[0].itinerary_item_id as string | null;
  if (itemId) revalidateVisit(itemId, updated[0].date as string);
  return { success: true };
}

/** Borra un registro. Si era el último de la visita, la visita vuelve a pendiente. */
export async function borrarRegistroDuenoAction(serviceLogId: string) {
  const auth = await requireRole(OWNER_ROLES);
  if (!auth.ok) return { error: auth.error };
  if (!isUuid(serviceLogId)) return { error: 'Datos inválidos' };

  const { data: deleted, error } = await auth.supabase
    .from('service_logs')
    .delete()
    .eq('id', serviceLogId)
    .select('itinerary_item_id, date');
  if (error) return { error: error.message };
  if (!deleted || deleted.length === 0) return { error: 'Registro no encontrado' };

  const itemId = deleted[0].itinerary_item_id as string | null;
  if (itemId) revalidateVisit(itemId, deleted[0].date as string);
  return { success: true };
}

/** Salteada, no estaba el cliente, o volver a pendiente. "Hecha" se da registrando el service. */
export async function marcarVisitaDuenoAction(itemId: string, status: 'skipped' | 'no_client' | 'pending') {
  const auth = await requireRole(OWNER_ROLES);
  if (!auth.ok) return { error: auth.error };
  const { supabase, user } = auth;
  if (!isUuid(itemId) || !['skipped', 'no_client', 'pending'].includes(status)) return { error: 'Datos inválidos' };

  const item = await getItem(supabase, itemId);
  if (!item) return { error: 'Visita no encontrada' };
  if (item.date > todayInArgentina()) return { error: FUTURE };

  // Para el dueño, quién y cuándo la cerró se fija acá (la base solo lo fuerza para el empleado)
  const closing = status === 'pending' ? { completed_by: null, completed_at: null } : { completed_by: user.id, completed_at: new Date().toISOString() };
  const { data: updated, error } = await supabase
    .from('itinerary_items')
    .update({ status, ...closing })
    .eq('id', itemId)
    .neq('status', 'done')
    .select('id');
  if (error) return { error: error.message };
  if (!updated || updated.length === 0) return { error: VISIT_DONE };

  revalidateVisit(itemId, item.date);
  return { success: true };
}
