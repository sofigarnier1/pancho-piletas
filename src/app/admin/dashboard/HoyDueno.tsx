'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, CalendarPlus, Car, CheckCircle2, ExternalLink, MapPin, Search, UserCheck } from 'lucide-react';
import { TablaExcel, type ColumnaUI, type Filtro } from '@/components/tabla/TablaExcel';
import { Ventana } from '@/components/tabla/Ventana';
import { StatusBadge, type BadgeTone } from '@/components/admin/bo';
import { AgregarPiletas, type PiletaParaAgregar } from '@/app/admin/itinerario/[fecha]/AgregarPiletas';
import { VisitaDuenoAcciones, type Persona } from '@/app/admin/itinerario/visita/[id]/VisitaDueno';

export type FilaHoy = {
  id: string;
  auto: string;
  /** Posición del auto en la pantalla del día (para ordenar como allá). */
  autoOrden: number;
  orden: number;
  numero: number | null;
  cliente: string;
  direccion: string;
  barrio: string | null;
  tipo: string;
  encargado: string | null;
  estado: string;
  hicieron: string | null;
  /** Nota del empleado cuando no se pudo (salteada o no estaba) */
  motivo: string | null;
  defaultEmployeeId: string;
};

const estadoLabel: Record<string, string> = { pending: 'Pendiente', done: 'Hecho', skipped: 'Salteado', no_client: 'No estaba' };
const estadoTone: Record<string, BadgeTone> = { pending: 'amber', done: 'green', skipped: 'gray', no_client: 'red' };

const COLUMNAS: ColumnaUI<FilaHoy>[] = [
  { id: 'auto', titulo: 'Auto', valor: (f) => f.auto, buscable: true, ancho: 14 },
  { id: 'orden', titulo: 'Orden', valor: (f) => f.orden, numerica: true, ancho: 6 },
  { id: 'numero', titulo: 'N°', valor: (f) => f.numero, numerica: true, codigo: true, buscable: true, ancho: 6 },
  { id: 'cliente', titulo: 'Cliente', valor: (f) => f.cliente, buscable: true, ancho: 26, celda: (f) => <span className="font-semibold text-foreground">{f.cliente}</span> },
  { id: 'direccion', titulo: 'Dirección', valor: (f) => f.direccion, buscable: true, ancho: 28 },
  { id: 'barrio', titulo: 'Barrio', valor: (f) => f.barrio, buscable: true, ancho: 14 },
  { id: 'tipo', titulo: 'Tipo', valor: (f) => f.tipo, ancho: 10 },
  { id: 'encargado', titulo: 'Encargado', valor: (f) => f.encargado, buscable: true, ancho: 16 },
  { id: 'estado', titulo: 'Estado', valor: (f) => estadoLabel[f.estado] ?? f.estado, ancho: 12, celda: (f) => (
    <StatusBadge tone={estadoTone[f.estado] ?? 'gray'}>{estadoLabel[f.estado] ?? f.estado}</StatusBadge>
  ) },
  { id: 'hicieron', titulo: 'La hizo', valor: (f) => f.hicieron, buscable: true, ancho: 18 },
  { id: 'motivo', titulo: 'Motivo', valor: (f) => f.motivo, buscable: true, ancho: 24 },
];

const FILTROS: Filtro<FilaHoy>[] = [
  { id: 'todas', etiqueta: 'Todas', aplica: () => true },
  { id: 'faltan', etiqueta: 'Faltan', aplica: (f) => f.estado === 'pending' },
  { id: 'hechas', etiqueta: 'Hechas', aplica: (f) => f.estado === 'done' },
];

