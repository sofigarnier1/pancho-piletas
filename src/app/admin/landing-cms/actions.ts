'use server';

import { revalidatePath } from 'next/cache';
import { requireRole, CMS_ROLES } from '@/lib/auth/require-role';

const SECTION_RE = /^[a-z_]{1,40}$/;
const KEY_RE = /^[a-z0-9_]{1,60}$/;
const MAX_VALUE_LENGTH = 2000;
// La lista de testimonios es un JSON con varios textos y enlaces de fotos.
const MAX_LIST_LENGTH = 20000;
const LIST_KEYS = new Set(['testimonios.items']);

export async function saveSectionAction(
  section: string,
  updates: Record<string, string | number>,
): Promise<{ success?: boolean; error?: string }> {
  const auth = await requireRole(CMS_ROLES);
  if (!auth.ok) return { error: auth.error };

  if (!SECTION_RE.test(section)) return { error: 'Sección inválida' };

  const now = new Date().toISOString();
  const rows: { section: string; key: string; value: string | number; updated_by: string; updated_at: string }[] = [];
  for (const [key, value] of Object.entries(updates)) {
    if (!KEY_RE.test(key)) return { error: `Clave inválida: ${key}` };
    if (typeof value !== 'string' && typeof value !== 'number') return { error: `Valor inválido para ${key}` };
    if (typeof value === 'string' && value.length > (LIST_KEYS.has(`${section}.${key}`) ? MAX_LIST_LENGTH : MAX_VALUE_LENGTH)) {
      return { error: `El texto de "${key}" es demasiado largo` };
    }
    rows.push({ section, key, value, updated_by: auth.user.id, updated_at: now });
  }

  // Un solo upsert en lote (antes: uno por clave, con estado parcial si fallaba a mitad)
  const { error } = await auth.supabase
    .from('landing_content')
    .upsert(rows, { onConflict: 'section,key' });
  if (error) return { error: error.message };

  revalidatePath('/');
  revalidatePath('/admin/landing-cms');
  return { success: true };
}
