/**
 * Manual de usuario ('/admin/manual', '/employee/ayuda' y '/client/ayuda') y botón de ayuda rápida "?" en cada pantalla.
 * Cada rol ve solo su manual; cada pantalla de su menú abre una ayuda propia. Son solo lecturas.
 */
import { expect, test, type Page } from './support/pw';
import { FIXTURE } from './support/seed';
import { todayInArgentina } from '../src/lib/dates';
import { svc } from '../tests/support/clients';

const go = async (page: Page, url: string) => {
  const res = await page.goto(url, { waitUntil: 'networkidle' });
  expect(res?.status(), url).toBeLessThan(400);
};

const abrirAyuda = async (page: Page) => {
  await page.getByTestId('ayuda-rapida-boton').click();
  const panel = page.getByTestId('ayuda-rapida-panel');
  await expect(panel).toBeVisible();
  await expect(panel.getByText('Buscando la ayuda de esta pantalla')).toHaveCount(0, { timeout: 15_000 });
  return panel;
};

const noExiste = async (page: Page, url: string) => {
  const res = await page.goto(url);
  expect(res?.status(), url).toBe(404);
};

test.describe('manual del equipo (dueño)', () => {
  test.use({ storageState: 'playwright/.auth/owner.json' });

  test('la portada muestra los temas del dueño y se puede buscar', async ({ page }) => {
    await go(page, '/admin/manual');
    await expect(page.getByRole('heading', { name: 'Manual de usuario', level: 1 })).toBeVisible();
    const main = page.locator('main');
    for (const t of ['Primeros pasos', 'Clientes', 'Piletas', 'Itinerario', 'Ventas', 'Stock']) {
      await expect(main.getByRole('link', { name: new RegExp(t) }).first()).toBeVisible();
    }
    await page.getByLabel('Buscar en el manual').fill('copiar');
    const res = page.getByTestId('manual-resultados');
    await expect(res.getByRole('link').first()).toBeVisible();
    // sin tildes ni mayúsculas
    await page.getByLabel('Buscar en el manual').fill('ITINERARIO');
    await expect(res.getByRole('link').first()).toBeVisible();
    await page.getByLabel('Buscar en el manual').fill('zzzxxqq');
    await expect(res).toContainText('No encontramos nada');
  });

  test('un tema se abre con su índice y pasos numerados, y se puede pasar a otro tema', async ({ page }) => {
    await go(page, '/admin/manual/itinerario');
    await expect(page.getByRole('heading', { name: 'Itinerario', level: 2 })).toBeVisible();
    const indice = page.getByRole('navigation', { name: 'Índice del manual' });
    await expect(indice.getByRole('link', { name: 'Armar el día (todo en una pantalla)' })).toBeVisible();
    await expect(page.getByText('Cómo hacerlo, paso a paso').first()).toBeVisible();
    await expect(page.getByRole('button', { name: /Imprimir/ })).toBeVisible();
    await indice.getByRole('link', { name: 'Ventas', exact: true }).click();
    await expect(page).toHaveURL(/\/admin\/manual\/ventas$/);
    await expect(page.locator('main h2').first()).toHaveText('Ventas');
  });

  test('"completo" junta todo para imprimir y un tema inexistente da 404', async ({ page }) => {
    await go(page, '/admin/manual/completo');
    await expect(page.getByRole('heading', { name: 'Manual de usuario completo' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Imprimir todo el manual' })).toBeVisible();
    const indice = page.getByRole('navigation', { name: 'Índice del manual' });
    await expect(indice.getByText('Qué querés hacer')).toBeVisible();
    const tarea = indice.getByRole('link', { name: 'Agregar piletas a un auto' }).first();
    const destino = (await tarea.getAttribute('href'))!.slice(1);
    await expect(page.locator(`[id="${destino}"]`)).toHaveCount(1);
    await noExiste(page, '/admin/manual/no-existe');
  });

  test('el dueño no ve el contenido de la web ni roles, ni siquiera por dirección (Puntos sí: lo mira sin editar)', async ({ page }) => {
    await go(page, '/admin/manual');
    const main = page.locator('main');
    for (const t of ['Contenido de la web', 'Roles']) await expect(main.getByRole('link', { name: new RegExp(`^${t}`) })).toHaveCount(0);
    await expect(main.getByRole('link', { name: /^Puntos/ }).first()).toBeVisible();
    await noExiste(page, '/admin/manual/roles');
    await noExiste(page, '/admin/manual/landing-cms');
    // y la búsqueda tampoco filtra contenido ajeno
    await go(page, '/admin/manual');
    await page.getByLabel('Buscar en el manual').fill('Gestión de roles');
    await expect(page.getByTestId('manual-resultados').getByRole('link').filter({ hasText: 'Roles' })).toHaveCount(0);
  });

  test('el menú tiene el acceso "Manual"', async ({ page }) => {
    await go(page, '/admin/dashboard');
    await page.getByRole('link', { name: 'Manual', exact: true }).click();
    await expect(page).toHaveURL(/\/admin\/manual$/);
  });

  test('el botón ? abre la ayuda de la pantalla y lleva al manual', async ({ page }) => {
    await go(page, '/admin/piletas/nueva');
    const panel = await abrirAyuda(page);
    await expect(panel.getByText('Cargar una pileta').first()).toBeVisible();
    await panel.getByRole('link', { name: 'Ver en el manual completo' }).click();
    await expect(page).toHaveURL(/\/admin\/manual\/piletas#nueva/);
  });

  test('la tecla ? abre la ayuda, pero no mientras se escribe en un campo', async ({ page }) => {
    await go(page, '/admin/clientes');
    await page.getByTestId('tabla-clientes-buscar').fill('a?b');
    await expect(page.getByTestId('ayuda-rapida-panel')).toHaveCount(0);
    await page.locator('body').click({ position: { x: 5, y: 300 } });
    await page.keyboard.press('?');
    await expect(page.getByTestId('ayuda-rapida-panel')).toBeVisible();
  });

  test('TODAS las pantallas del menú del dueño tienen ayuda escrita', async ({ page }) => {
    const clientId = (await svc().from('client_profiles').select('id').limit(1).single()).data!.id;
    const rutas = [
      '/admin/dashboard', '/admin/clientes', '/admin/clientes/nuevo', `/admin/clientes/${clientId}`,
      '/admin/piletas', '/admin/piletas/nueva', `/admin/piletas/${FIXTURE.pools.pool1.id}`,
      '/admin/itinerario', `/admin/itinerario/${todayInArgentina()}`,
      '/admin/ventas', '/admin/ventas/nueva', '/admin/stock', '/admin/stock/nuevo', '/admin/manual',
    ];
    for (const ruta of rutas) {
      await go(page, ruta);
      const panel = await abrirAyuda(page);
      await expect(panel.getByText('Todavía no hay ayuda escrita'), ruta).toHaveCount(0);
      await expect(panel.getByRole('link', { name: 'Ver en el manual completo' }), ruta).toBeVisible();
      await page.keyboard.press('Escape');
    }
  });
});

test.describe('manual del equipo (marketing y súper admin)', () => {
  test.describe('marketing', () => {
    test.use({ storageState: 'playwright/.auth/marketing.json' });
    test('ve sus temas y no los de clientes, piletas, itinerario o ventas', async ({ page }) => {
      await go(page, '/admin/manual');
      const main = page.locator('main');
      for (const t of ['Puntos', 'Contenido de la web', 'Stock', 'Dashboard']) await expect(main.getByRole('link', { name: new RegExp(`^${t}`) }).first()).toBeVisible();
      for (const t of ['Clientes', 'Piletas', 'Itinerario', 'Empleados', 'Ventas', 'Roles']) await expect(main.getByRole('link', { name: new RegExp(`^${t}`) })).toHaveCount(0);
      await noExiste(page, '/admin/manual/clientes');
    });

    test('la ayuda rápida de sus pantallas funciona', async ({ page }) => {
      for (const ruta of ['/admin/dashboard', '/admin/stock', '/admin/landing-cms', '/admin/puntos', '/admin/puntos/niveles', '/admin/puntos/asignar']) {
        await go(page, ruta);
        const panel = await abrirAyuda(page);
        await expect(panel.getByText('Todavía no hay ayuda escrita'), ruta).toHaveCount(0);
        await page.keyboard.press('Escape');
      }
    });
  });

  test.describe('súper admin', () => {
    test.use({ storageState: 'playwright/.auth/admin.json' });
    test('ve todos los temas, incluido Roles, y su ayuda funciona', async ({ page }) => {
      await go(page, '/admin/manual');
      const main = page.locator('main');
      for (const t of ['Roles', 'Puntos', 'Contenido de la web', 'Clientes']) await expect(main.getByRole('link', { name: new RegExp(`^${t}`) }).first()).toBeVisible();
      await go(page, '/admin/roles');
      const panel = await abrirAyuda(page);
      await expect(panel.getByText('Cambiar el rol de una persona').first()).toBeVisible();
    });
  });
});

test.describe('ayuda del empleado', () => {
  test.use({ storageState: 'playwright/.auth/employee.json', viewport: { width: 390, height: 844 } });

  test('tiene su propia ayuda, con el índice arriba, y no entra al manual del equipo', async ({ page }) => {
    await go(page, '/employee/ayuda');
    await expect(page.getByRole('heading', { name: 'Ayuda para el equipo de piletas', level: 1 })).toBeVisible();
    const main = page.locator('main');
    for (const t of ['Primeros pasos', 'Tu día de trabajo', 'Glosario']) await expect(main.getByRole('link', { name: new RegExp(t) }).first()).toBeVisible();
    await go(page, '/employee/ayuda/hoy');
    await expect(page.getByText('Marcar una pileta como hecha').first()).toBeVisible();
    await noExiste(page, '/employee/ayuda/clientes');
    await page.goto('/admin/manual');
    await expect(page).toHaveURL(/\/employee\//);
  });

  test('cada pantalla del empleado tiene ayuda rápida', async ({ page }) => {
    const { data: items } = await svc().from('itinerary_items').select('id').limit(1);
    for (const ruta of ['/employee/itinerario', `/employee/piletas/${items![0].id}`, '/employee/ayuda']) {
      await go(page, ruta);
      const panel = await abrirAyuda(page);
      await expect(panel.getByText('Todavía no hay ayuda escrita'), ruta).toHaveCount(0);
      await page.keyboard.press('Escape');
    }
  });
});

test.describe('ayuda del cliente', () => {
  test.use({ storageState: 'playwright/.auth/client.json' });

  test('tiene su propia ayuda y no entra al manual del equipo', async ({ page }) => {
    await go(page, '/client/ayuda');
    await expect(page.getByRole('heading', { name: 'Ayuda', level: 1, exact: true })).toBeVisible();
    const main = page.locator('main');
    for (const t of ['Primeros pasos', 'Mis compras', 'Mis servicios', 'Mis puntos']) await expect(main.getByRole('link', { name: new RegExp(t) }).first()).toBeVisible();
    await go(page, '/client/ayuda/puntos');
    await expect(page.getByText('Ver tus puntos y de dónde vienen').first()).toBeVisible();
    await noExiste(page, '/client/ayuda/clientes');
    await page.goto('/admin/manual');
    await expect(page).toHaveURL(/\/client\//);
  });

  test('cada pantalla del cliente tiene ayuda rápida', async ({ page }) => {
    for (const ruta of ['/client/dashboard', '/client/compras', '/client/servicios', '/client/puntos', '/client/ayuda']) {
      await go(page, ruta);
      const panel = await abrirAyuda(page);
      await expect(panel.getByText('Todavía no hay ayuda escrita'), ruta).toHaveCount(0);
      await page.keyboard.press('Escape');
    }
  });
});

test.describe('sin sesión', () => {
  test('el manual y la ayuda no se pueden abrir sin iniciar sesión', async ({ page }) => {
    for (const ruta of ['/admin/manual', '/admin/manual/clientes', '/employee/ayuda', '/client/ayuda']) {
      await page.goto(ruta);
      await expect(page, ruta).toHaveURL(/\/login/);
    }
  });
});
