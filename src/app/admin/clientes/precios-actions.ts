'use server';

// Precios por cliente (migración 31): solo el dueño y el súper admin. Nunca los ve el empleado ni marketing.
import { revalidatePath } from 'next/cache';
import { requireRole, isUuid, isIsoDate, OWNER_ROLES } from '@/lib/auth/require-role';
import { isPriceKind, parsePriceCents } from '@/lib/precios';

const revalidate = (clientId: string) => {
  revalidatePath(`/admin/clientes/${clientId}`);
  revalidatePath('/admin/clientes');
  revalidatePath('/admin/cobros');
};

/** Guarda el precio de un tipo desde una fecha. Si ya había uno de ese tipo con esa misma fecha, lo reemplaza. */
export async function guardarPrecioAction(clientId: string, kind: string, precio: string, desde: string) {
  const auth = await requireRole(OWNER_ROLES);
  if (!auth.ok) return { error: auth.error };
  if (!isUuid(clientId) || !isPriceKind(kind) || !isIsoDate(desde)) return { error: 'Datos inválidos' };
  const cents = parsePriceCents(precio);
  if (cents === null) return { error: 'El precio tiene que ser un número de 0 a 100.000.000 (por ejemplo 12.500 o 12.500,50)' };

  const { error } = await auth.supabase
    .from('client_prices')
    .upsert({ client_id: clientId, kind, price_cents: cents, valid_from: desde }, { onConflict: 'client_id,kind,valid_from' });
  if (error) {
    if (error.code === '22023') return { error: 'Los precios son solo para clientes' };
    if (error.code === '23514') return { error: 'Revisá la fecha: tiene que ser entre el año 2000 y el 2100' };
    if (error.code === '23503') return { error: 'Cliente no encontrado' };
    return { error: error.message };
  }
  revalidate(clientId);
  return { success: true };
}

/** Borra un precio cargado por error. Desde ese día vuelve a regir el anterior (si hay). */
export async function borrarPrecioAction(priceId: string, clientId: string) {
  const auth = await requireRole(OWNER_ROLES);
  if (!auth.ok) return { error: auth.error };
  if (!isUuid(priceId) || !isUuid(clientId)) return { error: 'Datos inválidos' };

  const { data, error } = await auth.supabase.from('client_prices').delete().eq('id', priceId).eq('client_id', clientId).select('id');
  if (error) return { error: error.message };
  if (!data || data.length === 0) return { error: 'Ese precio ya no estaba' };
  revalidate(clientId);
  return { success: true };
}
