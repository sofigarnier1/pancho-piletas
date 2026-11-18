'use server';

import { revalidatePath } from 'next/cache';
import { requireRole, isUuid, CMS_ROLES } from '@/lib/auth/require-role';

const TRIGGER_TYPES = ['purchase_online', 'purchase_manual', 'service', 'manual_grant'];
const COLOR_RE = /^#[0-9a-fA-F]{6}$/;
const MAX_MANUAL_POINTS = 100000;

// ─── Reglas de puntos ────────────────────────────────────────────────────────

export async function createRuleAction(_prevState: unknown, formData: FormData) {
  const auth = await requireRole(CMS_ROLES);
  if (!auth.ok) return { error: auth.error };
  const { supabase, user } = auth;

  const name = ((formData.get('name') as string | null) ?? '').trim();
  const description = (formData.get('description') as string | null)?.trim() || null;
  const triggerType = formData.get('trigger_type') as string;
  const pointsPer100 = parseInt(formData.get('points_per_100_ars') as string) || 1;
  const minAmountCents = Math.round(parseFloat(formData.get('min_amount') as string || '0') * 100);
  const startsAt = (formData.get('starts_at') as string) || null;
  const endsAt = (formData.get('ends_at') as string) || null;

  if (!name || !TRIGGER_TYPES.includes(triggerType)) return { error: 'Nombre y tipo de trigger son requeridos' };

  const { error } = await supabase.from('point_rules').insert({
    name,
    description,
    trigger_type: triggerType,
    points_per_100_ars: pointsPer100,
    min_amount_cents: minAmountCents,
    starts_at: startsAt || null,
    ends_at: endsAt || null,
    created_by: user.id,
  });

  if (error) return { error: error.message };
  revalidatePath('/admin/puntos');
  return { success: true };
}

export async function toggleRuleAction(ruleId: string, isActive: boolean) {
  const auth = await requireRole(CMS_ROLES);
  if (!auth.ok) return { error: auth.error };
  if (!isUuid(ruleId)) return { error: 'Regla inválida' };
  const { error } = await auth.supabase
    .from('point_rules')
    .update({ is_active: isActive })
    .eq('id', ruleId);
  if (error) return { error: error.message };
  revalidatePath('/admin/puntos');
  return { success: true };
}

export async function deleteRuleAction(ruleId: string) {
  const auth = await requireRole(CMS_ROLES);
  if (!auth.ok) return { error: auth.error };
  if (!isUuid(ruleId)) return { error: 'Regla inválida' };
  const { error } = await auth.supabase.from('point_rules').delete().eq('id', ruleId);
  if (error) return { error: error.message };
  revalidatePath('/admin/puntos');
  return { success: true };
}

// ─── Niveles ─────────────────────────────────────────────────────────────────

export async function createLevelAction(_prevState: unknown, formData: FormData) {
  const auth = await requireRole(CMS_ROLES);
  if (!auth.ok) return { error: auth.error };
  const { supabase } = auth;

  const name = ((formData.get('name') as string | null) ?? '').trim();
  const minPoints = parseInt(formData.get('min_points') as string) || 0;
  const color = (formData.get('color') as string) || '#1B5FA8';
  const sortOrder = parseInt(formData.get('sort_order') as string) || 0;
  const benefitsRaw = ((formData.get('benefits') as string | null) ?? '')
    .split('\n')
    .map((b) => b.trim())
    .filter(Boolean);

  if (!name) return { error: 'El nombre es requerido' };
  if (!COLOR_RE.test(color)) return { error: 'Color inválido' };

  const { error } = await supabase.from('client_levels').insert({
    name,
    min_points: minPoints,
    color,
    sort_order: sortOrder,
    benefits: benefitsRaw,
  });

  if (error) return { error: error.message };
  revalidatePath('/admin/puntos/niveles');
  return { success: true };
}

export async function updateLevelAction(_prevState: unknown, formData: FormData) {
  const auth = await requireRole(CMS_ROLES);
  if (!auth.ok) return { error: auth.error };
  const { supabase } = auth;

  const id = formData.get('id') as string;
  const name = ((formData.get('name') as string | null) ?? '').trim();
  const minPoints = parseInt(formData.get('min_points') as string) || 0;
  const color = (formData.get('color') as string) || '#1B5FA8';
  const sortOrder = parseInt(formData.get('sort_order') as string) || 0;
  const benefitsRaw = ((formData.get('benefits') as string | null) ?? '')
    .split('\n')
    .map((b) => b.trim())
    .filter(Boolean);

  if (!name || !isUuid(id)) return { error: 'Datos incompletos' };
  if (!COLOR_RE.test(color)) return { error: 'Color inválido' };

  const { error } = await supabase
    .from('client_levels')
    .update({ name, min_points: minPoints, color, sort_order: sortOrder, benefits: benefitsRaw })
    .eq('id', id);

  if (error) return { error: error.message };
  revalidatePath('/admin/puntos/niveles');
  return { success: true };
}

export async function deleteLevelAction(levelId: string) {
  const auth = await requireRole(CMS_ROLES);
  if (!auth.ok) return { error: auth.error };
  if (!isUuid(levelId)) return { error: 'Nivel inválido' };
  const { error } = await auth.supabase.from('client_levels').delete().eq('id', levelId);
  if (error) return { error: error.message };
  revalidatePath('/admin/puntos/niveles');
  return { success: true };
}

// ─── Asignación manual de puntos ─────────────────────────────────────────────

export async function assignPointsAction(_prevState: unknown, formData: FormData) {
  const auth = await requireRole(CMS_ROLES);
  if (!auth.ok) return { error: auth.error };
  const { supabase, user } = auth;

  const clientId = formData.get('client_id') as string;
  const points = parseInt(formData.get('points') as string);
  const notes = (formData.get('notes') as string | null)?.trim() || null;

  if (!isUuid(clientId)) return { error: 'Seleccioná un cliente' };
  if (Math.abs(points) > MAX_MANUAL_POINTS) return { error: `Máximo ${MAX_MANUAL_POINTS} puntos por asignación` };
  if (!points || isNaN(points) || points === 0) return { error: 'Ingresá una cantidad de puntos distinta de 0' };

  const { error } = await supabase.from('point_transactions').insert({
    client_id: clientId,
    points,
    source_type: 'manual_grant',
    notes,
    created_by: user.id,
  });

  if (error) return { error: error.message };
  revalidatePath('/admin/puntos/asignar');
  return { success: true };
}

export async function searchClientsAction(q: string) {
  const auth = await requireRole(CMS_ROLES);
  if (!auth.ok) return [];
  // Escapar comodines de LIKE para que el texto se busque literal
  const safe = String(q ?? '').slice(0, 60).replace(/[\\%_]/g, (c) => `\\${c}`);
  const { data } = await auth.supabase
    .from('profiles')
    .select('id, full_name, points_balance')
    .eq('role', 'client')
    .ilike('full_name', `%${safe}%`)
    .limit(8);
  return data ?? [];
}
