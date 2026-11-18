/**
 * Regresión visual: capturas de la landing, de las pantallas de acceso y del backoffice comparadas contra una
 * referencia guardada en e2e/visual.spec.ts-snapshots/. Detecta cambios de diseño no intencionales.
 *
 *   npm run test:visual          → compara
 *   npm run test:visual:update   → acepta el diseño actual como nueva referencia (hacerlo a propósito)
 *
 * Las referencias dependen del sistema operativo (fuentes y suavizado): las guardadas son de macOS.
 * En CI (Linux) se omite hasta generar sus propias referencias.
 */
import { expect, test, type Page } from '@playwright/test';

test.skip(!!process.env.CI, 'Las referencias visuales son de macOS; en CI se generan aparte.');

const MOBILE = { width: 390, height: 844 };

/** Las secciones se animan al entrar en pantalla: se recorre la página para que queden en su estado final. */
async function settle(page: Page) {
  await page.waitForLoadState('networkidle');
  await page.evaluate(async () => {
    for (let y = 0; y < document.body.scrollHeight; y += 400) { window.scrollTo(0, y); await new Promise((r) => setTimeout(r, 150)); }
    window.scrollTo(0, 0);
    await document.fonts.ready;
  });
  await page.waitForTimeout(1200);
}

const shot = { fullPage: true, animations: 'disabled' as const, maxDiffPixelRatio: 0.015 };

test.describe('landing', () => {
  test('escritorio', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('/');
    await settle(page);
    await expect(page).toHaveScreenshot('landing-escritorio.png', shot);
  });

  test('celular', async ({ page }) => {
    await page.setViewportSize(MOBILE);
    await page.goto('/');
    await settle(page);
    await expect(page).toHaveScreenshot('landing-celular.png', shot);
  });
});

test.describe('acceso', () => {
  for (const path of ['login', 'recover']) {
    test(path, async ({ page }) => {
      await page.setViewportSize({ width: 1280, height: 800 });
      await page.goto(`/${path}`);
      await page.waitForLoadState('networkidle');
      await expect(page).toHaveScreenshot(`${path}.png`, { animations: 'disabled', maxDiffPixelRatio: 0.01 });
    });
  }
});

test.describe('app del empleado en el celular', () => {
  test.use({ storageState: 'playwright/.auth/employee.json', viewport: MOBILE });
  test('itinerario del día', async ({ page }) => {
    await page.goto('/employee/itinerario');
    await page.waitForLoadState('networkidle');
    // "En vivo" aparece al conectarse: se espera para que la foto sea siempre igual
    await expect(page.getByTestId('en-vivo')).toBeVisible({ timeout: 15_000 });
    // la fecha de hoy cambia todos los días: se tapa para que no genere diferencias
    await expect(page).toHaveScreenshot('empleado-itinerario.png', {
      animations: 'disabled', maxDiffPixelRatio: 0.015, mask: [page.locator('h1'), page.getByTestId('en-vivo')],
    });
  });
});

// Portal del cliente (mismo estilo que el backoffice desde 2026-11). Los puntos cambian con los flujos: se tapan.
test.describe('portal del cliente', () => {
  test.use({ storageState: 'playwright/.auth/client.json' });
  test('inicio en escritorio', async ({ page }) => {
    await page.goto('/client/dashboard');
    await page.waitForLoadState('networkidle');
    await expect(page).toHaveScreenshot('cliente-inicio-escritorio.png', {
      animations: 'disabled', maxDiffPixelRatio: 0.015, mask: [page.locator('main p.text-4xl'), page.locator('main ul')],
    });
  });
});

// Backoffice (rediseño 2026-11): el menú, la barra superior y las tarjetas. Los datos cambian con cada corrida
// (los flujos crean clientes y ventas), así que se tapan los números, la fecha y las listas.
test.describe('backoffice', () => {
  test.use({ storageState: 'playwright/.auth/admin.json' });
  const dynamic = (page: Page) => [page.locator('.bo-stat-value'), page.locator('.bo-stat-foot'), page.locator('.bo-subtitle'), page.locator('.bo-rows'), page.locator('aside .truncate'), page.getByTestId('en-vivo')];

  test('dashboard escritorio', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('/admin/dashboard');
    await page.waitForLoadState('networkidle');
    await expect(page.getByTestId('en-vivo')).toBeVisible({ timeout: 15_000 }); // aparece al conectarse
    await expect(page).toHaveScreenshot('backoffice-dashboard-escritorio.png', { animations: 'disabled', maxDiffPixelRatio: 0.015, mask: dynamic(page) });
  });

  test('dashboard celular', async ({ page }) => {
    await page.setViewportSize(MOBILE);
    await page.goto('/admin/dashboard');
    await page.waitForLoadState('networkidle');
    await expect(page.getByTestId('en-vivo')).toBeVisible({ timeout: 15_000 }); // aparece al conectarse
    await expect(page).toHaveScreenshot('backoffice-dashboard-celular.png', { animations: 'disabled', maxDiffPixelRatio: 0.015, mask: dynamic(page) });
  });

  test('menú abierto en el celular', async ({ page }) => {
    await page.setViewportSize(MOBILE);
    await page.goto('/admin/dashboard');
    await page.getByRole('button', { name: 'Abrir menú' }).click();
    await expect(page.getByRole('dialog')).toBeVisible();
    await page.waitForTimeout(500);
    await expect(page).toHaveScreenshot('backoffice-menu-celular.png', { animations: 'disabled', maxDiffPixelRatio: 0.015, mask: [page.locator('aside .truncate')] });
  });

  test('manual escritorio', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('/admin/manual');
    await page.waitForLoadState('networkidle');
    await expect(page).toHaveScreenshot('backoffice-manual-escritorio.png', { animations: 'disabled', maxDiffPixelRatio: 0.015, mask: [page.locator('aside .truncate')] });
  });
});
