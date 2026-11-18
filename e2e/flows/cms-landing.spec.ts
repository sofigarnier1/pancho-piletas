/**
 * Marketing edita la landing desde el CMS y se verifica lo que ve el público:
 * título, cifras, testimonios, pie de página, envío; y las protecciones (URLs peligrosas, HTML, vacíos).
 */
import { expect, test, type Page } from '../support/pw';
import { expectToast } from '../support/ui';
import { svc } from '../../tests/support/clients';

test.describe.configure({ mode: 'serial' });

let snapshot: { section: string; key: string; value: unknown }[] = [];
test.beforeAll(async () => {
  snapshot = (await svc().from('landing_content').select('section, key, value')).data ?? [];
});
test.afterAll(async () => {
  await svc().from('landing_content').delete().neq('section', '__none__');
  await svc().from('landing_content').insert(snapshot);
});

/** Abre una sección del editor (si está cerrada), completa los campos por su etiqueta y guarda. */
async function editSection(page: Page, title: string, fields: Record<string, string>, opts: { expectError?: string | RegExp } = {}) {
  await page.goto('/admin/landing-cms');
  const header = page.getByRole('button', { name: title });
  const card = page.getByTestId('cms-seccion').filter({ has: header });
  if (!(await card.getByRole('button', { name: 'Guardar sección' }).isVisible())) await header.click();
  for (const [label, value] of Object.entries(fields)) {
    const field = card.locator('div.space-y-1\\.5').filter({ has: page.getByText(label, { exact: true }) }).locator('input, textarea');
    await field.fill(value);
  }
  await card.getByRole('button', { name: 'Guardar sección' }).click();
  await expectToast(page, opts.expectError ?? `Sección "${title}" guardada`);
}

const hero = (page: Page) => page.getByRole('heading', { level: 1 });

