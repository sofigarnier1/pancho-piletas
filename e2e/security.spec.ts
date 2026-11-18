/**
 * Tests de seguridad (regresión de la auditoría del 2026-09-30).
 *
 * 1) Siempre corren: validación anti open-redirect y acceso a rutas por rol.
 * 2) Solo con RUN_RLS_ATTACK_TESTS=1: intentan ataques reales contra la base
 *    (escalada de rol, puntos, pedidos "pagados", service_logs ajenos).
 *    Requieren haber aplicado la migración 20261001000010 y SUPABASE_SERVICE_ROLE_KEY
 *    en .env.local. Cada test restaura el estado original aunque falle.
 *
 *    RUN_RLS_ATTACK_TESTS=1 npx playwright test --project=security
 */

import { test, expect, type Page, type APIRequestContext } from '@playwright/test';
import { safeNextPath } from '../src/lib/safe-next';

// ─── 1) safeNextPath: open redirect ─────────────────────────────────────────

test.describe('safeNextPath — open redirect', () => {
  const blocked = [
    '@evil.com',
    '//evil.com',
    '/\\evil.com',
    '/@evil.com',
    'https://evil.com',
    'javascript:alert(1)',
    '/ok\n//evil.com',
    '',
  ];
  for (const input of blocked) {
    test(`bloquea ${JSON.stringify(input)}`, () => {
      expect(safeNextPath(input)).toBe('/');
    });
  }

  test('bloquea null / undefined', () => {
    expect(safeNextPath(null)).toBe('/');
    expect(safeNextPath(undefined)).toBe('/');
  });

  test('deja pasar rutas internas', () => {
    expect(safeNextPath('/')).toBe('/');
    expect(safeNextPath('/client/dashboard')).toBe('/client/dashboard');
    expect(safeNextPath('/admin/clientes?x=1')).toBe('/admin/clientes?x=1');
  });
});

// ─── 2) Acceso a rutas por rol ──────────────────────────────────────────────

async function gotoOrSkip(page: Page, path: string, role: string) {
  await page.goto(path);
  if (page.url().includes('/login')) {
    test.skip(true, `Sin sesión de ${role} — configurar TEST_${role.toUpperCase()}_EMAIL / _PASSWORD`);
  }
}

const AUTH = (name: string) => `playwright/.auth/${name}.json`;

test.describe('Rutas por rol — cliente', () => {
  test.use({ storageState: AUTH('client') });

  test('no entra a /admin', async ({ page }) => {
    await gotoOrSkip(page, '/client/dashboard', 'client');
    await page.goto('/admin/dashboard');
    await expect(page).toHaveURL(/\/client\/dashboard/);
  });

  test('no entra a /employee', async ({ page }) => {
    await gotoOrSkip(page, '/client/dashboard', 'client');
    await page.goto('/employee/itinerario');
    await expect(page).toHaveURL(/\/client\/dashboard/);
  });

  test('con sesión, /login lo manda a su panel', async ({ page }) => {
    await gotoOrSkip(page, '/client/dashboard', 'client');
    await page.goto('/login');
    await expect(page).toHaveURL(/\/client\/dashboard/);
  });
});

test.describe('Rutas por rol — empleado', () => {
  test.use({ storageState: AUTH('employee') });

  test('no entra a /admin', async ({ page }) => {
    await gotoOrSkip(page, '/employee/itinerario', 'employee');
    await page.goto('/admin/dashboard');
    await expect(page).toHaveURL(/\/employee\/itinerario/);
  });

  test('no entra al portal de clientes', async ({ page }) => {
    await gotoOrSkip(page, '/employee/itinerario', 'employee');
    await page.goto('/client/dashboard');
    await expect(page).toHaveURL(/\/employee\/itinerario/);
  });
});

test.describe('Rutas por rol — admin', () => {
  test.use({ storageState: AUTH('admin') });

  test('no entra a /client; a /employee sí (modo campo)', async ({ page }) => {
    await gotoOrSkip(page, '/admin/dashboard', 'admin');
    await page.goto('/client/dashboard');
    await expect(page).toHaveURL(/\/admin\/dashboard/);
    await page.goto('/employee/itinerario');
    await expect(page).toHaveURL(/\/employee\/itinerario/);
    await expect(page.getByTestId('modo-campo')).toBeVisible();
  });

  test('con sesión, /login lo manda al dashboard', async ({ page }) => {
    await gotoOrSkip(page, '/admin/dashboard', 'admin');
    await page.goto('/login');
    await expect(page).toHaveURL(/\/admin\/dashboard/);
  });
});

