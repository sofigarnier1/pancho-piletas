'use client';

import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { ArrowDown, ArrowUp, Download, LayoutGrid, Search, Share2, Table2 } from 'lucide-react';
import { toast } from 'sonner';
import { buscar, ordenar, siguienteOrden, totales, type Columna, type Orden } from '@/lib/tabla';
import { compartirExcel, descargarExcel } from '@/lib/excel-archivo';

export type ColumnaUI<T> = Columna<T> & {
  /** Cómo se ve la celda (si no, el valor tal cual). */
  celda?: (fila: T) => ReactNode;
  /** Texto largo que puede ocupar varias líneas (por ejemplo, notas). */
  largo?: boolean;
  /** Formato del total (por ejemplo, "12,5 L"). */
  formatoTotal?: (total: number) => ReactNode;
};

export type Filtro<T> = { id: string; etiqueta: string; aplica: (fila: T) => boolean };
export type Resalte = 'amber' | 'red' | 'gray' | null;
type Vista = 'tabla' | 'tarjetas';

type Props<T> = {
  /** Identifica la tabla: se usa para recordar la vista en este dispositivo y en los data-testid. */
  id: string;
  /** Título del Excel y del archivo. */
  titulo: string;
  filas: readonly T[];
  columnas: readonly ColumnaUI<T>[];
  claveFila: (fila: T) => string;
  /** Cómo se ve cada registro en la vista Tarjetas. */
  tarjeta: (fila: T) => ReactNode;
  alTocarFila?: (fila: T) => void;
  filtros?: readonly Filtro<T>[];
  filtroInicial?: string;
  ordenInicial?: Orden;
  resaltar?: (fila: T) => Resalte;
  buscador?: string;
  vacio?: ReactNode;
  /** Botones propios de la pantalla, a la derecha de la barra. */
  extra?: ReactNode;
  /** Qué pasa al tocar una fila (se muestra arriba de la tabla). */
  ayudaFila?: string;
};

const fmt = (n: number) => n.toLocaleString('es-AR', { maximumFractionDigits: 2 });

function leerVista(id: string): Vista | null {
  try {
    const v = window.localStorage.getItem(`vista:${id}`);
    return v === 'tabla' || v === 'tarjetas' ? v : null;
  } catch {
    return null;
  }
}

/**
 * Tabla tipo Excel del backoffice: se lee de un vistazo sin entrar a cada registro. Tocar el título de una columna
 * ordena; la búsqueda filtra; abajo van los totales. "Tabla" o "Tarjetas" se recuerda en este dispositivo.
 */