test.describe('marketing', () => {
  test.use({ storageState: 'playwright/.auth/marketing.json' });

  test('el título, la bajada y el botón del hero que se guardan son los que ve el público', async ({ page }) => {
    await editSection(page, 'Hero principal', {
      'Título principal': 'Agua cristalina todo el año',
      'Bajada del título': 'Texto de bajada editado desde el CMS',
      'Texto del botón CTA': 'Pedí tu cloro ahora',
    });
    await page.goto('/');
    await expect(hero(page)).toHaveText('Agua cristalina todo el año');
    await expect(page.getByText('Texto de bajada editado desde el CMS')).toBeVisible();
    await expect(page.getByRole('link', { name: 'Pedí tu cloro ahora' }).first()).toBeVisible();
  });

  test('si se vacía un campo, la landing vuelve al texto por defecto (no queda en blanco)', async ({ page }) => {
    await editSection(page, 'Hero principal', { 'Título principal': '' });
    await page.goto('/');
    await expect(hero(page)).toHaveText(/^Tu pileta limpia\.\s*Vos, quedate pancho\./);
  });

  test('un texto con HTML se muestra tal cual, sin ejecutarse', async ({ page }) => {
    const evil = '<img src=x onerror="window.__xss=1">Hola';
    await editSection(page, 'Hero principal', { 'Título principal': evil });
    let dialog = false;
    page.on('dialog', () => { dialog = true; });
    await page.goto('/');
    await expect(hero(page)).toContainText('<img src=x');
    expect(await page.evaluate(() => (window as unknown as { __xss?: number }).__xss)).toBeUndefined();
    expect(dialog).toBe(false);
    await expect(hero(page).locator('img')).toHaveCount(0);
  });

  test('las cifras de "Nosotros" se editan desde el CMS', async ({ page }) => {
    await editSection(page, 'Sección Nosotros', { 'Años de experiencia (ej: 10+)': '25+', 'Clientes (ej: 100+)': '300+' });
    await page.goto('/');
    await expect(page.locator('#nosotros').getByText('25+')).toBeVisible();
    await expect(page.locator('#nosotros').getByText('300+')).toBeVisible();
  });

  test('el título, la bajada y las exclusiones del service se editan desde el CMS', async ({ page }) => {
    await editSection(page, 'Service de piletas', {
      'Título del service': 'Tu pileta en buenas manos. Todo el año.',
      'Bajada del service': 'Bajada del service editada',
      'Qué no incluye': 'No hacemos instalaciones.',
    });
    await page.goto('/');
    const service = page.locator('#service');
    await expect(service.getByRole('heading', { level: 2 })).toHaveText(/^Tu pileta en buenas manos\.\s*Todo el año\.$/);
    await expect(service.getByText('Bajada del service editada')).toBeVisible();
    await expect(service.getByText('No hacemos instalaciones.')).toBeVisible();
  });

  test('un testimonio completo aparece con su zona; con enlace de reseñas seguro se muestra el link', async ({ page }) => {
    await editSection(page, 'Testimonios reales', {
      'Testimonio 1 — Nombre': 'Marta Gómez', 'Testimonio 1 — Zona': 'Tigre', 'Testimonio 1 — Estrellas (1 a 5)': '5',
      'Testimonio 1 — Texto': 'Excelente atención, el agua quedó perfecta.',
      'URL de reseñas externas': 'https://maps.example.com/resenas',
    });
    await page.goto('/');
    await expect(page.getByText('Marta Gómez')).toBeVisible();
    await expect(page.getByText('Tigre', { exact: true })).toBeVisible();
    await expect(page.getByText('“Excelente atención, el agua quedó perfecta.”')).toBeVisible();
    await expect(page.getByLabel('5 estrellas')).toBeVisible();
    await expect(page.getByRole('link', { name: 'Ver todas las reseñas' })).toHaveAttribute('href', 'https://maps.example.com/resenas');
  });

  test('un enlace javascript: en las reseñas se descarta: no se renderiza el link', async ({ page }) => {
    await editSection(page, 'Testimonios reales', { 'URL de reseñas externas': 'javascript:alert(document.domain)' });
    await page.goto('/');
    await expect(page.getByText('Marta Gómez')).toBeVisible(); // la sección sigue
    await expect(page.getByRole('link', { name: 'Ver todas las reseñas' })).toHaveCount(0);
    await expect(page.locator('a[href^="javascript:"]')).toHaveCount(0);
  });

  test('un testimonio con estrellas fuera de rango se muestra sin estrellas', async ({ page }) => {
    await editSection(page, 'Testimonios reales', { 'Testimonio 1 — Estrellas (1 a 5)': '9' });
    await page.goto('/');
    await expect(page.getByText('Marta Gómez')).toBeVisible();
    await expect(page.getByLabel(/estrellas/)).toHaveCount(0);
  });

  test('el pie de página muestra el teléfono, Instagram y la cobertura editados', async ({ page }) => {
    await editSection(page, 'Footer — Contacto', {
      'Teléfono': '+54 9 11 4000-1234', 'Instagram (handle)': '@pancho.test', 'Zona de cobertura': 'Zona Norte y Oeste',
      'Responsable del negocio': 'Pancho Pérez',
    });
    await page.goto('/');
    const footer = page.locator('footer');
    await expect(footer.getByText('+54 9 11 4000-1234')).toBeVisible();
    await expect(footer.getByText('@pancho.test')).toBeVisible();
    await expect(footer.getByText('Zona Norte y Oeste')).toBeVisible();
    await expect(footer.getByText('Responsable: Pancho Pérez')).toBeVisible();
    await expect(footer.locator('a[href="https://www.instagram.com/pancho.test"]')).toBeVisible();
  });

  test('el costo de envío se muestra en pesos, y 0 significa "sin cargo"', async ({ page }) => {
    await editSection(page, 'Configuración global', { 'Costo de envío (en centavos — 0 = gratis)': '150000' });
    await page.goto('/');
    await expect(page.getByText('Envío: $1.500')).toBeVisible();
    await editSection(page, 'Configuración global', { 'Costo de envío (en centavos — 0 = gratis)': '0' });
    await page.goto('/');
    await expect(page.getByText('Envío gratis en Zona Norte').first()).toBeVisible();
  });

  test('un texto de más de 2000 caracteres se rechaza con un aviso y no se guarda', async ({ page }) => {
    await editSection(page, 'Sección Nosotros', { 'Texto principal': 'x'.repeat(2001) }, { expectError: /demasiado largo/ });
    const { data } = await svc().from('landing_content').select('value').eq('section', 'nosotros').eq('key', 'cuerpo').single();
    expect(String(data?.value).length).toBeLessThan(2000);
  });
});

test.describe('quien no es marketing', () => {
  test('el owner ve el editor pero al guardar recibe un error y la landing no cambia', async ({ browser }) => {
    const ctx = await browser.newContext({ storageState: 'playwright/.auth/owner.json' });
    const page = await ctx.newPage();
    await editSection(page, 'Hero principal', { 'Título principal': 'HACK del owner' }, { expectError: 'No tenés permisos para esta acción' });
    await page.goto('/');
    await expect(hero(page)).not.toHaveText('HACK del owner');
    await ctx.close();
  });

  test('un empleado y un cliente no pueden abrir el editor', async ({ browser }) => {
    for (const [state, landing] of [['employee', /\/employee\/itinerario/], ['client', /\/client\/dashboard/]] as const) {
      const ctx = await browser.newContext({ storageState: `playwright/.auth/${state}.json` });
      const page = await ctx.newPage();
      await page.goto('/admin/landing-cms');
      await expect(page).toHaveURL(landing);
      await ctx.close();
    }
  });

  test('un visitante anónimo es enviado a iniciar sesión', async ({ browser }) => {
    const ctx = await browser.newContext();
    const page = await ctx.newPage();
    await page.goto('/admin/landing-cms');
    await expect(page).toHaveURL(/\/login/);
    await ctx.close();
  });
});
