'use client';

import { useMemo, useState, useTransition, type ReactNode } from 'react';
import { Plus, Search } from 'lucide-react';
import { toast } from 'sonner';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { normalizar } from '@/lib/tabla';
import type { ServiceType } from '@/lib/chlorine';
import { addPoolsToItineraryAction } from '../actions';
import { agregarAMiDiaAction } from '@/app/employee/campo-actions';

export type PiletaParaAgregar = {
  id: string;
  numero: number | null;
  cliente: string;
  lugar: string;
  barrio: string | null;
  /** Auto en el que ya está ese día (no se puede elegir de nuevo). */
  yaEn: string | null;
  /** La semana pasada, el mismo día, iba en este auto. */
  semanaPasada: boolean;
};

type Props = {
  fecha: string;
  vehicleId: string | null;
  vehicleName: string;
  piletas: PiletaParaAgregar[];
  testId?: string;
  /** Para agendar desde otra pantalla (Dashboard): se elige también el día y el auto. */
  elegirDiaYAuto?: { autos: { id: string; name: string }[] };
  /** Contenido y estilo del botón que abre la ventana (si no, "+ Agregar piletas"). */
  boton?: ReactNode;
  botonClassName?: string;
  /** Modo campo: el dueño se suma piletas a su día de hoy (le tocan a él, en el auto en el que va). */
  campo?: boolean;
};

