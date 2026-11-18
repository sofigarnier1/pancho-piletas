/**
 * Calidad transversal (solo lecturas):
 *  - mobile: las pantallas pensadas para el celular no se desbordan ni tapan los botones
 *  - accesibilidad básica con axe (solo problemas graves: serious / critical)
 *  - la landing tiene lo esencial para buscadores y compartir
 */
import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from './support/pw';
import { FIXTURE } from './support/seed';
import { svc } from '../tests/support/clients';

const MOBILE = { width: 390, height: 844 };

/** El contenido no debe ser más ancho que la pantalla (scroll horizontal = diseño roto en el celular). */
async function expectNoHorizontalScroll(page: Page, label: string) {
  const { scrollWidth, clientWidth } = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth, clientWidth: document.documentElement.clientWidth,
  }));
  expect(scrollWidth, `${label}: el contenido (${scrollWidth}px) es más ancho que la pantalla (${clientWidth}px)`).toBeLessThanOrEqual(clientWidth + 1);
}

/** Los botones y enlaces principales deben tener tamaño táctil razonable (mín. ~32 px en el eje corto). */
async function smallTouchTargets(page: Page, selector: string): Promise<string[]> {
  return page.$$eval(selector, (els) =>
    els
      .map((el) => ({ text: (el.textContent ?? '').trim().slice(0, 30), box: (el as HTMLElement).getBoundingClientRect() }))
      .filter((x) => x.box.width > 0 && x.box.height > 0 && Math.min(x.box.width, x.box.height) < 28)
      .map((x) => `${x.text || '(sin texto)'} ${Math.round(x.box.width)}×${Math.round(x.box.height)}`),
  );
}

test.describe('mobile (390 px)', () => {
  test.use({ viewport: MOBILE });

  test.describe('empleado', () => {
    test.use({ storageState: 'playwright/.auth/employee.json' });
    test('itinerario y pantalla de una pileta no se desbordan', async ({ page }) => {
      const { data } = await svc().from('itinerary_items').select('id').limit(1);
      for (const path of ['/employee/itinerario', `/employee/piletas/${data![0].id}`, '/employee/ayuda', '/employee/ayuda/hoy']) {
        await page.goto(path);
        await expectNoHorizontalScroll(page, path);
      }
    });

    test('los botones Hecha / No se pudo, el menú de abajo y las opciones de la pileta tienen tamaño táctil', async ({ page }) => {
      await page.goto('/employee/itinerario');
      expect(await smallTouchTargets(page, '[data-testid="ruta"] button, [data-testid="menu-abajo"] a')).toEqual([]);
      const { data } = await svc().from('itinerary_items').select('id').limit(1);
      await page.goto(`/employee/piletas/${data![0].id}`);
      expect(await smallTouchTargets(page, 'main button, button.w-full')).toEqual([]);
    });
  });

  test.describe('backoffice del dueño', () => {
    test.use({ storageState: 'playwright/.auth/owner.json' });
    test('las pantallas del dueño no se desbordan (las tablas anchas se deslizan adentro de su recuadro)', async ({ page }) => {
      const { data } = await svc().from('itinerary_items').select('id').limit(1);
      const hoy = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Argentina/Buenos_Aires' }).format(new Date());
      for (const path of [
        '/admin/dashboard', '/admin/clientes', '/admin/clientes/nuevo', '/admin/itinerario', `/admin/itinerario/${hoy}`,
        `/admin/itinerario/visita/${data![0].id}`, '/admin/itinerario/autos', '/admin/services', '/admin/services/planilla',
        '/admin/empleados', '/admin/empleados/cambios', '/admin/ventas', '/admin/puntos',
        '/admin/ventas/nueva', '/admin/ventas/reporte', '/admin/stock', '/admin/stock/cargar', '/admin/stock/movimientos',
      ]) {
        await page.goto(path);
        await page.waitForLoadState('networkidle');
        await expectNoHorizontalScroll(page, path);
      }
    });
  });

  test.describe('cliente', () => {
    test.use({ storageState: 'playwright/.auth/client.json' });
    test('el portal del cliente no se desborda', async ({ page }) => {
      for (const path of ['/client/dashboard', '/client/compras', '/client/servicios', '/client/puntos', '/client/ayuda', '/client/ayuda/inicio']) {
        await page.goto(path);
        await expectNoHorizontalScroll(page, path);
      }
    });
  });

  test('la landing y el acceso no se desbordan', async ({ page }) => {
    for (const path of ['/', '/login', '/recover']) {
      await page.goto(path);
      await page.waitForLoadState('networkidle');
      await expectNoHorizontalScroll(page, path);
    }
  });

  test('el botón flotante de WhatsApp no tapa el contenido principal: es visible y clickeable', async ({ page }) => {
    await page.goto('/');
    const fab = page.locator('a[href*="wa.me"]').last();
    await expect(fab).toBeVisible();
    // el botón entra con una animación: se mide cuando ya terminó
    await expect.poll(async () => (await fab.boundingBox())?.width ?? 0).toBeGreaterThanOrEqual(40);
  });
});

