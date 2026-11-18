/**
 * Tests del backoffice (admin/owner/super_admin).
 * Requieren TEST_ADMIN_EMAIL y TEST_ADMIN_PASSWORD.
 * Si no están configuradas, todos los tests se saltean.
 */

import { test, expect } from './support/pw';

async function assertIsAuthenticated(page: import('@playwright/test').Page, expectedPath: string) {
  await page.goto(expectedPath);
  const url = page.url();
  if (url.includes('/login')) {
    test.skip(true, 'Sin sesión de admin — configurar TEST_ADMIN_EMAIL / TEST_ADMIN_PASSWORD');
  }
}

test.describe('Admin — Dashboard', () => {
  test.beforeEach(async ({ page }) => {
    await assertIsAuthenticated(page, '/admin/dashboard');
  });

  test('carga el dashboard del día (dueño y súper admin)', async ({ page }) => {
    await expect(page.getByRole('heading', { level: 1 }).first()).toBeVisible();
    await expect(page.getByTestId('acciones-hoy')).toBeVisible();
    await expect(page.getByTestId('tabla-hoy')).toBeVisible();
  });

  test('muestra tarjetas de estadísticas', async ({ page }) => {
    // El dashboard tiene stat cards con números
    const cards = page.locator('[class*="rounded"]').filter({ hasText: /cliente|pileta|venta|service/i });
    await expect(cards.first()).toBeVisible();
  });
});

test.describe('Admin — Clientes', () => {
  test.beforeEach(async ({ page }) => {
    await assertIsAuthenticated(page, '/admin/clientes');
  });

  test('la página de clientes carga', async ({ page }) => {
    await expect(page.getByRole('heading', { name: /clientes/i })).toBeVisible();
  });

  test('tiene botón para crear nuevo cliente', async ({ page }) => {
    await expect(page.getByRole('link', { name: /nuevo cliente/i })).toBeVisible();
  });

  test('el formulario de nuevo cliente carga', async ({ page }) => {
    await page.goto('/admin/clientes/nuevo');
    await expect(page.getByLabel(/nombre/i)).toBeVisible();
    await expect(page.getByRole('button', { name: 'Pileta nueva' })).toBeVisible();
  });
});

test.describe('Admin — Piletas', () => {
  test.beforeEach(async ({ page }) => {
    await assertIsAuthenticated(page, '/admin/piletas');
  });

  test('la página de piletas carga', async ({ page }) => {
    await expect(page.getByRole('heading', { name: /piletas/i })).toBeVisible();
  });

  test('tiene botón para agregar pileta', async ({ page }) => {
    await expect(page.getByRole('link', { name: /nueva pileta/i })).toBeVisible();
  });

  test('el formulario de nueva pileta carga', async ({ page }) => {
    await page.goto('/admin/piletas/nueva');
    await expect(page.getByLabel(/dirección/i)).toBeVisible();
  });
});

test.describe('Admin — Itinerario', () => {
  test.beforeEach(async ({ page }) => {
    await assertIsAuthenticated(page, '/admin/itinerario');
  });

  test('el calendario mensual carga', async ({ page }) => {
    await expect(page.getByRole('heading', { name: /itinerario/i })).toBeVisible();
  });

  test('muestra los días del mes con navegación', async ({ page }) => {
    // La navegación usa links <a href="/admin/itinerario?y=...&m=...">
    await expect(page.locator('a[href*="itinerario?y"]').first()).toBeVisible();
  });
});

test.describe('Admin — Ventas', () => {
  test.beforeEach(async ({ page }) => {
    await assertIsAuthenticated(page, '/admin/ventas');
  });

  test('la página de ventas carga', async ({ page }) => {
    await expect(page.getByRole('heading', { name: /ventas/i })).toBeVisible();
  });

  test('tiene botón para nueva venta manual', async ({ page }) => {
    await expect(page.getByRole('link', { name: /venta rápida/i })).toBeVisible();
  });
});

