// Cloro aplicado en un service: cada tipo se mide en su unidad (migración 22).
// Los topes son los mismos que exige la base (ck_service_logs_chlorine_by_unit).

export type ChlorineType = 'pastilla' | 'granulado' | 'liquido';
export type ServiceType = 'service' | 'desagote';

export const CHLORINE_TYPES: ChlorineType[] = ['liquido', 'granulado', 'pastilla'];

type Rule = { max: number; step: number; unit: string; unitShort: string };

export const CHLORINE_RULES: Record<ChlorineType, Rule> = {
  liquido:   { max: 500,    step: 0.01, unit: 'litros',    unitShort: 'L' },
  granulado: { max: 50_000, step: 1,    unit: 'gramos',    unitShort: 'g' },
  pastilla:  { max: 100,    step: 0.5,  unit: 'pastillas', unitShort: '' },
};

export const CHLORINE_LABEL: Record<ChlorineType, string> = {
  liquido: 'Líquido', granulado: 'Granulado', pastilla: 'Pastillas',
};

export const SERVICE_TYPE_LABEL: Record<ServiceType, string> = {
  service: 'Service', desagote: 'Desagote',
};

export const isChlorineType = (v: unknown): v is ChlorineType =>
  typeof v === 'string' && (CHLORINE_TYPES as string[]).includes(v);

/** true si la cantidad es válida para el tipo (positiva, dentro del tope y en el paso de la unidad). */
export function isValidChlorineAmount(type: ChlorineType, amount: number): boolean {
  const { max, step } = CHLORINE_RULES[type];
  if (!Number.isFinite(amount) || amount <= 0 || amount > max) return false;
  const steps = amount / step;
  return Math.abs(steps - Math.round(steps)) < 1e-9;
}

const fmt = (n: number) => n.toLocaleString('es-AR', { maximumFractionDigits: 2 });

/** "Líquido · 2,5 L", "Granulado · 300 g", "Pastillas · 1,5", o solo el tipo si no hay cantidad. */
export function formatChlorine(type: string | null, amount: number | string | null): string | null {
  if (!isChlorineType(type)) return null;
  const n = amount === null || amount === '' ? null : Number(amount);
  if (n === null || !Number.isFinite(n)) return CHLORINE_LABEL[type];
  const unit = CHLORINE_RULES[type].unitShort;
  return `${CHLORINE_LABEL[type]} · ${fmt(n)}${unit ? ` ${unit}` : ''}`;
}

/**
 * Selector de cloro del empleado (botones − y + y valores rápidos): cuánto sube o baja cada toque y qué
 * cantidades aparecen como atajo. Siempre caen en el paso de la unidad que exige la base.
 */
export const CHLORINE_PICKER: Record<ChlorineType, { delta: number; rapidos: number[] }> = {
  liquido:   { delta: 0.5, rapidos: [1, 2, 3, 5] },
  granulado: { delta: 50,  rapidos: [100, 200, 300, 500] },
  pastilla:  { delta: 0.5, rapidos: [1, 2, 3, 4] },
};

/** Suma (o resta) un toque de − / + a la cantidad: nunca baja de 0 ni pasa el tope. 0 = sin cantidad. */
export function stepChlorine(type: ChlorineType, current: number | null, direction: 1 | -1): number {
  const { delta } = CHLORINE_PICKER[type];
  const { max } = CHLORINE_RULES[type];
  const base = current !== null && Number.isFinite(current) ? current : 0;
  // Si la cantidad escrita a mano no cae en el paso del botón, el primer toque la redondea a ese paso
  const snapped = direction === 1 ? Math.floor(base / delta + 1e-9) * delta : Math.ceil(base / delta - 1e-9) * delta;
  const next = Math.round((snapped + direction * delta) * 100) / 100;
  return Math.min(max, Math.max(0, next));
}
