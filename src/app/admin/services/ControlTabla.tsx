'use client';

import { useMemo, useState, useTransition } from 'react';
import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { ExternalLink, NotebookPen } from 'lucide-react';
import { toast } from 'sonner';
import { TablaExcel, type ColumnaUI, type Filtro } from '@/components/tabla/TablaExcel';
import { StatusBadge, type BadgeTone } from '@/components/admin/bo';
import { Ventana } from '@/components/tabla/Ventana';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { guardarNotaMesAction } from './actions';
import { formatChlorine } from '@/lib/chlorine';
import { formatDateAR } from '@/lib/dates';
import type { VisitaControl } from '@/lib/control-services';

export type FilaControl = {
  poolId: string;
  numero: number | null;
  cliente: string;
  direccion: string;
  barrio: string | null;
  activa: boolean;
  fuimos: number;
  services: number;
  desagotes: number;
  salteadas: number;
  noEstaba: number;
  programadas: number;
  liquido: number;
  granulado: number;
  pastillas: number;
  ultima: string | null;
  diasSinVisita: number | null;
  visitas: VisitaControl[];
  /** Observaciones que cargó el equipo en las visitas del mes, con el día. */
  observaciones: string | null;
  /** Nota del dueño para esta pileta en este mes. */
  notaMes: string | null;
};

const NOTA_MAX = 2000;

const n = (v: number) => (v === 0 ? null : v);
const fecha = (d: string | null) => (d ? formatDateAR(d, { day: '2-digit', month: '2-digit' }) : '');
const ESTADO: Record<string, { label: string; tone: BadgeTone }> = {
  done: { label: 'Hecha', tone: 'green' },
  skipped: { label: 'Salteada', tone: 'gray' },
  no_client: { label: 'No estaba', tone: 'red' },
  pending: { label: 'Pendiente', tone: 'amber' },
};

/** Columnas de cada planilla: sin salteadas ni "no estaba" (eso se ve en el detalle de cada pileta). */
const columnas = (tipo: 'service' | 'desagote'): ColumnaUI<FilaControl>[] => [
  { id: 'numero', titulo: 'N°', valor: (f) => f.numero, numerica: true, codigo: true, buscable: true, ancho: 6 },
  { id: 'cliente', titulo: 'Cliente', valor: (f) => f.cliente, buscable: true, ancho: 26, celda: (f) => <span className="font-semibold text-foreground">{f.cliente}</span> },
  { id: 'direccion', titulo: 'Dirección', valor: (f) => f.direccion, buscable: true, ancho: 26 },
  { id: 'barrio', titulo: 'Barrio', valor: (f) => f.barrio, buscable: true, ancho: 14 },
  { id: 'fuimos', titulo: tipo === 'desagote' ? 'Desagotes hechos' : 'Services hechos', valor: (f) => f.fuimos, numerica: true, total: true, celda: (f) => <strong data-testid="control-fuimos">{f.fuimos}</strong> },
  { id: 'liquido', titulo: 'Cloro líquido (L)', valor: (f) => n(f.liquido), numerica: true, total: true },
  { id: 'granulado', titulo: 'Granulado (g)', valor: (f) => n(f.granulado), numerica: true, total: true },
  { id: 'pastillas', titulo: 'Pastillas', valor: (f) => n(f.pastillas), numerica: true, total: true },
  { id: 'ultima', titulo: 'Última visita', valor: (f) => f.ultima, ancho: 12, celda: (f) => fecha(f.ultima) },
  { id: 'dias', titulo: 'Días sin visita', valor: (f) => f.diasSinVisita, numerica: true },
  { id: 'observaciones', titulo: 'Observaciones del equipo', valor: (f) => f.observaciones, buscable: true, largo: true, ancho: 40 },
  { id: 'nota', titulo: 'Notas del mes', valor: (f) => f.notaMes, buscable: true, largo: true, ancho: 40, celda: (f) => (
    f.notaMes ? <span className="whitespace-pre-line" data-testid="control-nota">{f.notaMes}</span> : <span className="text-muted-foreground">—</span>
  ) },
];

const filtros = (tipo: 'service' | 'desagote'): Filtro<FilaControl>[] => [
  { id: 'todas', etiqueta: 'Todas', aplica: () => true },
  ...(tipo === 'service' ? [{ id: 'sin-visitas', etiqueta: 'Sin visitas', aplica: (f: FilaControl) => f.fuimos === 0 }] : []),
  { id: 'con-notas', etiqueta: 'Con notas', aplica: (f) => !!f.notaMes },
];

