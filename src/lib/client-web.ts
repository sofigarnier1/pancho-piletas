// Acceso web de los clientes (registro, "Mi cuenta" y el portal /client).
// En el MVP está APAGADO: los clientes se cargan internamente y no usan la web. Se prende con CLIENT_WEB_ACCESS=enabled
// (hoy solo en el entorno de tests). Sin dependencias: lo usa también src/proxy.ts.

export const clientWebEnabled = (env: Record<string, string | undefined> = process.env): boolean =>
  env.CLIENT_WEB_ACCESS === 'enabled';

/** Aviso del login cuando un cliente intenta entrar con el acceso apagado (`/login?sin-acceso=1`). */
export const SIN_ACCESO_PARAM = 'sin-acceso';
export const SIN_ACCESO_MENSAJE = 'El acceso de los clientes a la web todavía no está habilitado. Consultanos por WhatsApp.';

/**
 * Con el acceso apagado, un cliente con sesión que entra al portal se queda sin sesión (`signOut: true`) y vuelve al
 * login con el aviso. Devuelve null si no hay nada que hacer.
 *
 * `/register` NO se bloquea: solo se oculta su enlace (login y landing). Lo sigue usando quien entra al equipo: se
 * registra (nace cliente, así que no puede entrar) y el súper admin le cambia el rol desde Roles.
 */
export function clientWebRedirect(
  pathname: string,
  role: string | undefined,
  enabled: boolean,
): { to: string; signOut: boolean } | null {
  if (enabled) return null;
  if ((pathname === '/client' || pathname.startsWith('/client/')) && role === 'client') {
    return { to: `/login?${SIN_ACCESO_PARAM}=1`, signOut: true };
  }
  return null;
}

/** Saca de una lista lo marcado `cuentaWeb: true` cuando el acceso está apagado (menú, preguntas, opciones de la consulta). */
export const conCuentaWeb = <T extends { cuentaWeb?: boolean }>(items: readonly T[], enabled: boolean): T[] =>
  enabled ? [...items] : items.filter((i) => !i.cuentaWeb);
