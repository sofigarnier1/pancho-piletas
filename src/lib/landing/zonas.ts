/** Partidos de Zona Norte que se marcan en el mapa de "¿Llegamos a tu zona?". A confirmar con Pancho. */
export const ZONAS = ["Vicente López", "San Isidro", "San Fernando", "Tigre", "Escobar", "Pilar"] as const;

export type Servicio = "cloro" | "service";
/**
 * Qué partidos cubre cada servicio (botones del mapa). Hoy los dos cubren los 6;
 * la zona de venta de cloro es más amplia: cuando Pancho confirme la lista, sumar acá los partidos extra
 * (y marcarlos `nuestro` en mapa-zonas-datos).
 */
export const ZONAS_POR_SERVICIO: Record<Servicio, readonly string[]> = {
  cloro: ZONAS,
  service: ZONAS,
};
