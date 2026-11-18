/**
 * Calculadora "¿cuánto cloro necesito?" (orientativa).
 * ⚠️ Las dosis de abajo son una regla común y están PENDIENTES DE CONFIRMAR con Pancho:
 * cambiar solo estas constantes cuando él las valide.
 */
export const LITROS_POR_PASTILLA_SEMANAL = 20000; // 1 pastilla de 200 g cada 20.000 litros, por semana
export const GRAMOS_POR_PASTILLA = 200;
export const SEMANAS_POR_MES = 4.33;

export type Medidas = { largo: number; ancho: number; profundidad: number };

const valido = (n: number) => Number.isFinite(n) && n > 0 && n <= 100;

/** Litros de una pileta rectangular (medidas en metros). 0 si falta o sobra algo. */
export function litrosDePileta({ largo, ancho, profundidad }: Medidas): number {
  if (![largo, ancho, profundidad].every(valido)) return 0;
  return Math.round(largo * ancho * profundidad * 1000);
}

/** Pastillas de 200 g por semana para mantenimiento, redondeado para arriba a media pastilla. */
export function pastillasPorSemana(litros: number): number {
  if (!(litros > 0)) return 0;
  return Math.max(0.5, Math.ceil((litros / LITROS_POR_PASTILLA_SEMANAL) * 2) / 2);
}

/** Kilos de pastillas que se usan en un mes. */
export function kgPorMes(pastillasSemana: number): number {
  return Math.round(((pastillasSemana * SEMANAS_POR_MES * GRAMOS_POR_PASTILLA) / 1000) * 10) / 10;
}

export type Recomendacion = { litros: number; pastillasSemana: number; kgMes: number };

export function recomendar(m: Medidas): Recomendacion | null {
  const litros = litrosDePileta(m);
  if (!litros) return null;
  const pastillasSemana = pastillasPorSemana(litros);
  return { litros, pastillasSemana, kgMes: kgPorMes(pastillasSemana) };
}
