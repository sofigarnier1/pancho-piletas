// Precios por cliente (migración 31). Todo en centavos. Cada precio rige desde una fecha hasta que empieza otro del mismo tipo.

export type PriceKind = 'service' | 'desagote' | 'cloro_liquido' | 'cloro_granulado' | 'cloro_pastilla';

export const PRICE_KINDS: PriceKind[] = ['service', 'desagote', 'cloro_liquido', 'cloro_granulado', 'cloro_pastilla'];

export const PRICE_LABEL: Record<PriceKind, string> = {
  service: 'Service',
  desagote: 'Desagote',
  cloro_liquido: 'Cloro líquido',
  cloro_granulado: 'Cloro granulado',
  cloro_pastilla: 'Cloro en pastillas',
};

/** Por qué se cobra cada precio. */
export const PRICE_UNIT: Record<PriceKind, string> = {
  service: 'por visita',
  desagote: 'por visita',
  cloro_liquido: 'por litro',
  cloro_granulado: 'por kilo',
  cloro_pastilla: 'por pastilla',
};

export const MAX_PRICE_CENTS = 10_000_000_000; // $100.000.000, igual que la base

export const isPriceKind = (v: unknown): v is PriceKind => typeof v === 'string' && (PRICE_KINDS as string[]).includes(v);

/**
 * "12500", "12.500", "12.500,50", "12500.5" o "$ 12.500" → centavos. Formato argentino: el punto separa miles y la coma
 * los decimales; un solo punto con 1 o 2 decimales se toma como decimal. null si no es un precio válido.
 */
export function parsePriceCents(input: string | null | undefined): number | null {
  if (typeof input !== 'string') return null;
  let t = input.replace(/\$/g, '').replace(/\s/g, '');
  if (!t) return null;
  if (t.includes(',')) t = t.replace(/\./g, '').replace(',', '.');
  else if (/^\d+\.\d{1,2}$/.test(t)) { /* decimal con punto */ }
  else t = t.replace(/\./g, '');
  if (!/^\d+(\.\d{1,2})?$/.test(t)) return null;
  const cents = Math.round(Number(t) * 100);
  return Number.isSafeInteger(cents) && cents >= 0 && cents <= MAX_PRICE_CENTS ? cents : null;
}

/** "$ 12.500" o "$ 12.500,50". */
export function formatPesos(cents: number): string {
  const n = cents / 100;
  return `$ ${n.toLocaleString('es-AR', { minimumFractionDigits: Number.isInteger(n) ? 0 : 2, maximumFractionDigits: 2 })}`;
}

export type PriceRow = { id: string; kind: string; price_cents: number; valid_from: string };

/** El precio que rige ese día para ese tipo (el de fecha "desde" más nueva que no pasa del día). */
export function precioVigente(prices: PriceRow[], kind: PriceKind, date: string): PriceRow | null {
  let best: PriceRow | null = null;
  for (const p of prices) {
    if (p.kind !== kind || p.valid_from > date) continue;
    if (!best || p.valid_from > best.valid_from) best = p;
  }
  return best;
}
