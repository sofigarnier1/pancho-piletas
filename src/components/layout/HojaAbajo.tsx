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
  testId?: string;
};

/**
 * Ventana que sube desde abajo (pensada para el celular del empleado: se maneja con el pulgar).
 * En la computadora queda centrada abajo, con un ancho cómodo. El contenido se desplaza adentro.
 */
export function HojaAbajo({ abierta, alCerrar, titulo, descripcion, children, testId }: Props) {
  return (
    <DialogPrimitive.Root open={abierta} onOpenChange={(o) => { if (!o) alCerrar(); }}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-black/50 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0" />
        <DialogPrimitive.Content
          data-testid={testId}
          // El estilo del backoffice le pone su fondo gris a todo lo que lleva la clase: la hoja va en blanco
          style={{ background: 'var(--card)' }}
          // Sin foco automático (en el celular evita que se abra el teclado apenas sube la hoja)
          onOpenAutoFocus={(e) => e.preventDefault()}
          className={cn(
            'backoffice fixed inset-x-0 bottom-0 z-50 mx-auto flex max-h-[92dvh] w-full max-w-lg flex-col rounded-t-2xl border-t shadow-2xl duration-300',
            'pb-[env(safe-area-inset-bottom)]',
            'data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:slide-out-to-bottom data-[state=open]:slide-in-from-bottom',
          )}
        >
          {/* Manija: indica que es una hoja que se puede cerrar */}
          <div className="mx-auto mt-2 h-1.5 w-10 rounded-full bg-border" aria-hidden="true" />
          <div className="flex items-start gap-3 px-5 pb-3 pt-2">
            <div className="min-w-0 flex-1">
              <DialogPrimitive.Title className="text-lg font-semibold leading-tight text-foreground">{titulo}</DialogPrimitive.Title>
              {descripcion ? (
                <DialogPrimitive.Description className="mt-0.5 truncate text-sm text-muted-foreground">{descripcion}</DialogPrimitive.Description>
              ) : (
                <DialogPrimitive.Description className="sr-only">{titulo}</DialogPrimitive.Description>
              )}
            </div>
            <DialogPrimitive.Close className="-mr-1 rounded-lg p-2 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus:outline-none focus:ring-2 focus:ring-ring">
              <X className="h-5 w-5" />
              <span className="sr-only">Cerrar</span>
            </DialogPrimitive.Close>
          </div>
          <div className="flex-1 overflow-y-auto overscroll-contain px-5 pb-5">{children}</div>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
