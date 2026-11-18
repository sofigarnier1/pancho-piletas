'use client';

import { createBrowserSupabaseClient } from '@/lib/supabase/client';
import { filaDeReporte, generarCodigo, type OrigenError } from '@/lib/errores';

const MAX_POR_CARGA = 5;
const yaReportados = new Set<string>();

type Entrada = {
  origen: OrigenError;
  error: unknown;
  digest?: string | null;
};

function textos(error: unknown): { mensaje: string; detalle: string | null } {
  if (error instanceof Error) return { mensaje: error.message || error.name, detalle: error.stack ?? null };
  if (typeof error === 'string') return { mensaje: error, detalle: null };
  try {
    return { mensaje: JSON.stringify(error) ?? 'Error sin mensaje', detalle: null };
  } catch {
    return { mensaje: 'Error sin mensaje', detalle: null };
  }
}

/**
 * Anota el error en la base y devuelve el código que ve la persona.
 * Nunca falla hacia afuera: si no se puede guardar (sin conexión, por ejemplo), igual devuelve el código
 * para que el aviso por WhatsApp funcione. Repetidos y exceso se descartan para no inundar la base.
 */
export async function reportarError({ origen, error, digest }: Entrada): Promise<string> {
  const codigo = generarCodigo();
  try {
    const { mensaje, detalle } = textos(error);
    const clave = `${mensaje}|${window.location.pathname}`;
    if (yaReportados.has(clave) || yaReportados.size >= MAX_POR_CARGA) return codigo;
    yaReportados.add(clave);

    const supabase = createBrowserSupabaseClient();
    await supabase.from('error_reports').insert(
      filaDeReporte({
        codigo,
        origen,
        mensaje,
        detalle,
        ruta: window.location.pathname,
        digest,
        navegador: navigator.userAgent,
      }),
    );
  } catch {
    // Reportar el error no puede romper nada más.
  }
  return codigo;
}
