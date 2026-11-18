'use client';

import { useTransition } from 'react';
import { toast } from 'sonner';
import { updateClientStatusAction } from '../actions';
import { useConfirmar } from '@/components/ui/confirmar';

const OPTIONS = [
  { value: 'active', label: 'Activo' },
  { value: 'inactive', label: 'Inactivo' },
  { value: 'blocked', label: 'Bloqueado' },
];

export function ClientStatusControl({ userId, status }: { userId: string; status: string }) {
  const [pending, startTransition] = useTransition();
  const { confirmar, ventanaConfirmar } = useConfirmar();

  const change = async (next: string) => {
    if (next === status) return;
    if (next === 'blocked' && !(await confirmar({ titulo: '¿Bloquear a este cliente?', mensaje: 'No va a poder ingresar ni usar el sistema y se le cierran las sesiones.', boton: 'Bloquear', peligro: true }))) return;
    if (next === 'inactive' && !(await confirmar({ titulo: '¿Pasar a inactivo?', mensaje: 'Sus datos y su historial quedan guardados. Lo podés volver a activar cuando quieras.', boton: 'Pasar a inactivo' }))) return;
    startTransition(async () => {
      const result = await updateClientStatusAction(userId, next);
      if (result.error) toast.error(result.error);
      else toast.success('Estado actualizado');
    });
  };

  return (
    <label className="flex items-center gap-2 text-xs text-muted-foreground">
      Estado
      <select
        value={status}
        disabled={pending}
        onChange={(e) => change(e.target.value)}
        className="h-9 rounded-lg border border-input bg-card px-2.5 text-sm text-foreground disabled:opacity-50"
      >
        {OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
      {ventanaConfirmar}
    </label>
  );
}
