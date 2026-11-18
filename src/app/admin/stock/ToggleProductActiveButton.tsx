'use client';

import { useTransition } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { toggleProductActiveAction } from './actions';
import { useConfirmar } from '@/components/ui/confirmar';

export function ToggleProductActiveButton({ productId, isActive }: { productId: string; isActive: boolean }) {
  const [pending, startTransition] = useTransition();
  const { confirmar, ventanaConfirmar } = useConfirmar();

  const cambiar = async () => {
    if (isActive && !(await confirmar({ titulo: '¿Desactivar este producto?', mensaje: 'Deja de verse en la web. Lo podés volver a activar cuando quieras.', boton: 'Desactivar', peligro: true }))) return;
    startTransition(async () => {
      const result = await toggleProductActiveAction(productId, !isActive);
      if (result.error) toast.error(result.error);
      else toast.success(isActive ? 'Producto desactivado' : 'Producto activado');
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
