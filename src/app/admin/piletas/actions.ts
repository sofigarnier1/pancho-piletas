'use server';

import { revalidatePath } from 'next/cache';
import { requireRole, isUuid, OWNER_ROLES } from '@/lib/auth/require-role';
import { POOL_TYPES } from '@/lib/clients';
import { buscarDireccion, isFrequency, parseCoordenadas, textoParaBuscar } from '@/lib/ubicacion';

const revalidatePool = (poolId: string, clientIds: string[]) => {
  revalidatePath('/admin/piletas');
  revalidatePath(`/admin/piletas/${poolId}`);
  revalidatePath('/admin/clientes');
  for (const id of clientIds) revalidatePath(`/admin/clientes/${id}`);
};

export async function createPoolAction(_prevState: unknown, formData: FormData) {
  const auth = await requireRole(OWNER_ROLES);
  if (!auth.ok) return { error: auth.error };

  const clientId = formData.get('client_id') as string;
  const address = (formData.get('address') as string | null)?.trim() || null;
  const nickname = (formData.get('nickname') as string | null)?.trim() || null;
  const neighborhood = (formData.get('neighborhood') as string | null)?.trim() || null;
  const poolType = (formData.get('pool_type') as string | null) || null;
  const notes = (formData.get('notes') as string | null)?.trim() || null;

  if (!isUuid(clientId)) return { error: 'Elegí un cliente' };
  if (poolType && !(POOL_TYPES as readonly string[]).includes(poolType)) return { error: 'Tipo de pileta inválido' };

  const { data, error } = await auth.supabase
    .from('pools')
    .insert({
      client_id: clientId,
      address,
      nickname,
      neighborhood,
      pool_type: poolType,
      notes,
      created_by: auth.user.id,
    })
    .select('id')
    .single();

  if (error) return { error: error.message };

  revalidatePath('/admin/piletas');
  revalidatePath('/admin/clientes');
  revalidatePath(`/admin/clientes/${clientId}`);
  return { success: true, poolId: data.id };
}

export async function togglePoolActiveAction(poolId: string, isActive: boolean) {
  const auth = await requireRole(OWNER_ROLES);
  if (!auth.ok) return { error: auth.error };
  if (!isUuid(poolId)) return { error: 'Pileta inválida' };

  const { error } = await auth.supabase.from('pools').update({ is_active: isActive }).eq('id', poolId);
  if (error) return { error: error.message };
  revalidatePool(poolId, []);
  return { success: true };
}

/** Suma un cliente a la pileta como co-cliente (el titular se cambia con "Hacer titular"). */
export async function addPoolClientAction(poolId: string, clientId: string) {
  const auth = await requireRole(OWNER_ROLES);
  if (!auth.ok) return { error: auth.error };
  if (!isUuid(poolId) || !isUuid(clientId)) return { error: 'Datos inválidos' };

  const { error } = await auth.supabase.from('pool_clients').insert({ pool_id: poolId, client_id: clientId });
  if (error) {
    if (error.code === '23505') return { error: 'Ese cliente ya está en esta pileta' };
    if (error.code === '23514') return { error: 'Solo se pueden sumar clientes a una pileta' };
    if (error.code === '23503') return { error: 'La pileta o el cliente no existen' };
    return { error: error.message };
  }
  revalidatePool(poolId, [clientId]);
  return { success: true };
}

/** Quita a un co-cliente de la pileta. Al titular no se lo quita: primero se elige otro. */
export async function removePoolClientAction(poolId: string, clientId: string) {
  const auth = await requireRole(OWNER_ROLES);
  if (!auth.ok) return { error: auth.error };
  if (!isUuid(poolId) || !isUuid(clientId)) return { error: 'Datos inválidos' };

  const { data: link } = await auth.supabase
    .from('pool_clients')
    .select('id, is_primary')
    .eq('pool_id', poolId)
    .eq('client_id', clientId)
    .maybeSingle();
  if (!link) return { error: 'Ese cliente no está en esta pileta' };
  if (link.is_primary) return { error: 'No se puede quitar al titular de la pileta: primero hacé titular a otro cliente' };

  const { error } = await auth.supabase.from('pool_clients').delete().eq('id', link.id);
  if (error) return { error: error.message };
  revalidatePool(poolId, [clientId]);
  return { success: true };
}

/** Hace titular a un cliente que ya está en la pileta; el titular anterior queda como co-cliente. */
export async function setPoolPrimaryClientAction(poolId: string, clientId: string) {
  const auth = await requireRole(OWNER_ROLES);
  if (!auth.ok) return { error: auth.error };
  if (!isUuid(poolId) || !isUuid(clientId)) return { error: 'Datos inválidos' };

  const { data: pool } = await auth.supabase.from('pools').select('client_id').eq('id', poolId).maybeSingle();
  if (!pool) return { error: 'Pileta inválida' };
  const { data: link } = await auth.supabase
    .from('pool_clients')
    .select('id')
    .eq('pool_id', poolId)
    .eq('client_id', clientId)
    .maybeSingle();
  if (!link) return { error: 'Ese cliente no está en esta pileta' };
  if (pool.client_id === clientId) return { success: true };

  const { error } = await auth.supabase.from('pools').update({ client_id: clientId }).eq('id', poolId);
  if (error) return { error: error.message };
  revalidatePool(poolId, [clientId, pool.client_id as string]);
  return { success: true };
}

