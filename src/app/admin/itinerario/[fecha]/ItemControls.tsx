'use client';

import { useTransition } from 'react';
import { ArrowDown, ArrowUp, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  removeItemFromItineraryAction,
  reorderItineraryAction,
  setItemAssigneeAction,
  setItemServiceTypeAction,
  setItemVehicleAction,
} from '../actions';
import type { ServiceType } from '@/lib/chlorine';
import { useConfirmar } from '@/components/ui/confirmar';

const NO_VEHICLE = 'none';
const ANYONE = 'any';

type Props = {
  fecha: string;
  itemId: string;
  /** Ids de todas las visitas del día, en el orden en que se ven (auto por auto) */
  orderedIds: string[];
  /** Ids de las visitas del mismo auto, en el orden de su ruta */
  groupIds: string[];
  vehicleId: string | null;
  serviceType: ServiceType;
  assigneeId: string | null;
  vehicles: { id: string; name: string }[];
  /** Quienes pueden ser encargados: primero los del auto, después el resto del equipo */
  team: { id: string; name: string; enAuto: boolean }[];
  /** Una pileta ya resuelta no se quita (tiene historial) */
  canRemove: boolean;
};

export function ItemControls({ fecha, itemId, orderedIds, groupIds, vehicleId, serviceType, assigneeId, vehicles, team, canRemove }: Props) {
  const [pending, startTransition] = useTransition();
  const { confirmar, ventanaConfirmar } = useConfirmar();
  const index = groupIds.indexOf(itemId);

  const run = (fn: () => Promise<{ error?: string }>, ok?: string) =>
    startTransition(async () => {
      const result = await fn();
      if (result.error) toast.error(result.error);
      else if (ok) toast.success(ok);
    });

  // Se mueve dentro de la ruta del auto: se intercambia con la visita vecina del mismo auto
  const move = (delta: -1 | 1) => {
    const neighbor = groupIds[index + delta];
    const next = [...orderedIds];
    const a = next.indexOf(itemId);
    const b = next.indexOf(neighbor);
    [next[a], next[b]] = [next[b], next[a]];
    run(() => reorderItineraryAction(fecha, next));
  };

  const remove = async () => {
    if (!(await confirmar({ titulo: '¿Quitar esta pileta del itinerario?', mensaje: 'Se saca de este día. Si hace falta, la podés volver a agendar.', boton: 'Quitar', peligro: true }))) return;
    run(() => removeItemFromItineraryAction(itemId, fecha), 'Pileta quitada del itinerario');
  };

  const btn = 'w-8 h-8 rounded-lg border border-border bg-card flex items-center justify-center hover:bg-muted hover:text-primary disabled:opacity-30 transition-colors';
  const assignee = team.find((t) => t.id === assigneeId);

  return (
    <div className="flex flex-wrap items-center gap-1">
      <Select
        value={serviceType}
        disabled={pending}
        onValueChange={(v) => run(() => setItemServiceTypeAction(itemId, v as ServiceType, fecha), 'Tipo de visita cambiado')}
      >
        <SelectTrigger aria-label="Tipo de visita" className="h-8 w-[6.5rem] text-xs">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="service">Service</SelectItem>
          <SelectItem value="desagote">Desagote</SelectItem>
        </SelectContent>
      </Select>
      <Select
        value={assigneeId ?? ANYONE}
        disabled={pending}
        onValueChange={(v) => run(() => setItemAssigneeAction(itemId, v === ANYONE ? null : v, fecha), 'Encargado de la visita actualizado')}
      >
        <SelectTrigger aria-label="Lo tiene que hacer" className="h-8 w-[9.5rem] text-xs" data-testid="item-encargado">
          <SelectValue>{assignee ? `Lo hace ${assignee.name}` : 'Cualquiera del auto'}</SelectValue>
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={ANYONE}>Cualquiera del auto</SelectItem>
          {team.map((t) => (
            <SelectItem key={t.id} value={t.id}>{t.name}{t.enAuto ? '' : ' (no va en este auto)'}</SelectItem>
          ))}
        </SelectContent>
      </Select>
      {vehicles.length > 0 && (
        <Select
          value={vehicleId ?? NO_VEHICLE}
          disabled={pending}
          onValueChange={(v) => run(() => setItemVehicleAction(itemId, v === NO_VEHICLE ? null : v, fecha), 'Visita cambiada de auto')}
        >
          <SelectTrigger aria-label="Auto de la visita" className="h-8 w-[7.5rem] text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {vehicles.map((v) => (
              <SelectItem key={v.id} value={v.id}>{v.name}</SelectItem>
            ))}
            <SelectItem value={NO_VEHICLE}>Sin auto</SelectItem>
          </SelectContent>
        </Select>
      )}
      <button type="button" aria-label="Subir" className={btn} disabled={pending || index <= 0} onClick={() => move(-1)}>
        <ArrowUp className="w-3.5 h-3.5" />
      </button>
      <button type="button" aria-label="Bajar" className={btn} disabled={pending || index >= groupIds.length - 1} onClick={() => move(1)}>
        <ArrowDown className="w-3.5 h-3.5" />
      </button>
      {canRemove && (
        <button type="button" aria-label="Quitar del itinerario" className={`${btn} text-destructive`} disabled={pending} onClick={remove}>
          <Trash2 className="w-3.5 h-3.5" />
        </button>
      )}
      {ventanaConfirmar}
    </div>
  );
}