function Tarjeta({ f }: { f: FilaHoy }) {
  return (
    <div className="space-y-1.5">
      <div className="flex items-start justify-between gap-2">
        <p className="font-semibold text-foreground leading-tight">
          {f.numero ? <span className="text-muted-foreground font-medium tabular-nums">N° {f.numero} · </span> : null}
          {f.cliente}
        </p>
        <StatusBadge tone={estadoTone[f.estado] ?? 'gray'}>{estadoLabel[f.estado] ?? f.estado}</StatusBadge>
      </div>
      <p className="text-sm text-muted-foreground flex items-center gap-1.5">
        <MapPin className="w-3.5 h-3.5 flex-shrink-0" /> {[f.direccion, f.barrio].filter(Boolean).join(' · ')}
      </p>
      <p className="text-xs text-muted-foreground flex flex-wrap items-center gap-x-3 gap-y-1">
        <span className="inline-flex items-center gap-1"><Car className="w-3.5 h-3.5" /> {f.auto} · {f.orden}°</span>
        <span>{f.tipo}</span>
        {f.encargado && <span className="inline-flex items-center gap-1 font-semibold text-[#705498]"><UserCheck className="w-3.5 h-3.5" /> Le toca a {f.encargado}</span>}
        {f.hicieron && <span>La hizo: {f.hicieron}</span>}
      </p>
      {f.motivo && <p className="text-xs italic text-muted-foreground">Motivo: “{f.motivo}”</p>}
    </div>
  );
}

/** Lo que se ve de la visita en la ventana, arriba de los botones para registrarla. */
function DatosVisita({ f }: { f: FilaHoy }) {
  return (
    <dl className="bo-dl grid-cols-2">
      <div><dt>Auto</dt><dd>{f.auto} · {f.orden}° de la ruta</dd></div>
      <div><dt>Tipo</dt><dd>{f.tipo}</dd></div>
      <div><dt>Estado</dt><dd><StatusBadge tone={estadoTone[f.estado] ?? 'gray'}>{estadoLabel[f.estado] ?? f.estado}</StatusBadge></dd></div>
      <div><dt>Encargado</dt><dd>{f.encargado ? `Le toca a ${f.encargado}` : 'Cualquiera del auto'}</dd></div>
      {f.hicieron && <div className="col-span-2"><dt>La hizo</dt><dd>{f.hicieron}</dd></div>}
      {f.motivo && <div className="col-span-2"><dt>Motivo</dt><dd>{f.motivo}</dd></div>}
    </dl>
  );
}

type Props = {
  hoy: string;
  filas: FilaHoy[];
  team: Persona[];
  piletas: PiletaParaAgregar[];
  autos: { id: string; name: string }[];
};

/** Minúsculas y sin tildes, para buscar "Gomez" y encontrar "Gómez". */
const normalizar = (s: string) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');

/**
 * El día de hoy para el dueño: botones grandes para registrar un service o agendar piletas, y la tabla de las
 * visitas de hoy. Tocar una visita abre una ventana para registrarla ahí mismo.
 */