test.describe('accesibilidad básica (axe: problemas serios o críticos)', () => {
  const scan = async (page: Page, label: string) => {
    const { violations } = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze();
    const serious = violations.filter((v) => v.impact === 'serious' || v.impact === 'critical');
    const report = serious.map((v) => `${v.id} (${v.impact}): ${v.help} → ${v.nodes.length} elemento(s), ej. ${v.nodes[0]?.target.join(' ')}`);
    expect(report, `${label}\n${report.join('\n')}`).toEqual([]);
  };

  for (const path of ['/login', '/recover']) {
    test(`${path}`, async ({ page }) => {
      await page.goto(path);
      await page.waitForLoadState('networkidle');
      await scan(page, path);
    });
  }

  test('la landing', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    // las secciones se animan al entrar en pantalla: se recorre la página para que se muestren antes de analizar
    // la landing usa desplazamiento suave: se salta sin animación para analizar con todo en su lugar
    await page.evaluate(async () => { for (let y = 0; y < document.body.scrollHeight; y += 500) { window.scrollTo({ top: y, behavior: 'instant' }); await new Promise((r) => setTimeout(r, 120)); } window.scrollTo({ top: 0, behavior: 'instant' }); });
    await page.waitForTimeout(800);
    await scan(page, '/');
  });

  test.describe('app del empleado', () => {
    test.use({ storageState: 'playwright/.auth/employee.json', viewport: MOBILE });
    for (const path of ['/employee/itinerario', '/employee/ayuda/hoy']) {
      test(path, async ({ page }) => {
        await page.goto(path);
        await page.waitForLoadState('networkidle');
        await scan(page, path);
      });
    }
  });

  test.describe('portal del cliente', () => {
    test.use({ storageState: 'playwright/.auth/client.json', viewport: MOBILE });
    for (const path of ['/client/dashboard', '/client/puntos', '/client/ayuda/inicio']) {
      test(path, async ({ page }) => {
        await page.goto(path);
        await page.waitForLoadState('networkidle');
        await scan(page, path);
      });
    }
  });

  test.describe('backoffice', () => {
    test.use({ storageState: 'playwright/.auth/admin.json' });
    for (const path of ['/admin/dashboard', '/admin/clientes', '/admin/stock', '/admin/manual', '/admin/manual/clientes']) {
      test(path, async ({ page }) => {
        await page.goto(path);
        await page.waitForLoadState('networkidle');
        await scan(page, path);
      });
    }
  });
});

test.describe('landing: lo esencial para buscadores y compartir', () => {
  test('tiene título, descripción, idioma, imágenes con texto alternativo y un único h1', async ({ page }) => {
    await page.goto('/');
    await expect(page).toHaveTitle(/Pancho Piletas/);
    expect(await page.locator('meta[name="description"]').getAttribute('content')).toMatch(/cloro/i);
    expect(await page.locator('html').getAttribute('lang')).toBe('es');
    await expect(page.locator('meta[property="og:title"]')).toHaveCount(1);
    await expect(page.locator('h1')).toHaveCount(1);
    const withoutAlt = await page.$$eval('img', (imgs) => imgs.filter((i) => !i.hasAttribute('alt')).map((i) => i.src));
    expect(withoutAlt, 'imágenes sin atributo alt').toEqual([]);
  });

  test('todos los enlaces de WhatsApp usan el número del negocio', async ({ page }) => {
    await page.goto('/');
    const hrefs = await page.$$eval('a[href*="wa.me"]', (as) => as.map((a) => (a as HTMLAnchorElement).href));
    expect(hrefs.length).toBeGreaterThan(2);
    for (const h of hrefs) expect(h).toContain('wa.me/5491100000000');
  });

  test('los enlaces externos abren en pestaña nueva de forma segura', async ({ page }) => {
    await page.goto('/');
    const bad = await page.$$eval('a[target="_blank"]', (as) => as.filter((a) => !/noopener/.test(a.getAttribute('rel') ?? '')).map((a) => (a as HTMLAnchorElement).href));
    expect(bad, 'enlaces con target=_blank sin rel=noopener').toEqual([]);
  });

  test('los productos del catálogo se muestran con su precio', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByText(FIXTURE.products.combo.name).first()).toBeVisible();
    await expect(page.getByText('$35.000').first()).toBeVisible();
  });
});

test.describe('landing con la sesión iniciada', () => {
  test.use({ storageState: 'playwright/.auth/client.json' });
  test('el cliente ve "Mi panel" y "Cerrar sesión" en vez de Ingresar', async ({ page }) => {
    await page.goto('/');
    const nav = page.getByRole('navigation', { name: 'Principal' });
    await expect(nav.getByRole('link', { name: 'Mi panel' })).toHaveAttribute('href', '/client/dashboard');
    await expect(nav.getByRole('button', { name: 'Cerrar sesión' })).toBeVisible();
    await expect(nav.getByRole('link', { name: 'Ingresar' })).toHaveCount(0);
  });
});

test.describe('cabeceras de seguridad (equipo rojo 2026-10-19)', () => {
  for (const path of ['/', '/login']) {
    test(`${path}: no se puede embeber en otro sitio y no anuncia el framework`, async ({ request }) => {
      const res = await request.get(path);
      const h = res.headers();
      expect(h['x-frame-options'], 'X-Frame-Options').toBe('DENY');
      expect(h['content-security-policy'], 'CSP').toContain("frame-ancestors 'none'");
      expect(h['x-content-type-options'], 'nosniff').toBe('nosniff');
      expect(h['referrer-policy']).toBe('strict-origin-when-cross-origin');
      expect(h['x-powered-by'], 'X-Powered-By').toBeUndefined();
    });
  }

  test('las páginas protegidas redirigen al login y también llevan las cabeceras', async ({ request }) => {
    const res = await request.get('/admin/dashboard', { maxRedirects: 0 });
    expect(res.status()).toBe(307);
    expect(res.headers()['x-frame-options']).toBe('DENY');
  });
});
