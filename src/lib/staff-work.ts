// Trabajo del equipo por mes (pantalla Empleados) y traducción del historial de registros de service.
// Todo es puro: las pantallas buscan los datos y acá se cuentan y se pasan a palabras.
import { CHLORINE_LABEL, CHLORINE_RULES, CHLORINE_TYPES, SERVICE_TYPE_LABEL, formatChlorine, isChlorineType, type ChlorineType } from '@/lib/chlorine';

// ---------------------------------------------------------------------------------------------
// Mes elegido (?mes=2026-11)
// ---------------------------------------------------------------------------------------------

export type Mes = { mes: string; from: string; to: string; prev: string; next: string; label: string };

const pad = (n: number) => String(n).padStart(2, '0');
const ym = (y: number, m: number) => {
  const d = new Date(Date.UTC(y, m - 1, 1));
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}`;
};

/** El mes pedido (YYYY-MM) o, si no es válido, el del día de hoy (YYYY-MM-DD, hora argentina). */
export function parseMes(raw: string | undefined | null, today: string): Mes {
  const ok = typeof raw === 'string' && /^\d{4}-(0[1-9]|1[0-2])$/.test(raw) && +raw.slice(0, 4) >= 2000 && +raw.slice(0, 4) <= 2100;
  const mes = ok ? raw! : today.slice(0, 7);
  const y = +mes.slice(0, 4);
  const m = +mes.slice(5, 7);
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const label = new Date(Date.UTC(y, m - 1, 15)).toLocaleDateString('es-AR', { month: 'long', year: 'numeric', timeZone: 'UTC' });
  return { mes, from: `${mes}-01`, to: `${mes}-${pad(last)}`, prev: ym(y, m - 1), next: ym(y, m + 1), label: label.charAt(0).toUpperCase() + label.slice(1) };
}

// ---------------------------------------------------------------------------------------------
// Totales por persona
// ---------------------------------------------------------------------------------------------

export type WorkLog = {
  id: string;
  employee_id: string;
  itinerary_item_id: string | null;
  date: string;
  service_type: string | null;
  chlorine_type: string | null;
  chlorine_amount: number | string | null;
};

export type ChlorineTotal = { amount: number; withoutAmount: number };

export type WorkSummary = {
  employeeId: string;
  visits: number;
  service: number;
  desagote: number;
  days: number;
  logs: number;
  chlorine: Record<ChlorineType, ChlorineTotal>;
};

const emptyChlorine = (): Record<ChlorineType, ChlorineTotal> => ({
  liquido: { amount: 0, withoutAmount: 0 },
  granulado: { amount: 0, withoutAmount: 0 },
  pastilla: { amount: 0, withoutAmount: 0 },
});

export const emptySummary = (employeeId: string): WorkSummary => ({
  employeeId, visits: 0, service: 0, desagote: 0, days: 0, logs: 0, chlorine: emptyChlorine(),
});

/**
 * Totales de cada persona. Una visita cuenta una vez por persona aunque esa persona tenga varios registros en ella
 * (si fueron dos, cada una la suma). El cloro se suma por tipo, en su unidad, sin convertir entre tipos.
 */
export function summarizeWork(logs: WorkLog[]): Map<string, WorkSummary> {
  const out = new Map<string, WorkSummary>();
  const visits = new Map<string, Map<string, string>>(); // persona → visita → tipo
  const days = new Map<string, Set<string>>();
  for (const l of logs) {
    const s = out.get(l.employee_id) ?? emptySummary(l.employee_id);
    out.set(l.employee_id, s);
    s.logs += 1;
    const v = visits.get(l.employee_id) ?? new Map<string, string>();
    visits.set(l.employee_id, v);
    v.set(l.itinerary_item_id ?? `registro:${l.id}`, l.service_type === 'desagote' ? 'desagote' : 'service');
    const d = days.get(l.employee_id) ?? new Set<string>();
    days.set(l.employee_id, d);
    d.add(l.date);
    if (isChlorineType(l.chlorine_type)) {
      const n = l.chlorine_amount === null || l.chlorine_amount === '' ? NaN : Number(l.chlorine_amount);
      if (Number.isFinite(n) && n > 0) s.chlorine[l.chlorine_type].amount += n;
      else s.chlorine[l.chlorine_type].withoutAmount += 1;
    }
  }
  for (const [id, s] of out) {
    const v = [...(visits.get(id)?.values() ?? [])];
    s.visits = v.length;
    s.desagote = v.filter((t) => t === 'desagote').length;
    s.service = s.visits - s.desagote;
    s.days = days.get(id)?.size ?? 0;
    // Evita colas de coma flotante (0,1 + 0,2)
    for (const t of CHLORINE_TYPES) s.chlorine[t].amount = Math.round(s.chlorine[t].amount * 100) / 100;
  }
  return out;
}

/**
 * Visitas por persona y por día (para la grilla "Por día"): una visita cuenta una vez por persona aunque tenga
 * varios registros en ella.
 */
export function visitasPorDia(logs: WorkLog[]): Map<string, Map<string, number>> {
  const vistos = new Set<string>();
  const out = new Map<string, Map<string, number>>();
  for (const l of logs) {
    const clave = `${l.employee_id}|${l.itinerary_item_id ?? `registro:${l.id}`}`;
    if (vistos.has(clave)) continue;
    vistos.add(clave);
    const dias = out.get(l.employee_id) ?? new Map<string, number>();
    out.set(l.employee_id, dias);
    dias.set(l.date, (dias.get(l.date) ?? 0) + 1);
  }
  return out;
}

/** Cuántas visitas marcó cada persona como salteadas o "no estaba el cliente" (`completed_by` de la visita). */
export function marcasPorPersona(items: { status: string; completed_by: string | null }[]): Map<string, { salteadas: number; noEstaba: number }> {
  const out = new Map<string, { salteadas: number; noEstaba: number }>();
  for (const i of items) {
    if (!i.completed_by || (i.status !== 'skipped' && i.status !== 'no_client')) continue;
    const m = out.get(i.completed_by) ?? { salteadas: 0, noEstaba: 0 };
    out.set(i.completed_by, m);
    if (i.status === 'skipped') m.salteadas += 1;
    else m.noEstaba += 1;
  }
  return out;
}

const fmt = (n: number) => n.toLocaleString('es-AR', { maximumFractionDigits: 2 });

/** "Líquido · 12,5 L", "Pastillas · 8 (y 2 veces sin cantidad)". Solo los tipos que se usaron. */
export function chlorineTotalsText(c: Record<ChlorineType, ChlorineTotal>): string[] {
  return CHLORINE_TYPES.flatMap((t) => {
    const { amount, withoutAmount } = c[t];
    if (amount === 0 && withoutAmount === 0) return [];
    const unit = CHLORINE_RULES[t].unitShort;
    const base = amount > 0 ? `${CHLORINE_LABEL[t]} · ${fmt(amount)}${unit ? ` ${unit}` : ''}` : CHLORINE_LABEL[t];
    const extra = withoutAmount === 0 ? '' : amount > 0
      ? ` (y ${withoutAmount === 1 ? '1 vez' : `${withoutAmount} veces`} sin cantidad)`
      : ` (${withoutAmount === 1 ? '1 vez' : `${withoutAmount} veces`}, sin cantidad)`;
    return [base + extra];
  });
}

// ---------------------------------------------------------------------------------------------
// Historial de cambios (service_log_history)
// ---------------------------------------------------------------------------------------------

export type HistoryRow = {
  id: string;
  service_log_id: string;
  action: 'insert' | 'update' | 'delete' | string;
  changed_by: string | null;
  changed_at: string;
  old_data: Record<string, unknown> | null;
  new_data: Record<string, unknown> | null;
};

export type FieldChange = { field: string; before: string; after: string };

export type HistoryEntry = {
  id: string;
  serviceLogId: string;
  action: 'insert' | 'update' | 'delete';
  verb: string;
  changedBy: string | null;
  changedAt: string;
  /** Día del registro (el de después; si se borró, el que tenía) */
  logDate: string | null;
  poolId: string | null;
  itemId: string | null;
  employeeId: string | null;
  /** Cómo quedó (alta) o cómo estaba (borrado), en palabras */
  snapshot: FieldChange[];
  /** Solo en las ediciones: qué cambió, antes y después */
  changes: FieldChange[];
};

export const HISTORY_VERB: Record<'insert' | 'update' | 'delete', string> = {
  insert: 'Registró', update: 'Editó', delete: 'Borró',
};

const str = (v: unknown): string | null => (typeof v === 'string' && v !== '' ? v : null);

const dateText = (d: string | null) => {
  if (!d || !/^\d{4}-\d{2}-\d{2}$/.test(d)) return '—';
  const [y, m, day] = d.split('-');
  return `${+day}/${+m}/${y}`;
};

/** Los datos de un registro que entiende una persona (sin ids internos ni marcas de tiempo). */
function readable(data: Record<string, unknown>, nameOf: (id: string) => string): FieldChange[] {
  const person = str(data.employee_id);
  const notes = str(data.notes);
  const type = str(data.service_type);
  return [
    { field: 'Quién lo hizo', before: '', after: person ? nameOf(person) : '—' },
    { field: 'Fecha', before: '', after: dateText(str(data.date)) },
    { field: 'Tipo de visita', before: '', after: type === 'desagote' || type === 'service' ? SERVICE_TYPE_LABEL[type] : '—' },
    { field: 'Cloro', before: '', after: formatChlorine(str(data.chlorine_type), (data.chlorine_amount as number | string | null) ?? null) ?? 'Sin cloro' },
    { field: 'Observaciones', before: '', after: notes ?? '—' },
  ];
}

/** Una fila del historial en palabras: qué hizo quién, y en las ediciones el antes y el después de cada dato que cambió. */
export function describeHistory(row: HistoryRow, nameOf: (id: string) => string): HistoryEntry {
  const action = row.action === 'update' || row.action === 'delete' ? row.action : 'insert';
  const data = (action === 'delete' ? row.old_data : row.new_data) ?? row.old_data ?? row.new_data ?? {};
  const after = readable(data, nameOf);
  let changes: FieldChange[] = [];
  if (action === 'update' && row.old_data && row.new_data) {
    const before = readable(row.old_data, nameOf);
    changes = after
      .map((a, i) => ({ field: a.field, before: before[i].after, after: a.after }))
      .filter((c) => c.before !== c.after);
  }
  return {
    id: row.id,
    serviceLogId: row.service_log_id,
    action,
    verb: HISTORY_VERB[action],
    changedBy: row.changed_by,
    changedAt: row.changed_at,
    logDate: str(data.date),
    poolId: str(data.pool_id),
    itemId: str(data.itinerary_item_id),
    employeeId: str(data.employee_id),
    snapshot: action === 'update' ? [] : after.filter((f) => f.after !== '—'),
    changes,
  };
}
