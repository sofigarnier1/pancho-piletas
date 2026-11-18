// Lo que se carga en un registro de service (empleado o dueño) y cómo se valida antes de guardarlo.
import { isChlorineType, isValidChlorineAmount } from '@/lib/chlorine';

/** Lo que se carga en un registro de service. El tipo de visita (service o desagote) sale del itinerario. */
export type RegistroData = {
  chlorineType: string | null; // null = sin cloro
  chlorineAmount: number | null; // en la unidad del tipo: litros, gramos o pastillas
  notes?: string;
};

export type ChlorineColumns = {
  chlorine_applied: boolean;
  chlorine_type: string | null;
  chlorine_amount: number | null;
  notes: string | null;
};

/** Valida el cloro y devuelve las columnas a guardar, o el error a mostrar. */
export function chlorineColumns(data: RegistroData): { error: string } | ChlorineColumns {
  const notes = typeof data.notes === 'string' ? data.notes.trim().slice(0, 1000) || null : null;
  if (data.chlorineType === null || data.chlorineType === undefined || data.chlorineType === '') {
    return { chlorine_applied: false, chlorine_type: null, chlorine_amount: null, notes };
  }
  if (!isChlorineType(data.chlorineType)) return { error: 'Tipo de cloro inválido' };
  const amount = data.chlorineAmount;
  // La cantidad es opcional (se puede no saber), pero si viene tiene que tener sentido para la unidad
  if (amount !== null && amount !== undefined && !isValidChlorineAmount(data.chlorineType, amount)) {
    return { error: 'Cantidad de cloro inválida' };
  }
  return { chlorine_applied: true, chlorine_type: data.chlorineType, chlorine_amount: amount ?? null, notes };
}