/** Nota del dueño para la pileta en el mes: se escribe acá y se ve en la columna "Notas del mes". */
function NotaMes({ f, mes }: { f: FilaControl; mes: string }) {
  const [texto, setTexto] = useState(f.notaMes ?? '');
  const [pending, startTransition] = useTransition();
  const cambio = texto.trim() !== (f.notaMes ?? '').trim();
  const guardar = () =>
    startTransition(async () => {
      const r = await guardarNotaMesAction(f.poolId, mes, texto);
      if (r.error) { toast.error(r.error); return; }
      toast.success(texto.trim() ? 'Nota guardada' : 'Nota borrada');
    });
  return (
    <section className="space-y-2 rounded-xl border border-border bg-muted/40 p-3" data-testid="nota-mes">
      <label htmlFor="nota-mes" className="flex items-center gap-1.5 text-sm font-semibold text-foreground">
        <NotebookPen className="w-4 h-4 text-primary" /> Notas del mes
      </label>
      <Textarea
        id="nota-mes"
        rows={3}
        maxLength={NOTA_MAX}
        placeholder="Lo que quieras anotar de esta pileta este mes (cobrar, cambiar el filtro, pidió desagote...)"
        value={texto}
        onChange={(e) => setTexto(e.target.value)}
        className="bg-card"
      />
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs text-muted-foreground">Se ve en la planilla de services y en la de desagotes. Para borrarla, dejala vacía.</span>
        <Button size="sm" onClick={guardar} disabled={pending || !cambio} data-testid="nota-guardar">
          {pending ? 'Guardando...' : 'Guardar nota'}
        </Button>
      </div>
    </section>
  );
}

