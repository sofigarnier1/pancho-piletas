/**
 * Bajar una tabla a Excel (.xlsx) o compartirla (por WhatsApp u otra app). Solo corre en el navegador.
 * La librería se carga recién cuando se toca el botón, para no sumar peso a las pantallas.
 */
import type { SheetData } from 'write-excel-file/universal';
import { filasExcel, nombreArchivo, type Columna } from './tabla';

const XLSX = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

async function armarBlob<T>(titulo: string, filas: readonly T[], columnas: readonly Columna<T>[]): Promise<Blob> {
  const { default: writeExcelFile } = await import('write-excel-file/universal');
  const data = filasExcel(filas, columnas) as unknown as SheetData;
  const blob = await writeExcelFile(data, {
    sheet: titulo.slice(0, 31).replace(/[\\/?*[\]:]/g, '-') || 'Hoja 1',
    columns: columnas.map((c) => ({ width: c.ancho ?? Math.max(10, Math.min(40, c.titulo.length + 4)) })),
    stickyRowsCount: 1,
    stickyColumnsCount: 1,
  }).toBlob();
  return blob.type ? blob : new Blob([blob], { type: XLSX });
}

function descargar(blob: Blob, archivo: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = archivo;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

export async function descargarExcel<T>(titulo: string, filas: readonly T[], columnas: readonly Columna<T>[]): Promise<void> {
  descargar(await armarBlob(titulo, filas, columnas), nombreArchivo(titulo));
}

/**
 * En el celular abre el menú de compartir del teléfono con el archivo (ahí se elige WhatsApp). Donde no se pueden
 * compartir archivos (WhatsApp Web en la computadora), lo descarga y abre WhatsApp para adjuntarlo.
 */
export async function compartirExcel<T>(
  titulo: string,
  filas: readonly T[],
  columnas: readonly Columna<T>[],
): Promise<'compartido' | 'descargado' | 'cancelado'> {
  const blob = await armarBlob(titulo, filas, columnas);
  const archivo = nombreArchivo(titulo);
  const file = new File([blob], archivo, { type: XLSX });
  if (typeof navigator !== 'undefined' && navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title: titulo });
      return 'compartido';
    } catch (e) {
      if (e instanceof DOMException && e.name === 'AbortError') return 'cancelado';
    }
  }
  descargar(blob, archivo);
  window.open(`https://wa.me/?text=${encodeURIComponent(`Te paso la planilla "${titulo}" (te la adjunto acá).`)}`, '_blank', 'noopener');
  return 'descargado';
}
