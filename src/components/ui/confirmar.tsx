'use client';

import { useCallback, useRef, useState } from 'react';
import * as DialogPrimitive from '@radix-ui/react-dialog';
import { AlertTriangle, HelpCircle } from 'lucide-react';
import { cn } from '@/lib/utils';

export type OpcionesConfirmar = {
  /** La pregunta, corta: "¿Borrar este pago?" */
  titulo: string;
  /** Qué va a pasar, en palabras simples: "La deuda del cliente vuelve a subir." */
  mensaje?: string;
  /** Texto del botón que confirma: "Borrar", "Quitar", "Bloquear"... */
  boton: string;
  /** Rojo para lo que borra, bloquea o no se puede deshacer fácil. */
  peligro?: boolean;
};

/**
 * Ventana para confirmar una acción, con los colores de la app (reemplaza al `window.confirm` del navegador).
 *
 *   const { confirmar, ventanaConfirmar } = useConfirmar();
 *   if (!(await confirmar({ titulo: '¿Borrar este pago?', boton: 'Borrar', peligro: true }))) return;
 *   ...
 *   return <>{...}{ventanaConfirmar}</>;
 */
export function useConfirmar() {
  const [opciones, setOpciones] = useState<OpcionesConfirmar | null>(null);
  const resolver = useRef<((si: boolean) => void) | null>(null);

  const cerrar = useCallback((si: boolean) => {
    resolver.current?.(si);
    resolver.current = null;
    setOpciones(null);
  }, []);

  const confirmar = useCallback((o: OpcionesConfirmar) => {
    resolver.current?.(false);
    setOpciones(o);
    return new Promise<boolean>((resolve) => { resolver.current = resolve; });
  }, []);

  const Icono = opciones?.peligro ? AlertTriangle : HelpCircle;

  const ventanaConfirmar = (
    <DialogPrimitive.Root open={opciones !== null} onOpenChange={(o) => { if (!o) cerrar(false); }}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-[60] bg-black/45 backdrop-blur-[2px] data-[state=open]:animate-in data-[state=open]:fade-in-0" />
        <DialogPrimitive.Content
          className="fixed left-1/2 top-1/2 z-[61] w-[calc(100%-2rem)] max-w-[400px] -translate-x-1/2 -translate-y-1/2 rounded-2xl bg-card p-6 text-center shadow-2xl outline-none data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-95"
          data-testid="confirmar-ventana"
          onOpenAutoFocus={(e) => e.preventDefault()}
        >
          <div className={cn('mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full',
            opciones?.peligro ? 'bg-red-50 text-red-600' : 'bg-[#F0F7FF] text-[#1B5FA8]')}>
            <Icono className="h-6 w-6" />
          </div>
          <DialogPrimitive.Title className="text-lg font-semibold text-foreground">{opciones?.titulo}</DialogPrimitive.Title>
          {opciones?.mensaje ? (
            <DialogPrimitive.Description className="mt-2 text-sm leading-relaxed text-muted-foreground">{opciones.mensaje}</DialogPrimitive.Description>
          ) : (
            <DialogPrimitive.Description className="sr-only">Confirmá la acción</DialogPrimitive.Description>
          )}
          <div className="mt-6 grid grid-cols-2 gap-2.5">
            <button type="button" onClick={() => cerrar(false)} data-testid="confirmar-no"
              className="h-11 rounded-full border border-border bg-background text-sm font-semibold text-foreground hover:bg-muted">
              Cancelar
            </button>
            <button type="button" onClick={() => cerrar(true)} data-testid="confirmar-si"
              className={cn('h-11 rounded-full text-sm font-semibold text-white',
                opciones?.peligro ? 'bg-red-600 hover:bg-red-700' : 'bg-[#1B5FA8] hover:bg-[#0F3D6E]')}>
              {opciones?.boton}
            </button>
          </div>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );

  return { confirmar, ventanaConfirmar };
}
