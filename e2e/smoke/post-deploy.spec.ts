/**
 * Smoke test para correr DESPUÉS de cada deploy contra la URL publicada. Solo lecturas: no crea,
 * edita ni borra nada, y no necesita acceso a la base. Verifica que la web está viva y que cada
 * rol puede entrar a su panel.
 *
 *   SMOKE_URL=https://tu-sitio.vercel.app \
 *   SMOKE_ADMIN_EMAIL=… SMOKE_ADMIN_PASSWORD=… (idem OWNER / MARKETING / EMPLOYEE / CLIENT) \
 *   npm run test:smoke
 *
 * Sin SMOKE_URL levanta un servidor local contra la base de test (útil para probar este mismo archivo).
 * Los roles sin credenciales se omiten y se avisa. Usar usuarios de prueba dedicados en producción.
 */
import { expect, test, type Page } from '@playwright/test';

const ROLES = [
  { role: 'admin', panel: /\/admin\/dashboard/, heading: 'Dashboard' },
  { role: 'owner', panel: /\/admin\/dashboard/, heading: 'Dashboard' },
  { role: 'marketing', panel: /\/admin\/dashboard/, heading: 'Dashboard' },
  { role: 'employee', panel: /\/employee\/itinerario/, heading: null },
  { role: 'client', panel: /\/client\/dashboard/, heading: null },
] as const;

const creds = (role: string) => ({
  email: process.env[`SMOKE_${role.toUpperCase()}_EMAIL`],
  password: process.env[`SMOKE_${role.toUpperCase()}_PASSWORD`],
});

function watch(page: Page): string[] {
  const problems: string[] = [];
  page.on('pageerror', (e) => problems.push(`error de JavaScript: ${e.message}`));
  page.on('response', (r) => { if (r.status() >= 500) problems.push(`respuesta ${r.status()}: ${r.url()}`); });
  return problems;
}

test('la landing responde y muestra lo esencial', async ({ page }) => {
  const problems = watch(page);
  const res = await page.goto('/');
  expect(res?.status()).toBe(200);
  await expect(page).toHaveTitle(/Pancho Piletas/);
  await expect(page.locator('h1')).toHaveCount(1);
  await expect(page.locator('a[href*="wa.me/5491100000000"]').first()).toBeVisible();
  expect(problems, problems.join('\n')).toEqual([]);
});

test('las pantallas de acceso cargan', async ({ page }) => {
  for (const path of ['/login', '/recover']) {
    const res = await page.goto(path);
    expect(res?.status(), path).toBe(200);
  }
});

test('las rutas protegidas mandan a iniciar sesión', async ({ page }) => {
  for (const path of ['/admin/dashboard', '/employee/itinerario', '/client/dashboard']) {
    await page.goto(path);
    await expect(page).toHaveURL(/\/login/);
  }
});

test('el callback de login no permite redirecciones a otros sitios', async ({ page }) => {
  await page.goto('/api/auth/callback?code=invalido&next=//evil.example.com');
  await expect(page).toHaveURL(/\/login/);
  expect(new URL(page.url()).host).not.toContain('evil');
});

test('un login con datos incorrectos es rechazado', async ({ page }) => {
  await page.goto('/login');
  await page.getByLabel('Email').fill('nadie@example.com');
  await page.getByLabel('Contraseña', { exact: true }).fill('incorrecta1');
  await page.getByRole('button', { name: 'Ingresar' }).click();
  await expect(page.getByText('Email o contraseña incorrectos')).toBeVisible();
});

for (const { role, panel, heading } of ROLES) {
  test(`${role}: inicia sesión, llega a su panel y no ve el de otros`, async ({ page }) => {
    const { email, password } = creds(role);
    test.skip(!email || !password, `Sin credenciales: definir SMOKE_${role.toUpperCase()}_EMAIL y _PASSWORD`);
    const problems = watch(page);

    await page.goto('/login');
    await page.getByLabel('Email').fill(email!);
    await page.getByLabel('Contraseña', { exact: true }).fill(password!);
    await page.getByRole('button', { name: 'Ingresar' }).click();
    await page.waitForURL(panel, { timeout: 20_000 });
    if (heading) await expect(page.getByRole('heading', { name: heading }).first()).toBeVisible();

    // cada rol queda confinado a su zona
    const own = new URL(page.url()).pathname.split('/')[1];
    for (const zone of ['admin', 'employee', 'client'].filter((z) => z !== own)) {
      await page.goto(`/${zone}/${zone === 'admin' ? 'dashboard' : zone === 'employee' ? 'itinerario' : 'dashboard'}`);
      await expect(page).not.toHaveURL(new RegExp(`/${zone}/`));
    }
    expect(problems, problems.join('\n')).toEqual([]);
  });
}
