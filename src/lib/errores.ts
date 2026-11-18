/**
 * Reporte de errores: piezas puras (código, mensaje de WhatsApp, recorte).
 * El envío a la base está en errores-cliente.ts.
 */

/** A quién le llega el aviso por WhatsApp cuando algo falla (con código de país y el 9 de celular). */
export const WHATSAPP_ERRORES = '5493442563953';

const ALFABETO = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // sin 0/O/1/I para que se lea bien por teléfono

/** Código corto que ve la persona y viaja en el mensaje: 6 caracteres. */
export function generarCodigo(azar: () => number = Math.random): string {
  let codigo = '';
  for (let i = 0; i < 6; i++) codigo += ALFABETO[Math.floor(azar() * ALFABETO.length)];
  return codigo;
}

export function recortar(texto: string | null | undefined, max: number): string | null {
  if (!texto) return null;
  return texto.length > max ? texto.slice(0, max) : texto;
}

/** Quita lo que no debe viajar: la parte "?..." de las URLs (puede traer tokens o datos). */
export function rutaSinParametros(url: string): string {
  try {
    return new URL(url, 'http://x').pathname;
  } catch {
    return url.split('?')[0].split('#')[0];
  }
}

export function mensajeWhatsApp(codigo: string, ruta: string): string {
  return `Hola, me apareció un error en la app de Pancho Piletas.\nCódigo: ${codigo}\nPantalla: ${rutaSinParametros(ruta)}`;
}

export function urlWhatsApp(codigo: string, ruta: string): string {
  return `https://wa.me/${WHATSAPP_ERRORES}?text=${encodeURIComponent(mensajeWhatsApp(codigo, ruta))}`;
}

export type OrigenError = 'pantalla' | 'navegador' | 'promesa';

export type ReporteError = {
  codigo: string;
  origen: OrigenError;
  mensaje: string;
  detalle?: string | null;
  ruta?: string | null;
  digest?: string | null;
  navegador?: string | null;
};

/** Fila lista para insertar en error_reports, con los largos que exige la base. */
export function filaDeReporte(r: ReporteError) {
  return {
    code: r.codigo,
    source: r.origen,
    message: recortar(r.mensaje, 1000) ?? 'Error sin mensaje',
    details: recortar(r.detalle, 6000),
    path: recortar(r.ruta ? rutaSinParametros(r.ruta) : null, 300),
    digest: recortar(r.digest, 100),
    user_agent: recortar(r.navegador, 300),
  };
}
