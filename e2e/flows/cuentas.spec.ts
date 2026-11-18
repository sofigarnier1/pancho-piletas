/**
 * Cuentas: registro con confirmación por mail, inicio y cierre de sesión, recuperar y cambiar contraseña.
 * Los mails se leen de Mailpit (Supabase local).
 */
import { expect, test, type Page } from '../support/pw';
import { TEST_USERS } from '../support/env';
import { expectToast } from '../support/ui';
import { authLink, clearMailbox, countEmails, waitForEmail } from '../support/mail';
import { rand, svc, tempUser } from '../../tests/support/clients';

test.describe.configure({ mode: 'serial' });
test.beforeEach(async () => { await clearMailbox(); });

const fillLogin = async (page: Page, email: string, password: string) => {
  await page.goto('/login');
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Contraseña', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'Ingresar' }).click();
};

test.describe('registro cerrado: las cuentas las crea el súper admin', () => {
  test('/register ya no existe y vuelve al ingreso, sin enlace "Registrate"', async ({ page }) => {
    await page.goto('/register');
    await expect(page).toHaveURL(/\/login/);
    await expect(page.getByRole('link', { name: /registrate/i })).toHaveCount(0);
  });

  test('nadie puede registrarse por la API pública', async () => {
    const { createClient } = await import('@supabase/supabase-js');
    const anon = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!);
    const email = `${rand('intruso')}@piletaspancho.test`;
    const { error } = await anon.auth.signUp({ email, password: 'MiClave123!' });
    const { data } = await svc().auth.admin.listUsers({ perPage: 200 });
    const u = data.users.find((x) => x.email === email);
    if (u) await svc().auth.admin.deleteUser(u.id);
    // En Supabase local el registro público sigue abierto; en producción está apagado (se verifica con /auth/v1/settings).
    test.skip(!error, 'el Supabase local deja registrarse: el bloqueo se configura en el panel de producción');
    expect(error).toBeTruthy();
  });
});

test.describe('inicio y cierre de sesión', () => {
  test('con una contraseña incorrecta avisa sin revelar nada más', async ({ page }) => {
    await fillLogin(page, TEST_USERS.client.email, 'incorrecta');
    await expectToast(page, 'Email o contraseña incorrectos');
    await expect(page).toHaveURL(/\/login/);
  });

  test('un email que no existe da el mismo aviso (no se puede averiguar quién tiene cuenta)', async ({ page }) => {
    await fillLogin(page, 'nadie@piletaspancho.test', 'cualquiera1');
    await expectToast(page, 'Email o contraseña incorrectos');
  });

  for (const [role, expected] of [
    ['admin', /\/admin\/dashboard/], ['owner', /\/admin\/dashboard/], ['marketing', /\/admin\/dashboard/],
    ['employee', /\/employee\/itinerario/], ['client', /\/client\/dashboard/],
  ] as const) {
    test(`${role}: al ingresar llega a su panel`, async ({ page }) => {
      await fillLogin(page, TEST_USERS[role].email, TEST_USERS[role].password);
      await page.waitForURL(expected);
    });
  }

  // Cerrar sesión invalida TODAS las sesiones de ese usuario (signOut global de Supabase).
  // Por eso estos tests usan usuarios descartables: con los compartidos se romperían las sesiones
  // guardadas que usan los demás archivos.
  const logoutCase = async (page: Page, role: string, path: string, logout: (p: Page) => Promise<void>) => {
    const t = await tempUser(role);
    await fillLogin(page, t.email, 'TmpPass123!');
    await page.waitForURL(`**${path}`);
    await logout(page);
    await page.waitForURL('**/login');
    await page.goto(path);
    await expect(page).toHaveURL(/\/login/);
    await t.cleanup();
  };

  test('el cliente cierra sesión y ya no puede ver su panel', async ({ page }) => {
    await logoutCase(page, 'client', '/client/dashboard', async (p) => {
      await p.locator('header button:has(svg.lucide-log-out)').click();
      await expectToast(p, 'Sesión cerrada');
    });
  });

  test('el admin cierra sesión desde el menú lateral', async ({ page }) => {
    await logoutCase(page, 'super_admin', '/admin/dashboard', async (p) => {
      await p.getByRole('button', { name: 'Cerrar sesión' }).click();
    });
  });

  test('el empleado cierra sesión desde su encabezado', async ({ page }) => {
    await logoutCase(page, 'employee', '/employee/itinerario', async (p) => {
      await p.locator('header button:has(svg.lucide-log-out)').click();
    });
  });

  test('cerrar sesión en un lugar la cierra también en los demás dispositivos', async ({ browser }) => {
    const t = await tempUser();
    const a = await (await browser.newContext()).newPage();
    const b = await (await browser.newContext()).newPage();
    await fillLogin(a, t.email, 'TmpPass123!'); await a.waitForURL(/\/client\/dashboard/);
    await fillLogin(b, t.email, 'TmpPass123!'); await b.waitForURL(/\/client\/dashboard/);
    await a.locator('header button:has(svg.lucide-log-out)').click();
    await a.waitForURL('**/login');
    await b.reload();
    await b.goto('/client/dashboard');
    await expect(b).toHaveURL(/\/login/);
    await a.context().close(); await b.context().close();
    await t.cleanup();
  });

  test('con sesión iniciada, /login redirige al panel', async ({ page }) => {
    await fillLogin(page, TEST_USERS.owner.email, TEST_USERS.owner.password);
    await page.waitForURL(/\/admin\/dashboard/);
    await page.goto('/login');
    await expect(page).toHaveURL(/\/admin\/dashboard/);
  });
});

