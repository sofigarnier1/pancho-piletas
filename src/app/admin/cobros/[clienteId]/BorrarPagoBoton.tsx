'use client';

import { useTransition } from 'react';
import { Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { borrarPagoAction } from '../actions';
import { useConfirmar } from '@/components/ui/confirmar';

export function BorrarPagoBoton({ paymentId }: { paymentId: string }) {
  const [pending, startTransition] = useTransition();
  const { confirmar, ventanaConfirmar } = useConfirmar();
  const borrar = async () => {
    if (!(await confirmar({ titulo: '¿Borrar este pago?', mensaje: 'La deuda del cliente vuelve a subir.', boton: 'Borrar', peligro: true }))) return;
    startTransition(async () => {
      const r = await borrarPagoAction(paymentId);
      if (r.error) { toast.error(r.error); return; }
      toast.success('Pago borrado');
    });
  };
  return (
    <>
    <button type="button" className="bo-icon-btn !h-8 !w-8" aria-label="Borrar pago" title="Borrar pago" disabled={pending} onClick={borrar} data-testid="borrar-pago">
      <Trash2 className="h-4 w-4" />
    </button>
    {ventanaConfirmar}
    </>
  );
}
