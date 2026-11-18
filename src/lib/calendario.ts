/** Calendario del itinerario: la grilla del mes (semanas completas de lunes a domingo) y el estado de cada día. */

export type EstadoDia = 'sin-programar' | 'programado' | 'pendientes' | 'terminado';

export type VisitaDelDia = { status: string; vehicle_id: string | null };

export type ResumenDia = {
  estado: EstadoDia;
  total: number;
  hechas: number;
  /** Visitas que no se hicieron ni se resolvieron (solo cuenta en días que ya pasaron). */
  sinHacer: number;
  porAuto: { vehicleId: string | null; cantidad: number }[];
};

const RESUELTA = new Set(['done', 'skipped', 'no_client']);

/**
 * Estado de un día a simple vista:
 * - sin visitas → "sin-programar";
 * - pasado con alguna visita pendiente → "pendientes";
 * - todas resueltas (hechas, salteadas o "no estaba") → "terminado";
 * - si no → "programado" (hoy o un día que viene, o hoy con alguna hecha).
 */
export function resumenDia(visitas: readonly VisitaDelDia[], fecha: string, hoy: string): ResumenDia {
  const total = visitas.length;
  const hechas = visitas.filter((v) => v.status === 'done').length;
  const pendientes = visitas.filter((v) => !RESUELTA.has(v.status)).length;
  const porAutoMap = new Map<string | null, number>();
  for (const v of visitas) porAutoMap.set(v.vehicle_id, (porAutoMap.get(v.vehicle_id) ?? 0) + 1);
  const porAuto = [...porAutoMap].map(([vehicleId, cantidad]) => ({ vehicleId, cantidad }));

  let estado: EstadoDia;
  if (total === 0) estado = 'sin-programar';
  else if (pendientes === 0) estado = 'terminado';
  else if (fecha < hoy) estado = 'pendientes';
  else estado = 'programado';
  return { estado, total, hechas, sinHacer: fecha < hoy ? pendientes : 0, porAuto };
}

export type CeldaCalendario = { fecha: string; dia: number; delMes: boolean };

const iso = (d: Date) => d.toISOString().slice(0, 10);

/** Semanas completas (lunes a domingo) que cubren el mes; los días de los meses vecinos van con `delMes: false`. */
export function semanasDelMes(year: number, month: number): CeldaCalendario[][] {
  const primero = new Date(Date.UTC(year, month - 1, 1));
  const dowLunes = (primero.getUTCDay() + 6) % 7; // lunes = 0
  const inicio = new Date(primero);
  inicio.setUTCDate(1 - dowLunes);
  const ultimo = new Date(Date.UTC(year, month, 0));
  const finDow = (ultimo.getUTCDay() + 6) % 7;
  const fin = new Date(ultimo);
  fin.setUTCDate(ultimo.getUTCDate() + (6 - finDow));

  const semanas: CeldaCalendario[][] = [];
  for (const d = new Date(inicio); d <= fin; d.setUTCDate(d.getUTCDate() + 1)) {
    if (semanas.length === 0 || semanas[semanas.length - 1].length === 7) semanas.push([]);
    semanas[semanas.length - 1].push({ fecha: iso(d), dia: d.getUTCDate(), delMes: d.getUTCMonth() === month - 1 });
  }
  return semanas;
}
