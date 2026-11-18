// Depósito de cloro, ventas y reporte "Cloro del mes" (migración 34).
// El depósito guarda cada tipo en su unidad base: líquido en litros, granulado en kilos y pastillas en unidades.
// (El cloro que anota el empleado en un service va en gramos para el granulado: la base lo pasa a kilos.)

import { CHLORINE_TYPES, isChlorineType, type ChlorineType } from './chlorine';

export { CHLORINE_TYPES, isChlorineType, type ChlorineType };

type Unidad = { singular: string; plural: string; corta: string; por: string };

export const DEPOSITO_UNIDAD: Record<ChlorineType, Unidad> = {
  liquido:   { singular: 'litro',   plural: 'litros',    corta: 'L',  por: 'por litro' },
  granulado: { singular: 'kilo',    plural: 'kilos',     corta: 'kg', por: 'por kilo' },
  pastilla:  { singular: 'pastilla', plural: 'pastillas', corta: '',  por: 'por pastilla' },
};

export const DEPOSITO_LABEL: Record<ChlorineType, string> = {
  liquido: 'Cloro líquido', granulado: 'Cloro granulado', pastilla: 'Pastillas de cloro',
};

/** Etiqueta corta para botones y columnas. */
export const TIPO_LABEL: Record<ChlorineType, string> = {
  liquido: 'Líquido', granulado: 'Granulado', pastilla: 'Pastillas',
};

export const MAX_CANTIDAD = 1_000_000; // igual que ingresar_stock / sacar_merma
export const MAX_DEPOSITO = 100_000_000; // igual que ck_chlorine_stock_quantity

// ─── Categorías, segmentos y movimientos ───────────────────────────────────────────────────────

export type Categoria = 'cloro' | 'quimicos' | 'accesorios' | 'combos' | 'otros';
export const CATEGORIAS: Categoria[] = ['cloro', 'quimicos', 'accesorios', 'combos', 'otros'];
export const CATEGORIA_LABEL: Record<Categoria, string> = {
  cloro: 'Cloro', quimicos: 'Químicos', accesorios: 'Accesorios', combos: 'Combos', otros: 'Otros',
};
/** Las que puede elegir un producto de tipo "Otro" (el resto sale del tipo). */
export const CATEGORIAS_OTRO: Categoria[] = ['quimicos', 'accesorios', 'otros'];
export const isCategoria = (v: unknown): v is Categoria => typeof v === 'string' && (CATEGORIAS as string[]).includes(v);

export type Segmento = 'service' | 'cloro' | 'mostrador';
export const SEGMENTO_LABEL: Record<Segmento, string> = {
  service: 'Cliente de service', cloro: 'Solo cloro', mostrador: 'Mostrador',
};

export type TipoMovimiento =
  | 'ingreso' | 'venta' | 'pedido' | 'pedido_cancelado' | 'service' | 'service_corregido' | 'ajuste' | 'merma';
export const MOVIMIENTO_LABEL: Record<TipoMovimiento, string> = {
  ingreso: 'Ingreso',
  venta: 'Venta',
  pedido: 'Pedido online',
  pedido_cancelado: 'Pedido cancelado',
  service: 'Service',
  service_corregido: 'Service corregido',
  ajuste: 'Conteo / ajuste',
  merma: 'Merma',
};

// ─── Números ───────────────────────────────────────────────────────────────────────────────────

const fmtNum = (n: number) => n.toLocaleString('es-AR', { maximumFractionDigits: 3 });

/** "12,5 L", "3 kg", "1 pastilla", "40 pastillas". */
export function formatCantidad(tipo: ChlorineType, cantidad: number | string | null): string {
  const n = Number(cantidad ?? 0);
  const u = DEPOSITO_UNIDAD[tipo];
  if (u.corta) return `${fmtNum(n)} ${u.corta}`;
  return `${fmtNum(n)} ${n === 1 ? u.singular : u.plural}`;
}

/**
 * Cantidad escrita a mano → número. Acepta "2,5", "2.5", "1.000", "1.000,5" y "0.250". La coma es el decimal;
 * sin coma, un punto con 1 o 2 decimales (o "0.xxx") es decimal y si no, separa miles. Hasta 3 decimales.
 * null si no se entiende o es negativa.
 */
export function parseCantidad(input: string | null | undefined): number | null {
  if (typeof input !== 'string') return null;
  let t = input.replace(/\s/g, '');
  if (!t) return null;
  if (t.includes(',')) t = t.replace(/\./g, '').replace(',', '.');
  else if (/^\d+\.\d{1,2}$/.test(t) || /^0\.\d+$/.test(t)) { /* decimal con punto */ }
  else t = t.replace(/\./g, '');
  if (!/^\d+(\.\d{1,3})?$/.test(t)) return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
}

/** Positiva, con hasta 3 decimales, dentro del tope; las pastillas, enteras o por mitades. */
export function cantidadValida(tipo: ChlorineType | null, n: number | null, max = MAX_CANTIDAD): n is number {
  if (n === null || !Number.isFinite(n) || n <= 0 || n > max) return false;
  if (Math.abs(n * 1000 - Math.round(n * 1000)) > 1e-6) return false;
  if (tipo === 'pastilla' && Math.abs(n * 2 - Math.round(n * 2)) > 1e-9) return false;
  return true;
}

/** Cuántas unidades enteras de una presentación alcanzan con lo que hay en el depósito. */
export function alcanzaPara(deposito: number | string, contenido: number | string | null): number | null {
  const d = Number(deposito);
  const c = Number(contenido);
  if (!contenido || !Number.isFinite(c) || c <= 0) return null;
  return Math.max(0, Math.floor(d / c + 1e-9));
}

