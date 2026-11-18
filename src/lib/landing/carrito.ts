/**
 * Carrito de la landing: vive solo en el celular (localStorage), sin cuentas ni pagos online.
 * Arma el mensaje de WhatsApp para Pancho con productos, cantidades y total estimado.
 */
import { formatoPrecio } from "./consulta";

export type ItemCarrito = { id: string; nombre: string; precioCents: number; cantidad: number; imagen?: string; detalle?: string };

// Solo rutas propias o https (lo guardado en el celu no es de fiar)
const imagenSegura = (v: unknown): string | undefined =>
  typeof v === "string" && v.length < 500 && ((v.startsWith("/") && !v.startsWith("//")) || v.startsWith("https://")) ? v : undefined;

export const MAX_CANTIDAD = 99;
export const LIMITES_CARRITO = { nombre: 80, direccion: 160 } as const;
export const CLAVE_CARRITO = "pancho-carrito-v1";

const acotar = (n: number) => Math.min(MAX_CANTIDAD, Math.max(0, Math.floor(n)));

/** Suma `delta` unidades de un producto (si llega a 0 lo saca). */
export function cambiarCantidad(items: ItemCarrito[], producto: Omit<ItemCarrito, "cantidad">, delta: number): ItemCarrito[] {
  const actual = items.find((i) => i.id === producto.id);
  const cantidad = acotar((actual?.cantidad ?? 0) + delta);
  if (!actual) return cantidad > 0 ? [...items, { ...producto, cantidad }] : items;
  return cantidad > 0 ? items.map((i) => (i.id === producto.id ? { ...i, cantidad } : i)) : items.filter((i) => i.id !== producto.id);
}

export const cantidadDe = (items: ItemCarrito[], id: string): number => items.find((i) => i.id === id)?.cantidad ?? 0;
export const unidades = (items: ItemCarrito[]): number => items.reduce((n, i) => n + i.cantidad, 0);
export const totalCents = (items: ItemCarrito[]): number => items.reduce((n, i) => n + i.cantidad * i.precioCents, 0);

/** Lee lo guardado descartando cualquier cosa que no tenga la forma esperada. */
export function leerCarrito(crudo: string | null): ItemCarrito[] {
  try {
    const datos: unknown = JSON.parse(crudo ?? "[]");
    if (!Array.isArray(datos)) return [];
    const items: ItemCarrito[] = [];
    for (const d of datos) {
      if (!d || typeof d !== "object") continue;
      const { id, nombre, precioCents, cantidad, imagen, detalle } = d as Record<string, unknown>;
      if (typeof id !== "string" || typeof nombre !== "string" || typeof precioCents !== "number" || typeof cantidad !== "number") continue;
      if (!Number.isFinite(precioCents) || precioCents < 0 || acotar(cantidad) < 1 || items.some((i) => i.id === id)) continue;
      items.push({
        id,
        nombre: nombre.slice(0, 120),
        precioCents: Math.floor(precioCents),
        cantidad: acotar(cantidad),
        ...(imagenSegura(imagen) && { imagen: imagenSegura(imagen) }),
        ...(typeof detalle === "string" && detalle && { detalle: detalle.slice(0, 60) }),
      });
    }
    return items;
  } catch {
    return [];
  }
}

export function errorDelPedido(nombre: string, direccion: string): string | null {
  if (!nombre.trim()) return "Escribí tu nombre.";
  if (!direccion.trim()) return "Escribí tu dirección (calle, número y localidad).";
  return null;
}

export function mensajePedido(items: ItemCarrito[], nombre: string, direccion: string): string {
  const lineas = items.map((i) => `• ${i.cantidad} x ${i.nombre}${i.detalle ? ` (${i.detalle})` : ""} — ${formatoPrecio(i.cantidad * i.precioCents)}`);
  return [
    "Hola Pancho! Quiero hacer este pedido:",
    "",
    ...lineas,
    "",
    `Total: ${formatoPrecio(totalCents(items))}`,
    "",
    `Nombre: ${nombre.trim().slice(0, LIMITES_CARRITO.nombre)}`,
    `Dirección: ${direccion.trim().slice(0, LIMITES_CARRITO.direccion)}`,
    "",
    "Gracias!",
  ].join("\n");
}
