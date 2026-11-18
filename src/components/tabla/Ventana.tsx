'use client';

import type { ReactNode } from 'react';
import * as DialogPrimitive from '@radix-ui/react-dialog';
import { X } from 'lucide-react';
import { cn } from '@/lib/utils';

type Props = {
  abierta: boolean;
  alCerrar: () => void;
  titulo: ReactNode;
  descripcion?: ReactNode;
  children: ReactNode;
  className?: string;
  testId?: string;
};

/**
 * Ventana flotante para ver o cambiar un registro de una tabla: en la computadora aparece en el medio de la pantalla;
 * en el celular ocupa toda la pantalla. El contenido se desplaza adentro; el título y la cruz quedan fijos arriba.
 */
export function Ventana({ abierta, alCerrar, titulo, descripcion, children, className, testId }: Props) {
  return (
    <DialogPrimitive.Root open={abierta} onOpenChange={(o) => { if (!o) alCerrar(); }}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-black/50 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0" />
        <DialogPrimitive.Content
          data-testid={testId}
          // El estilo del backoffice le pone su fondo gris a todo lo que lleva la clase: la ventana va en blanco
          style={{ background: 'var(--card)' }}
          // Sin foco automático en la cruz (en el celular evita el recuadro y que se abra el teclado)
          onOpenAutoFocus={(e) => e.preventDefault()}
          className={cn(
            'backoffice fixed z-50 flex flex-col shadow-2xl duration-200',
            // Celular: toda la pantalla
            'inset-0 h-dvh w-full',
            // Computadora: centrada, con bordes redondeados y alto máximo
            'sm:inset-auto sm:left-1/2 sm:top-1/2 sm:h-auto sm:max-h-[88vh] sm:w-[min(44rem,calc(100vw-2rem))] sm:-translate-x-1/2 sm:-translate-y-1/2 sm:rounded-2xl sm:border',
            'data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 sm:data-[state=closed]:zoom-out-95 sm:data-[state=open]:zoom-in-95',
            className,
          )}
        >
          <div className="flex items-start gap-3 border-b border-border px-5 py-4">
            <div className="min-w-0 flex-1">
              <DialogPrimitive.Title className="text-lg font-semibold leading-tight text-foreground">{titulo}</DialogPrimitive.Title>
              {descripcion ? (
                <DialogPrimitive.Description className="mt-0.5 text-sm text-muted-foreground">{descripcion}</DialogPrimitive.Description>
              ) : (
                <DialogPrimitive.Description className="sr-only">{titulo}</DialogPrimitive.Description>
              )}
            </div>
            <DialogPrimitive.Close className="-mr-1 rounded-lg p-2 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus:outline-none focus:ring-2 focus:ring-ring">
              <X className="h-5 w-5" />
              <span className="sr-only">Cerrar</span>
            </DialogPrimitive.Close>
          </div>
          <div className="flex-1 overflow-y-auto overscroll-contain pt-5">{children}</div>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