test.describe('Rutas por rol — marketing', () => {
  test.use({ storageState: AUTH('marketing') });

  test('no entra a /employee', async ({ page }) => {
    await gotoOrSkip(page, '/admin/dashboard', 'marketing');
    await page.goto('/employee/itinerario');
    await expect(page).toHaveURL(/\/admin\/dashboard/);
  });
});

test.describe('Sin sesión', () => {
  for (const path of ['/admin/dashboard', '/admin/roles', '/client/dashboard', '/employee/itinerario']) {
    test(`${path} redirige a /login`, async ({ page }) => {
      await page.goto(path);
      await expect(page).toHaveURL(/\/login/);
    });
  }
});

// ─── 3) Ataques contra la base (opt-in) ─────────────────────────────────────

const RUN_ATTACKS = process.env.RUN_RLS_ATTACK_TESTS === '1';
const SUPA = process.env.NEXT_PUBLIC_SUPABASE_URL ?? '';
const ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? '';
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY ?? '';

type Session = { token: string; userId: string };

async function signIn(request: APIRequestContext, email?: string, password?: string): Promise<Session> {
  test.skip(!email || !password, 'Faltan credenciales de test');
  const res = await request.post(`${SUPA}/auth/v1/token?grant_type=password`, {
    headers: { apikey: ANON, 'Content-Type': 'application/json' },
    data: { email, password },
  });
  expect(res.ok(), 'login contra Supabase').toBeTruthy();
  const json = await res.json();
  return { token: json.access_token, userId: json.user.id };
}

const asUser = (s: Session) => ({
  apikey: ANON,
  Authorization: `Bearer ${s.token}`,
  'Content-Type': 'application/json',
  Prefer: 'return=representation',
});

const asService = {
  apikey: SERVICE,
  Authorization: `Bearer ${SERVICE}`,
  'Content-Type': 'application/json',
  Prefer: 'return=representation',
};

// Las llamadas con la secret key van por fetch de Node: el request de Playwright se
// identifica como Chrome y Supabase rechaza ("Forbidden use of secret API key in browser").
const svc = (path: string, init: { method?: string; body?: unknown } = {}) =>
  fetch(`${SUPA}${path}`, {
    method: init.method ?? 'GET',
    headers: asService,
    body: init.body === undefined ? undefined : JSON.stringify(init.body),
  });

async function readProfile(_request: APIRequestContext, id: string, cols: string) {
  const res = await svc(`/rest/v1/profiles?id=eq.${id}&select=${cols}`);
  const body = await res.text();
  expect(res.ok, `lectura con service role: ${res.status} ${body.slice(0, 200)}`).toBeTruthy();
  const rows = JSON.parse(body);
  expect(rows.length, `no se encontró el perfil ${id}: ${body.slice(0, 200)}`).toBeGreaterThan(0);
  return rows[0];
}

