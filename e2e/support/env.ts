/**
 * Entorno de los tests e2e: SIEMPRE contra el Supabase LOCAL (`npm run db:test:start`).
 *
 * Las claves se leen de `supabase status` en cada corrida (no se guardan en ningún archivo)
 * y se pasan por variables de entorno al servidor de Next y a los tests. Como las variables
 * de proceso tienen prioridad sobre `.env.local`, el servidor de tests nunca ve las claves
 * de producción.
 *
 * Guarda de seguridad: si la URL no es local, se aborta. Los tests crean y borran datos.
 */
import { execSync } from 'node:child_process';

export const TEST_PORT = 3002;
export const TEST_APP_URL = `http://localhost:${TEST_PORT}`;

/** Usuarios de prueba, uno por rol (+ un segundo cliente para probar aislamiento entre clientes). */
export const TEST_USERS = {
  admin:     { email: 'test-admin@piletaspancho.test',     password: 'TestAdmin123!',     role: 'super_admin' },
  owner:     { email: 'test-owner@piletaspancho.test',     password: 'TestOwner123!',     role: 'owner' },
  marketing: { email: 'test-marketing@piletaspancho.test', password: 'TestMarketing123!', role: 'marketing' },
  employee:  { email: 'test-employee@piletaspancho.test',  password: 'TestEmployee123!',  role: 'employee' },
  client:    { email: 'test-client@piletaspancho.test',    password: 'TestClient123!',    role: 'client' },
  client2:   { email: 'test-client2@piletaspancho.test',   password: 'TestClient2123!',   role: 'client' },
} as const;

export type TestUserKey = keyof typeof TEST_USERS;

const LOCAL_HOSTS = ['127.0.0.1', 'localhost', '[::1]'];

export const assertLocalUrl = (url: string): void => {
  const host = new URL(url).hostname;
  if (!LOCAL_HOSTS.includes(host)) {
    throw new Error(
      `Los tests e2e escriben datos y solo pueden correr contra Supabase local. ` +
      `La URL "${url}" no es local — abortando para no tocar datos reales.`,
    );
  }
};

export type LocalSupabase = {
  url: string;
  anonKey: string;
  serviceKey: string;
  mailUrl: string;
  dbUrl: string;
};

let cached: LocalSupabase | undefined;

export const getLocalSupabase = (): LocalSupabase => {
  if (cached) return cached;

  let out: string;
  try {
    out = execSync('npx supabase status -o env', { stdio: ['ignore', 'pipe', 'ignore'] }).toString();
  } catch {
    throw new Error('No se pudo leer el estado de Supabase local. ¿Está corriendo? Ejecutá: npm run db:test:start');
  }

  const vars: Record<string, string> = {};
  for (const line of out.split('\n')) {
    const m = line.match(/^([A-Z_]+)="?(.*?)"?$/);
    if (m) vars[m[1]] = m[2];
  }
  const { API_URL, ANON_KEY, SERVICE_ROLE_KEY, INBUCKET_URL, DB_URL } = vars;
  if (!API_URL || !ANON_KEY || !SERVICE_ROLE_KEY) {
    throw new Error('`supabase status` no devolvió API_URL / ANON_KEY / SERVICE_ROLE_KEY. ¿Está corriendo? npm run db:test:start');
  }
  assertLocalUrl(API_URL);

  cached = { url: API_URL, anonKey: ANON_KEY, serviceKey: SERVICE_ROLE_KEY, mailUrl: INBUCKET_URL ?? '', dbUrl: DB_URL ?? '' };
  return cached;
};

/** Variables que deben ver el servidor de Next y los tests. */
export const buildE2eEnv = (): Record<string, string> => {
  const sb = getLocalSupabase();
  const env: Record<string, string> = {
    NEXT_PUBLIC_SUPABASE_URL: sb.url,
    NEXT_PUBLIC_SUPABASE_ANON_KEY: sb.anonKey,
    SUPABASE_SERVICE_ROLE_KEY: sb.serviceKey,
    NEXT_PUBLIC_APP_URL: TEST_APP_URL,
    NEXT_PUBLIC_WA_NUMBER: '5491100000000',
    E2E_MAIL_URL: sb.mailUrl,
    E2E_DB_URL: sb.dbUrl,
    // Compatibilidad con los specs existentes
    RUN_RLS_ATTACK_TESTS: '1',
    // Acceso web de los clientes (registro, Mi cuenta, portal /client): apagado en producción en el MVP, prendido en los
    // tests para seguir probando el portal y sus capturas. Lo apagado se prueba en src/lib/client-web.test.ts.
    CLIENT_WEB_ACCESS: 'enabled',
  };
  for (const [key, u] of Object.entries(TEST_USERS)) {
    const k = key.toUpperCase();
    env[`TEST_${k}_EMAIL`] = u.email;
    env[`TEST_${k}_PASSWORD`] = u.password;
  }
  return env;
};
