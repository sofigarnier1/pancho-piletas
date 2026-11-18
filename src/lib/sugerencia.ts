// Sugerencia del itinerario, SIN IA: reglas fijas sobre los datos que ya hay (etapa 6 del roadmap de Pancho).
// Nunca escribe nada: arma una propuesta que el dueño revisa, corrige y carga con "Agregar piletas" de siempre.
//
// Qué piletas van (de más a menos importante):
//   1. Las que quedaron sin hacer la semana pasada y nadie volvió a agendar.
//   2. Las que fueron el mismo día de la semana hace 1, 2 o 4 semanas, según su frecuencia (semanal, quincenal, mensual).
//   3. Las que "les toca": desde la última visita hecha pasaron los días de su frecuencia.
//   4. Las activas que nunca tuvieron una visita (van sin marcar: el dueño decide).
// No van: las que ya están ese día, las que ya tienen una visita en los 3 días siguientes, y las que se hicieron hace poco.
//
// En qué auto: el que tenía la visita de referencia (si sigue activo); si no, el que tiene piletas más cerca
// (por coordenadas), o del mismo barrio, o el que tiene menos paradas.
// En qué orden: el de la visita de referencia; las demás se intercalan donde menos alargan el recorrido.
import { addDays } from '@/lib/dates';
import { FREQUENCY_DAYS, distanciaKm, type Coords, type Frequency } from '@/lib/ubicacion';

export type PoolSug = {
  id: string;
  numero: number | null;
  cliente: string;
  lugar: string;
  barrio: string | null;
  frequency: Frequency;
  lat: number | null;
  lng: number | null;
};

/** Visitas cercanas a la fecha (unas 5 semanas para atrás y unos días para adelante). */
export type VisitaSug = { poolId: string; date: string; status: string; vehicleId: string | null; sortOrder: number };

export type PendienteSug = { poolId: string; date: string; estado: string };

export type ItemSugerido = {
  poolId: string;
  numero: number | null;
  cliente: string;
  lugar: string;
  barrio: string | null;
  motivo: string;
  /** Las que vienen marcadas para cargar (las "nunca visitadas" vienen sin marcar). */
  marcada: boolean;
  prioridad: 1 | 2 | 3 | 4;
};

export type GrupoSugerido = { vehicleId: string | null; vehicleName: string; items: ItemSugerido[] };

type Entrada = {
  fecha: string;
  pools: PoolSug[];
  visitas: VisitaSug[];
  autos: { id: string; name: string }[];
  /** Lo que ya está cargado ese día (pileta → auto). */
  enElDia: { poolId: string; vehicleId: string | null; sortOrder: number }[];
  pendientes: PendienteSug[];
};

const dm = (d: string) => `${Number(d.slice(8, 10))}/${Number(d.slice(5, 7))}`;
const diasEntre = (a: string, b: string) => Math.round((Date.parse(`${b}T12:00:00Z`) - Date.parse(`${a}T12:00:00Z`)) / 86_400_000);
const coordsDe = (p: PoolSug): Coords | null => (p.lat !== null && p.lng !== null ? { lat: p.lat, lng: p.lng } : null);

type Cand = ItemSugerido & { vehicleRef: string | null; ordenRef: number | null; coords: Coords | null };

