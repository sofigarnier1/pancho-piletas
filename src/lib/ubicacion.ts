// Ubicación de las piletas (migración 33): coordenadas, distancias y búsqueda de la dirección en OpenStreetMap (Nominatim).

export type Coords = { lat: number; lng: number };

export const FREQUENCIES = ['semanal', 'quincenal', 'mensual'] as const;
export type Frequency = (typeof FREQUENCIES)[number];
export const FREQUENCY_LABEL: Record<Frequency, string> = { semanal: 'Semanal', quincenal: 'Quincenal', mensual: 'Mensual' };
/** Cada cuántos días le toca. */
export const FREQUENCY_DAYS: Record<Frequency, number> = { semanal: 7, quincenal: 14, mensual: 28 };
export const isFrequency = (v: unknown): v is Frequency => typeof v === 'string' && (FREQUENCIES as readonly string[]).includes(v);

const valid = (lat: number, lng: number) => Number.isFinite(lat) && Number.isFinite(lng) && Math.abs(lat) <= 90 && Math.abs(lng) <= 180;

/**
 * Lo que pega el dueño: "-34.4708, -58.5286", o un link de Google Maps ("…/@-34.4708,-58.5286,17z", "…?q=-34.47,-58.52",
 * "…!3d-34.47!4d-58.52"). null si no se entiende.
 */
export function parseCoordenadas(texto: string | null | undefined): Coords | null {
  if (typeof texto !== 'string') return null;
  const t = texto.trim();
  if (!t) return null;
  const num = String.raw`(-?\d{1,3}(?:\.\d+)?)`;
  const patrones = [
    new RegExp(String.raw`!3d${num}!4d${num}`),
    new RegExp(String.raw`@${num},${num}`),
    new RegExp(String.raw`[?&](?:q|query|ll|destination)=${num}(?:,|%2C)\s*${num}`, 'i'),
    new RegExp(String.raw`^${num}\s*[,;]\s*${num}$`),
    new RegExp(String.raw`^${num}\s+${num}$`),
  ];
  for (const re of patrones) {
    const m = t.match(re);
    if (m) {
      const lat = Number(m[1]);
      const lng = Number(m[2]);
      if (valid(lat, lng)) return { lat, lng };
    }
  }
  return null;
}

/** Distancia en km entre dos puntos (haversine): para 100 piletas en el GBA alcanza y sobra. */
export function distanciaKm(a: Coords, b: Coords): number {
  const rad = (d: number) => (d * Math.PI) / 180;
  const dLat = rad(b.lat - a.lat);
  const dLng = rad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * 6371 * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** El texto que se busca en el mapa: dirección, barrio, ciudad y país. null si no hay dirección. */
export function textoParaBuscar(p: { address: string | null; neighborhood: string | null; city: string | null }): string | null {
  if (!p.address?.trim()) return null;
  return [p.address.trim(), p.neighborhood?.trim(), p.city?.trim() || 'Buenos Aires', 'Argentina'].filter(Boolean).join(', ');
}

const NOMINATIM = 'https://nominatim.openstreetmap.org/search';

/**
 * Busca la dirección en OpenStreetMap (Nominatim). Gratis, con límite de 1 pedido por segundo: se usa de a una pileta.
 * Solo se manda la dirección (nada del cliente). null si no la encuentra o si el servicio no responde.
 */
export async function buscarDireccion(texto: string, fetchFn: typeof fetch = fetch): Promise<Coords | null> {
  const url = `${NOMINATIM}?${new URLSearchParams({ q: texto, format: 'jsonv2', limit: '1', countrycodes: 'ar' })}`;
  try {
    const res = await fetchFn(url, {
      headers: { 'User-Agent': 'CloroYPiletasPancho-backoffice/1.0', 'Accept-Language': 'es' },
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) return null;
    const data = (await res.json()) as { lat?: string; lon?: string }[];
    const first = Array.isArray(data) ? data[0] : null;
    if (!first) return null;
    const lat = Number(first.lat);
    const lng = Number(first.lon);
    return valid(lat, lng) ? { lat, lng } : null;
  } catch {
    return null;
  }
}
