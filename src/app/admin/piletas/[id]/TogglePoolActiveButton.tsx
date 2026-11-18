'use client';

import { useTransition } from 'react';
import { toast } from 'sonner';
import { togglePoolActiveAction } from '../actions';
import { Button } from '@/components/ui/button';
import { useConfirmar } from '@/components/ui/confirmar';

export function TogglePoolActiveButton({ poolId, isActive }: { poolId: string; isActive: boolean }) {
  const [pending, startTransition] = useTransition();
  const { confirmar, ventanaConfirmar } = useConfirmar();

  const cambiar = async () => {
    if (isActive && !(await confirmar({ titulo: '¿Desactivar esta pileta?', mensaje: 'Deja de aparecer para agendar y en las planillas. Su historial queda guardado y la podés volver a activar.', boton: 'Desactivar', peligro: true }))) return;
    startTransition(async () => {
      const r = await togglePoolActiveAction(poolId, !isActive);
      if (r?.error) toast.error(r.error);
      else toast.success(isActive ? 'Pileta desactivada' : 'Pileta activada');
    });
  };

  return (
    <>
      <Button variant="outline" size="sm" disabled={pending} onClick={cambiar} className="text-xs">
        {pending ? '...' : isActive ? 'Desactivar' : 'Activar'}
      </Button>
      {ventanaConfirmar}
    </>
  );
}
