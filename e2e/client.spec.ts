/**
 * Tests del portal del cliente.
 * Requieren TEST_CLIENT_EMAIL y TEST_CLIENT_PASSWORD.
 */

import { test, expect } from './support/pw';

async function assertIsAuthenticated(page: import('@playwright/test').Page, path: string) {
  await page.goto(path);
  const url = page.url();
  if (url.includes('/login')) {
    test.skip(true, 'Sin sesión de cliente — configurar TEST_CLIENT_EMAIL / TEST_CLIENT_PASSWORD');
  }
}

test.describe('Client — Header y navegación', () => {
  test.beforeEach(async ({ page }) => {
    await assertIsAuthenticated(page, '/client/dashboard');
  });

  test('header muestra el logo y nombre', async ({ page }) => {
    await expect(page.getByRole('link', { name: /Piletas Pancho/i })).toBeVisible();
  });

  test('los 4 links de navegación están visibles en desktop', async ({ page }) => {
    const nav = page.getByRole('navigation');
    await expect(nav.getByRole('link', { name: 'Inicio', exact: true })).toBeVisible();
    await expect(nav.getByRole('link', { name: 'Compras', exact: true })).toBeVisible();
    await expect(nav.getByRole('link', { name: 'Servicios', exact: true })).toBeVisible();
    await expect(nav.getByRole('link', { name: 'Puntos', exact: true })).toBeVisible();
  });
});

test.describe('Client — Dashboard', () => {
  test.beforeEach(async ({ page }) => {
    await assertIsAuthenticated(page, '/client/dashboard');
  });

  test('muestra saludo con nombre del cliente', async ({ page }) => {
    await expect(page.getByRole('heading', { name: /hola/i })).toBeVisible();
  });

  test('muestra la sección de puntos con saldo', async ({ page }) => {
    await expect(page.getByText(/mis puntos/i).first()).toBeVisible();
  });

  test('muestra links a Compras, Servicios y Puntos', async ({ page }) => {
    await expect(page.getByRole('link', { name: /mis compras/i })).toBeVisible();
    await expect(page.getByRole('link', { name: /mis servicios/i })).toBeVisible();
    await expect(page.getByRole('link', { name: /mis puntos/i })).toBeVisible();
  });

  test('muestra el nivel del cliente (al menos "Bronce")', async ({ page }) => {
    await expect(page.getByText(/bronce|plata|oro/i).first()).toBeVisible();
  });
});

test.describe('Client — Compras', () => {
  test.beforeEach(async ({ page }) => {
    await assertIsAuthenticated(page, '/client/compras');
  });

  test('la página de compras carga', async ({ page }) => {
    await expect(page.getByRole('heading', { name: /mis compras/i })).toBeVisible();
  });

  test('muestra estado vacío o lista de compras', async ({ page }) => {
    const empty = page.getByText(/sin compras registradas/i);
    const list = page.locator('[class*="space-y"]').first();
    const isEmptyState = await empty.isVisible().catch(() => false);
    const hasList = await list.isVisible().catch(() => false);
    expect(isEmptyState || hasList).toBe(true);
  });
});

test.describe('Client — Servicios', () => {
  test.beforeEach(async ({ page }) => {
    await assertIsAuthenticated(page, '/client/servicios');
  });

  test('la página de servicios carga', async ({ page }) => {
    await expect(page.getByRole('heading', { name: /mis servicios/i })).toBeVisible();
  });

  test('muestra el rango de tiempo (último año)', async ({ page }) => {
    await expect(page.getByText(/último año/i)).toBeVisible();
  });

  test('muestra estado vacío o lista de services', async ({ page }) => {
    const empty = page.getByText(/sin servicios registrados/i);
    const list = page.locator('[class*="space-y"]').first();
    const isEmptyState = await empty.isVisible().catch(() => false);
    const hasList = await list.isVisible().catch(() => false);
    expect(isEmptyState || hasList).toBe(true);
  });
});

test.describe('Client — Puntos', () => {
  test.beforeEach(async ({ page }) => {
    await assertIsAuthenticated(page, '/client/puntos');
  });

  test('la página de puntos carga', async ({ page }) => {
    await expect(page.getByRole('heading', { name: /mis puntos/i })).toBeVisible();
  });

  test('muestra el saldo actual', async ({ page }) => {
    await expect(page.getByText(/saldo actual/i)).toBeVisible();
  });

  test('muestra la sección de niveles con los 3 niveles base', async ({ page }) => {
    await expect(page.getByText('Niveles')).toBeVisible();
    await expect(page.getByText('Bronce').first()).toBeVisible();
    await expect(page.getByText('Plata').first()).toBeVisible();
    await expect(page.getByText('Oro').first()).toBeVisible();
  });

  test('muestra la sección de últimos movimientos', async ({ page }) => {
    await expect(page.getByText(/últimos movimientos/i)).toBeVisible();
  });

  test('nivel actual está marcado como "Tu nivel actual"', async ({ page }) => {
    await expect(page.getByText(/tu nivel actual/i)).toBeVisible();
  });
});
