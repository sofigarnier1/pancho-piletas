'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Check, HandCoins, Plus } from 'lucide-react';
import { toast } from 'sonner';
import { TablaExcel, type ColumnaUI, type Filtro } from '@/components/tabla/TablaExcel';
import { Panel, PanelHeader, StatusBadge } from '@/components/admin/bo';
import { Button } from '@/components/ui/button';
import { formatPesos } from '@/lib/precios';
import { formatDateAR } from '@/lib/dates';
import { cargarPagoAction, confirmarCobroAction, confirmarCobrosDeAction } from './actions';

export type FilaDeuda = {
  clientId: string;
  numero: number | null;
  cliente: string;
  services: number;
  desagotes: number;
  cargos: number;
  pagos: number;
  saldo: number;
  conEmpleado: number;
  sinPrecio: number;
  ultimoPago: string | null;
};

const pesos = (c: number) => formatPesos(c);
const fecha = (d: string | null) => (d ? formatDateAR(d, { day: '2-digit', month: '2-digit', year: 'numeric' }) : '');

// En el Excel van en pesos (no en centavos)
const COLUMNAS: ColumnaUI<FilaDeuda>[] = [
  { id: 'numero', titulo: 'N°', valor: (f) => f.numero, numerica: true, codigo: true, buscable: true, ancho: 6 },
  { id: 'cliente', titulo: 'Cliente', valor: (f) => f.cliente, buscable: true, ancho: 28, celda: (f) => <span className="font-semibold text-foreground">{f.cliente}</span> },
  { id: 'services', titulo: 'Services', valor: (f) => f.services, numerica: true, total: true },
  { id: 'desagotes', titulo: 'Desagotes', valor: (f) => f.desagotes, numerica: true, total: true },
  { id: 'cargos', titulo: 'Lo hecho ($)', valor: (f) => f.cargos / 100, numerica: true, total: true, celda: (f) => pesos(f.cargos), formatoTotal: (t) => pesos(Math.round(t * 100)) },
  { id: 'pagos', titulo: 'Pagó ($)', valor: (f) => f.pagos / 100, numerica: true, total: true, celda: (f) => pesos(f.pagos), formatoTotal: (t) => pesos(Math.round(t * 100)) },
  {
    id: 'saldo', titulo: 'Debe ($)', valor: (f) => f.saldo / 100, numerica: true, total: true, formatoTotal: (t) => pesos(Math.round(t * 100)),
    celda: (f) => <strong className={f.saldo > 0 ? 'text-[#ad4d52]' : f.saldo < 0 ? 'text-[#28745b]' : ''} data-testid="deuda-saldo">{f.saldo < 0 ? `A favor ${pesos(-f.saldo)}` : pesos(f.saldo)}</strong>,
  },
  { id: 'empleado', titulo: 'Lo tiene un empleado ($)', valor: (f) => (f.conEmpleado ? f.conEmpleado / 100 : null), numerica: true, total: true, celda: (f) => (f.conEmpleado ? pesos(f.conEmpleado) : ''), formatoTotal: (t) => pesos(Math.round(t * 100)) },
  { id: 'ultimo', titulo: 'Último pago', valor: (f) => f.ultimoPago, ancho: 12, celda: (f) => fecha(f.ultimoPago) },
  { id: 'sinprecio', titulo: 'Sin precio', valor: (f) => (f.sinPrecio ? f.sinPrecio : null), numerica: true, celda: (f) => (f.sinPrecio ? <StatusBadge tone="amber">{f.sinPrecio} sin precio</StatusBadge> : '') },
];

const FILTROS: Filtro<FilaDeuda>[] = [
  { id: 'deben', etiqueta: 'Deben', aplica: (f) => f.saldo > 0 },
  { id: 'todos', etiqueta: 'Todos', aplica: () => true },
  { id: 'sin-precio', etiqueta: 'Sin precio', aplica: (f) => f.sinPrecio > 0 },
];

/** La deuda de cada cliente, de mayor a menor. Tocá una fila para ver el detalle. */
export function DeudaTabla({ filas }: { filas: FilaDeuda[] }) {
  const router = useRouter();
  return (
    <TablaExcel
      id="cobros"
      titulo="Cobros - deuda por cliente"
      filas={filas}
      columnas={COLUMNAS}
      claveFila={(f) => f.clientId}
      alTocarFila={(f) => router.push(`/admin/cobros/${f.clientId}`)}
      ayudaFila="Tocá un cliente para ver qué se le cobró y qué pagó."
      filtros={FILTROS}
      filtroInicial="deben"
      ordenInicial={{ columna: 'saldo', sentido: 'desc' }}
      resaltar={(f) => (f.sinPrecio > 0 ? 'amber' : null)}
      buscador="Buscar por nombre o N°..."
      vacio="Ningún cliente debe nada."
      tarjeta={(f) => (
        <div className="space-y-1">
          <p className="font-semibold text-foreground">{f.numero ? <span className="font-medium text-muted-foreground">N° {f.numero} · </span> : null}{f.cliente}</p>
          <p className="text-sm">Debe <strong>{pesos(f.saldo)}</strong></p>
          <p className="text-xs text-muted-foreground">{f.services} services · {f.desagotes} desagotes · pagó {pesos(f.pagos)}</p>
          {f.sinPrecio > 0 && <StatusBadge tone="amber">{f.sinPrecio} sin precio</StatusBadge>}
        </div>
      )}
    />
  );
}

export type CobroEnMano = { id: string; empleadoId: string; empleado: string; cliente: string; fecha: string; monto: number; nota: string | null };

