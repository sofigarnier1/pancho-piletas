import { execSync } from 'node:child_process';
import { assertLocalUrl, getLocalSupabase } from './env';
import { seed } from './seed';

/** Tras `db reset` los servicios (auth, REST) reinician: se espera a que respondan antes de sembrar. */
async function waitForServices(url: string, anonKey: string, serviceKey: string, timeoutMs = 60_000) {
  const deadline = Date.now() + timeoutMs;
  let last = '';
  while (Date.now() < deadline) {
    try {
      const [auth, rest] = await Promise.all([
        fetch(`${url}/auth/v1/health`, { headers: { apikey: anonKey } }),
        // con service role: el rol anon no tiene permiso de lectura sobre profiles (da 401 aunque el servicio esté sano)
        fetch(`${url}/rest/v1/profiles?select=id&limit=1`, { headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}` } }),
      ]);
      if (auth.ok && rest.ok) return;
      last = `auth ${auth.status}, rest ${rest.status}`;
    } catch (e) {
      last = String(e);
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error(`Supabase local no quedó disponible tras el reset (${last})`);
}

/** Base local limpia (migraciones desde cero) + datos fijos. Aborta si la URL no es local. */
export async function resetAndSeed(): Promise<void> {
  const sb = getLocalSupabase();
  assertLocalUrl(sb.url);

  if (process.env.E2E_SKIP_RESET === '1') {
    console.log('[test] E2E_SKIP_RESET=1: se usa la base tal como está.');
    return;
  }

  const t0 = Date.now();
  execSync('npx supabase db reset --local', { stdio: 'ignore' });
  await waitForServices(sb.url, sb.anonKey, sb.serviceKey);
  await seed();
  console.log(`[test] base local reseteada y sembrada en ${((Date.now() - t0) / 1000).toFixed(1)}s`);
}
