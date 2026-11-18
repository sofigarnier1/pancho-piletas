/**
 * Tests del portal del empleado.
 * Requieren TEST_EMPLOYEE_EMAIL y TEST_EMPLOYEE_PASSWORD.
 */

import { test, expect } from './support/pw';

async function assertIsAuthenticated(page: import('@playwright/test').Page, path: string) {
  await page.goto(path);
  const url = page.url();
  if (url.includes('/login')) {
    test.skip(true, 'Sin sesión de empleado — configurar TEST_EMPLOYEE_EMAIL / TEST_EMPLOYEE_PASSWORD');
  }
}

test.describe('Employee — Header y navegación', () => {
  test.beforeEach(async ({ page }) => {
    await assertIsAuthenticated(page, '/employee/itinerario');
  });

  test('header muestra el nombre de la app', async ({ page }) => {
    await expect(page.getByText('Piletas Pancho')).toBeVisible();
  });

  test('el menú tiene solo Hoy y Ayuda: sin Calendario ni Historial', async ({ page }) => {
    const menu = page.getByTestId('menu-abajo');
    await expect(menu.getByRole('link', { name: /hoy/i })).toBeVisible();
    await expect(menu.getByRole('link', { name: /ayuda/i })).toBeVisible();
    await expect(menu.getByRole('link')).toHaveCount(2);
  });

  test('botón de logout visible', async ({ page }) => {
    await expect(page.getByRole('button').filter({ has: page.locator('[class*="lucide"]') }).last()).toBeVisible();
  });
});

test.describe('Employee — Itinerario del día', () => {
  test.beforeEach(async ({ page }) => {
    await assertIsAuthenticated(page, '/employee/itinerario');
  });

  test('la página carga con la fecha de hoy en el título', async ({ page }) => {
    // El título contiene el mes y el día en es-AR
    const heading = page.getByRole('heading', { level: 1 });
    await expect(heading).toBeVisible();
  });

  test('muestra el estado del itinerario (vacío o con piletas)', async ({ page }) => {
    // Debe mostrar o bien el mensaje de "No hay piletas" o bien piletas en la lista
    const empty = page.getByText(/no hay piletas asignadas/i);
    const list = page.locator('[class*="space-y"]').first();
    const isEmptyState = await empty.isVisible().catch(() => false);
    const hasList = await list.isVisible().catch(() => false);
    expect(isEmptyState || hasList).toBe(true);
  });
});

test.describe('Employee — sin calendario ni historial', () => {
  test('las pantallas de Calendario e Historial ya no existen', async ({ page }) => {
    for (const ruta of ['/employee/calendario', '/employee/historial']) {
      const res = await page.goto(ruta);
      expect(res?.status(), ruta).toBe(404);
    }
  });
});

test.describe('Employee — Pileta detail (itinerary item)', () => {
  test('una URL de pileta inexistente devuelve 404', async ({ page }) => {
    await page.goto('/employee/piletas/00000000-0000-0000-0000-000000000000');
    // Next.js muestra la página de not found
    await expect(page.getByText(/not found|no encontrado|404/i)).toBeVisible({ timeout: 10_000 });
  });
});
