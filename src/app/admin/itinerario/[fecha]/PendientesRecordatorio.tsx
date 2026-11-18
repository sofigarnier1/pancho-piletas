'use client';

import { useState, useTransition } from 'react';
import { AlertTriangle, Plus } from 'lucide-react';
import { toast } from 'sonner';
import { reprogramarPendienteAction } from '../actions';

export type PendienteSinReprogramar = {
  itemId: string;
  fecha: string;
  /** "Salteada", "No estaba el cliente" o "Pendiente". */
  estado: string;
  nota: string | null;
  desagote: boolean;
  numero: number | null;
  cliente: string;
  lugar: string;
};

/**
 * Recordatorio al armar el día: las visitas sin hacer de la semana anterior que nadie volvió a agendar.
 * Nunca se agregan solas: cada una tiene su botón "Agregar".
 */
export function PendientesRecordatorio({ fecha, pendientes }: { fecha: string; pendientes: PendienteSinReprogramar[] }) {
  const [pending, startTransition] = useTransition();
  const [agregando, setAgregando] = useState<string | null>(null);
  if (pendientes.length === 0) return null;

  const agregar = (itemId: string) => {
    setAgregando(itemId);
    startTransition(async () => {
      const r = await reprogramarPendienteAction(fecha, itemId);
      setAgregando(null);
      if (r.error) { toast.error(r.error); return; }
      toast.success('Visita agregada al día');
    });
  };

  const n = pendientes.length;
  return (
    <section className="bo-panel mb-4 border-[#e7c98a] bg-[#fff9ec]" data-testid="pendientes-recordatorio" aria-label="Visitas sin hacer de la semana pasada">
      <div className="flex items-start gap-2.5 px-5 pt-4 pb-2">
        <AlertTriangle className="mt-0.5 h-4 w-4 flex-shrink-0 text-[#b7791f]" />
        <div>
          <h2 className="text-sm font-semibold text-foreground">
            {n === 1 ? 'Quedó 1 sin hacer de la semana pasada' : `Quedaron ${n} sin hacer de la semana pasada`}
          </h2>
          <p className="text-xs text-muted-foreground">Nadie las volvió a agendar. Tocá <strong>Agregar</strong> en las que querés sumar a este día; las demás siguen acá.</p>
        </div>
      </div>
      <ul className="bo-rows">
        {pendientes.map((p) => (
          <li key={p.itemId} className="flex items-center gap-3 px-5 py-2.5" data-testid="pendiente-sin-reprogramar">
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold text-foreground">
                {p.numero ? <span className="font-medium text-muted-foreground">N° {p.numero} · </span> : null}{p.cliente}
              </p>
              <p className="truncate text-xs text-muted-foreground">
                {p.lugar} · {p.estado} el {Number(p.fecha.slice(8, 10))}/{Number(p.fecha.slice(5, 7))}
                {p.desagote ? ' · desagote' : ''}
                {p.nota ? ` · “${p.nota}”` : ''}
              </p>
            </div>
            <button type="button" className="bo-btn" disabled={pending} onClick={() => agregar(p.itemId)} data-testid="pendiente-agregar">
              <Plus className="h-4 w-4" /> {agregando === p.itemId ? 'Agregando...' : 'Agregar'}
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}