/** Corrige los datos de la pileta (dirección, barrio, alias, tipo y notas). El titular se cambia con "Hacer titular". */
export async function updatePoolAction(poolId: string, _prevState: unknown, formData: FormData) {
  const auth = await requireRole(OWNER_ROLES);
  if (!auth.ok) return { error: auth.error };
  if (!isUuid(poolId)) return { error: 'Pileta inválida' };

  const text = (key: string, max: number) => {
    const v = (formData.get(key) as string | null)?.trim() ?? '';
    return v ? v.slice(0, max) : null;
  };
  const poolType = (formData.get('pool_type') as string | null) || null;
  if (poolType && !(POOL_TYPES as readonly string[]).includes(poolType)) return { error: 'Tipo de pileta inválido' };

  const { data, error } = await auth.supabase
    .from('pools')
    .update({
      address: text('address', 200),
      neighborhood: text('neighborhood', 100),
      nickname: text('nickname', 100),
      pool_type: poolType,
      notes: text('notes', 1000),
    })
    .eq('id', poolId)
    .select('id, client_id');
  if (error) return { error: error.message };
  // Con RLS, una pileta que no se puede tocar no devuelve error: devuelve 0 filas
  if (!data || data.length === 0) return { error: 'Pileta inválida' };
  revalidatePool(poolId, [data[0].client_id as string]);
  return { success: true };
}

/** Cada cuánto se visita la pileta (semanal, quincenal o mensual): lo usa la sugerencia del itinerario. */
export async function setPoolFrequencyAction(poolId: string, frequency: string) {
  const auth = await requireRole(OWNER_ROLES);
  if (!auth.ok) return { error: auth.error };
  if (!isUuid(poolId) || !isFrequency(frequency)) return { error: 'Datos inválidos' };
  const { data, error } = await auth.supabase.from('pools').update({ frequency }).eq('id', poolId).select('id, client_id');
  if (error) return { error: error.message };
  if (!data || data.length === 0) return { error: 'Pileta inválida' };
  revalidatePool(poolId, [data[0].client_id as string]);
  return { success: true };
}

/** "Ubicar en el mapa": busca la dirección de la pileta en OpenStreetMap y guarda las coordenadas. */
export async function ubicarPiletaAction(poolId: string) {
  const auth = await requireRole(OWNER_ROLES);
  if (!auth.ok) return { error: auth.error };
  if (!isUuid(poolId)) return { error: 'Datos inválidos' };
  const { data: pool } = await auth.supabase.from('pools').select('address, neighborhood, city').eq('id', poolId).maybeSingle();
  if (!pool) return { error: 'Pileta inválida' };
  const texto = textoParaBuscar(pool as { address: string | null; neighborhood: string | null; city: string | null });
  if (!texto) return { error: 'La pileta no tiene dirección: cargala primero' };

  const coords = await buscarDireccion(texto);
  if (!coords) return { error: 'No se encontró la dirección en el mapa. Pegá las coordenadas o el link de Google Maps a mano.' };

  const { data, error } = await auth.supabase
    .from('pools')
    .update({ lat: coords.lat, lng: coords.lng, located_at: new Date().toISOString(), location_source: 'auto' })
    .eq('id', poolId)
    .select('id, client_id');
  if (error) return { error: error.message };
  if (!data || data.length === 0) return { error: 'Pileta inválida' };
  revalidatePool(poolId, [data[0].client_id as string]);
  return { success: true, ...coords };
}

/** Corrige la ubicación a mano: coordenadas o un link de Google Maps. Vacío = sin ubicar. */
export async function guardarUbicacionAction(poolId: string, texto: string) {
  const auth = await requireRole(OWNER_ROLES);
  if (!auth.ok) return { error: auth.error };
  if (!isUuid(poolId) || typeof texto !== 'string') return { error: 'Datos inválidos' };
  const vacio = !texto.trim();
  const coords = vacio ? null : parseCoordenadas(texto);
  if (!vacio && !coords) return { error: 'No se entienden las coordenadas: pegá algo como -34.4708, -58.5286 o el link de Google Maps' };

  const { data, error } = await auth.supabase
    .from('pools')
    .update(coords
      ? { lat: coords.lat, lng: coords.lng, located_at: new Date().toISOString(), location_source: 'manual' }
      : { lat: null, lng: null, located_at: null, location_source: null })
    .eq('id', poolId)
    .select('id, client_id');
  if (error) return { error: error.message };
  if (!data || data.length === 0) return { error: 'Pileta inválida' };
  revalidatePool(poolId, [data[0].client_id as string]);
  return { success: true };
}
