'use client';

import { useEffect, useState } from 'react';
import { MessageCircle, RotateCcw, TriangleAlert } from 'lucide-react';
import { reportarError } from '@/lib/errores-cliente';
import { urlWhatsApp } from '@/lib/errores';

type Props = {
  error: Error & { digest?: string };
  onReintentar: () => void;
};

/** Pantalla que se muestra cuando se rompe una página: anota el error y ofrece avisar por WhatsApp. */
export function CartelError({ error, onReintentar }: Props) {
  const [codigo, setCodigo] = useState<string | null>(null);

  useEffect(() => {
    let vigente = true;
    reportarError({ origen: 'pantalla', error, digest: error.digest }).then((c) => {
      if (vigente) setCodigo(c);
    });
    return () => {
      vigente = false;
    };
  }, [error]);

  const ruta = typeof window === 'undefined' ? '' : window.location.pathname;

  return (
    <main
      data-testid="cartel-error"
      className="flex min-h-screen items-center justify-center bg-[#F0F7FF] px-4 py-10"
    >
      <div className="w-full max-w-md rounded-3xl bg-white p-6 text-center shadow-lg">
        <div className="mx-auto mb-4 flex size-14 items-center justify-center rounded-full bg-amber-100 text-amber-700">
          <TriangleAlert className="size-7" aria-hidden />
        </div>
        <h1 className="text-2xl font-bold text-[#0F3D6E]">Algo salió mal</h1>
        <p className="mt-2 text-sm text-slate-600">
          Ya quedó anotado para que lo revisemos. Si querés, avisanos por WhatsApp y lo vemos más rápido.
        </p>
        {codigo && (
          <p className="mt-3 text-sm text-slate-500" data-testid="codigo-error">
            Código del error: <strong className="font-mono tracking-wider text-[#0F3D6E]">{codigo}</strong>
          </p>
        )}
        <div className="mt-6 flex flex-col gap-3">
          {codigo && (
            <a
              href={urlWhatsApp(codigo, ruta)}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex h-12 items-center justify-center gap-2 rounded-xl bg-[#1B5FA8] px-4 font-semibold text-white"
            >
              <MessageCircle className="size-5" aria-hidden />
              Avisar por WhatsApp
            </a>
          )}
          <button
            type="button"
            onClick={onReintentar}
            className="inline-flex h-12 items-center justify-center gap-2 rounded-xl border border-slate-200 px-4 font-semibold text-[#0F3D6E]"
          >
            <RotateCcw className="size-5" aria-hidden />
            Reintentar
          </button>
        </div>
      </div>
    </main>
  );
}
