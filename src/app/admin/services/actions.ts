'use server';

import { revalidatePath } from 'next/cache';
import { requireRole, isUuid, OWNER_ROLES } from '@/lib/auth/require-role';

// En un archivo "use server" solo se exportan funciones async: el tope se repite en el formulario
const NOTA_MES_MAX = 2000;
const MES = /^\d{4}-(0[1-9]|1[0-2])$/;

/**
 * Nota del dueño para una pileta en un mes (YYYY-MM), en la pantalla Services. Texto vacío = se borra la nota.
 * Quién y cuándo la escribió lo fija la base.
 */
export async function guardarNotaMesAction(poolId: string, mes: string, texto: string) {
  const auth = await requireRole(OWNER_ROLES);
  if (!auth.ok) return { error: auth.error };
  if (!isUuid(poolId) || typeof mes !== 'string' || !MES.test(mes) || typeof texto !== 'string') return { error: 'Datos inválidos' };
  const notes = texto.trim();
  if (notes.length > NOTA_MES_MAX) return { error: `La nota puede tener hasta ${NOTA_MES_MAX} caracteres` };
  const month = `${mes}-01`;
  const { supabase } = auth;

  if (!notes) {
    const { error } = await supabase.from('pool_month_notes').delete().eq('pool_id', poolId).eq('month', month);
    if (error) return { error: error.message };
  } else {
    const { error } = await supabase
      .from('pool_month_notes')
      .upsert({ pool_id: poolId, month, notes }, { onConflict: 'pool_id,month' });
    if (error) {
      if (error.code === '23503') return { error: 'Pileta no encontrada' };
      return { error: error.message };
    }
  }
  revalidatePath('/admin/services');
  return { success: true };
}