test.describe('Admin — Stock', () => {
  test.beforeEach(async ({ page }) => {
    await assertIsAuthenticated(page, '/admin/stock');
  });

  test('la página de stock carga', async ({ page }) => {
    await expect(page.getByRole('heading', { name: /stock/i })).toBeVisible();
  });

  test('tiene botón para nuevo producto', async ({ page }) => {
    await expect(page.getByRole('link', { name: /nuevo producto/i })).toBeVisible();
  });
});

test.describe('Admin — Landing CMS', () => {
  test.beforeEach(async ({ page }) => {
    await assertIsAuthenticated(page, '/admin/landing-cms');
  });

  test('el editor CMS carga', async ({ page }) => {
    await expect(page.getByRole('heading', { name: /landing cms/i })).toBeVisible();
  });

  test('tiene sección Hero expandida por defecto', async ({ page }) => {
    // El label es un div de texto, no un <label>; el input se identifica por placeholder
    await expect(page.getByPlaceholder(/Tu pileta limpia/i)).toBeVisible();
  });

  test('las demás secciones están colapsables', async ({ page }) => {
    await expect(page.getByText('Testimonios reales')).toBeVisible();
    await expect(page.getByText('Sección Nosotros')).toBeVisible();
    await expect(page.getByText('Footer — Contacto')).toBeVisible();
    await expect(page.getByText('Configuración global')).toBeVisible();
  });

  test('expandir una sección muestra sus campos', async ({ page }) => {
    await page.getByRole('button', { name: 'Footer — Contacto' }).click();
    await expect(page.getByText('Teléfono')).toBeVisible();
    await expect(page.getByText('Instagram (handle)')).toBeVisible();
  });
});

test.describe('Admin — Puntos / Reglas', () => {
  test.beforeEach(async ({ page }) => {
    await assertIsAuthenticated(page, '/admin/puntos');
  });

  test('la página de puntos carga', async ({ page }) => {
    await expect(page.getByRole('heading', { name: /sistema de puntos/i })).toBeVisible();
  });

  test('tiene links de navegación a Niveles y Asignar', async ({ page }) => {
    await expect(page.getByRole('link', { name: /niveles/i })).toBeVisible();
    await expect(page.getByRole('link', { name: /asignar puntos/i })).toBeVisible();
  });

  test('botón Nueva regla muestra el formulario', async ({ page }) => {
    await page.getByRole('button', { name: /nueva regla/i }).click();
    await expect(page.getByPlaceholder(/puntos por compra/i)).toBeVisible();
    await expect(page.getByText(/tipo de trigger/i)).toBeVisible();
  });
});

test.describe('Admin — Puntos / Niveles', () => {
  test.beforeEach(async ({ page }) => {
    await assertIsAuthenticated(page, '/admin/puntos/niveles');
  });

  test('la página de niveles carga', async ({ page }) => {
    await expect(page.getByRole('heading', { name: /niveles/i })).toBeVisible();
  });

  test('los niveles del seed están cargados', async ({ page }) => {
    await expect(page.getByText('Bronce', { exact: true })).toBeVisible();
    await expect(page.getByText('Plata', { exact: true })).toBeVisible();
    await expect(page.getByText('Oro', { exact: true })).toBeVisible();
  });
});

test.describe('Admin — Puntos / Asignar', () => {
  test.beforeEach(async ({ page }) => {
    await assertIsAuthenticated(page, '/admin/puntos/asignar');
  });

  test('el formulario de asignación carga', async ({ page }) => {
    await expect(page.getByRole('heading', { name: /asignar puntos/i })).toBeVisible();
    await expect(page.getByPlaceholder(/buscar por nombre/i)).toBeVisible();
  });
});

test.describe('Admin — Roles', () => {
  test.beforeEach(async ({ page }) => {
    await assertIsAuthenticated(page, '/admin/roles');
  });

  test('la página de roles carga', async ({ page }) => {
    await expect(page.getByRole('heading', { name: /roles/i })).toBeVisible();
  });
});
