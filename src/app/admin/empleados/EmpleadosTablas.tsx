'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { TablaExcel, type ColumnaUI } from '@/components/tabla/TablaExcel';
import { StatusBadge } from '@/components/admin/bo';

export type FilaEmpleado = {
  id: string;
  nombre: string;
  rol: string;
  estado: string;
  visitas: number;
  service: number;
  desagote: number;
  dias: number;
  salteadas: number;
  noEstaba: number;
  liquido: number;
  granulado: number;
  pastillas: number;
  cambios: number;
  /** Visitas por día del mes: fecha → cantidad */
  porDia: Record<string, number>;
};

const n = (v: number) => (v === 0 ? null : v);

const RESUMEN: ColumnaUI<FilaEmpleado>[] = [
  { id: 'nombre', titulo: 'Persona', valor: (f) => f.nombre, buscable: true, ancho: 24, celda: (f) => (
    <span className="font-semibold text-foreground">
      {f.nombre}
      <span className="block text-xs font-normal text-muted-foreground">{f.rol}</span>
      {f.estado !== 'active' && <StatusBadge tone="gray">{f.estado === 'blocked' ? 'Bloqueado' : 'Inactivo'}</StatusBadge>}
    </span>
  ) },
  { id: 'dias', titulo: 'Días trabajados', valor: (f) => f.dias, numerica: true, total: true },
  { id: 'visitas', titulo: 'Visitas', valor: (f) => f.visitas, numerica: true, total: true, celda: (f) => <strong data-testid="visitas">{f.visitas}</strong> },
  { id: 'service', titulo: 'Services', valor: (f) => f.service, numerica: true, total: true },
  { id: 'desagote', titulo: 'Desagotes', valor: (f) => f.desagote, numerica: true, total: true },
  { id: 'salteadas', titulo: 'Salteadas', valor: (f) => f.salteadas, numerica: true, total: true },
  { id: 'noestaba', titulo: 'No estaba', valor: (f) => f.noEstaba, numerica: true, total: true },
  { id: 'liquido', titulo: 'Cloro líquido (L)', valor: (f) => n(f.liquido), numerica: true, total: true },
  { id: 'granulado', titulo: 'Granulado (g)', valor: (f) => n(f.granulado), numerica: true, total: true },
  { id: 'pastillas', titulo: 'Pastillas', valor: (f) => n(f.pastillas), numerica: true, total: true },
  { id: 'cambios', titulo: 'Cambios hechos', valor: (f) => f.cambios, numerica: true, total: true },
];

/** Empleados en dos vistas tipo Excel: el resumen del mes y una grilla persona × día. Tocar una fila abre el detalle. */
export function EmpleadosTablas({ filas, dias, mes, label }: { filas: FilaEmpleado[]; dias: string[]; mes: string; label: string }) {
  const router = useRouter();
  const [pestana, setPestana] = useState<'resumen' | 'dias'>('resumen');

  const porDia = useMemo<ColumnaUI<FilaEmpleado>[]>(() => [
    { id: 'nombre', titulo: 'Persona', valor: (f) => f.nombre, buscable: true, ancho: 24, celda: (f) => <span className="font-semibold text-foreground">{f.nombre}</span> },
    ...dias.map((d) => ({
      id: d,
      titulo: String(Number(d.slice(8))),
      valor: (f: FilaEmpleado) => f.porDia[d] ?? null,
      numerica: true,
      total: true,
      ancho: 5,
    })),
    { id: 'total', titulo: 'Total', valor: (f) => f.visitas, numerica: true, total: true, celda: (f) => <strong>{f.visitas}</strong> },
  ], [dias]);

  const abrir = (f: FilaEmpleado) => router.push(`/admin/empleados/${f.id}?mes=${mes}`);

  return (
    <div>
      <div className="flex flex-wrap items-center gap-3 px-5 pt-4">
        <div className="bo-segmented" role="tablist" aria-label="Vista de empleados">
          <button type="button" role="tab" aria-selected={pestana === 'resumen'} data-active={pestana === 'resumen'} onClick={() => setPestana('resumen')} data-testid="empleados-pestana-resumen">
            Resumen del mes
          </button>
          <button type="button" role="tab" aria-selected={pestana === 'dias'} data-active={pestana === 'dias'} onClick={() => setPestana('dias')} data-testid="empleados-pestana-dias">
            Por día
          </button>
        </div>
        <p className="text-xs text-muted-foreground">
          {pestana === 'resumen'
            ? 'Una fila por persona con lo que hizo en el mes.'
            : 'Cuántas piletas hizo cada persona cada día del mes.'}
        </p>
      </div>
      {pestana === 'resumen' ? (
        <TablaExcel
          id="empleados"
          titulo={`Empleados ${label}`}
          filas={filas}
          columnas={RESUMEN}
          claveFila={(f) => f.id}
          tarjeta={(f) => (
            <div className="space-y-1">
              <p className="font-semibold text-foreground">{f.nombre} <span className="text-xs font-normal text-muted-foreground">· {f.rol}</span></p>
              <p className="text-sm"><strong>{f.visitas}</strong> visitas en <strong>{f.dias}</strong> días · {f.service} services · {f.desagote} desagotes</p>
              <p className="text-xs text-muted-foreground">
                Salteadas: {f.salteadas} · No estaba: {f.noEstaba}
                {f.liquido ? ` · Líquido ${f.liquido} L` : ''}{f.granulado ? ` · Granulado ${f.granulado} g` : ''}{f.pastillas ? ` · Pastillas ${f.pastillas}` : ''}
              </p>
            </div>
          )}
          alTocarFila={abrir}
          ayudaFila="Tocá una fila para ver el detalle de esa persona."
          ordenInicial={{ columna: 'visitas', sentido: 'desc' }}
          buscador="Buscar persona..."
          vacio="Todavía no hay empleados cargados."
        />
      ) : (
        <TablaExcel
          id="empleados-dias"
          titulo={`Empleados por día ${label}`}
          filas={filas}
          columnas={porDia}
          claveFila={(f) => f.id}
          tarjeta={(f) => (
            <div className="space-y-1">
              <p className="font-semibold text-foreground">{f.nombre}</p>
              <p className="text-xs text-muted-foreground">
                {Object.entries(f.porDia).sort().map(([d, c]) => `${Number(d.slice(8))}: ${c}`).join(' · ') || 'Sin visitas en el mes'}
              </p>
            </div>
          )}
          alTocarFila={abrir}
          ayudaFila="Tocá una fila para ver el detalle de esa persona."
          buscador="Buscar persona..."
          vacio="Todavía no hay empleados cargados."
        />
      )}
    </div>
  );
}