export function HoyDueno({ hoy, filas, team, piletas, autos }: Props) {
  // Ventana "Registrar service": null = cerrada; 'lista' = elegir la visita; un id = esa visita
  const [ventana, setVentana] = useState<string | null>(null);
  const fila = useMemo(() => filas.find((f) => f.id === ventana) ?? null, [filas, ventana]);
  const paraElegir = useMemo(
    () => [...filas].sort((a, b) => Number(a.estado !== 'pending') - Number(b.estado !== 'pending') || a.autoOrden - b.autoOrden || a.orden - b.orden),
    [filas],
  );
  // Buscador de la lista: con muchas piletas no hay que bajar hasta encontrarla
  const [busqueda, setBusqueda] = useState('');
  const elegibles = useMemo(() => {
    const q = normalizar(busqueda.trim());
    if (!q) return paraElegir;
    const palabras = q.split(/\s+/);
    return paraElegir.filter((f) => {
      const texto = normalizar([f.numero, f.cliente, f.direccion, f.barrio, f.auto].filter(Boolean).join(' '));
      return palabras.every((p) => texto.includes(p));
    });
  }, [paraElegir, busqueda]);
  const abrirLista = () => { setBusqueda(''); setVentana('lista'); };
  const cerrar = () => setVentana(null);

  return (
    <>
      <div className="mb-5 grid gap-2.5 grid-cols-2 lg:grid-cols-4" data-testid="acciones-hoy">
        <button type="button" className="bo-big-action primary" onClick={abrirLista} data-testid="registrar-service">
          <CheckCircle2 /> Registrar service
        </button>
        <AgregarPiletas
          fecha={hoy}
          vehicleId={autos[0]?.id ?? null}
          vehicleName=""
          piletas={piletas}
          elegirDiaYAuto={{ autos }}
          testId="agendar-pileta"
          botonClassName="bo-big-action"
          boton={<><CalendarPlus /> Agendar pileta</>}
        />
        <Link href={`/admin/itinerario/${hoy}`} className="bo-big-action" data-testid="armar-dia">
          <Car /> Armar el día
        </Link>
        <Link href="/admin/clientes/nuevo" className="bo-big-action">
          <UserCheck /> Nuevo cliente
        </Link>
      </div>

      <TablaExcel
        id="hoy"
        titulo="Visitas de hoy"
        filas={filas}
        columnas={COLUMNAS}
        claveFila={(f) => f.id}
        tarjeta={(f) => <Tarjeta f={f} />}
        alTocarFila={(f) => setVentana(f.id)}
        filtros={FILTROS}
        resaltar={(f) => (f.estado === 'skipped' || f.estado === 'no_client' ? 'gray' : null)}
        buscador="Buscar por cliente, N°, dirección, auto o empleado..."
        vacio="Hoy no hay piletas en el itinerario. Tocá «Agendar pileta» o «Armar el día»."
        ayudaFila="Tocá una visita para registrar el service."
      />

      <Ventana
        abierta={ventana !== null}
        alCerrar={cerrar}
        titulo={fila ? `${fila.numero ? `N° ${fila.numero} · ` : ''}${fila.cliente}` : 'Registrar service'}
        descripcion={fila ? [fila.direccion, fila.barrio].filter(Boolean).join(' · ') : '¿Qué pileta hiciste? Elegí la visita de hoy.'}
        testId="ventana-visita"
      >
        {fila ? (
          <div className="space-y-5 px-5 pb-6">
            <DatosVisita f={fila} />
            <VisitaDuenoAcciones
              key={fila.id}
              itemId={fila.id}
              status={fila.estado}
              team={team}
              defaultEmployeeId={fila.defaultEmployeeId}
              alTerminar={cerrar}
            />
            <div className="flex flex-wrap gap-x-5 gap-y-2 border-t border-border pt-4">
              <button type="button" className="bo-link text-sm" onClick={() => setVentana('lista')}>
                <ArrowLeft className="w-3.5 h-3.5" /> Elegir otra visita
              </button>
              <Link href={`/admin/itinerario/visita/${fila.id}`} className="bo-link text-sm">
                <ExternalLink className="w-3.5 h-3.5" /> Abrir la visita (corregir registros e historial)
              </Link>
            </div>
          </div>
        ) : paraElegir.length === 0 ? (
          <p className="px-5 pb-8 text-sm text-muted-foreground">Hoy no hay piletas en el itinerario. Agendá una con «Agendar pileta».</p>
        ) : (
          <div className="pb-4" data-testid="elegir-visita">
            <div className="sticky top-0 z-10 border-b border-border bg-background px-5 pb-3 pt-1">
              <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <input
                  type="search"
                  value={busqueda}
                  onChange={(e) => setBusqueda(e.target.value)}
                  placeholder="Buscar por N°, cliente, dirección o auto..."
                  aria-label="Buscar visita"
                  autoComplete="off"
                  className="h-10 w-full rounded-md border border-border bg-background pl-9 pr-3 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
                  data-testid="elegir-visita-buscar"
                />
              </div>
            </div>
            {elegibles.length === 0 ? (
              <p className="px-5 py-6 text-sm text-muted-foreground">Ninguna visita de hoy coincide con la búsqueda.</p>
            ) : null}
            {elegibles.map((f) => (
              <button
                key={f.id}
                type="button"
                onClick={() => setVentana(f.id)}
                className="flex w-full items-center gap-3 border-b border-border px-5 py-3 text-left hover:bg-muted"
                data-testid="elegir-visita-fila"
              >
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-semibold text-foreground">
                    {f.numero ? <span className="text-muted-foreground font-medium">N° {f.numero} · </span> : null}{f.cliente}
                  </span>
                  <span className="block truncate text-xs text-muted-foreground">{f.auto} · {[f.direccion, f.barrio].filter(Boolean).join(' · ')}</span>
                </span>
                <StatusBadge tone={estadoTone[f.estado] ?? 'gray'}>{estadoLabel[f.estado] ?? f.estado}</StatusBadge>
              </button>
            ))}
          </div>
        )}
      </Ventana>
    </>
  );
}
