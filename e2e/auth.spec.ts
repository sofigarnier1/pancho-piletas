import { test, expect } from './support/pw';

test.describe('Páginas de auth — estructura', () => {
  test('/login carga con el formulario correcto', async ({ page }) => {
    await page.goto('/login');
    await expect(page.getByLabel('Email')).toBeVisible();
    await expect(page.getByLabel('Contraseña', { exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Ingresar' })).toBeVisible();
    await expect(page.getByRole('link', { name: /olvidaste/i })).toBeVisible();
  });

  test('/register ya no existe: nadie se crea una cuenta solo, vuelve a /login', async ({ page }) => {
    await page.goto('/register');
    await expect(page).toHaveURL(/\/login/);
    await expect(page.getByRole('link', { name: /registrate/i })).toHaveCount(0);
  });

  test('/recover carga el formulario de recuperación', async ({ page }) => {
    await page.goto('/recover');
    await expect(page.getByLabel('Email')).toBeVisible();
  });

  test('link "¿Olvidaste tu contraseña?" lleva a /recover', async ({ page }) => {
    await page.goto('/login');
    await page.getByRole('link', { name: /olvidaste/i }).click();
    await expect(page).toHaveURL(/\/recover/);
  });

});

test.describe('Validaciones del formulario de login', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/login');
  });

  test('email inválido muestra error de validación', async ({ page }) => {
    await page.getByLabel('Email').fill('noesun-email');
    await page.getByLabel('Contraseña', { exact: true }).fill('123456');
    await page.getByRole('button', { name: 'Ingresar' }).click();
    await expect(page.getByText(/email inválido/i)).toBeVisible();
  });

  test('contraseña muy corta muestra error de validación', async ({ page }) => {
    await page.getByLabel('Email').fill('test@test.com');
    await page.getByLabel('Contraseña', { exact: true }).fill('123');
    await page.getByRole('button', { name: 'Ingresar' }).click();
    await expect(page.getByText(/mínimo 6/i)).toBeVisible();
  });

  test('credenciales incorrectas muestran toast de error', async ({ page }) => {
    await page.getByLabel('Email').fill('noexiste@test.com');
    await page.getByLabel('Contraseña', { exact: true }).fill('contraseña123');
    await page.getByRole('button', { name: 'Ingresar' }).click();
    await expect(page.getByText(/email o contraseña incorrectos/i)).toBeVisible({ timeout: 10_000 });
  });
});

test.describe('Guardas de rutas — redirigen a /login si no hay sesión', () => {
  const protectedRoutes = [
    '/admin/dashboard',
    '/admin/clientes',
    '/admin/piletas',
    '/admin/itinerario',
    '/admin/ventas',
    '/admin/stock',
    '/admin/roles',
    '/admin/landing-cms',
    '/admin/puntos',
    '/admin/puntos/niveles',
    '/employee/itinerario',
    '/client/dashboard',
    '/client/compras',
    '/client/servicios',
    '/client/puntos',
  ];

  for (const route of protectedRoutes) {
    test(`${route} → redirige a /login`, async ({ page }) => {
      await page.goto(route);
      await page.waitForURL(/\/login/, { timeout: 10_000 });
      expect(page.url()).toContain('/login');
    });
  }
});

test.describe('Login exitoso (con credenciales de prueba)', () => {
  test('admin es redirigido a /admin/dashboard', async ({ page }) => {
    const email = process.env.TEST_ADMIN_EMAIL;
    const password = process.env.TEST_ADMIN_PASSWORD;
    test.skip(!email || !password, 'Requiere TEST_ADMIN_EMAIL y TEST_ADMIN_PASSWORD');

    await page.goto('/login');
    await page.getByLabel('Email').fill(email!);
    await page.getByLabel('Contraseña', { exact: true }).fill(password!);
    await page.getByRole('button', { name: 'Ingresar' }).click();
    await page.waitForURL('/admin/dashboard', { timeout: 15_000 });
    await expect(page).toHaveURL('/admin/dashboard');
  });

  test('employee es redirigido a /employee/itinerario', async ({ page }) => {
    const email = process.env.TEST_EMPLOYEE_EMAIL;
    const password = process.env.TEST_EMPLOYEE_PASSWORD;
    test.skip(!email || !password, 'Requiere TEST_EMPLOYEE_EMAIL y TEST_EMPLOYEE_PASSWORD');

    await page.goto('/login');
    await page.getByLabel('Email').fill(email!);
    await page.getByLabel('Contraseña', { exact: true }).fill(password!);
    await page.getByRole('button', { name: 'Ingresar' }).click();
    await page.waitForURL('/employee/itinerario', { timeout: 15_000 });
    await expect(page).toHaveURL('/employee/itinerario');
  });

  test('client es redirigido a /client/dashboard', async ({ page }) => {
    const email = process.env.TEST_CLIENT_EMAIL;
    const password = process.env.TEST_CLIENT_PASSWORD;
    test.skip(!email || !password, 'Requiere TEST_CLIENT_EMAIL y TEST_CLIENT_PASSWORD');

    await page.goto('/login');
    await page.getByLabel('Email').fill(email!);
    await page.getByLabel('Contraseña', { exact: true }).fill(password!);
    await page.getByRole('button', { name: 'Ingresar' }).click();
    await page.waitForURL('/client/dashboard', { timeout: 15_000 });
    await expect(page).toHaveURL('/client/dashboard');
  });
});