/** true si hay aviso configurado y la cantidad llegó a él (o está por debajo). */
export function stockBajo(cantidad: number | string, aviso: number | string | null): boolean {
  if (aviso === null || aviso === '') return false;
  return Number(cantidad) <= Number(aviso);
}

/** Total de una línea en centavos, redondeado igual que la base (round(cantidad × precio)). */
export const totalLinea = (cantidad: number, precioCents: number): number => Math.round(cantidad * precioCents);

// ─── Mes del reporte / historial ─────────────────────────────────────────────────────────────────

/** "2026-11" → { desde: "2026-11-01", hasta: "2026-11-30" }; null si no es un mes válido. */
export function rangoMes(mes: string | null | undefined): { desde: string; hasta: string } | null {
  if (typeof mes !== 'string' || !/^\d{4}-(0[1-9]|1[0-2])$/.test(mes)) return null;
  const [y, m] = mes.split('-').map(Number);
  const ultimo = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return { desde: `${mes}-01`, hasta: `${mes}-${String(ultimo).padStart(2, '0')}` };
}

/** Suma (o resta) meses a "YYYY-MM". */
export function moverMes(mes: string, delta: number): string {
  const [y, m] = mes.split('-').map(Number);
  const d = new Date(Date.UTC(y, m - 1 + delta, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
}

/** "noviembre de 2026". */
export function nombreMes(mes: string): string {
  const [y, m] = mes.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, 15)).toLocaleDateString('es-AR', { month: 'long', year: 'numeric', timeZone: 'UTC' });
}

// ─── Reporte "Cloro del mes" ─────────────────────────────────────────────────────────────────────

export type Canal = 'service' | 'venta_service' | 'venta_cloro' | 'mostrador';
export const CANALES: Canal[] = ['service', 'venta_service', 'venta_cloro', 'mostrador'];
export const CANAL_LABEL: Record<Canal, string> = {
  service: 'Aplicado en services',
  venta_service: 'Clientes de service',
  venta_cloro: 'Clientes solo de cloro',
  mostrador: 'Mostrador',
};

/** Una fila de reporte_cloro(desde, hasta). */
export type FilaReporte = {
  chlorine_type: string | null;
  category: string;
  product_name: string | null;
  canal: Canal;
  origen: 'manual' | 'online' | 'service';
  cantidad: number | string | null;
  importe_cents: number | string;
  movimientos: number | string;
};

type Celda = { cantidad: number; importe: number; online: number };
const celda = (): Celda => ({ cantidad: 0, importe: 0, online: 0 });

export type FilaCloro = { tipo: ChlorineType; canales: Record<Canal, Celda>; total: Celda };
export type FilaOtros = { categoria: Categoria; producto: string; cantidad: number; importe: number };

export type Reporte = {
  cloro: FilaCloro[];
  /** Total en pesos por canal (todas las filas de cloro). */
  importePorCanal: Record<Canal, number>;
  importeCloro: number;
  otros: FilaOtros[];
  importeOtros: number;
};

const redondear = (n: number) => Math.round(n * 1000) / 1000;

/** Arma la tabla del reporte: una fila por tipo de cloro (siempre los tres) y los otros productos por categoría. */
export function armarReporte(filas: readonly FilaReporte[]): Reporte {
  const cloro: FilaCloro[] = CHLORINE_TYPES.map((tipo) => ({
    tipo,
    canales: { service: celda(), venta_service: celda(), venta_cloro: celda(), mostrador: celda() },
    total: celda(),
  }));
  const importePorCanal: Record<Canal, number> = { service: 0, venta_service: 0, venta_cloro: 0, mostrador: 0 };
  const otrosMap = new Map<string, FilaOtros>();

  for (const f of filas) {
    const cantidad = Number(f.cantidad ?? 0);
    const importe = Number(f.importe_cents ?? 0);
    if (isChlorineType(f.chlorine_type)) {
      const fila = cloro.find((c) => c.tipo === f.chlorine_type)!;
      const c = fila.canales[f.canal];
      if (!c) continue;
      c.cantidad = redondear(c.cantidad + cantidad);
      c.importe += importe;
      if (f.origen === 'online') c.online = redondear(c.online + cantidad);
      fila.total.cantidad = redondear(fila.total.cantidad + cantidad);
      fila.total.importe += importe;
      if (f.origen === 'online') fila.total.online = redondear(fila.total.online + cantidad);
      importePorCanal[f.canal] += importe;
    } else {
      const categoria = isCategoria(f.category) ? f.category : 'otros';
      const producto = f.product_name ?? 'Sin nombre';
      const key = `${categoria}|${producto}`;
      const o = otrosMap.get(key) ?? { categoria, producto, cantidad: 0, importe: 0 };
      o.cantidad = redondear(o.cantidad + cantidad);
      o.importe += importe;
      otrosMap.set(key, o);
    }
  }

  const otros = [...otrosMap.values()].sort((a, b) =>
    CATEGORIAS.indexOf(a.categoria) - CATEGORIAS.indexOf(b.categoria) || a.producto.localeCompare(b.producto, 'es'));

  return {
    cloro,
    importePorCanal,
    importeCloro: cloro.reduce((s, f) => s + f.total.importe, 0),
    otros,
    importeOtros: otros.reduce((s, o) => s + o.importe, 0),
  };
}
