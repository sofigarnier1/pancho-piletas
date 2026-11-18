'use client';

import { useState, useTransition } from 'react';
import { Sparkles } from 'lucide-react';
import { toast } from 'sonner';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import type { GrupoSugerido } from '@/lib/sugerencia';
import { addPoolsToItineraryAction } from '../actions';

type Props = { fecha: string; grupos: GrupoSugerido[]; autos: { id: string; name: string }[] };

/**
 * "Sugerir": propone qué piletas van, en qué auto y en qué orden, con el motivo de cada una (reglas fijas, sin IA).
 * Nada se guarda hasta tocar "Cargar sugerencia", que usa el mismo "Agregar piletas" de cada auto.
 */
export function SugerenciaBoton({ fecha, grupos, autos }: Props) {
  const [open, setOpen] = useState(false);
  const inicial = () => new Map(grupos.flatMap((g) => g.items.map((i) => [i.poolId, { marcada: i.marcada, auto: g.vehicleId ?? '' }] as const)));
  const [estado, setEstado] = useState(inicial);
  const [pending, startTransition] = useTransition();
  const total = grupos.reduce((n, g) => n + g.items.length, 0);
  const elegidas = [...estado.values()].filter((e) => e.marcada).length;

  const abrir = () => { setEstado(inicial()); setOpen(true); };
  const cambiar = (poolId: string, patch: Partial<{ marcada: boolean; auto: string }>) =>
    setEstado((prev) => new Map(prev).set(poolId, { ...prev.get(poolId)!, ...patch }));

  const cargar = () =>
    startTransition(async () => {
      // Por auto, en el orden de la sugerencia
      const porAuto = new Map<string, string[]>();
      for (const g of grupos) for (const i of g.items) {
        const e = estado.get(i.poolId)!;
        if (e.marcada) porAuto.set(e.auto, [...(porAuto.get(e.auto) ?? []), i.poolId]);
      }
      let n = 0;
      for (const [auto, ids] of porAuto) {
        const r = await addPoolsToItineraryAction(fecha, ids, { vehicleId: auto || null });
        if (r.error) { toast.error(r.error); return; }
        n += r.count ?? 0;
      }
      toast.success(n === 1 ? 'Sugerencia cargada: 1 pileta' : `Sugerencia cargada: ${n} piletas`);
      setOpen(false);
    });

  return (
    <>
      <button type="button" className="bo-btn" onClick={abrir} disabled={total === 0} data-testid="sugerir" title={total === 0 ? 'No hay nada para sugerir' : undefined}>
        <Sparkles className="h-4 w-4" /> Sugerir{total > 0 ? ` (${total})` : ''}
      </button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent style={{ background: 'var(--card)' }} className="backoffice max-w-2xl p-0 gap-0 max-h-[90dvh] flex flex-col max-sm:inset-0 max-sm:left-0 max-sm:top-0 max-sm:translate-x-0 max-sm:translate-y-0 max-sm:h-dvh max-sm:max-h-none max-sm:border-0">
          <div className="p-5 pb-3 border-b border-border">
            <DialogTitle>Sugerencia para el día</DialogTitle>
            <DialogDescription>
              Según la frecuencia de cada pileta, lo que se hizo las semanas anteriores, lo que quedó sin hacer y lo que queda cerca.
              Revisá, sacá o cambiá de auto lo que haga falta. No se guarda nada hasta que toques Cargar sugerencia.
            </DialogDescription>
          </div>
          <div className="flex-1 overflow-y-auto" data-testid="sugerencia-lista">
            {grupos.map((g) => (
              <section key={g.vehicleId ?? 'none'} className="border-b border-border" data-testid="sugerencia-grupo">
                <h3 className="px-5 pt-3 pb-1 text-xs font-bold uppercase tracking-wide text-muted-foreground">{g.vehicleName}</h3>
                <ul>
                  {g.items.map((i, idx) => {
                    const e = estado.get(i.poolId)!;
                    return (
                      <li key={i.poolId} className="flex items-start gap-3 px-5 py-2.5" data-testid="sugerencia-item">
                        <input type="checkbox" className="mt-1 h-4 w-4" checked={e.marcada} onChange={(ev) => cambiar(i.poolId, { marcada: ev.target.checked })} aria-label={`Incluir ${i.cliente}`} />
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-semibold text-foreground">
                            <span className="text-muted-foreground font-medium">{idx + 1}. </span>
                            {i.numero ? <span className="text-muted-foreground font-medium">N° {i.numero} · </span> : null}{i.cliente}
                          </p>
                          <p className="truncate text-xs text-muted-foreground">{[i.lugar, i.barrio].filter(Boolean).join(' · ')}</p>
                          <p className={`text-xs ${i.prioridad === 1 ? 'font-semibold text-[#b7791f]' : 'text-primary'}`} data-testid="sugerencia-motivo">{i.motivo}</p>
                        </div>
                        <select className="h-9 rounded-md border border-input bg-card px-2 text-xs" value={e.auto} onChange={(ev) => cambiar(i.poolId, { auto: ev.target.value })} aria-label="Auto sugerido">
                          {autos.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
                          <option value="">Sin auto</option>
                        </select>
                      </li>
                    );
                  })}
                </ul>
              </section>
            ))}
          </div>
          <div className="flex items-center justify-between gap-2 border-t border-border p-4">
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>Cancelar</Button>
            <Button type="button" disabled={elegidas === 0 || pending} onClick={cargar} data-testid="sugerencia-cargar">
              {pending ? 'Cargando...' : `Cargar sugerencia (${elegidas})`}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
