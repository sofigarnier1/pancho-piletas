/** Ayudas de clientes y piletas que comparten las pantallas del backoffice y sus acciones. */

export const POOL_TYPES = ['fibra', 'hormigon', 'liner', 'otro'] as const;
export type PoolType = (typeof POOL_TYPES)[number];

export const POOL_TYPE_LABEL: Record<string, string> = {
  fibra: 'Fibra', hormigon: 'Hormigón', liner: 'Liner', otro: 'Otro',
};

/** Nombre para comparar: sin mayúsculas, acentos ni espacios de más. */
export function normalizeName(name: string): string {
  return name
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

/** Clientes que se llaman igual (es solo un aviso: puede haber dos "Juan García"). */
export function sameNameClients<T extends { full_name: string }>(name: string, clients: T[]): T[] {
  const n = normalizeName(name);
  if (!n) return [];
  return clients.filter((c) => normalizeName(c.full_name) === n);
}

/**
 * N° de cliente escrito en el formulario: vacío → null; entero mayor que 0 → número;
 * cualquier otra cosa → 'invalid'.
 */
export function parseClientNumber(raw: string | null | undefined): number | null | 'invalid' {
  const s = (raw ?? '').trim();
  if (!s) return null;
  if (!/^\d+$/.test(s)) return 'invalid';
  const n = Number(s);
  return n > 0 && n <= 2147483647 ? n : 'invalid';
}

/** Próximo N° libre para sugerir: el más alto + 1. */
export function nextClientNumber(numbers: (number | null | undefined)[]): number {
  return numbers.reduce<number>((max, n) => (typeof n === 'number' && n > max ? n : max), 0) + 1;
}

type PoolLike = { nickname?: string | null; address?: string | null };

/** Cómo se nombra una pileta en las listas: alias, si no la dirección, si no "Pileta sin dirección". */
export function poolTitle(pool: PoolLike | null | undefined): string {
  return pool?.nickname?.trim() || pool?.address?.trim() || 'Pileta sin dirección';
}

/** Relación 1 a 1 embebida por Supabase: según el caso llega como objeto o como lista. */
export function embedOne<T>(value: T | T[] | null | undefined): T | null {
  if (Array.isArray(value)) return value[0] ?? null;
  return value ?? null;
}
