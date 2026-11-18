// Modo campo: el dueño (o el súper admin) usa la pantalla del empleado cuando sale a hacer piletas.
// Para el empleado, la base (RLS) ya devuelve solo lo suyo. El dueño puede leer todo el día, así que la pantalla
// le aplica la misma regla que la base aplica al empleado (employee_can_see_item, migración 26).
import type { UserRole } from '@/lib/supabase/user';

/** Quiénes pueden usar la pantalla del empleado. */
export const FIELD_ROLES: UserRole[] = ['employee', 'owner', 'super_admin'];

export const esModoCampo = (role: string | null | undefined): boolean => role === 'owner' || role === 'super_admin';

/**
 * ¿Esta visita es de "su día"? Igual que employee_can_see_item:
 * - si es suya (encargado = él), siempre;
 * - si va en un auto, solo si él va en ese auto ese día;
 * - si va sin auto, solo si no tiene encargado (la puede hacer cualquiera).
 */
export function esDeSuDia(
  item: { vehicle_id: string | null; assigned_employee_id: string | null },
  miAuto: string | null,
  userId: string,
): boolean {
  if (item.assigned_employee_id && item.assigned_employee_id === userId) return true;
  if (item.vehicle_id) return item.vehicle_id === miAuto;
  return item.assigned_employee_id === null;
}
