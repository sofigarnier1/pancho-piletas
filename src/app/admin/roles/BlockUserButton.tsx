'use client';

import { useState, useTransition } from 'react';
import { toast } from 'sonner';
import { setUserBlockedAction } from './actions';
import { Button } from '@/components/ui/button';
import { useConfirmar } from '@/components/ui/confirmar';

export function BlockUserButton({ userId, initiallyBlocked, isSelf }: { userId: string; initiallyBlocked: boolean; isSelf: boolean }) {
  const [blocked, setBlocked] = useState(initiallyBlocked);
  const [pending, startTransition] = useTransition();
  const { confirmar, ventanaConfirmar } = useConfirmar();
  if (isSelf) return <div className="w-28 flex-shrink-0" />;

  const toggle = async () => {
    if (!blocked && !(await confirmar({ titulo: '¿Bloquear esta cuenta?', mensaje: 'No va a poder entrar hasta que la desbloquees.', boton: 'Bloquear', peligro: true }))) return;
    startTransition(async () => {
      const result = await setUserBlockedAction(userId, !blocked);
      if (result.error) {
        toast.error(result.error);
      } else {
        setBlocked(!blocked);
        toast.success(blocked ? 'Usuario desbloqueado' : 'Usuario bloqueado');
      }
    });
  };

  return (
    <>
    <Button type="button" variant="outline" size="sm" className="w-28 flex-shrink-0 text-xs" disabled={pending} onClick={toggle} aria-label={blocked ? 'Desbloquear' : 'Bloquear'}>
      {blocked ? 'Desbloquear' : 'Bloquear'}
    </Button>
    {ventanaConfirmar}
    </>
  );
}
