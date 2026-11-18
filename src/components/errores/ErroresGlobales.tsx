'use client';

import { useEffect } from 'react';
import { toast } from 'sonner';
import { reportarError } from '@/lib/errores-cliente';
import { urlWhatsApp, type OrigenError } from '@/lib/errores';

// Avisos del navegador que no son fallas de la app (extensiones, scripts de terceros, ajustes de layout).
const RUIDO = [/ResizeObserver loop/i, /^Script error\.?$/i, /Non-Error promise rejection/i, /AbortError/i];

function esRuido(mensaje: string) {
  return RUIDO.some((r) => r.test(mensaje));
}

/** Atrapa los errores que ninguna pantalla manejó, los anota y avisa con un cartel que ofrece WhatsApp. */
export function ErroresGlobales() {
  useEffect(() => {
    async function manejar(origen: OrigenError, error: unknown, mensaje: string) {
      if (esRuido(mensaje)) return;
      const codigo = await reportarError({ origen, error });
      toast.error('Algo salió mal', {
        description: `Ya quedó anotado (código ${codigo}).`,
        duration: 15000,
        action: {
          label: 'Avisar por WhatsApp',
          onClick: () => window.open(urlWhatsApp(codigo, window.location.pathname), '_blank', 'noopener'),
        },
      });
    }

    const alError = (e: ErrorEvent) => {
      // Sin archivo de origen suele ser una extensión del navegador, no la app.
      if (!e.filename) return;
      void manejar('navegador', e.error ?? e.message, e.message ?? '');
    };
    const alRechazo = (e: PromiseRejectionEvent) => {
      const r = e.reason;
      void manejar('promesa', r, r instanceof Error ? r.message : String(r ?? ''));
    };

    window.addEventListener('error', alError);
    window.addEventListener('unhandledrejection', alRechazo);
    return () => {
      window.removeEventListener('error', alError);
      window.removeEventListener('unhandledrejection', alRechazo);
    };
  }, []);

  return null;
}