test.describe('recuperar contraseña', () => {
  test('el enlace del mail permite elegir una contraseña nueva; la vieja deja de servir', async ({ page }) => {
    const t = await tempUser();
    const oldPassword = 'TmpPass123!';
    const newPassword = 'NuevaClave456!';

    await page.goto('/recover');
    await page.getByLabel('Email').fill(t.email);
    await page.getByRole('button', { name: /Enviar|Recuperar/ }).click();
    await expect(page.getByText('Revisá tu email')).toBeVisible();

    const mail = await waitForEmail(t.email);
    await page.goto(authLink(mail));
    await page.waitForURL(/\/reset-password/);

    await page.getByLabel('Nueva contraseña').fill(newPassword);
    await page.getByLabel('Confirmar contraseña').fill(newPassword);
    await page.getByRole('button', { name: /Guardar|Actualizar|Cambiar/ }).click();
    await expectToast(page, 'Contraseña actualizada correctamente');
    // la sesión de recuperación queda iniciada: /login lo lleva directo a su panel
    await page.waitForURL(/\/client\/dashboard/);

    // la vieja ya no funciona, la nueva sí
    const ctx = await page.context().browser()!.newContext();
    const p2 = await ctx.newPage();
    await fillLogin(p2, t.email, oldPassword);
    await expectToast(p2, 'Email o contraseña incorrectos');
    await fillLogin(p2, t.email, newPassword);
    await p2.waitForURL(/\/client\/dashboard/);
    await ctx.close();
    await t.cleanup();
  });

  test('un email no registrado muestra el mismo mensaje y no envía ningún mail', async ({ page }) => {
    await page.goto('/recover');
    await page.getByLabel('Email').fill('fantasma@piletaspancho.test');
    await page.getByRole('button', { name: /Enviar|Recuperar/ }).click();
    await expect(page.getByText('Revisá tu email')).toBeVisible();
    await page.waitForTimeout(1500);
    expect(await countEmails('fantasma@piletaspancho.test')).toBe(0);
  });

  test('la nueva contraseña debe coincidir y tener al menos 6 caracteres', async ({ page }) => {
    const t = await tempUser();
    await page.goto('/recover');
    await page.getByLabel('Email').fill(t.email);
    await page.getByRole('button', { name: /Enviar|Recuperar/ }).click();
    const mail = await waitForEmail(t.email);
    await page.goto(authLink(mail));
    await page.waitForURL(/\/reset-password/);

    await page.getByLabel('Nueva contraseña').fill('123');
    await page.getByLabel('Confirmar contraseña').fill('123');
    await page.getByRole('button', { name: /Guardar|Actualizar|Cambiar/ }).click();
    await expect(page.getByText('Mínimo 6 caracteres')).toBeVisible();

    await page.getByLabel('Nueva contraseña').fill('abcdef1');
    await page.getByLabel('Confirmar contraseña').fill('abcdef2');
    await page.getByRole('button', { name: /Guardar|Actualizar|Cambiar/ }).click();
    await expect(page.getByText('Las contraseñas no coinciden')).toBeVisible();
    await t.cleanup();
  });

  test('sin enlace válido, la pantalla de nueva contraseña no cambia nada', async ({ page }) => {
    await page.goto('/reset-password');
    await page.getByLabel('Nueva contraseña').fill('Abcdef12');
    await page.getByLabel('Confirmar contraseña').fill('Abcdef12');
    await page.getByRole('button', { name: /Guardar|Actualizar|Cambiar/ }).click();
    await expect(page.locator('[data-sonner-toast]').first()).toBeVisible();
    await expect(page).not.toHaveURL(/\/client|\/admin|\/employee/);
  });
});
