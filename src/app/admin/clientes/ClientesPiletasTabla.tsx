'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { ExternalLink, MapPin, Phone, Plus, User, Waves } from 'lucide-react';
import { TablaExcel, type ColumnaUI, type Filtro } from '@/components/tabla/TablaExcel';
import { StatusBadge, type BadgeTone } from '@/components/admin/bo';
import { Ventana } from '@/components/tabla/Ventana';
import { POOL_TYPE_LABEL } from '@/lib/clients';
import { formatDateAR, todayInArgentina } from '@/lib/dates';
import { formatPesos, precioVigente } from '@/lib/precios';
import { PreciosPanel } from './[id]/PreciosPanel';
import { EditClienteForm } from './[id]/EditClienteForm';
import { ClientStatusControl } from './[id]/ClientStatusControl';
import { EditPiletaForm } from './EditPiletaForm';
import { TogglePoolActiveButton } from '@/app/admin/piletas/[id]/TogglePoolActiveButton';
import { PoolClientsPanel } from '@/app/admin/piletas/[id]/PoolClientsPanel';
import type { FilaClientePileta, OpcionCliente } from './data';

const estadoLabel: Record<string, string> = { active: 'Activo', inactive: 'Inactivo', blocked: 'Bloqueado' };
const estadoTone: Record<string, BadgeTone> = { active: 'green', inactive: 'gray', blocked: 'red' };

const activa = (f: FilaClientePileta) => f.estadoCliente === 'active' && f.piletaActiva !== false;
const estadoTexto = (f: FilaClientePileta) => {
  if (f.estadoCliente !== 'active') return estadoLabel[f.estadoCliente] ?? f.estadoCliente;
  if (f.poolId === null) return 'Sin pileta';
  return f.piletaActiva ? 'Activa' : 'Pileta inactiva';
};
const clientes = (f: FilaClientePileta) => (f.coClientes.length ? `${f.cliente} (+ ${f.coClientes.join(', ')})` : f.cliente);
/** Precio del service que rige hoy (en centavos), o null si no tiene. */
const precioService = (f: FilaClientePileta) => precioVigente(f.precios, 'service', todayInArgentina())?.price_cents ?? null;
const fecha = (d: string | null) => (d ? formatDateAR(d, { day: '2-digit', month: '2-digit', year: '2-digit' }) : '');

const COLUMNAS: ColumnaUI<FilaClientePileta>[] = [
  { id: 'numero', titulo: 'N°', valor: (f) => f.numero, numerica: true, codigo: true, buscable: true, ancho: 6 },
  { id: 'cliente', titulo: 'Cliente', valor: clientes, buscable: true, ancho: 30, celda: (f) => (
    <span className="font-semibold text-foreground">
      {f.cliente}
      {f.coClientes.length > 0 && <span className="block text-xs font-normal text-muted-foreground">+ {f.coClientes.join(', ')}</span>}
    </span>
  ) },
  { id: 'telefono', titulo: 'Teléfono', valor: (f) => f.telefono, buscable: true, ancho: 16 },
  { id: 'direccion', titulo: 'Dirección', valor: (f) => f.direccion ?? (f.alias ? `(${f.alias})` : null), buscable: true, ancho: 30 },
  { id: 'ultima', titulo: 'Última visita', valor: (f) => f.ultimaVisita, ancho: 12, celda: (f) => fecha(f.ultimaVisita) },
  { id: 'precio', titulo: 'Precio service', valor: (f) => (precioService(f) === null ? null : precioService(f)! / 100), numerica: true, ancho: 14, celda: (f) => {
    const c = precioService(f);
    return c === null ? <span className="text-amber-700">Sin precio</span> : <span className="tabular-nums">{formatPesos(c)}</span>;
  } },
  { id: 'estado', titulo: 'Estado', valor: estadoTexto, ancho: 14, celda: (f) => (
    <StatusBadge tone={activa(f) ? (f.poolId ? 'green' : 'amber') : estadoTone[f.estadoCliente] ?? 'gray'}>{estadoTexto(f)}</StatusBadge>
  ) },
  { id: 'notas', titulo: 'Notas', valor: (f) => [f.notasCliente, f.notasPileta].filter(Boolean).join(' · ') || null, largo: true, ancho: 40 },
];

