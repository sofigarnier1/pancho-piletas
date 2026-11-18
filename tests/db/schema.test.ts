/**
 * Invariantes del esquema (lo que un linter de seguridad revisaría):
 * toda tabla con RLS y con políticas, funciones sensibles con search_path fijo y sin acceso público,
 * triggers esperados activos, y ninguna política de escritura abierta a todos.
 *
 * Si agregás una tabla, sumala a la matriz (rls-matrix.test.ts) y a EXPECTED_TABLES.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import pg from 'pg';
import { getLocalSupabase } from '../../e2e/support/env';

const EXPECTED_TABLES = [
  'chlorine_stock', 'client_levels', 'client_prices', 'client_profiles', 'employee_profiles', 'error_reports', 'itinerary_day_crews', 'itinerary_days', 'itinerary_items',
  'landing_clicks', 'landing_content', 'manual_sale_items', 'manual_sales', 'order_items', 'orders', 'payments', 'point_rules', 'point_transactions',
  'pool_clients', 'pool_month_notes', 'pools', 'products', 'profiles', 'service_log_history', 'service_logs', 'stock_movements', 'vehicles',
];

let db: pg.Client;
const q = async <T extends pg.QueryResultRow>(sql: string, params: unknown[] = []) => (await db.query<T>(sql, params)).rows;

beforeAll(async () => {
  db = new pg.Client({ connectionString: getLocalSupabase().dbUrl });
  await db.connect();
});
afterAll(async () => { await db.end(); });

describe('esquema · tablas y RLS', () => {
  it('las tablas del esquema public son exactamente las cubiertas por la matriz de permisos', async () => {
    const rows = await q<{ relname: string }>(`select relname from pg_class where relnamespace='public'::regnamespace and relkind in ('r','p') order by 1`);
    expect(rows.map((r) => r.relname)).toEqual(EXPECTED_TABLES);
  });

  it('todas tienen RLS activado', async () => {
    const rows = await q<{ relname: string }>(`select relname from pg_class where relnamespace='public'::regnamespace and relkind in ('r','p') and not relrowsecurity`);
    expect(rows.map((r) => r.relname), 'tablas SIN RLS (accesibles para cualquiera con la clave pública)').toEqual([]);
  });

  it('ninguna tabla tiene RLS "forzado" apagado por error y todas tienen al menos una política', async () => {
    const rows = await q<{ tablename: string; n: string }>(`select c.relname as tablename, count(p.policyname)::text as n from pg_class c left join pg_policies p on p.tablename=c.relname and p.schemaname='public' where c.relnamespace='public'::regnamespace and c.relkind in ('r','p') group by 1`);
    for (const r of rows) expect(Number(r.n), `${r.tablename} no tiene políticas (nadie podría leerla)`).toBeGreaterThan(0);
  });

  it('ninguna política de escritura está abierta a todos (USING/CHECK true)', async () => {
    const rows = await q(`select tablename, policyname, cmd from pg_policies where schemaname='public' and cmd in ('INSERT','UPDATE','DELETE','ALL') and (qual='true' or with_check='true')`);
    expect(rows).toEqual([]);
  });

  it('solo client_levels y landing_content se leen sin condición', async () => {
    const rows = await q<{ tablename: string }>(`select distinct tablename from pg_policies where schemaname='public' and cmd in ('SELECT','ALL') and qual='true' order by 1`);
    expect(rows.map((r) => r.tablename)).toEqual(['client_levels', 'landing_content']);
  });

  it.each(['landing_clicks', 'error_reports'])('%s es una de las dos únicas tablas donde cualquiera puede escribir: solo insertar, y con largos acotados', async (tabla) => {
    const rows = await q<{ cmd: string; roles: string[]; with_check: string | null; qual: string | null }>(`select cmd, roles::text[] as roles, with_check, qual from pg_policies where schemaname='public' and tablename=$1 and permissive='PERMISSIVE' and 'anon' = any(roles::text[])`, [tabla]);
    expect(rows.map((r) => r.cmd)).toEqual(['INSERT']);
    expect(rows[0].roles.sort()).toEqual(['anon', 'authenticated']);
    expect(rows[0].with_check).toMatch(/char_length/);
  });

  it('toda política de escritura exige un rol o ser el dueño de la fila', async () => {
    const rows = await q<{ tablename: string; policyname: string; qual: string | null; with_check: string | null }>(
      // Las restrictivas (cuentas bloqueadas) solo restan acceso: no otorgan nada, se verifican aparte
      `select tablename, policyname, qual, with_check from pg_policies where schemaname='public' and permissive='PERMISSIVE' and cmd in ('INSERT','UPDATE','DELETE','ALL') and tablename not in ('landing_clicks', 'error_reports')`);
    for (const r of rows) {
      const expr = `${r.qual ?? ''} ${r.with_check ?? ''}`;
      expect(/get_my_role|is_admin|is_owner_or_above|can_edit_points|auth\.uid\(\)|client_id|employee_id/.test(expr), `${r.tablename}.${r.policyname}: ${expr}`).toBe(true);
    }
  });
});

describe('esquema · funciones', () => {
  it('toda función SECURITY DEFINER fija su search_path (evita secuestro de funciones)', async () => {
    const rows = await q<{ proname: string }>(`select proname from pg_proc where pronamespace='public'::regnamespace and prosecdef and (proconfig is null or not exists (select 1 from unnest(proconfig) c where c like 'search_path=%'))`);
    expect(rows.map((r) => r.proname)).toEqual([]);
  });

  it('los guardianes y funciones de ayuda de las políticas también fijan search_path', async () => {
    const rows = await q<{ proname: string }>(`select proname from pg_proc where pronamespace='public'::regnamespace and proname in ('guard_profile_write','guard_product_update','guard_itinerary_item_update','get_my_role','is_admin','is_owner_or_above','can_edit_points','adjust_stock') and (proconfig is null or not exists (select 1 from unnest(proconfig) c where c like 'search_path=%'))`);
    expect(rows.map((r) => r.proname)).toEqual([]);
  });

  it.each([
    'handle_new_user', 'sync_role_to_app_metadata', 'update_client_points_and_level',
    // Migración 30: las funciones de trigger no se llaman por la API
    'guard_itinerary_item_update', 'guard_pool_client_write', 'guard_product_update', 'guard_profile_write', 'check_item_rescheduled_from',
    'guard_client_price_write', 'guard_payment_write',
  ])('%s no es ejecutable por anon ni authenticated', async (fn) => {
    const [r] = await q<{ anon: boolean; auth: boolean }>(`select has_function_privilege('anon', p.oid, 'execute') as anon, has_function_privilege('authenticated', p.oid, 'execute') as auth from pg_proc p where p.pronamespace='public'::regnamespace and p.proname=$1`, [fn]);
    expect(r).toEqual({ anon: false, auth: false });
  });

  it.each(['adjust_stock', 'employee_can_see_pool', 'pendientes_sin_reprogramar', 'precio_vigente', 'movimientos_cuenta', 'deuda_clientes'])('%s solo la ejecutan usuarios autenticados', async (fn) => {
    const [r] = await q<{ anon: boolean; auth: boolean }>(`select has_function_privilege('anon', p.oid, 'execute') as anon, has_function_privilege('authenticated', p.oid, 'execute') as auth from pg_proc p where p.pronamespace='public'::regnamespace and p.proname=$1`, [fn]);
    expect(r).toEqual({ anon: false, auth: true });
  });

  it.each(['get_my_role', 'is_admin', 'is_owner_or_above'])('%s es ejecutable (las políticas lo necesitan para anon y authenticated)', async (fn) => {
    const [r] = await q<{ anon: boolean; auth: boolean }>(`select has_function_privilege('anon', p.oid, 'execute') as anon, has_function_privilege('authenticated', p.oid, 'execute') as auth from pg_proc p where p.pronamespace='public'::regnamespace and p.proname=$1`, [fn]);
    expect(r).toEqual({ anon: true, auth: true });
  });
});

describe('esquema · triggers', () => {
  const EXPECTED: [string, string][] = [
    ['profiles', 'tr_guard_profile_write'], ['profiles', 'tr_sync_role'], ['profiles', 'tr_profiles_updated_at'],
    ['products', 'tr_guard_product_update'], ['itinerary_items', 'tr_guard_itinerary_item_update'],
    ['service_logs', 'tr_guard_service_log_write'], ['profiles', 'tr_revoke_sessions_on_block'],
    ['point_transactions', 'tr_update_points_and_level'], ['orders', 'tr_deduct_stock'], ['manual_sale_items', 'tr_deduct_stock_manual'],
    ['service_logs', 'tr_close_item_on_log'],
    // equipo rojo 2026-10-19 (migración 17)
    ['manual_sales', 'tr_guard_manual_sale'], ['manual_sale_items', 'tr_manual_sale_total'], ['point_transactions', 'tr_point_tx_created_by'],
    // autos, rutas y registros (migración 22)
    ['service_logs', 'tr_service_log_history'], ['service_logs', 'tr_reopen_item_on_log_delete'], ['service_logs', 'tr_service_logs_updated_at'],
    ['profiles', 'tr_set_profile_has_account'], ['itinerary_day_crews', 'tr_guard_day_crew_write'], ['vehicles', 'tr_vehicles_updated_at'],
    // piletas compartidas (migración 24)
    ['pools', 'tr_sync_pool_primary_client'], ['pool_clients', 'tr_guard_pool_client_write'],
    // encargado de la visita (migración 26)
    ['itinerary_items', 'tr_check_item_assignee'],
    // notas del mes (migración 27)
    ['pool_month_notes', 'tr_stamp_pool_month_note'], ['pool_month_notes', 'tr_pool_month_notes_updated_at'],
    // nota de "no se pudo" (migración 28)
    ['itinerary_items', 'tr_clear_item_status_note'],
    // visitas reprogramadas (migración 30)
    ['itinerary_items', 'tr_check_item_rescheduled_from'],
    // precios por cliente (migración 31)
    ['client_prices', 'tr_guard_client_price_write'], ['client_prices', 'tr_client_prices_updated_at'],
    // cobros (migración 32)
    ['payments', 'tr_guard_payment_write'], ['payments', 'tr_payments_updated_at'],
    // stock de cloro y ventas (migración 34)
    ['chlorine_stock', 'tr_chlorine_stock_updated_at'], ['products', 'tr_set_product_category'],
    ['service_logs', 'tr_stock_por_service'],
  ];
  it.each(EXPECTED)('%s tiene el trigger %s activo', async (table, name) => {
    const rows = await q<{ tgenabled: string }>(`select tgenabled from pg_trigger where tgname=$1 and tgrelid=('public.'||$2)::regclass`, [name, table]);
    expect(rows.map((r) => r.tgenabled), `trigger ${name} ausente o desactivado`).toEqual(['O']);
  });

  it.each(['tr_on_auth_user_created', 'tr_on_auth_user_deleted'])('%s está activo sobre auth.users (alta y baja del perfil)', async (name) => {
    const rows = await q<{ tgenabled: string }>(`select tgenabled from pg_trigger where tgname=$1 and tgrelid='auth.users'::regclass`, [name]);
    expect(rows.map((r) => r.tgenabled)).toEqual(['O']);
  });

  it('ya no existe el índice de un solo registro por visita (migración 22)', async () => {
    expect(await q(`select 1 from pg_indexes where indexname='ux_service_logs_item'`)).toEqual([]);
  });

  it('toda tabla con columna updated_at tiene su trigger set_updated_at (BEFORE UPDATE)', async () => {
    const rows = await q<{ table_name: string }>(`select c.table_name from information_schema.columns c where c.table_schema='public' and c.column_name='updated_at' and not exists (select 1 from pg_trigger t join pg_proc p on p.oid=t.tgfoid where t.tgrelid=('public.'||c.table_name)::regclass and not t.tgisinternal and p.proname='set_updated_at')`);
    expect(rows.map((r) => r.table_name), 'tablas con updated_at pero sin trigger set_updated_at').toEqual([]);
  });

  it('el índice único de itinerario existe', async () => {
    const rows = await q(`select 1 from pg_indexes where indexname='ux_itinerary_items_day_pool'`);
    expect(rows).toHaveLength(1);
  });

  it('cuentas bloqueadas: toda tabla privada tiene la política restrictiva y las públicas de la landing no', async () => {
    const restrictive = await q<{ tablename: string }>(
      `select tablename from pg_policies where schemaname='public' and permissive='RESTRICTIVE' and policyname='blocked denied' order by 1`);
    const names = restrictive.map((r) => r.tablename);
    expect(names).toEqual([
      'chlorine_stock', 'client_prices', 'client_profiles', 'employee_profiles', 'error_reports', 'itinerary_day_crews', 'itinerary_days', 'itinerary_items', 'manual_sale_items',
      'manual_sales', 'order_items', 'orders', 'payments', 'point_rules', 'point_transactions', 'pool_clients', 'pool_month_notes', 'pools', 'profiles', 'service_log_history',
      'service_logs', 'stock_movements', 'vehicles',
    ]);
    // Cualquier otra restrictiva sería inesperada
    const others = await q(`select tablename, policyname from pg_policies where schemaname='public' and permissive='RESTRICTIVE' and policyname <> 'blocked denied'`);
    expect(others).toEqual([]);
    // Lo público de la landing tiene que seguir funcionando para una cuenta bloqueada
    for (const pub of ['products', 'landing_content', 'client_levels']) expect(names).not.toContain(pub);
  });
});
