'use client';

// Tablas del reporte "Cloro del mes": el cloro por tipo y canal, y los otros productos. Se bajan a Excel.
import { TablaExcel, type ColumnaUI } from '@/components/tabla/TablaExcel';
import { formatPesos } from '@/lib/precios';
import {
  CANALES, CANAL_LABEL, CATEGORIA_LABEL, DEPOSITO_LABEL, formatCantidad, type Canal, type FilaCloro, type FilaOtros,
} from '@/lib/cloro';

const pesos = (c: number) => formatPesos(c);
const totalPesos = (t: number) => pesos(Math.round(t * 100));

const cant = (canal: Canal | 'total') => (f: FilaCloro) => (canal === 'total' ? f.total : f.canales[canal]);

// Cada tipo va en su unidad (litros, kilos, pastillas): las cantidades no se suman entre filas; los pesos sí.
const COLUMNAS_CLORO: ColumnaUI<FilaCloro>[] = [
  { id: 'tipo', titulo: 'Cloro', valor: (f) => DEPOSITO_LABEL[f.tipo], ancho: 20, celda: (f) => <span className="font-semibold text-foreground">{DEPOSITO_LABEL[f.tipo]}</span> },
  ...CANALES.flatMap((canal): ColumnaUI<FilaCloro>[] => [
    {
      id: `${canal}-cant`, titulo: CANAL_LABEL[canal], valor: (f) => cant(canal)(f).cantidad, numerica: true, ancho: 14,
      celda: (f) => {
        const c = cant(canal)(f);
        return c.cantidad ? (
          <span data-testid={`reporte-${f.tipo}-${canal}`}>
            {formatCantidad(f.tipo, c.cantidad)}
            {c.online ? <span className="block text-[11px] text-muted-foreground">{formatCantidad(f.tipo, c.online)} online</span> : null}
          </span>
        ) : '';
      },
    },
    {
      id: `${canal}-pesos`, titulo: `${CANAL_LABEL[canal]} ($)`, valor: (f) => cant(canal)(f).importe / 100, numerica: true, total: true,
      celda: (f) => (cant(canal)(f).importe ? pesos(cant(canal)(f).importe) : ''), formatoTotal: totalPesos,
    },
  ]),
  {
    id: 'total-cant', titulo: 'Total', valor: (f) => f.total.cantidad, numerica: true, ancho: 14,
    celda: (f) => <strong data-testid={`reporte-${f.tipo}-total`}>{formatCantidad(f.tipo, f.total.cantidad)}</strong>,
  },
  { id: 'total-pesos', titulo: 'Total ($)', valor: (f) => f.total.importe / 100, numerica: true, total: true, celda: (f) => <strong>{pesos(f.total.importe)}</strong>, formatoTotal: totalPesos },
];

export function ReporteCloro({ filas, mes }: { filas: FilaCloro[]; mes: string }) {
  return (
    <TablaExcel
      id="reporte-cloro"
      titulo={`Cloro del mes ${mes}`}
      filas={filas}
      columnas={COLUMNAS_CLORO}
      claveFila={(f) => f.tipo}
      vacio="No salió cloro este mes."
      tarjeta={(f) => (
        <div className="space-y-1">
          <p className="font-semibold text-foreground">{DEPOSITO_LABEL[f.tipo]}: {formatCantidad(f.tipo, f.total.cantidad)} · {pesos(f.total.importe)}</p>
          {CANALES.map((c) => (
            <p key={c} className="text-xs text-muted-foreground">
              {CANAL_LABEL[c]}: {formatCantidad(f.tipo, f.canales[c].cantidad)}{f.canales[c].importe ? ` · ${pesos(f.canales[c].importe)}` : ''}
            </p>
          ))}
        </div>
      )}
    />
  );
}

const COLUMNAS_OTROS: ColumnaUI<FilaOtros>[] = [
  { id: 'categoria', titulo: 'Categoría', valor: (f) => CATEGORIA_LABEL[f.categoria], buscable: true, ancho: 14 },
  { id: 'producto', titulo: 'Producto', valor: (f) => f.producto, buscable: true, ancho: 30, celda: (f) => <span className="font-semibold text-foreground">{f.producto}</span> },
  { id: 'cantidad', titulo: 'Unidades', valor: (f) => f.cantidad, numerica: true, total: true },
  { id: 'importe', titulo: 'Vendido ($)', valor: (f) => f.importe / 100, numerica: true, total: true, celda: (f) => pesos(f.importe), formatoTotal: totalPesos },
];

export function ReporteOtros({ filas, mes }: { filas: FilaOtros[]; mes: string }) {
  return (
    <TablaExcel
      id="reporte-otros"
      titulo={`Otros productos ${mes}`}
      filas={filas}
      columnas={COLUMNAS_OTROS}
      claveFila={(f) => `${f.categoria}|${f.producto}`}
      ordenInicial={{ columna: 'importe', sentido: 'desc' }}
      buscador="Buscar producto..."
      vacio="No se vendieron otros productos este mes."
      tarjeta={(f) => (
        <div className="space-y-1">
          <p className="font-semibold text-foreground">{f.producto}</p>
          <p className="text-xs text-muted-foreground">{CATEGORIA_LABEL[f.categoria]} · {f.cantidad.toLocaleString('es-AR')} u. · {pesos(f.importe)}</p>
        </div>
      )}
    />
  );
}