const FILTROS: Filtro<FilaClientePileta>[] = [
  { id: 'activos', etiqueta: 'Activos', aplica: activa },
  { id: 'inactivos', etiqueta: 'Inactivos', aplica: (f) => !activa(f) },
  { id: 'todos', etiqueta: 'Todos', aplica: () => true },
];

function Tarjeta({ f }: { f: FilaClientePileta }) {
  return (
    <div className="space-y-1.5">
      <div className="flex items-start justify-between gap-2">
        <p className="font-semibold text-foreground leading-tight">
          {f.numero ? <span className="text-muted-foreground font-medium tabular-nums">N° {f.numero} · </span> : null}
          {f.cliente}
        </p>
        <StatusBadge tone={activa(f) ? (f.poolId ? 'green' : 'amber') : estadoTone[f.estadoCliente] ?? 'gray'}>{estadoTexto(f)}</StatusBadge>
      </div>
      {f.coClientes.length > 0 && <p className="text-xs text-muted-foreground">+ {f.coClientes.join(', ')}</p>}
      <p className="text-sm text-muted-foreground flex items-center gap-1.5">
        <MapPin className="w-3.5 h-3.5 flex-shrink-0" />
        {f.direccion ?? f.alias ?? (f.poolId ? 'Sin dirección' : 'Sin pileta')}
      </p>
      {f.telefono && <p className="text-sm text-muted-foreground flex items-center gap-1.5"><Phone className="w-3.5 h-3.5" /> {f.telefono}</p>}
      <p className="text-xs text-muted-foreground">
        Service: <strong className={precioService(f) === null ? 'text-amber-700' : 'text-foreground'}>{precioService(f) === null ? 'Sin precio' : formatPesos(precioService(f)!)}</strong>
      </p>
      {f.poolId && f.ultimaVisita && (
        <p className="text-xs text-muted-foreground">
          Última visita: <strong className="text-foreground">{fecha(f.ultimaVisita)}</strong>
        </p>
      )}
    </div>
  );
}