/** Botón "+ Agregar piletas" de cada auto: se eligen varias de una vez y van al final de la ruta de ese auto. */
export function AgregarPiletas({ fecha, vehicleId, vehicleName, piletas, testId, elegirDiaYAuto, boton, botonClassName, campo }: Props) {
  const [open, setOpen] = useState(false);
  const [dia, setDia] = useState(fecha);
  const [auto, setAuto] = useState<string>(vehicleId ?? '');
  const [texto, setTexto] = useState('');
  const [elegidas, setElegidas] = useState<string[]>([]);
  const [tipo, setTipo] = useState<ServiceType>('service');
  const [pending, startTransition] = useTransition();

  const lista = useMemo(() => {
    const palabras = normalizar(texto).split(' ').filter(Boolean);
    // "Ya va en..." vale para el día de la pantalla: si se eligió otro día, no se sabe
    const base = elegirDiaYAuto && dia !== fecha ? piletas.map((p) => ({ ...p, yaEn: null })) : piletas;
    return base
      .filter((p) => {
        if (!palabras.length) return true;
        const todo = normalizar(`${p.numero ?? ''} ${p.cliente} ${p.lugar} ${p.barrio ?? ''}`);
        return palabras.every((w) => todo.includes(w));
      })
      .sort((a, b) =>
        Number(!!a.yaEn) - Number(!!b.yaEn)
        || Number(b.semanaPasada) - Number(a.semanaPasada)
        || (a.numero ?? 1e9) - (b.numero ?? 1e9)
        || a.cliente.localeCompare(b.cliente, 'es'));
  }, [piletas, texto, elegirDiaYAuto, dia, fecha]);

  const alternar = (id: string) =>
    setElegidas((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));

  const cerrar = () => { setOpen(false); setTexto(''); setElegidas([]); setTipo('service'); setDia(fecha); setAuto(vehicleId ?? ''); };

  const agregar = () =>
    startTransition(async () => {
      const r = campo
        ? await agregarAMiDiaAction(elegidas, tipo)
        : await addPoolsToItineraryAction(elegirDiaYAuto ? dia : fecha, elegidas, {
          vehicleId: elegirDiaYAuto ? auto || null : vehicleId,
          serviceType: tipo,
        });
      if (r.error) { toast.error(r.error); return; }
      const yaEstaban = r.skipped ? ` (${r.skipped} ya estaban ese día)` : '';
      toast.success(campo
        ? (r.count === 1 ? 'Pileta agregada a tu día' : `${r.count} piletas agregadas a tu día`) + yaEstaban
        : (r.count === 1 ? 'Pileta agregada al itinerario' : `${r.count} piletas agregadas al itinerario`) + yaEstaban);
      cerrar();
    });

  return (
    <>
      <button type="button" className={botonClassName ?? 'bo-btn w-full justify-center border-dashed'} onClick={() => setOpen(true)} data-testid={testId}>
        {boton ?? <><Plus /> Agregar piletas</>}
      </button>
      <Dialog open={open} onOpenChange={(o) => (o ? setOpen(true) : cerrar())}>
        <DialogContent style={{ background: 'var(--card)' }} className="backoffice max-w-lg p-0 gap-0 max-h-[90dvh] flex flex-col max-sm:inset-0 max-sm:left-0 max-sm:top-0 max-sm:translate-x-0 max-sm:translate-y-0 max-sm:h-dvh max-sm:max-h-none max-sm:border-0">
          <div className="p-5 pb-3 border-b border-border space-y-3">
            <div>
              <DialogTitle>{campo ? 'Agregar a mi día' : elegirDiaYAuto ? 'Agendar piletas' : `Agregar piletas a ${vehicleName}`}</DialogTitle>
              <DialogDescription>Tocá las piletas que van. Quedan al final de la ruta, en el orden en que las elegís.</DialogDescription>
            </div>
            {elegirDiaYAuto && (
              <div className="grid grid-cols-2 gap-2">
                <label className="space-y-1 text-xs font-medium text-muted-foreground">
                  Día
                  <input type="date" className="h-10 w-full rounded-md border border-input bg-card px-3 text-sm text-foreground" value={dia} onChange={(e) => e.target.value && setDia(e.target.value)} required data-testid="agendar-dia" />
                </label>
                <label className="space-y-1 text-xs font-medium text-muted-foreground">
                  Auto
                  <select className="h-10 w-full rounded-md border border-input bg-card px-3 text-sm text-foreground" value={auto} onChange={(e) => setAuto(e.target.value)} data-testid="agendar-auto">
                    {elegirDiaYAuto.autos.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
                    <option value="">Sin auto</option>
                  </select>
                </label>
              </div>
            )}
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <input
                type="search"
                autoFocus
                aria-label="Buscar pileta"
                placeholder="Buscar por N°, cliente, dirección o barrio..."
                value={texto}
                onChange={(e) => setTexto(e.target.value)}
                className="bo-search"
                data-testid="agregar-buscar"
              />
            </div>
            <div className="flex items-center gap-2 text-sm">
              <span className="text-muted-foreground">Van como</span>
              <div className="bo-segmented">
                <button type="button" data-active={tipo === 'service'} onClick={() => setTipo('service')}>Service</button>
                <button type="button" data-active={tipo === 'desagote'} onClick={() => setTipo('desagote')}>Desagote</button>
              </div>
            </div>
          </div>
          <div className="flex-1 overflow-y-auto" data-testid="agregar-lista">
            {lista.length === 0 && <p className="p-6 text-center text-sm text-muted-foreground">No hay piletas que coincidan.</p>}
            {lista.map((p) => {
              const orden = elegidas.indexOf(p.id);
              const marcada = orden >= 0;
              return (
                <button
                  key={p.id}
                  type="button"
                  disabled={!!p.yaEn || pending}
                  onClick={() => alternar(p.id)}
                  data-testid="agregar-pileta"
                  aria-pressed={marcada}
                  className={`flex w-full items-center gap-3 border-b border-border px-5 py-3 text-left transition-colors disabled:opacity-50 ${marcada ? 'bg-accent' : 'hover:bg-muted'}`}
                >
                  <span className={`flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-md border text-xs font-bold ${marcada ? 'border-primary bg-primary text-white' : 'border-input bg-card'}`}>
                    {marcada ? orden + 1 : ''}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-semibold text-foreground">
                      {p.numero ? <span className="text-muted-foreground font-medium">N° {p.numero} · </span> : null}{p.cliente}
                    </span>
                    <span className="block truncate text-xs text-muted-foreground">{[p.lugar, p.barrio].filter(Boolean).join(' · ')}</span>
                  </span>
                  {p.yaEn ? (
                    <span className="text-[11px] text-muted-foreground whitespace-nowrap">Ya va en {p.yaEn}</span>
                  ) : p.semanaPasada ? (
                    <span className="text-[11px] font-semibold text-primary whitespace-nowrap">Iba la semana pasada</span>
                  ) : null}
                </button>
              );
            })}
          </div>
          <div className="flex items-center justify-between gap-2 border-t border-border p-4">
            <Button type="button" variant="outline" onClick={cerrar}>Cancelar</Button>
            <Button type="button" disabled={elegidas.length === 0 || pending} onClick={agregar} data-testid="agregar-confirmar">
              {pending ? 'Agregando...' : elegidas.length === 1 ? 'Agregar 1 pileta' : `Agregar ${elegidas.length} piletas`}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
