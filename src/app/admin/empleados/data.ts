// Lecturas de la pantalla Empleados y del historial de registros. Solo para el dueño (y el súper admin):
// la pantalla lo controla con requireRole y la base lo vuelve a exigir con RLS.
import { describeHistory, type HistoryEntry, type HistoryRow } from '@/lib/staff-work';
import { embedOne, poolTitle } from '@/lib/clients';
import type { CambiosContexto } from './CambiosLista';
import type { createSupabaseServerClient } from '@/lib/supabase/server';

type Supabase = Awaited<ReturnType<typeof createSupabaseServerClient>>;

export const STAFF = ['employee', 'owner', 'super_admin'] as const;

const HISTORY_COLS = 'id, service_log_id, action, changed_by, changed_at, old_data, new_data';

/** Nombres de las personas y de las piletas que aparecen en el historial. */
async function contexto(supabase: Supabase, rows: HistoryRow[]): Promise<CambiosContexto> {
  const people = new Set<string>();
  const pools = new Set<string>();
  for (const r of rows) {
    if (r.changed_by) people.add(r.changed_by);
    for (const d of [r.old_data, r.new_data]) {
      if (typeof d?.employee_id === 'string') people.add(d.employee_id);
      if (typeof d?.pool_id === 'string') pools.add(d.pool_id);
    }
  }
  const [{ data: profs }, { data: pls }] = await Promise.all([
    people.size ? supabase.from('profiles').select('id, full_name').in('id', [...people]) : Promise.resolve({ data: [] }),
    pools.size
      ? supabase.from('pools').select('id, nickname, address, profiles!pools_client_id_fkey (full_name)').in('id', [...pools])
      : Promise.resolve({ data: [] }),
  ]);
  const names: Record<string, string> = {};
  for (const p of (profs ?? []) as { id: string; full_name: string | null }[]) names[p.id] = p.full_name || 'Sin nombre';
  const poolNames: Record<string, string> = {};
  for (const p of (pls ?? []) as unknown as { id: string; nickname: string | null; address: string | null; profiles: { full_name: string } | null }[]) {
    const client = embedOne(p.profiles)?.full_name;
    poolNames[p.id] = `${poolTitle(p)}${client ? ` · ${client}` : ''}`;
  }
  return { names, pools: poolNames };
}

function traducir(rows: HistoryRow[], ctx: CambiosContexto): HistoryEntry[] {
  return rows.map((r) => describeHistory(r, (id) => ctx.names[id] ?? 'Alguien que ya no está'));
}

/** Los cambios de un mes (por fecha del cambio), del más nuevo al más viejo. Con persona: los que hizo o los de sus registros. */
export async function cambiosDelMes(supabase: Supabase, from: string, to: string, personaId: string | null, limit = 300) {
  // El mes va de las 0 h del primer día a las 0 h del día siguiente al último, en hora argentina
  const desde = `${from}T00:00:00-03:00`;
  const hasta = new Date(new Date(`${to}T00:00:00-03:00`).getTime() + 86_400_000).toISOString();
  let q = supabase.from('service_log_history').select(HISTORY_COLS).gte('changed_at', desde).lt('changed_at', hasta);
  if (personaId) q = q.or(`changed_by.eq.${personaId},new_data->>employee_id.eq.${personaId},old_data->>employee_id.eq.${personaId}`);
  const { data, error } = await q.order('changed_at', { ascending: false }).limit(limit + 1);
  const rows = (data ?? []) as HistoryRow[];
  const ctx = await contexto(supabase, rows.slice(0, limit));
  return { entries: traducir(rows.slice(0, limit), ctx), ctx, more: rows.length > limit, error: error?.message ?? null };
}

/** Los cambios de los registros de una visita (también los de registros ya borrados), del más viejo al más nuevo. */
export async function cambiosDeLaVisita(supabase: Supabase, itemId: string) {
  const { data } = await supabase
    .from('service_log_history')
    .select(HISTORY_COLS)
    .or(`new_data->>itinerary_item_id.eq.${itemId},old_data->>itinerary_item_id.eq.${itemId}`)
    .order('changed_at', { ascending: true })
    .limit(500);
  const rows = (data ?? []) as HistoryRow[];
  const ctx = await contexto(supabase, rows);
  return { entries: traducir(rows, ctx), ctx };
}