function Ficha({ f, opciones }: { f: FilaClientePileta; opciones: OpcionCliente[] }) {
  return (
    <div className="space-y-6 px-5 pb-8" data-testid="ficha-panel">
      <section className="space-y-3">
        <h3 className="bo-form-title !mb-2 flex items-center gap-1.5"><User className="w-3.5 h-3.5" /> Cliente</h3>
        <EditClienteForm key={`c-${f.clientId}-${f.cliente}-${f.numero}-${f.telefono}-${f.notasCliente}`} clientId={f.clientId} fullName={f.cliente} clientNumber={f.numero} phone={f.telefono} notes={f.notasCliente}>
          <dl className="bo-dl grid-cols-2">
            <div><dt>Nombre</dt><dd className="font-semibold">{f.cliente}</dd></div>
            <div><dt>N° de cliente</dt><dd>{f.numero ?? 'Sin N°'}</dd></div>
            <div><dt>Teléfono</dt><dd>{f.telefono ?? 'Sin teléfono'}</dd></div>
            {f.notasCliente && <div className="col-span-2"><dt>Notas</dt><dd className="whitespace-pre-line">{f.notasCliente}</dd></div>}
          </dl>
        </EditClienteForm>
        <ClientStatusControl userId={f.clientId} status={f.estadoCliente} />
      </section>

      <section className="space-y-3 border-t border-border pt-5" data-testid="ficha-precios">
        <PreciosPanel clientId={f.clientId} prices={f.precios} hoy={todayInArgentina()} />
      </section>

      <section className="space-y-3 border-t border-border pt-5">
        <h3 className="bo-form-title !mb-2 flex items-center gap-1.5"><Waves className="w-3.5 h-3.5" /> Pileta</h3>
        {f.poolId ? (
          <>
            <EditPiletaForm key={`p-${f.poolId}-${f.direccion}-${f.barrio}-${f.alias}-${f.tipo}-${f.notasPileta}`} poolId={f.poolId} address={f.direccion} neighborhood={f.barrio} nickname={f.alias} poolType={f.tipo} notes={f.notasPileta}>
              <dl className="bo-dl grid-cols-2">
                <div><dt>Dirección</dt><dd className="font-semibold">{f.direccion ?? 'Sin dirección'}</dd></div>
                <div><dt>Barrio</dt><dd>{f.barrio ?? '—'}</dd></div>
                {f.alias && <div><dt>Alias</dt><dd>{f.alias}</dd></div>}
                <div><dt>Tipo de pileta</dt><dd>{f.tipo ? POOL_TYPE_LABEL[f.tipo] ?? f.tipo : 'Sin especificar'}</dd></div>
                {f.notasPileta && <div className="col-span-2"><dt>Notas de la pileta</dt><dd className="whitespace-pre-line">{f.notasPileta}</dd></div>}
                <div><dt>Última visita</dt><dd>{f.ultimaVisita ? fecha(f.ultimaVisita) : 'Sin visitas'}</dd></div>
              </dl>
            </EditPiletaForm>
            <div className="flex flex-wrap items-center gap-3">
              <StatusBadge tone={f.piletaActiva ? 'green' : 'gray'}>{f.piletaActiva ? 'Pileta activa' : 'Pileta inactiva'}</StatusBadge>
              <TogglePoolActiveButton poolId={f.poolId} isActive={!!f.piletaActiva} />
            </div>
            <PoolClientsPanel poolId={f.poolId} clients={f.clientesPileta} options={opciones} />
            <Link href={`/admin/piletas/${f.poolId}`} className="bo-link text-sm">
              <ExternalLink className="w-3.5 h-3.5" /> Ver historial de services
            </Link>
          </>
        ) : (
          <p className="text-sm text-muted-foreground">Este cliente todavía no tiene pileta.</p>
        )}
        <Link href={`/admin/piletas/nueva?cliente=${f.clientId}`} className="bo-link text-sm">
          <Plus className="w-3.5 h-3.5" /> Agregar otra pileta a este cliente
        </Link>
      </section>

      <div className="border-t border-border pt-4">
        <Link href={`/admin/clientes/${f.clientId}`} className="bo-link text-sm">
          <ExternalLink className="w-3.5 h-3.5" /> Abrir la ficha completa del cliente
        </Link>
      </div>
    </div>
  );
}

/** "Clientes y piletas": una fila por pileta, como la planilla. Tocar una fila abre sus datos para cambiarlos. */
export function ClientesPiletasTabla({ filas, opciones }: { filas: FilaClientePileta[]; opciones: OpcionCliente[] }) {
  const [abierta, setAbierta] = useState<string | null>(null);
  // Después de guardar, la página se vuelve a cargar: se busca la fila de nuevo para mostrar los datos al día
  const fila = useMemo(() => filas.find((f) => f.key === abierta) ?? null, [filas, abierta]);

  return (
    <>
      <TablaExcel
        id="clientes"
        titulo="Clientes y piletas"
        filas={filas}
        columnas={COLUMNAS}
        claveFila={(f) => f.key}
        tarjeta={(f) => <Tarjeta f={f} />}
        alTocarFila={(f) => setAbierta(f.key)}
        filtros={FILTROS}
        resaltar={(f) => (activa(f) ? null : 'gray')}
        buscador="Buscar por nombre, N°, dirección o teléfono..."
        vacio="No hay clientes para mostrar"
      />
      <Ventana
        abierta={fila !== null}
        alCerrar={() => setAbierta(null)}
        titulo={fila ? `${fila.numero ? `N° ${fila.numero} · ` : ''}${fila.cliente}` : ''}
        descripcion={fila ? [fila.direccion ?? fila.alias, fila.barrio].filter(Boolean).join(' · ') || (fila.poolId ? 'Pileta sin dirección' : 'Sin pileta') : null}
      >
        {fila && <Ficha f={fila} opciones={opciones} />}
      </Ventana>
    </>
  );
}