export function TablaExcel<T>({
  id, titulo, filas, columnas, claveFila, tarjeta, alTocarFila, filtros, filtroInicial, ordenInicial = null, resaltar,
  buscador = 'Buscar...', vacio, extra, ayudaFila = 'Tocá una fila para ver o cambiar sus datos.',
}: Props<T>) {
  const [texto, setTexto] = useState('');
  const [orden, setOrden] = useState<Orden>(ordenInicial);
  const [filtro, setFiltro] = useState(filtroInicial ?? filtros?.[0]?.id ?? '');
  const [vista, setVista] = useState<Vista>('tabla');
  const [ocupado, setOcupado] = useState(false);

  // La vista se decide en el navegador: la elegida antes en este dispositivo, o tarjetas en pantallas chicas
  useEffect(() => {
    const guardada = leerVista(id);
    const inicial = guardada ?? (window.matchMedia('(max-width: 639px)').matches ? 'tarjetas' : 'tabla');
    setVista(inicial);
  }, [id]);

  const cambiarVista = (v: Vista) => {
    setVista(v);
    try { window.localStorage.setItem(`vista:${id}`, v); } catch { /* sin almacenamiento: vale para esta visita */ }
  };

  const visibles = useMemo(() => {
    const f = filtros?.find((x) => x.id === filtro);
    const filtradas = f ? filas.filter(f.aplica) : filas;
    return ordenar(buscar(filtradas, columnas, texto), columnas, orden);
  }, [filas, columnas, filtros, filtro, texto, orden]);
  const tot = useMemo(() => totales(visibles, columnas), [visibles, columnas]);
  const hayTotales = Object.keys(tot).length > 0;

  const exportar = async (modo: 'bajar' | 'compartir') => {
    setOcupado(true);
    try {
      if (modo === 'bajar') {
        await descargarExcel(titulo, visibles, columnas);
      } else {
        const r = await compartirExcel(titulo, visibles, columnas);
        if (r === 'descargado') toast.info('Se descargó el Excel: adjuntalo en el chat de WhatsApp que se abrió');
      }
    } catch {
      toast.error('No se pudo armar el Excel. Probá de nuevo.');
    } finally {
      setOcupado(false);
    }
  };

  return (
    <div className="xl-root" data-testid={`tabla-${id}`}>
      <div className="bo-toolbar">
        <div className="relative flex-1 min-w-48 max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <input
            type="search"
            aria-label="Buscar en la tabla"
            placeholder={buscador}
            value={texto}
            onChange={(e) => setTexto(e.target.value)}
            className="bo-search"
            data-testid={`tabla-${id}-buscar`}
          />
        </div>
        {filtros && filtros.length > 1 && (
          <div className="bo-segmented">
            {filtros.map((f) => (
              <button key={f.id} type="button" data-active={filtro === f.id} onClick={() => setFiltro(f.id)}>
                {f.etiqueta}
              </button>
            ))}
          </div>
        )}
        <div className="flex flex-wrap items-center gap-2 sm:ml-auto">
          {extra}
          <div className="bo-segmented" role="group" aria-label="Vista">
            <button type="button" data-active={vista === 'tabla'} onClick={() => cambiarVista('tabla')} data-testid={`tabla-${id}-vista-tabla`}>
              <span className="inline-flex items-center gap-1"><Table2 className="w-3.5 h-3.5" /> Tabla</span>
            </button>
            <button type="button" data-active={vista === 'tarjetas'} onClick={() => cambiarVista('tarjetas')} data-testid={`tabla-${id}-vista-tarjetas`}>
              <span className="inline-flex items-center gap-1"><LayoutGrid className="w-3.5 h-3.5" /> Tarjetas</span>
            </button>
          </div>
          <button type="button" className="bo-btn" disabled={ocupado || visibles.length === 0} onClick={() => exportar('bajar')} data-testid={`tabla-${id}-excel`}>
            <Download /> Descargar Excel
          </button>
          <button type="button" className="bo-btn" disabled={ocupado || visibles.length === 0} onClick={() => exportar('compartir')} data-testid={`tabla-${id}-compartir`}>
            <Share2 /> Compartir
          </button>
        </div>
      </div>

      <p className="px-5 pt-3 text-xs text-muted-foreground" data-testid={`tabla-${id}-cantidad`}>
        {visibles.length === filas.length ? `${filas.length} en total` : `${visibles.length} de ${filas.length}`}
        {alTocarFila ? ` · ${ayudaFila}` : ''}
      </p>

      {visibles.length === 0 ? (
        <div className="bo-empty">{vacio ?? (texto ? `Sin resultados para "${texto}"` : 'No hay nada para mostrar')}</div>
      ) : vista === 'tarjetas' ? (
        <div className="xl-cards" data-testid={`tabla-${id}-tarjetas`}>
          {visibles.map((f) => {
            const r = resaltar?.(f);
            const cls = `xl-card ${r && r !== 'gray' ? `xl-${r}` : ''}`;
            return alTocarFila ? (
              <button key={claveFila(f)} type="button" className={cls} onClick={() => alTocarFila(f)} data-testid="tabla-tarjeta">
                {tarjeta(f)}
              </button>
            ) : (
              <div key={claveFila(f)} className={cls} data-testid="tabla-tarjeta">{tarjeta(f)}</div>
            );
          })}
        </div>
      ) : (
        <div className="xl-wrap mt-3">
          <table className="xl">
            <thead>
              <tr>
                {columnas.map((c) => (
                  <th key={c.id} className={c.numerica ? 'xl-num' : undefined} aria-sort={orden?.columna === c.id ? (orden.sentido === 'asc' ? 'ascending' : 'descending') : undefined}>
                    <button type="button" onClick={() => setOrden(siguienteOrden(orden, c.id))} title="Ordenar por esta columna">
                      {c.titulo}
                      {orden?.columna === c.id && (orden.sentido === 'asc' ? <ArrowUp className="w-3.5 h-3.5" /> : <ArrowDown className="w-3.5 h-3.5" />)}
                    </button>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {visibles.map((f) => {
                const r = resaltar?.(f);
                return (
                  <tr
                    key={claveFila(f)}
                    className={[alTocarFila ? 'xl-click' : '', r ? `xl-${r}` : ''].join(' ').trim() || undefined}
                    onClick={alTocarFila ? () => alTocarFila(f) : undefined}
                    data-testid="tabla-fila"
                  >
                    {columnas.map((c) => {
                      const cls = [c.numerica ? 'xl-num' : '', c.largo ? 'xl-wrapcell' : ''].join(' ').trim() || undefined;
                      if (c.celda) return <td key={c.id} className={cls}>{c.celda(f)}</td>;
                      const v = c.valor(f);
                      return <td key={c.id} className={cls}>{v === null || v === '' ? '' : typeof v === 'number' && !c.codigo ? fmt(v) : v}</td>;
                    })}
                  </tr>
                );
              })}
            </tbody>
            {hayTotales && (
              <tfoot>
                <tr data-testid={`tabla-${id}-totales`}>
                  {columnas.map((c, i) => (
                    <td key={c.id} className={c.numerica ? 'xl-num' : undefined}>
                      {c.id in tot ? (c.formatoTotal ? c.formatoTotal(tot[c.id]) : fmt(tot[c.id])) : i === 0 ? 'Total' : ''}
                    </td>
                  ))}
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      )}
    </div>
  );
}
