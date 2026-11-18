'use server';

// Cobros (migración 32): solo el dueño y el súper admin.
import { revalidatePath } from 'next/cache';
import { requireRole, isUuid, isIsoDate, OWNER_ROLES } from '@/lib/auth/require-role';
import { parsePriceCents } from '@/lib/precios';

const MAX_NOTA = 500;

const revalidate = (clientId?: string | null) => {
  revalidatePath('/admin/cobros');
  if (clientId) revalidatePath(`/admin/cobros/${clientId}`);
};

/** "Confirmar": el empleado me entregó la plata de este cobro. */
export async function confirmarCobroAction(paymentId: string) {
  const auth = await requireRole(OWNER_ROLES);
  if (!auth.ok) return { error: auth.error };
  if (!isUuid(paymentId)) return { error: 'Datos inválidos' };
  const { data, error } = await auth.supabase
    .from('payments')
    .update({ status: 'recibido' })
    .eq('id', paymentId)
    .eq('status', 'con_empleado')
    .select('client_id');
  if (error) return { error: error.message };
  if (!data || data.length === 0) return { error: 'Ese cobro ya estaba confirmado' };
  revalidate(data[0].client_id as string);
  return { success: true };
}

/** "Confirmar todo": el empleado me entregó todo lo que tenía cobrado. */
export async function confirmarCobrosDeAction(employeeId: string) {
  const auth = await requireRole(OWNER_ROLES);
  if (!auth.ok) return { error: auth.error };
  if (!isUuid(employeeId)) return { error: 'Datos inválidos' };
  const { data, error } = await auth.supabase
    .from('payments')
    .update({ status: 'recibido' })
    .eq('received_by', employeeId)
    .eq('status', 'con_empleado')
    .select('id');
  if (error) return { error: error.message };
  if (!data || data.length === 0) return { error: 'No tenía cobros sin entregar' };
  revalidate();
  return { success: true, count: data.length };
}

/** Pago que recibió el dueño directamente (efectivo, transferencia...). */
export async function cargarPagoAction(clientId: string, monto: string, fecha: string, nota?: string | null) {
  const auth = await requireRole(OWNER_ROLES);
  if (!auth.ok) return { error: auth.error };
  if (!isUuid(clientId) || !isIsoDate(fecha)) return { error: 'Datos inválidos' };
  if (nota !== undefined && nota !== null && typeof nota !== 'string') return { error: 'Datos inválidos' };
  const cents = parsePriceCents(monto);
  if (cents === null || cents <= 0) return { error: 'El monto tiene que ser un número mayor que 0 (por ejemplo 15.000 o 15.000,50)' };

  const { error } = await auth.supabase.from('payments').insert({
    client_id: clientId,
    amount_cents: cents,
    paid_at: fecha,
    status: 'recibido',
    notes: (nota ?? '').trim().slice(0, MAX_NOTA) || null,
  });
  if (error) {
    if (error.code === '22023') return { error: 'Los pagos son solo de clientes' };
    if (error.code === '23514') return { error: 'Revisá la fecha: tiene que ser entre el año 2000 y el 2100' };
    if (error.code === '23503') return { error: 'Cliente no encontrado' };
    return { error: error.message };
  }
  revalidate(clientId);
  return { success: true };
}

/** Borra un pago cargado por error (lo cobrara quien lo cobrara). */
export async function borrarPagoAction(paymentId: string) {
  const auth = await requireRole(OWNER_ROLES);
  if (!auth.ok) return { error: auth.error };
  if (!isUuid(paymentId)) return { error: 'Datos inválidos' };
  const { data, error } = await auth.supabase.from('payments').delete().eq('id', paymentId).select('client_id');
  if (error) return { error: error.message };
  if (!data || data.length === 0) return { error: 'Ese pago ya no estaba' };
  revalidate(data[0].client_id as string);
  return { success: true };
}
