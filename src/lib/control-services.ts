/**
 * Control de services por pileta (pantalla Services): cuántas veces se fue en el período, qué pasó en cada visita
 * y cuánto cloro se le puso. Todo puro: la pantalla busca los datos y acá se arma.
 */
import { isChlorineType } from '@/lib/chlorine';

export type ControlItem = {
  id: string;
  pool_id: string;
  date: string;
  status: string;
  service_type: string | null;
  vehicle_id: string | null;
};

export type ControlLog = {
  id: string;
  itinerary_item_id: string | null;
  pool_id: string;
  employee_id: string;
  date: string;
  service_type: string | null;
  chlorine_type: string | null;
  chlorine_amount: number | string | null;
  notes: string | null;
};

export type VisitaControl = {
  itemId: string | null;
  date: string;
  status: string;
  serviceType: 'service' | 'desagote';
  empleados: string[];
  cloro: { type: string; amount: number | null }[];
  notas: string[];
};

export type ControlPileta = {
  /** Visitas con al menos un registro de service (las veces que se fue). */
  fuimos: number;
  services: number;
  desagotes: number;
  salteadas: number;
  noEstaba: number;
  /** Visitas de días que ya pasaron que quedaron sin registrar. */
  sinHacer: number;
  /** Visitas que vienen (hoy o después) todavía pendientes. */
  programadas: number;
  liquido: number;
  granulado: number;
  pastillas: number;
  ultima: string | null;
  visitas: VisitaControl[];
};

const vacio = (): ControlPileta => ({
  fuimos: 0, services: 0, desagotes: 0, salteadas: 0, noEstaba: 0, sinHacer: 0, programadas: 0,
  liquido: 0, granulado: 0, pastillas: 0, ultima: null, visitas: [],
});

const redondear = (n: number) => Math.round(n * 100) / 100;

/**
 * Resumen por pileta. Una visita con registros cuenta una vez aunque tenga varios (fueron dos personas); un registro
 * sin visita del itinerario cuenta como una visita aparte. El cloro se suma por tipo, en su unidad.
 */
export function controlPorPileta(items: readonly ControlItem[], logs: readonly ControlLog[], hoy: string): Map<string, ControlPileta> {
  const out = new Map<string, ControlPileta>();
  const get = (poolId: string) => {
    const c = out.get(poolId) ?? vacio();
    out.set(poolId, c);
    return c;
  };

  const logsDe = new Map<string, ControlLog[]>();
  const sueltos: ControlLog[] = [];
  for (const l of logs) {
    if (l.itinerary_item_id) logsDe.set(l.itinerary_item_id, [...(logsDe.get(l.itinerary_item_id) ?? []), l]);
    else sueltos.push(l);
  }

  const agregarVisita = (poolId: string, v: VisitaControl, registros: ControlLog[]) => {
    const c = get(poolId);
    c.visitas.push(v);
    if (registros.length > 0) {
      c.fuimos += 1;
      if (v.serviceType === 'desagote') c.desagotes += 1;
      else c.services += 1;
      if (!c.ultima || v.date > c.ultima) c.ultima = v.date;
    } else if (v.status === 'skipped') c.salteadas += 1;
    else if (v.status === 'no_client') c.noEstaba += 1;
    else if (v.date < hoy) c.sinHacer += 1;
    else c.programadas += 1;
    for (const l of registros) {
      if (!isChlorineType(l.chlorine_type)) continue;
      const n = l.chlorine_amount === null || l.chlorine_amount === '' ? NaN : Number(l.chlorine_amount);
      if (!Number.isFinite(n) || n <= 0) continue;
      if (l.chlorine_type === 'liquido') c.liquido = redondear(c.liquido + n);
      else if (l.chlorine_type === 'granulado') c.granulado = redondear(c.granulado + n);
      else c.pastillas = redondear(c.pastillas + n);
    }
  };

  const visita = (base: { itemId: string | null; date: string; status: string; serviceType: string | null }, registros: ControlLog[]): VisitaControl => ({
    itemId: base.itemId,
    date: base.date,
    status: registros.length > 0 ? 'done' : base.status,
    serviceType: (registros[0]?.service_type ?? base.serviceType) === 'desagote' ? 'desagote' : 'service',
    empleados: [...new Set(registros.map((r) => r.employee_id))],
    cloro: registros.filter((r) => isChlorineType(r.chlorine_type)).map((r) => ({
      type: r.chlorine_type as string,
      amount: r.chlorine_amount === null || r.chlorine_amount === '' ? null : Number(r.chlorine_amount),
    })),
    notas: registros.map((r) => r.notes?.trim() ?? '').filter(Boolean),
  });

  for (const i of items) {
    const registros = logsDe.get(i.id) ?? [];
    agregarVisita(i.pool_id, visita({ itemId: i.id, date: i.date, status: i.status, serviceType: i.service_type }, registros), registros);
  }
  for (const l of sueltos) {
    agregarVisita(l.pool_id, visita({ itemId: null, date: l.date, status: 'done', serviceType: l.service_type }, [l]), [l]);
  }
  for (const c of out.values()) c.visitas.sort((a, b) => a.date.localeCompare(b.date));
  return out;
}

/** Días entre la última visita y hoy (null si nunca se fue). */
export function diasDesde(ultima: string | null, hoy: string): number | null {
  if (!ultima) return null;
  const ms = Date.parse(`${hoy}T12:00:00Z`) - Date.parse(`${ultima}T12:00:00Z`);
  return Math.max(0, Math.round(ms / 86_400_000));
}
