// Enlaces a Google Maps para el empleado: cómo llegar a una pileta y la ruta completa del día en orden.
// Formato oficial de "Maps URLs": https://developers.google.com/maps/documentation/urls/get-started

export type Parada = {
  address: string | null;
  neighborhood?: string | null;
  city?: string | null;
  lat: number | null;
  lng: number | null;
};

/** Paradas por tramo: el destino más 8 puntos intermedios (Google Maps abre hasta 9 intermedios). */
export const PARADAS_POR_TRAMO = 9;

const BASE = 'https://www.google.com/maps/dir/?api=1';

/** Dónde queda la parada para Maps: las coordenadas si las hay; si no, la dirección con barrio y localidad. */
export function lugar(p: Parada): string | null {
  if (p.lat !== null && p.lng !== null && Number.isFinite(p.lat) && Number.isFinite(p.lng)) return `${p.lat},${p.lng}`;
  const texto = [p.address, p.neighborhood, p.city].map((x) => x?.trim()).filter(Boolean).join(', ');
  return texto || null;
}

/** "Cómo llegar" a una pileta desde donde está el celular. null si no tiene dirección ni coordenadas. */
export function comoLlegarUrl(p: Parada): string | null {
  const destino = lugar(p);
  return destino ? `${BASE}&destination=${encodeURIComponent(destino)}&travelmode=driving` : null;
}

export type Tramo = { url: string; desde: number; hasta: number; paradas: number };

/**
 * La ruta completa en el orden del recorrido, partida en tramos de hasta 9 paradas. Cada tramo sale de donde
 * está el celular (al abrir el segundo, el empleado está en la última parada del primero).
 * Las paradas sin dirección se saltean. `desde`/`hasta` son las posiciones (1, 2, …) entre las que tienen dirección.
 */
export function rutaCompleta(paradas: readonly Parada[], porTramo = PARADAS_POR_TRAMO): Tramo[] {
  const lugares = paradas.map(lugar).filter((x): x is string => x !== null);
  const tramos: Tramo[] = [];
  for (let i = 0; i < lugares.length; i += porTramo) {
    const grupo = lugares.slice(i, i + porTramo);
    const destino = grupo[grupo.length - 1];
    const intermedios = grupo.slice(0, -1);
    let url = `${BASE}&destination=${encodeURIComponent(destino)}&travelmode=driving`;
    if (intermedios.length) url += `&waypoints=${intermedios.map(encodeURIComponent).join('%7C')}`;
    tramos.push({ url, desde: i + 1, hasta: i + grupo.length, paradas: grupo.length });
  }
  return tramos;
}
