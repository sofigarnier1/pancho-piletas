'use client';

import { useTransition } from 'react';
import { toggleRuleAction } from './actions';
import { toast } from 'sonner';
import { useConfirmar } from '@/components/ui/confirmar';

type Props = { ruleId: string; isActive: boolean };

export function ToggleRuleButton({ ruleId, isActive }: Props) {
  const [pending, startTransition] = useTransition();
  const { confirmar, ventanaConfirmar } = useConfirmar();

  const handleToggle = async () => {
    if (isActive && !(await confirmar({ titulo: '¿Desactivar esta regla?', mensaje: 'Deja de aplicarse hasta que la vuelvas a activar.', boton: 'Desactivar', peligro: true }))) return;
    startTransition(async () => {
      const result = await toggleRuleAction(ruleId, !isActive);
      if (result.error) {
        toast.error(result.error);
      } else {
        toast.success(isActive ? 'Regla desactivada' : 'Regla activada');
      }
    });
  };

  return (
    <>
    <button
      data-testid="regla-interruptor"
      onClick={handleToggle}
      disabled={pending}
      className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus-visible:outline-none disabled:opacity-50 ${
        isActive ? 'bg-[#2b9270]' : 'bg-muted-foreground/30'
      }`}
    >
      <span
        className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow-lg ring-0 transition duration-200 ease-in-out ${
          isActive ? 'translate-x-4' : 'translate-x-0'
        }`}
      />
    </button>
    {ventanaConfirmar}
    </>
  );
}
