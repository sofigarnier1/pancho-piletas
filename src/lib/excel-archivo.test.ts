import { afterEach, describe, expect, it, vi } from 'vitest';
import { compartirExcel, descargarExcel } from './excel-archivo';
import type { Columna } from './tabla';

type Fila = { cliente: string; numero: number | null };
const filas: Fila[] = [{ cliente: 'Ana', numero: 101 }, { cliente: 'Beto', numero: null }];
const columnas: Columna<Fila>[] = [
  { id: 'numero', titulo: 'N°', valor: (f) => f.numero, numerica: true },
  { id: 'cliente', titulo: 'Cliente', valor: (f) => f.cliente },
];

/** Un .xlsx es un zip: empieza con "PK". */
async function esXlsx(blob: Blob) {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  return bytes[0] === 0x50 && bytes[1] === 0x4b;
}

/** Lo mínimo del navegador para descargar: un enlace que se toca y una URL temporal. */
function navegadorFalso() {
  const clicks: { href: string; download: string }[] = [];
  vi.stubGlobal('document', {
    createElement: () => {
      const a = { href: '', download: '', click: () => clicks.push({ href: a.href, download: a.download }), remove: () => {} };
      return a;
    },
    body: { appendChild: () => {} },
  });
  const blobs: Blob[] = [];
  vi.stubGlobal('URL', Object.assign(Object.create(URL), {
    createObjectURL: (b: Blob) => { blobs.push(b); return `blob:${blobs.length}`; },
    revokeObjectURL: () => {},
  }));
  const abiertas: string[] = [];
  vi.stubGlobal('window', { open: (u: string) => { abiertas.push(u); return null; } });
  return { clicks, blobs, abiertas };
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe('descargarExcel', () => {
  it('baja un .xlsx con el nombre de la tabla', async () => {
    vi.useFakeTimers();
    const nav = navegadorFalso();
    await descargarExcel('Services noviembre de 2026', filas, columnas);
    expect(nav.clicks).toHaveLength(1);
    expect(nav.clicks[0].download).toMatch(/\.xlsx$/);
    expect(nav.blobs[0].type).toBe('application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    expect(await esXlsx(nav.blobs[0])).toBe(true);
  });
});

describe('compartirExcel', () => {
  it('en el celular abre el menú de compartir con el archivo', async () => {
    const share = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal('navigator', { canShare: () => true, share });
    expect(await compartirExcel('Clientes y piletas', filas, columnas)).toBe('compartido');
    const { files, title } = share.mock.calls[0][0] as { files: File[]; title: string };
    expect(title).toBe('Clientes y piletas');
    expect(files[0].name).toMatch(/\.xlsx$/);
    expect(await esXlsx(files[0])).toBe(true);
  });

  it('si la persona cierra el menú de compartir, no descarga nada', async () => {
    const nav = navegadorFalso();
    vi.stubGlobal('navigator', { canShare: () => true, share: () => Promise.reject(new DOMException('cerró', 'AbortError')) });
    expect(await compartirExcel('Hoy', filas, columnas)).toBe('cancelado');
    expect(nav.clicks).toHaveLength(0);
  });

  it('donde no se pueden compartir archivos, lo descarga y abre WhatsApp con un mensaje', async () => {
    vi.useFakeTimers();
    const nav = navegadorFalso();
    vi.stubGlobal('navigator', {});
    expect(await compartirExcel('Hoy', filas, columnas)).toBe('descargado');
    expect(nav.clicks).toHaveLength(1);
    expect(nav.abiertas[0]).toMatch(/^https:\/\/wa\.me\/\?text=/);
    expect(decodeURIComponent(nav.abiertas[0])).toContain('"Hoy"');
  });
});