/** Lo que cobraron los empleados y todavía no te entregaron. */
export function EnManoPanel({ cobros }: { cobros: CobroEnMano[] }) {
  const [pending, startTransition] = useTransition();
  const porEmpleado = new Map<string, CobroEnMano[]>();
  for (const c of cobros) porEmpleado.set(c.empleadoId, [...(porEmpleado.get(c.empleadoId) ?? []), c]);

  const confirmar = (id: string) =>
    startTransition(async () => {
      const r = await confirmarCobroAction(id);
      if (r.error) { toast.error(r.error); return; }
      toast.success('Cobro confirmado');
    });
  const confirmarTodo = (empleadoId: string) =>
    startTransition(async () => {
      const r = await confirmarCobrosDeAction(empleadoId);
      if (r.error) { toast.error(r.error); return; }
      toast.success(r.count === 1 ? 'Cobro confirmado' : `${r.count} cobros confirmados`);
    });

  return (
    <Panel className="mb-5" testId="en-mano">
      <PanelHeader icon={HandCoins} title="Lo tienen los empleados" bordered />
      {cobros.length === 0 ? (
        <p className="bo-empty !py-6">Nadie tiene plata cobrada sin entregarte.</p>
      ) : (
        [...porEmpleado.entries()].map(([empleadoId, lista]) => (
          <div key={empleadoId} className="border-b border-border last:border-0" data-testid="en-mano-empleado">
            <div className="flex items-center justify-between gap-2 px-5 pt-3">
              <p className="text-sm font-semibold text-foreground">
                {lista[0].empleado}: {pesos(lista.reduce((n, c) => n + c.monto, 0))}
              </p>
              <Button size="sm" variant="outline" disabled={pending} onClick={() => confirmarTodo(empleadoId)} data-testid="confirmar-todo">
                <Check /> Confirmar todo
              </Button>
            </div>
            <ul className="bo-rows">
              {lista.map((c) => (
                <li key={c.id} className="flex items-center gap-3 px-5 py-2.5" data-testid="en-mano-cobro">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm text-foreground"><strong className="tabular-nums">{pesos(c.monto)}</strong> de {c.cliente}</p>
                    <p className="truncate text-xs text-muted-foreground">{fecha(c.fecha)}{c.nota ? ` · “${c.nota}”` : ''}</p>
                  </div>
                  <Button size="sm" disabled={pending} onClick={() => confirmar(c.id)} data-testid="confirmar-cobro">Confirmar</Button>
                </li>
              ))}
            </ul>
          </div>
        ))
      )}
    </Panel>
  );
}

/** Cargar un pago que te hicieron a vos (efectivo, transferencia...). */
export function CargarPago({ clientes, hoy, clienteFijo }: { clientes: { id: string; nombre: string }[]; hoy: string; clienteFijo?: string }) {
  const [clientId, setClientId] = useState(clienteFijo ?? '');
  const [monto, setMonto] = useState('');
  const [dia, setDia] = useState(hoy);
  const [nota, setNota] = useState('');
  const [pending, startTransition] = useTransition();

  const guardar = (e: React.FormEvent) => {
    e.preventDefault();
    startTransition(async () => {
      const r = await cargarPagoAction(clientId, monto, dia, nota);
      if (r.error) { toast.error(r.error); return; }
      toast.success('Pago guardado');
      setMonto(''); setNota(''); if (!clienteFijo) setClientId('');
    });
  };

  return (
    <Panel className="mb-5" testId="cargar-pago">
      <PanelHeader icon={Plus} title="Cargar un pago" bordered />
      <form onSubmit={guardar} className="grid gap-2 p-4 sm:grid-cols-2 lg:grid-cols-[2fr_1fr_1fr_2fr_auto] lg:items-end">
        {!clienteFijo && (
          <label className="space-y-1 text-xs font-medium text-muted-foreground">
            Cliente
            <select className="h-10 w-full rounded-md border border-input bg-card px-3 text-sm text-foreground" value={clientId} onChange={(e) => setClientId(e.target.value)} required data-testid="pago-cliente">
              <option value="">Elegí el cliente...</option>
              {clientes.map((c) => <option key={c.id} value={c.id}>{c.nombre}</option>)}
            </select>
          </label>
        )}
        <label className="space-y-1 text-xs font-medium text-muted-foreground">
          Monto
          <input inputMode="decimal" placeholder="15.000" className="h-10 w-full rounded-md border border-input bg-card px-3 text-sm text-foreground" value={monto} onChange={(e) => setMonto(e.target.value)} required data-testid="pago-monto" />
        </label>
        <label className="space-y-1 text-xs font-medium text-muted-foreground">
          Fecha
          <input type="date" className="h-10 w-full rounded-md border border-input bg-card px-3 text-sm text-foreground" value={dia} onChange={(e) => e.target.value && setDia(e.target.value)} required data-testid="pago-fecha" />
        </label>
        <label className="space-y-1 text-xs font-medium text-muted-foreground">
          Nota (opcional)
          <input className="h-10 w-full rounded-md border border-input bg-card px-3 text-sm text-foreground" value={nota} onChange={(e) => setNota(e.target.value)} maxLength={500} placeholder="Transferencia, efectivo..." />
        </label>
        <Button type="submit" disabled={pending || !monto.trim() || !clientId} data-testid="pago-guardar">
          {pending ? 'Guardando...' : 'Guardar pago'}
        </Button>
      </form>
    </Panel>
  );
}
