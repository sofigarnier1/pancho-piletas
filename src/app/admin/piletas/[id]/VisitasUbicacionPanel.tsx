'use client';

import { useState, useTransition } from 'react';
import { MapPinned, Navigation } from 'lucide-react';
import { toast } from 'sonner';
import { Panel, PanelHeader, StatusBadge } from '@/components/admin/bo';
import { Button } from '@/components/ui/button';
import { FREQUENCIES, FREQUENCY_LABEL, type Frequency } from '@/lib/ubicacion';
import { guardarUbicacionAction, setPoolFrequencyAction, ubicarPiletaAction } from '../actions';

type Props = {
  poolId: string;
  frequency: Frequency;
  lat: number | null;
  lng: number | null;
  source: 'auto' | 'manual' | null;
  tieneDireccion: boolean;
};

/** Cada cuánto se visita y dónde queda en el mapa: lo usa la sugerencia del itinerario para saber cuándo le toca y qué queda cerca. */
export function VisitasUbicacionPanel({ poolId, frequency, lat, lng, source, tieneDireccion }: Props) {
  const [texto, setTexto] = useState('');
  const [pending, startTransition] = useTransition();
  const ubicada = lat !== null && lng !== null;

  const cambiarFrecuencia = (f: string) =>
    startTransition(async () => {
      const r = await setPoolFrequencyAction(poolId, f);
      if (r.error) { toast.error(r.error); return; }
      toast.success('Frecuencia guardada');
    });
  const ubicar = () =>
    startTransition(async () => {
      const r = await ubicarPiletaAction(poolId);
      if (r.error) { toast.error(r.error); return; }
      toast.success('Pileta ubicada en el mapa: revisá que el punto esté bien');
    });
  const guardar = (e: React.FormEvent) => {
    e.preventDefault();
    startTransition(async () => {
      const r = await guardarUbicacionAction(poolId, texto);
      if (r.error) { toast.error(r.error); return; }
      toast.success(texto.trim() ? 'Ubicación guardada' : 'Ubicación borrada');
      setTexto('');
    });
  };

  return (
    <Panel className="mb-5" testId="visitas-ubicacion">
      <PanelHeader icon={MapPinned} title="Visitas y ubicación" bordered />
      <div className="bo-panel-pad space-y-4">
        <label className="block max-w-xs space-y-1 text-xs font-medium text-muted-foreground">
          Frecuencia
          <select className="h-10 w-full rounded-md border border-input bg-card px-3 text-sm text-foreground" value={frequency} disabled={pending} onChange={(e) => cambiarFrecuencia(e.target.value)} data-testid="pileta-frecuencia">
            {FREQUENCIES.map((f) => <option key={f} value={f}>{FREQUENCY_LABEL[f]}</option>)}
          </select>
        </label>

        <div className="space-y-2">
          <p className="flex flex-wrap items-center gap-2 text-sm" data-testid="pileta-ubicacion">
            {ubicada ? (
              <>
                <StatusBadge tone="green">Ubicada en el mapa</StatusBadge>
                <span className="tabular-nums text-muted-foreground">{lat!.toFixed(5)}, {lng!.toFixed(5)}</span>
                <span className="text-xs text-muted-foreground">({source === 'manual' ? 'cargada a mano' : 'buscada por la dirección'})</span>
                <a className="bo-link inline-flex items-center gap-1" href={`https://www.google.com/maps/search/?api=1&query=${lat},${lng}`} target="_blank" rel="noopener noreferrer">
                  <Navigation className="h-3.5 w-3.5" /> Ver en el mapa
                </a>
              </>
            ) : (
              <StatusBadge tone="amber">Sin ubicar</StatusBadge>
            )}
          </p>
          <Button type="button" variant="outline" disabled={pending || !tieneDireccion} onClick={ubicar} data-testid="ubicar-mapa">
            <MapPinned /> Ubicar en el mapa
          </Button>
          {!tieneDireccion && <p className="text-xs text-muted-foreground">Cargá la dirección de la pileta para poder ubicarla.</p>}
        </div>

        <form onSubmit={guardar} className="flex flex-col gap-2 sm:flex-row sm:items-end">
          <label className="flex-1 space-y-1 text-xs font-medium text-muted-foreground">
            Corregir a mano
            <input className="h-10 w-full rounded-md border border-input bg-card px-3 text-sm text-foreground" value={texto} onChange={(e) => setTexto(e.target.value)} placeholder="-34.4708, -58.5286 o el link de Google Maps" data-testid="ubicacion-texto" />
          </label>
          <Button type="submit" variant="outline" disabled={pending} data-testid="ubicacion-guardar">Guardar ubicación</Button>
        </form>
      </div>
    </Panel>
  );
}
