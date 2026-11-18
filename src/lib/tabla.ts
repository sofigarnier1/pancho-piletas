/**
 * Lógica de las tablas tipo Excel del backoffice (sin React): orden por columna, búsqueda, totales y las filas para
 * bajar a Excel. La usan `src/components/tabla/TablaExcel.tsx` y sus tests.
 */

export type Valor = string | number | null;

export type Columna<T> = {
  id: string;
  /** Título de la columna (también es el encabezado del Excel). */
  titulo: string;
  /** Valor de la celda: con este se ordena, se suma y se escribe en el Excel. */
  valor: (fila: T) => Valor;
  /** Columna de números: se alinea a la derecha y puede llevar total. */
  numerica?: boolean;
  /** Número que es un código (por ejemplo, el N° de cliente): se muestra tal cual, sin punto de miles. */
  codigo?: boolean;
  /** Suma la columna en la fila de totales. */
  total?: boolean;
  /** Entra en la búsqueda de arriba. */
  buscable?: boolean;
  /** Ancho en el Excel, en caracteres. */
  ancho?: number;
};

export type Orden = { columna: string; sentido: 'asc' | 'desc' } | null;

/** Texto para buscar y comparar: sin mayúsculas ni acentos. */
export const normalizar = (s: string): string =>
  s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();

/** Compara dos valores: los vacíos siempre al final; números como números y textos en orden alfabético español. */
export function comparar(a: Valor, b: Valor): number {
  const va = a === null || a === '' ? null : a;
  const vb = b === null || b === '' ? null : b;
  if (va === null && vb === null) return 0;
  if (va === null) return 1;
  if (vb === null) return -1;
  if (typeof va === 'number' && typeof vb === 'number') return va - vb;
  return String(va).localeCompare(String(vb), 'es', { numeric: true, sensitivity: 'base' });
}

/** Ordena sin modificar la lista original. Los vacíos quedan al final en los dos sentidos. */
export function ordenar<T>(filas: readonly T[], columnas: readonly Columna<T>[], orden: Orden): T[] {
  const copia = [...filas];
  if (!orden) return copia;
  const col = columnas.find((c) => c.id === orden.columna);
  if (!col) return copia;
  const signo = orden.sentido === 'asc' ? 1 : -1;
  return copia.sort((x, y) => {
    const a = col.valor(x);
    const b = col.valor(y);
    const vacioA = a === null || a === '';
    const vacioB = b === null || b === '';
    if (vacioA || vacioB) return comparar(a, b);
    return signo * comparar(a, b);
  });
}

/** Siguiente orden al tocar el título de una columna: ascendente → descendente → sin orden. */
export function siguienteOrden(actual: Orden, columna: string): Orden {
  if (!actual || actual.columna !== columna) return { columna, sentido: 'asc' };
  if (actual.sentido === 'asc') return { columna, sentido: 'desc' };
  return null;
}

/** Filtra por las columnas buscables. Todas las palabras tienen que aparecer (en cualquier columna). */
export function buscar<T>(filas: readonly T[], columnas: readonly Columna<T>[], texto: string): T[] {
  const palabras = normalizar(texto).split(' ').filter(Boolean);
  if (palabras.length === 0) return [...filas];
  const buscables = columnas.filter((c) => c.buscable);
  return filas.filter((f) => {
    const todo = normalizar(buscables.map((c) => c.valor(f) ?? '').join(' '));
    return palabras.every((p) => todo.includes(p));
  });
}

/** Totales de las columnas con `total`: la suma de los valores numéricos (redondeada a 2 decimales). */
export function totales<T>(filas: readonly T[], columnas: readonly Columna<T>[]): Record<string, number> {
  const out: Record<string, number> = {};
  for (const c of columnas) {
    if (!c.total) continue;
    const suma = filas.reduce((acc, f) => {
      const v = c.valor(f);
      return typeof v === 'number' && Number.isFinite(v) ? acc + v : acc;
    }, 0);
    out[c.id] = Math.round(suma * 100) / 100;
  }
  return out;
}

export type CeldaExcel = { value: Valor; fontWeight?: 'bold' } | null;

/**
 * Filas para el Excel: encabezado en negrita, una fila por registro y, si alguna columna suma, la fila "Total" al final.
 */
export function filasExcel<T>(filas: readonly T[], columnas: readonly Columna<T>[]): CeldaExcel[][] {
  const encabezado: CeldaExcel[] = columnas.map((c) => ({ value: c.titulo, fontWeight: 'bold' }));
  const cuerpo: CeldaExcel[][] = filas.map((f) => columnas.map((c) => {
    const v = c.valor(f);
    return v === null || v === '' ? null : { value: v };
  }));
  const tot = totales(filas, columnas);
  if (Object.keys(tot).length === 0) return [encabezado, ...cuerpo];
  const filaTotal: CeldaExcel[] = columnas.map((c, i) => {
    if (c.id in tot) return { value: tot[c.id], fontWeight: 'bold' };
    return i === 0 ? { value: 'Total', fontWeight: 'bold' } : null;
  });
  return [encabezado, ...cuerpo, filaTotal];
}

/** Nombre de archivo seguro: "Clientes y piletas 2026-11" → "clientes-y-piletas-2026-11.xlsx". */
export function nombreArchivo(base: string): string {
  const limpio = normalizar(base).replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
  return `${limpio || 'planilla'}.xlsx`;
}
