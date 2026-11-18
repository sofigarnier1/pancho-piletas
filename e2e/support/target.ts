/**
 * A qué entorno corren los tests de la suite acción-por-acción: local (por defecto, el único
 * que corre sin pedir nada) o producción (opt-in explícito, porque crea y borra datos reales).
 *
 * Local: usa `supabase status` como el resto de la suite (ver ./env.ts).
 * Producción: exige E2E_TARGET=prod + E2E_ALLOW_PROD_WRITE=1 + las 4 variables de abajo.
 *   Los datos que esta corrida crea en producción llevan el prefijo ZZE2E (ver ./cleanup.ts)
 *   y se borran al terminar o al cortar por una falla.
 */
import { getLocalSupabase, TEST_APP_URL } from './env';

export type Target = {
  mode: 'local' | 'prod';
  appUrl: string;
  supabaseUrl: string;
  anonKey: string;
  serviceKey: string;
};

let cached: Target | undefined;

export function getTarget(): Target {
  if (cached) return cached;

  if (process.env.E2E_TARGET === 'prod') {
    if (process.env.E2E_ALLOW_PROD_WRITE !== '1') {
      throw new Error(
        'E2E_TARGET=prod requiere E2E_ALLOW_PROD_WRITE=1 explícito: esta corrida crea y borra datos reales ' +
        '(con prefijo ZZE2E) en la base de producción. Si es lo que querés, agregá esa variable.',
      );
    }
    const appUrl = process.env.E2E_PROD_URL;
    const supabaseUrl = process.env.E2E_PROD_SUPABASE_URL;
    const anonKey = process.env.E2E_PROD_SUPABASE_ANON_KEY;
    const serviceKey = process.env.E2E_PROD_SUPABASE_SERVICE_ROLE_KEY;
    const missing = [
      !appUrl && 'E2E_PROD_URL',
      !supabaseUrl && 'E2E_PROD_SUPABASE_URL',
      !anonKey && 'E2E_PROD_SUPABASE_ANON_KEY',
      !serviceKey && 'E2E_PROD_SUPABASE_SERVICE_ROLE_KEY',
    ].filter((x): x is string => !!x);
    if (missing.length) throw new Error(`Faltan variables para correr contra producción: ${missing.join(', ')}`);
    cached = { mode: 'prod', appUrl: appUrl!, supabaseUrl: supabaseUrl!, anonKey: anonKey!, serviceKey: serviceKey! };
    return cached;
  }

  const sb = getLocalSupabase();
  cached = { mode: 'local', appUrl: TEST_APP_URL, supabaseUrl: sb.url, anonKey: sb.anonKey, serviceKey: sb.serviceKey };
  return cached;
}

/** Prefijo con el que esta suite marca TODO lo que crea, para poder identificarlo y borrarlo. */
export const E2E_TAG = 'ZZE2E';
