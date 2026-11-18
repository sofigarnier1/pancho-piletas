// Planilla mensual del service, como la planilla en papel: una fila por pileta con N°, cliente (titular), dirección,
// lo que pasó cada semana del mes y el cloro. Sin precios. Todo puro: la pantalla busca los datos y acá se arma.
import { CHLORINE_TYPES, isChlorineType, type ChlorineType } from '@/lib/chlorine';
import { chlorineTotalsText, type ChlorineTotal } from '@/lib/staff-work';

export const WEEKS = 5;

/** Semana del mes por día: 1–7 → 0, 8–14 → 1, 15–21 → 2, 22–28 → 3, 29–31 → 4. Cada día de la semana cae una vez por columna. */
export const weekOfMonth = (date: string): number => Math.min(WEEKS - 1, Math.floor((Number(date.slice(8, 10)) - 1) / 7));

/** Los días que abarca cada semana del mes ("1–7", …, "29–31"); la quinta puede no existir (febrero). */
export function weekRanges(from: string, to: string): (string | null)[] {
  const last = Number(to.slice(8, 10));
  return Array.from({ length: WEEKS }, (_, w) => {
    const a = w * 7 + 1;
    if (a > last) return null;
    const b = w === WEEKS - 1 ? last : Math.min(a + 6, last);
    return a === b ? String(a) : `${a}–${b}`;
  });
}

export type PlanillaItem = {
  id: string;
  date: string;
  status: string;
  service_type: string | null;
  pool_id: string;
  pool: { nickname: string | null; address: string | null; neighborhood: string | null; clientName: string | null; clientNumber: number | null };
};

export type PlanillaLog = { itinerary_item_id: string | null; pool_id: string; chlorine_type: string | null; chlorine_amount: number | string | null };

export type Mark = 'S' | 'D' | 'X' | 'NE' | '·';
export type Cell = { date: string; mark: Mark; itemId: string };

export type PlanillaRow = {
  poolId: string;
  number: number | null;
  client: string;
  address: string;
  weeks: Cell[][];
  done: number;
  chlorine: string[];
  /** Pileta activa sin ninguna visita agendada en el mes. */
  sinAgendar: boolean;
};

/** Pileta activa (para que salgan todas, aunque no tengan visitas en el mes). */
export type PlanillaPool = { id: string } & PlanillaItem['pool'];

export const MARK_LABEL: Record<Mark, string> = {
  S: 'Service hecho', D: 'Desagote hecho', X: 'Salteada', NE: 'No estaba el cliente', '·': 'Pendiente',
};

export function markOf(status: string, serviceType: string | null): Mark {
  if (status === 'done') return serviceType === 'desagote' ? 'D' : 'S';
  if (status === 'skipped') return 'X';
  if (status === 'no_client') return 'NE';
  return '·';
}

/**
 * Arma las filas: una por pileta activa (`pools`) y por cada pileta con visitas en el mes, ordenadas por N° de cliente
 * (los sin N° al final) y nombre. Las activas sin visitas quedan marcadas `sinAgendar`.
 */
export function buildPlanilla(items: PlanillaItem[], logs: PlanillaLog[], pools: PlanillaPool[] = []): PlanillaRow[] {
  const rows = new Map<string, PlanillaRow & { cl: Record<ChlorineType, ChlorineTotal> }>();
  const fila = (poolId: string, p: PlanillaItem['pool']) => {
    let r = rows.get(poolId);
    if (!r) {
      r = {
        poolId,
        number: p.clientNumber ?? null,
        client: p.clientName || 'Sin cliente',
        address: [p.address || p.nickname || 'Sin dirección', p.neighborhood].filter(Boolean).join(', '),
        weeks: Array.from({ length: WEEKS }, () => []),
        done: 0,
        chlorine: [],
        sinAgendar: true,
        cl: { liquido: { amount: 0, withoutAmount: 0 }, granulado: { amount: 0, withoutAmount: 0 }, pastilla: { amount: 0, withoutAmount: 0 } },
      };
      rows.set(poolId, r);
    }
    return r;
  };
  for (const it of [...items].sort((a, b) => a.date.localeCompare(b.date))) {
    const r = fila(it.pool_id, it.pool);
    r.sinAgendar = false;
    r.weeks[weekOfMonth(it.date)].push({ date: it.date, mark: markOf(it.status, it.service_type), itemId: it.id });
    if (it.status === 'done') r.done += 1;
  }
  for (const p of pools) fila(p.id, p);
  const inMonth = new Set(items.map((i) => i.id));
  for (const l of logs) {
    // Solo el cloro de las visitas del mes que están en la planilla
    if (!l.itinerary_item_id || !inMonth.has(l.itinerary_item_id)) continue;
    const r = rows.get(l.pool_id);
    if (!r || !isChlorineType(l.chlorine_type)) continue;
    const n = l.chlorine_amount === null || l.chlorine_amount === '' ? NaN : Number(l.chlorine_amount);
    if (Number.isFinite(n) && n > 0) r.cl[l.chlorine_type].amount += n;
    else r.cl[l.chlorine_type].withoutAmount += 1;
  }
  return [...rows.values()]
    .map(({ cl, ...r }) => {
      for (const t of CHLORINE_TYPES) cl[t].amount = Math.round(cl[t].amount * 100) / 100;
      return { ...r, chlorine: chlorineTotalsText(cl) };
    })
    .sort((a, b) =>
      (a.number ?? Infinity) - (b.number ?? Infinity) || a.client.localeCompare(b.client, 'es') || a.address.localeCompare(b.address, 'es'));
}