export function sugerirDia({ fecha, pools, visitas, autos, enElDia, pendientes }: Entrada): GrupoSugerido[] {
  const yaEsta = new Set(enElDia.map((i) => i.poolId));
  const autosActivos = new Set(autos.map((a) => a.id));
  const porPileta = new Map<string, VisitaSug[]>();
  for (const v of visitas) porPileta.set(v.poolId, [...(porPileta.get(v.poolId) ?? []), v]);
  const pend = new Map(pendientes.map((p) => [p.poolId, p]));

  const cands: Cand[] = [];
  for (const p of pools) {
    if (yaEsta.has(p.id)) continue;
    const vs = porPileta.get(p.id) ?? [];
    const intervalo = FREQUENCY_DAYS[p.frequency];
    // Ya tiene una visita agendada en los próximos 3 días: no hace falta
    if (vs.some((v) => v.date > fecha && v.date <= addDays(fecha, 3))) continue;
    const hechas = vs.filter((v) => v.status === 'done' && v.date < fecha).map((v) => v.date).sort();
    const ultima = hechas.at(-1) ?? null;
    const base = { poolId: p.id, numero: p.numero, cliente: p.cliente, lugar: p.lugar, barrio: p.barrio, coords: coordsDe(p) };

    const pe = pend.get(p.id);
    if (pe) {
      const ref = vs.find((v) => v.date === pe.date) ?? null;
      cands.push({ ...base, motivo: `Quedó sin hacer el ${dm(pe.date)} (${pe.estado.toLowerCase()})`, marcada: true, prioridad: 1, vehicleRef: ref?.vehicleId ?? null, ordenRef: ref?.sortOrder ?? null });
      continue;
    }
    // Hecha hace poco (menos de su frecuencia, con 2 días de margen): todavía no le toca
    if (ultima && diasEntre(ultima, fecha) < intervalo - 2) continue;

    const mismoDia = vs.find((v) => v.date === addDays(fecha, -intervalo));
    if (mismoDia) {
      const semanas = intervalo / 7;
      cands.push({
        ...base,
        motivo: semanas === 1 ? 'Fue el mismo día la semana pasada' : `Fue el mismo día hace ${semanas} semanas (${p.frequency})`,
        marcada: true, prioridad: 2, vehicleRef: mismoDia.vehicleId, ordenRef: mismoDia.sortOrder,
      });
      continue;
    }
    if (ultima) {
      const ref = vs.filter((v) => v.date === ultima)[0];
      cands.push({ ...base, motivo: `Le toca: la última vez fue hace ${diasEntre(ultima, fecha)} días (${p.frequency})`, marcada: true, prioridad: 3, vehicleRef: ref?.vehicleId ?? null, ordenRef: null });
      continue;
    }
    if (vs.length === 0) {
      cands.push({ ...base, motivo: 'Todavía no tiene ninguna visita', marcada: false, prioridad: 4, vehicleRef: null, ordenRef: null });
    }
  }

  // Autos: primero los que tienen referencia; después, cerca de lo que ya va en cada auto
  const asignado = new Map<string, string | null>();
  const paradas = new Map<string | null, { coords: Coords | null; barrio: string | null }[]>();
  const sumar = (veh: string | null, c: { coords: Coords | null; barrio: string | null }) => paradas.set(veh, [...(paradas.get(veh) ?? []), c]);
  const poolById = new Map(pools.map((p) => [p.id, p]));
  for (const i of enElDia) {
    const p = poolById.get(i.poolId);
    sumar(i.vehicleId, { coords: p ? coordsDe(p) : null, barrio: p?.barrio ?? null });
  }
  const conRef = cands.filter((c) => c.vehicleRef && autosActivos.has(c.vehicleRef));
  for (const c of conRef) { asignado.set(c.poolId, c.vehicleRef); sumar(c.vehicleRef, c); }

  const opciones: (string | null)[] = autos.length ? autos.map((a) => a.id) : [null];
  for (const c of cands.filter((x) => !asignado.has(x.poolId)).sort((a, b) => a.prioridad - b.prioridad)) {
    let mejor: string | null = opciones[0];
    let mejorPuntaje = Infinity;
    for (const veh of opciones) {
      const ps = paradas.get(veh) ?? [];
      let puntaje: number;
      const conCoords = ps.filter((x) => x.coords);
      if (c.coords && conCoords.length) puntaje = Math.min(...conCoords.map((x) => distanciaKm(c.coords!, x.coords!)));
      else if (c.barrio && ps.some((x) => x.barrio === c.barrio)) puntaje = 1000 - ps.filter((x) => x.barrio === c.barrio).length;
      else puntaje = 10_000 + ps.length;
      if (puntaje < mejorPuntaje) { mejorPuntaje = puntaje; mejor = veh; }
    }
    asignado.set(c.poolId, mejor);
    sumar(mejor, c);
  }

  // Orden dentro de cada auto
  const nombre = new Map(autos.map((a) => [a.id, a.name]));
  const grupos: GrupoSugerido[] = [];
  for (const veh of [...new Set([...opciones, ...cands.map((c) => asignado.get(c.poolId) ?? null)])]) {
    const lista = cands.filter((c) => (asignado.get(c.poolId) ?? null) === veh);
    if (!lista.length) continue;
    grupos.push({ vehicleId: veh, vehicleName: veh ? nombre.get(veh) ?? 'Auto' : 'Sin auto', items: ordenar(lista).map(({ vehicleRef: _v, ordenRef: _o, coords: _c, ...i }) => i) });
  }
  return grupos;
}

/** Los que tienen orden de referencia, en ese orden; los demás con coordenadas, donde menos alargan; los sin coordenadas, al final por barrio. */
function ordenar(lista: Cand[]): Cand[] {
  const ruta = lista.filter((c) => c.ordenRef !== null).sort((a, b) => a.ordenRef! - b.ordenRef!);
  const conCoords = lista.filter((c) => c.ordenRef === null && c.coords);
  const sinCoords = lista.filter((c) => c.ordenRef === null && !c.coords)
    .sort((a, b) => (a.barrio ?? '').localeCompare(b.barrio ?? '', 'es') || (a.numero ?? 1e9) - (b.numero ?? 1e9));
  for (const c of conCoords) {
    if (!ruta.length) { ruta.push(c); continue; }
    let pos = ruta.length;
    let costo = Infinity;
    for (let i = 0; i <= ruta.length; i++) {
      const prev = ruta[i - 1]?.coords ?? null;
      const next = ruta[i]?.coords ?? null;
      const d = (a: Coords | null, b: Coords | null) => (a && b ? distanciaKm(a, b) : 0);
      const extra = d(prev, c.coords) + d(c.coords, next) - d(prev, next);
      if (extra <= costo + 1e-9) { costo = Math.min(costo, extra); pos = i; } // en empate, más al final
    }
    ruta.splice(pos, 0, c);
  }
  return [...ruta, ...sinCoords];
}
