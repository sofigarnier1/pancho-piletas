/**
 * Borra TODO lo que esta suite pudo haber creado, identificado por el prefijo ZZE2E, en el
 * target activo (local o, con permiso explícito, producción — ver ./target.ts).
 *
 * El orden importa: varias FK del esquema son RESTRICT (sin "on delete cascade"), así que hay
 * que borrar los hijos antes que los padres o la base rechaza el delete. Orden verificado contra
 * las migraciones (supabase/migrations/2026050200000{1-8}_*.sql):
 *   1. landing_content.updated_by → null (si un marketing ZZE2E guardó contenido del CMS)
 *   2. point_transactions (sin cascada desde profiles/point_rules)
 *   3. service_logs (sin cascada desde profiles/pools)
 *   4. orders            (client_id sin cascada; order_items sí cascada desde orders)
 *   5. manual_sales      (client_id/sold_by sin cascada; manual_sale_items sí cascada desde manual_sales)
 *   6. itinerary_items   (pool_id sin cascada)
 *   7. itinerary_days    (created_by sin cascada; cascada hacia itinerary_items restantes)
 *   8. pools             (client_id SÍ cascada desde profiles, pero created_by no — se borra explícito)
 *   9. point_rules
 *  10. products
 *  11. auth.users (admin API) → cascada automática a profiles, client_profiles, employee_profiles
 *  12. client_levels (recién al final: profiles.client_level_id apunta acá sin cascada)
 */
import { E2E_TAG, getTarget } from './target';

type Json = Record<string, unknown>;

function rest(path: string, init: { method?: string; body?: Json } = {}) {
  const { supabaseUrl, serviceKey } = getTarget();
  return fetch(`${supabaseUrl}${path}`, {
    method: init.method ?? 'GET',
    headers: {
      apikey: serviceKey,
      Authorization: `Bearer ${serviceKey}`,
      'Content-Type': 'application/json',
      Prefer: 'return=representation',
    },
    body: init.body === undefined ? undefined : JSON.stringify(init.body),
  });
}

async function selectIds(table: string, filter: string): Promise<string[]> {
  const res = await rest(`/rest/v1/${table}?select=id&${filter}`);
  if (!res.ok) return [];
  const rows = (await res.json()) as { id: string }[];
  return rows.map((r) => r.id);
}

/** DELETE con un filtro PostgREST; devuelve cuántas filas borró. Nunca tira: una tabla ausente o sin ese filtro no debe cortar la limpieza. */
async function del(table: string, filter: string): Promise<number> {
  try {
    const res = await rest(`/rest/v1/${table}?${filter}`, { method: 'DELETE' });
    if (!res.ok) {
      console.warn(`[cleanup] DELETE ${table}?${filter} → ${res.status} ${(await res.text()).slice(0, 200)}`);
      return 0;
    }
    const rows = (await res.json().catch(() => [])) as unknown[];
    return Array.isArray(rows) ? rows.length : 0;
  } catch (e) {
    console.warn(`[cleanup] DELETE ${table}?${filter} falló: ${String(e).slice(0, 160)}`);
    return 0;
  }
}

const inList = (ids: string[]) => `(${ids.map((id) => `"${id}"`).join(',')})`;

/** Borra todo lo marcado ZZE2E del target activo. Devuelve cuántas filas borró en total (negocio + usuarios). */
export async function cleanupE2E(): Promise<number> {
  let total = 0;
  const zzeProfiles = await selectIds('profiles', `full_name=ilike.${E2E_TAG}*`);
  const zzePools = await selectIds('pools', `nickname=ilike.${E2E_TAG}*`);
  const zzeRules = await selectIds('point_rules', `name=ilike.${E2E_TAG}*`);

  // 1) Desatar landing_content.updated_by antes de poder borrar los perfiles
  if (zzeProfiles.length) {
    const res = await rest(`/rest/v1/landing_content?updated_by=in.${inList(zzeProfiles)}`, { method: 'PATCH', body: { updated_by: null } });
    void res;
  }

  // 2) point_transactions: por cliente/creador ZZE2E, por regla ZZE2E, o notas marcadas
  if (zzeProfiles.length) total += await del('point_transactions', `or=(client_id.in.${inList(zzeProfiles)},created_by.in.${inList(zzeProfiles)})`);
  if (zzeRules.length) total += await del('point_transactions', `rule_id=in.${inList(zzeRules)}`);
  total += await del('point_transactions', `notes=ilike.${E2E_TAG}*`);

  // 3) service_logs: por empleado/cliente/pileta ZZE2E, o notas marcadas (solo tiene employee_id y client_id)
  if (zzeProfiles.length) total += await del('service_logs', `or=(employee_id.in.${inList(zzeProfiles)},client_id.in.${inList(zzeProfiles)})`);
  if (zzePools.length) total += await del('service_logs', `pool_id=in.${inList(zzePools)}`);
  total += await del('service_logs', `notes=ilike.${E2E_TAG}*`);

  // 4) orders (cascada a order_items)
  if (zzeProfiles.length) total += await del('orders', `client_id=in.${inList(zzeProfiles)}`);
  total += await del('orders', `shipping_address=ilike.${E2E_TAG}*`);

  // 5) manual_sales (cascada a manual_sale_items)
  if (zzeProfiles.length) total += await del('manual_sales', `or=(client_id.in.${inList(zzeProfiles)},sold_by.in.${inList(zzeProfiles)})`);
  total += await del('manual_sales', `notes=ilike.${E2E_TAG}*`);

  // 6) itinerary_items (sin cascada desde pools)
  if (zzePools.length) total += await del('itinerary_items', `pool_id=in.${inList(zzePools)}`);
  if (zzeProfiles.length) total += await del('itinerary_items', `or=(assigned_employee_id.in.${inList(zzeProfiles)},completed_by.in.${inList(zzeProfiles)})`);

  // 7) itinerary_days (cascada a lo que quede de itinerary_items)
  if (zzeProfiles.length) total += await del('itinerary_days', `created_by=in.${inList(zzeProfiles)}`);

  // 8) pools
  if (zzeProfiles.length) total += await del('pools', `or=(client_id.in.${inList(zzeProfiles)},created_by.in.${inList(zzeProfiles)})`);
  total += await del('pools', `nickname=ilike.${E2E_TAG}*`);

  // 9) point_rules
  total += await del('point_rules', `name=ilike.${E2E_TAG}*`);

  // 10) products
  total += await del('products', `name=ilike.${E2E_TAG}*`);

  // 11) usuarios (cascada a profiles, client_profiles, employee_profiles)
  for (const id of zzeProfiles) {
    try {
      const res = await rest(`/auth/v1/admin/users/${id}`, { method: 'DELETE' });
      if (res.ok || res.status === 404) total += 1;
      else console.warn(`[cleanup] no se pudo borrar el usuario ${id}: ${res.status}`);
    } catch (e) {
      console.warn(`[cleanup] no se pudo borrar el usuario ${id}: ${String(e).slice(0, 160)}`);
    }
  }

  // 12) client_levels (recién ahora: ya no hay profiles ZZE2E que los referencien)
  total += await del('client_levels', `name=ilike.${E2E_TAG}*`);

  return total;
}
