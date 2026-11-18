'use client';

import { useTransition } from 'react';
import { Users, X } from 'lucide-react';
import { toast } from 'sonner';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { assignCrewAction, removeCrewAction } from '../actions';
import { useConfirmar } from '@/components/ui/confirmar';

type Props = {
  fecha: string;
  vehicleId: string;
  members: { crewId: string; name: string }[];
  /** Gente que se puede sumar; si ya va en otro auto ese día, se cambia */
  candidates: { id: string; name: string; otherVehicle: string | null }[];
};

export function CrewControls({ fecha, vehicleId, members, candidates }: Props) {
  const [pending, startTransition] = useTransition();
  const { confirmar, ventanaConfirmar } = useConfirmar();

  const add = (employeeId: string) =>
    startTransition(async () => {
      const r = await assignCrewAction(fecha, vehicleId, employeeId);
      if (r.error) toast.error(r.error);
      else toast.success('Equipo del auto actualizado');
    });

  const remove = async (crewId: string, name: string) => {
    if (!(await confirmar({ titulo: `¿Sacar a ${name} del auto?`, mensaje: 'Deja de ir en este auto este día. Lo podés volver a sumar.', boton: 'Sacar del auto', peligro: true }))) return;
    startTransition(async () => {
      const r = await removeCrewAction(crewId, fecha);
      if (r.error) toast.error(r.error);
      else toast.success('Equipo del auto actualizado');
    });
  };

  return (
    <div data-testid="auto-equipo" className="flex flex-wrap items-center gap-2 px-5 py-3 border-b border-border">
      <Users className="w-4 h-4 text-muted-foreground flex-shrink-0" />
      {members.length === 0 && <span className="text-xs text-muted-foreground">Nadie asignado</span>}
      {members.map((m) => (
        <span key={m.crewId} className="inline-flex items-center gap-1 rounded-full bg-accent text-primary text-xs font-semibold pl-2.5 pr-1 py-0.5">
          {m.name}
          <button
            type="button"
            aria-label={`Sacar a ${m.name} del auto`}
            className="w-5 h-5 rounded-full flex items-center justify-center hover:bg-white/60 disabled:opacity-40"
            disabled={pending}
            onClick={() => remove(m.crewId, m.name)}
          >
            <X className="w-3 h-3" />
          </button>
        </span>
      ))}
      {candidates.length > 0 && (
        <Select value="" disabled={pending} onValueChange={add}>
          <SelectTrigger aria-label="Sumar al auto" className="h-8 w-44 text-xs">
            <SelectValue placeholder="Sumar al auto..." />
          </SelectTrigger>
          <SelectContent>
            {candidates.map((c) => (
              <SelectItem key={c.id} value={c.id}>
                {c.name}
                {c.otherVehicle ? ` (va en ${c.otherVehicle})` : ''}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}
      {ventanaConfirmar}
    </div>
  );
}