/** Selector de auto o empleado: cambia la dirección y la pantalla se vuelve a armar con ese filtro. */
function FiltroSelect({ nombre, etiqueta, opciones, valor }: { nombre: string; etiqueta: string; opciones: { id: string; name: string }[]; valor: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  return (
    <select
      aria-label={etiqueta}
      value={valor}
      onChange={(e) => {
        const p = new URLSearchParams(params.toString());
        if (e.target.value) p.set(nombre, e.target.value);
        else p.delete(nombre);
        router.push(`${pathname}?${p.toString()}`);
      }}
      className="h-9 rounded-lg border border-input bg-card px-2.5 text-sm text-foreground"
      data-testid={`control-filtro-${nombre}`}
    >
      <option value="">{etiqueta}: todos</option>
      {opciones.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
    </select>
  );
}

function Detalle({ f, nombres, mes }: { f: FilaControl; nombres: Record<string, string>; mes: string }) {
  return (
    <div className="px-5 pb-8 space-y-4" data-testid="control-detalle">
      <NotaMes key={`${f.poolId}-${mes}-${f.notaMes ?? ''}`} f={f} mes={mes} />
      <div className="grid grid-cols-2 gap-2 text-center">
        <div className="rounded-lg bg-muted p-2"><p className="text-xl font-bold">{f.fuimos}</p><p className="text-[11px] text-muted-foreground">hechas</p></div>
        <div className="rounded-lg bg-muted p-2"><p className="text-xl font-bold">{f.salteadas + f.noEstaba}</p><p className="text-[11px] text-muted-foreground">salteadas o no estaba</p></div>
      </div>
      {f.visitas.length === 0 ? (
        <p className="text-sm text-muted-foreground">No tuvo visitas en este período.</p>
      ) : (
        <ol className="space-y-2">
          {f.visitas.map((v, i) => {
            const e = ESTADO[v.status] ?? { label: v.status, tone: 'gray' as BadgeTone };
            return (
              <li key={`${v.itemId ?? 'x'}-${i}`} className="rounded-lg border border-border p-3 text-sm space-y-1" data-testid="control-visita">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="font-semibold bo-capitalize">{formatDateAR(v.date, { weekday: 'short', day: 'numeric', month: 'short' })}</span>
                  <span className="flex gap-1">
                    {v.serviceType === 'desagote' && <StatusBadge tone="purple">Desagote</StatusBadge>}
                    <StatusBadge tone={e.tone}>{e.label}</StatusBadge>
                  </span>
                </div>
                {v.empleados.length > 0 && <p className="text-xs text-muted-foreground">Hecha por {v.empleados.map((id) => nombres[id] ?? 'Sin nombre').join(' y ')}</p>}
                {v.cloro.length > 0 && <p className="text-xs">Cloro: {v.cloro.map((c) => formatChlorine(c.type, c.amount)).join(' · ')}</p>}
                {v.notas.map((t, k) => <p key={k} className="text-xs italic text-muted-foreground">{t}</p>)}
                {v.itemId && (
                  <Link href={`/admin/itinerario/visita/${v.itemId}`} className="bo-link text-xs">
                    <ExternalLink className="w-3 h-3" /> Abrir la visita
                  </Link>
                )}
              </li>
            );
          })}
        </ol>
      )}
      <Link href={`/admin/piletas/${f.poolId}`} className="bo-link text-sm">
        <ExternalLink className="w-3.5 h-3.5" /> Ver la ficha de la pileta
      </Link>
    </div>
  );
}

export function ControlTabla({ filas, nombres, autos, empleados, auto, empleado, titulo, tipo, mes }: {
  filas: FilaControl[];
  nombres: Record<string, string>;
  autos: { id: string; name: string }[];
  empleados: { id: string; name: string }[];
  auto: string;
  empleado: string;
  titulo: string;
  tipo: 'service' | 'desagote';
  mes: string;
}) {
  const [abierta, setAbierta] = useState<string | null>(null);
  const fila = useMemo(() => filas.find((f) => f.poolId === abierta) ?? null, [filas, abierta]);
  const cols = useMemo(() => columnas(tipo), [tipo]);
  const filt = useMemo(() => filtros(tipo), [tipo]);

  return (
    <>
      <TablaExcel
        id={tipo === 'desagote' ? 'control-desagotes' : 'control'}
        titulo={titulo}
        filas={filas}
        columnas={cols}
        claveFila={(f) => f.poolId}
        tarjeta={(f) => (
          <div className="space-y-1">
            <p className="font-semibold text-foreground">{f.numero ? <span className="text-muted-foreground font-medium">N° {f.numero} · </span> : null}{f.cliente}</p>
            <p className="text-xs text-muted-foreground">{[f.direccion, f.barrio].filter(Boolean).join(' · ')}</p>
            <p className="text-sm">Fuimos <strong>{f.fuimos}</strong> {f.fuimos === 1 ? 'vez' : 'veces'}{f.ultima ? ` · última ${fecha(f.ultima)}` : ''}</p>
            <p className="text-xs text-muted-foreground">
              {[f.liquido && `${f.liquido} L`, f.granulado && `${f.granulado} g`, f.pastillas && `${f.pastillas} pastillas`].filter(Boolean).join(' · ') || 'Sin novedades'}
            </p>
            {f.notaMes && <p className="text-xs whitespace-pre-line"><strong>Nota:</strong> {f.notaMes}</p>}
          </div>
        )}
        alTocarFila={(f) => setAbierta(f.poolId)}
        ayudaFila="Tocá una fila para ver cada visita de esa pileta y escribir sus notas del mes."
        filtros={filt}
        resaltar={(f) => (f.fuimos === 0 && f.activa && tipo === 'service' ? 'amber' : null)}
        ordenInicial={{ columna: 'numero', sentido: 'asc' }}
        buscador="Buscar por N°, cliente, dirección o barrio..."
        vacio={tipo === 'desagote' ? 'No hubo desagotes este mes con estos filtros.' : 'No hay piletas para mostrar con estos filtros.'}
        extra={
          <>
            <FiltroSelect nombre="auto" etiqueta="Auto" opciones={autos} valor={auto} />
            <FiltroSelect nombre="empleado" etiqueta="Empleado" opciones={empleados} valor={empleado} />
          </>
        }
      />
      <Ventana
        abierta={fila !== null}
        alCerrar={() => setAbierta(null)}
        titulo={fila ? `${fila.numero ? `N° ${fila.numero} · ` : ''}${fila.cliente}` : ''}
        descripcion={fila ? [fila.direccion, fila.barrio].filter(Boolean).join(' · ') : null}
      >
        {fila && <Detalle f={fila} nombres={nombres} mes={mes} />}
      </Ventana>
    </>
  );
}