test.describe('RLS — ataques (RUN_RLS_ATTACK_TESTS=1)', () => {
  // Varios tests modifican y restauran al mismo usuario de prueba: no pueden correr en paralelo.
  test.describe.configure({ mode: 'serial' });
  test.skip(!RUN_ATTACKS, 'Opt-in: RUN_RLS_ATTACK_TESTS=1');
  test.skip(!SUPA || !ANON || !SERVICE, 'Faltan variables de Supabase en .env.local');

  test('un cliente no puede cambiarse el rol', async ({ request }) => {
    const s = await signIn(request, process.env.TEST_CLIENT_EMAIL, process.env.TEST_CLIENT_PASSWORD);
    try {
      const res = await request.patch(`${SUPA}/rest/v1/profiles?id=eq.${s.userId}`, {
        headers: asUser(s),
        data: { role: 'super_admin' },
      });
      expect(res.ok(), 'el PATCH debería ser rechazado').toBeFalsy();

      expect((await readProfile(request, s.userId, 'role')).role).toBe('client');
    } finally {
      await svc(`/rest/v1/profiles?id=eq.${s.userId}`, { method: 'PATCH', body: { role: 'client' } });
    }
  });

  test('un cliente no puede darse puntos ni nivel', async ({ request }) => {
    const s = await signIn(request, process.env.TEST_CLIENT_EMAIL, process.env.TEST_CLIENT_PASSWORD);
    const before = await readProfile(request, s.userId, 'points_balance,client_level_id');
    try {
      const res = await request.patch(`${SUPA}/rest/v1/profiles?id=eq.${s.userId}`, {
        headers: asUser(s),
        data: { points_balance: 999999 },
      });
      expect(res.ok(), 'el PATCH debería ser rechazado').toBeFalsy();

      expect((await readProfile(request, s.userId, 'points_balance')).points_balance).toBe(before.points_balance);
    } finally {
      await svc(`/rest/v1/profiles?id=eq.${s.userId}`, { method: 'PATCH', body: before });
    }
  });

  test('un cliente no puede crear un pedido ya pagado', async ({ request }) => {
    const s = await signIn(request, process.env.TEST_CLIENT_EMAIL, process.env.TEST_CLIENT_PASSWORD);
    try {
      const res = await request.post(`${SUPA}/rest/v1/orders`, {
        headers: asUser(s),
        data: { client_id: s.userId, status: 'paid', subtotal_cents: 1, total_cents: 1 },
      });
      expect(res.ok(), 'el INSERT debería ser rechazado').toBeFalsy();
    } finally {
      await svc(`/rest/v1/orders?client_id=eq.${s.userId}&total_cents=eq.1`, { method: 'DELETE' });
    }
  });

  test('un empleado no registra service sobre una pileta fuera del itinerario', async ({ request }) => {
    const s = await signIn(request, process.env.TEST_EMPLOYEE_EMAIL, process.env.TEST_EMPLOYEE_PASSWORD);
    const pools = await (await svc('/rest/v1/pools?select=id,client_id&limit=1')).json();
    test.skip(!pools.length, 'No hay piletas cargadas para probar');

    const res = await request.post(`${SUPA}/rest/v1/service_logs`, {
      headers: asUser(s),
      data: { employee_id: s.userId, pool_id: pools[0].id, client_id: pools[0].client_id, itinerary_item_id: null },
    });
    try {
      expect(res.ok(), 'el INSERT debería ser rechazado').toBeFalsy();
    } finally {
      await svc(`/rest/v1/service_logs?employee_id=eq.${s.userId}&itinerary_item_id=is.null`, { method: 'DELETE' });
    }
  });
  test('marketing asigna puntos y el saldo del cliente se actualiza', async ({ request }) => {
    const mkt = await signIn(request, process.env.TEST_MARKETING_EMAIL, process.env.TEST_MARKETING_PASSWORD);
    const cli = await signIn(request, process.env.TEST_CLIENT_EMAIL, process.env.TEST_CLIENT_PASSWORD);
    const before = await readProfile(request, cli.userId, 'points_balance,client_level_id');
    let txId: string | undefined;
    try {
      const res = await request.post(`${SUPA}/rest/v1/point_transactions`, {
        headers: asUser(mkt),
        data: { client_id: cli.userId, points: 7, source_type: 'manual_grant', notes: 'e2e-security', created_by: mkt.userId },
      });
      expect(res.ok(), `insert de puntos por marketing: ${res.status()} ${await res.text()}`).toBeTruthy();
      txId = (await res.json())[0]?.id;

      const after = await readProfile(request, cli.userId, 'points_balance');
      expect(after.points_balance).toBe(before.points_balance + 7);
    } finally {
      if (txId) await svc(`/rest/v1/point_transactions?id=eq.${txId}`, { method: 'DELETE' });
      await svc(`/rest/v1/profiles?id=eq.${cli.userId}`, { method: 'PATCH', body: before });
    }
  });

  test('marketing no puede cambiar el stock de un producto (el precio sí: migración 19)', async ({ request }) => {
    const mkt = await signIn(request, process.env.TEST_MARKETING_EMAIL, process.env.TEST_MARKETING_PASSWORD);
    const products = await (await svc('/rest/v1/products?select=id,stock_units&limit=1')).json();
    test.skip(!products.length, 'No hay productos cargados para probar');
    const { id, stock_units } = products[0];
    try {
      const res = await request.patch(`${SUPA}/rest/v1/products?id=eq.${id}`, {
        headers: asUser(mkt),
        data: { stock_units: (stock_units ?? 0) + 1 },
      });
      expect(res.ok(), 'el PATCH de stock debería ser rechazado').toBeFalsy();
    } finally {
      await svc(`/rest/v1/products?id=eq.${id}`, { method: 'PATCH', body: { stock_units } });
    }
  });
});
