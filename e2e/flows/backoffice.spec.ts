/**
 * Backoffice: menú según el rol, dashboard, clientes (listado, búsqueda, filtros, ficha), piletas
 * (listado, activar/desactivar, historial) y gestión de roles.
 */
import { expect, test } from '../support/pw';
import { FIXTURE } from '../support/seed';
import { TEST_USERS } from '../support/env';
import { expectToast, selectOption, confirmar } from '../support/ui';
import { rand, svc, tempUser, userIds } from '../../tests/support/clients';
import { authLink, clearMailbox, waitForEmail } from '../support/mail';
import { todayInArgentina } from '../../src/lib/dates';

test.describe.configure({ mode: 'serial' });

const MENU: Record<string, string[]> = {
  admin: ['Dashboard', 'Clientes y piletas', 'Itinerario', 'Services', 'Empleados', 'Cobros', 'Ventas', 'Stock', 'Landing CMS', 'Puntos', 'Roles', 'Manual'],
  owner: ['Dashboard', 'Clientes y piletas', 'Itinerario', 'Services', 'Empleados', 'Cobros', 'Ventas', 'Stock', 'Puntos', 'Manual'],
  marketing: ['Dashboard', 'Stock', 'Landing CMS', 'Puntos', 'Manual'],
};

test.describe('menú lateral según el rol', () => {
  for (const [role, items] of Object.entries(MENU)) {
    test(`${role} ve exactamente: ${items.join(', ')}`, async ({ browser }) => {
      const ctx = await browser.newContext({ storageState: `playwright/.auth/${role}.json` });
      const page = await ctx.newPage();
      await page.goto('/admin/dashboard');
      // el menú se arma con el usuario que carga el cliente un instante después de la página
      await expect(page.locator('aside nav a')).toHaveCount(items.length);
      const links = await page.locator('aside nav a').allInnerTexts();
      expect(links.map((l) => l.trim())).toEqual(items);
      await ctx.close();
    });
  }

  test('cada opción del menú del super_admin abre su pantalla', async ({ browser }) => {
    const ctx = await browser.newContext({ storageState: 'playwright/.auth/admin.json' });
    const page = await ctx.newPage();
    await page.goto('/admin/dashboard');
    await expect(page.locator('aside nav a')).toHaveCount(12);
    for (const [label, url, heading] of [
      ['Clientes y piletas', '/admin/clientes', 'Clientes y piletas'], ['Itinerario', '/admin/itinerario', /itinerario/i],
      ['Services', '/admin/services', 'Planilla de services'], ['Empleados', '/admin/empleados', 'Empleados'],
      ['Cobros', '/admin/cobros', 'Cobros'],
      ['Ventas', '/admin/ventas', 'Ventas'], ['Stock', '/admin/stock', 'Stock'], ['Landing CMS', '/admin/landing-cms', /landing cms/i],
      ['Puntos', '/admin/puntos', 'Sistema de puntos'], ['Roles', '/admin/roles', 'Gestión de roles'], ['Dashboard', '/admin/dashboard', /lunes|martes|miércoles|jueves|viernes|sábado|domingo/i],
    ] as const) {
      await page.locator('aside nav').getByRole('link', { name: label, exact: true }).click();
      await page.waitForURL(`**${url}`);
      await expect(page.getByRole('heading', { name: heading }).first()).toBeVisible();
    }
    await ctx.close();
  });
});

test.describe('dashboard y clientes (owner)', () => {
  test.use({ storageState: 'playwright/.auth/owner.json' });

  test('el dashboard del dueño muestra el día de hoy como en la base', async ({ page }) => {
    const { data: day } = await svc().from('itinerary_days').select('itinerary_items (status)').eq('date', todayInArgentina()).maybeSingle();
    const items = (day?.itinerary_items ?? []) as { status: string }[];
    await page.goto('/admin/dashboard');
    const card = (label: string) => page.locator('.bo-stats > *').filter({ hasText: label }).first();
    await expect(card('Visitas hoy')).toContainText(String(items.length));
    await expect(card('Hechas')).toContainText(String(items.filter((i) => i.status === 'done').length));
    await expect(card('Faltan')).toContainText(String(items.filter((i) => i.status === 'pending').length));
    // la tabla de hoy: una fila por visita, con las dos piletas del seed
    await expect(page.getByTestId('tabla-hoy').getByTestId('tabla-fila')).toHaveCount(items.length);
    await expect(page.getByTestId('tabla-hoy').getByText('test-client2', { exact: true })).toBeVisible();
  });

  test('los botones grandes del dashboard llevan a armar el día y a dar de alta un cliente', async ({ page }) => {
    await page.goto('/admin/dashboard');
    await page.getByTestId('armar-dia').click();
    await page.waitForURL(`**/admin/itinerario/${todayInArgentina()}`);
    await page.goto('/admin/dashboard');
    await page.getByTestId('acciones-hoy').getByRole('link', { name: 'Nuevo cliente' }).click();
    await page.waitForURL('**/admin/clientes/nuevo');
  });

  test('el listado de clientes muestra a los dos clientes y se puede buscar por nombre', async ({ page }) => {
    await page.goto('/admin/clientes');
    const tabla = page.getByTestId('tabla-clientes');
    await expect(tabla.getByText('test-client2', { exact: true })).toBeVisible();
    await expect(tabla.getByText('test-client', { exact: true })).toBeVisible();

    await page.getByTestId('tabla-clientes-buscar').fill('client2');
    await expect(tabla.getByText('test-client2', { exact: true })).toBeVisible();
    await expect(tabla.getByText('test-client', { exact: true })).toHaveCount(0);

    await page.getByTestId('tabla-clientes-buscar').fill('no-existe-nadie');
    await expect(tabla.getByText('No hay clientes para mostrar')).toBeVisible();
  });

  test('tocar una fila abre la ficha en una ventana, sin salir de la lista', async ({ page }) => {
    await page.goto('/admin/clientes');
    await page.getByTestId('tabla-clientes').getByTestId('tabla-fila').filter({ hasText: 'test-client2' }).click();
    const ficha = page.getByTestId('ficha-panel');
    await expect(ficha).toBeVisible();
    await expect(ficha.getByText('Calle Falsa 742').first()).toBeVisible();
    await expect(page).toHaveURL(/\/admin\/clientes$/);
    await page.keyboard.press('Escape');
    await expect(ficha).toHaveCount(0);
  });

  test('el filtro "Inactivos" muestra solo a quienes no están activos', async ({ page }) => {
    const t = await tempUser();
    await svc().from('profiles').update({ status: 'inactive', full_name: 'Cliente Inactivo E2E' }).eq('id', t.id);
    await page.goto('/admin/clientes');
    await page.getByRole('button', { name: 'Inactivos' }).click();
    await expect(page.getByText('Cliente Inactivo E2E')).toBeVisible();
    await expect(page.getByText('test-client2', { exact: true })).toHaveCount(0);
    await page.getByRole('button', { name: 'Activos', exact: true }).click();
    await expect(page.getByText('Cliente Inactivo E2E')).toHaveCount(0);
    await expect(page.getByText('test-client2', { exact: true })).toBeVisible();
    await t.cleanup();
  });

  test('la ficha del cliente muestra sus datos, sus piletas y compras', async ({ page }) => {
    const ids = await userIds();
    await page.goto(`/admin/clientes/${ids.client}`);
    await expect(page.getByRole('heading', { name: 'test-client' })).toBeVisible();
    await expect(page.getByText('Activo', { exact: true }).first()).toBeVisible(); // el badge (el selector de estado repite la palabra)
    await expect(page.getByLabel('Estado')).toHaveValue('active');
    await expect(page.getByText(/Entrega de cloro: San Isidro.*Av\. Libertador 1234/)).toBeVisible(); // la dirección de entrega del seed
    await expect(page.getByRole("link", { name: /Casa de San Isidro/ }).getByText(/San Isidro.*Av\. Libertador 1234/)).toBeVisible(); // y la de la pileta
    await expect(page.getByText('Piletas (1)')).toBeVisible();
    await expect(page.getByText('Casa de San Isidro')).toBeVisible();
  });

  test('el owner bloquea y desbloquea una cuenta desde la ficha (pide confirmación)', async ({ page }) => {
    const t = await tempUser();
    await page.goto(`/admin/clientes/${t.id}`);
    await expect(page.getByLabel('Estado')).toHaveValue('active');

    // Cancelar la confirmación no cambia nada
    await page.getByLabel('Estado').selectOption('blocked');
    await confirmar(page, false);
    await expect(page.getByLabel('Estado')).toHaveValue('active');
    expect((await svc().from('profiles').select('status').eq('id', t.id).single()).data!.status).toBe('active');

    await page.getByLabel('Estado').selectOption('blocked');
    await confirmar(page);
    await expectToast(page, 'Estado actualizado');
    await expect.poll(async () => (await svc().from('profiles').select('status').eq('id', t.id).single()).data!.status).toBe('blocked');

    await page.getByLabel('Estado').selectOption('active');
    await expect.poll(async () => (await svc().from('profiles').select('status').eq('id', t.id).single()).data!.status).toBe('active');
    await t.cleanup();
  });

  test('"Nueva pileta" desde la ficha preselecciona al cliente', async ({ page }) => {
    const ids = await userIds();
    await page.goto(`/admin/clientes/${ids.client}`);
    await page.getByRole('link', { name: /Nueva pileta|Agregar/ }).first().click();
    await page.waitForURL(/\/admin\/piletas\/nueva\?cliente=/);
    await expect(page.getByRole('combobox').first()).toContainText('test-client');
  });
});

test.describe('piletas (owner)', () => {
  test.use({ storageState: 'playwright/.auth/owner.json' });
  test.afterAll(async () => { await svc().from('pools').update({ is_active: true }).eq('id', FIXTURE.pools.pool2.id); });

  test('la lista muestra las piletas activas; desactivar una la pasa a "Inactivos"', async ({ page }) => {
    const fila = () => page.getByTestId('tabla-clientes').getByTestId('tabla-fila').filter({ hasText: 'Calle Falsa 742' });
    // la dirección vieja de la lista de piletas lleva a Clientes y piletas
    await page.goto('/admin/piletas');
    await page.waitForURL('**/admin/clientes');
    await expect(fila()).toHaveCount(1);

    await page.goto(`/admin/piletas/${FIXTURE.pools.pool2.id}`);
    await expect(page.getByRole('heading', { name: 'Casa de Tigre' })).toBeVisible();
    await page.getByRole('button', { name: 'Desactivar' }).click();
    await confirmar(page);
    await expectToast(page, 'Pileta desactivada');
    await expect(page.getByRole('button', { name: 'Activar', exact: true })).toBeVisible();
    expect((await svc().from('pools').select('is_active').eq('id', FIXTURE.pools.pool2.id).single()).data?.is_active).toBe(false);

    await page.goto('/admin/clientes');
    await expect(fila()).toHaveCount(0);
    await page.getByRole('button', { name: 'Inactivos', exact: true }).click();
    await expect(fila()).toHaveCount(1);

    await page.goto(`/admin/piletas/${FIXTURE.pools.pool2.id}`);
    await page.getByRole('button', { name: 'Activar', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Desactivar' })).toBeVisible();
  });

  test('la ficha de una pileta muestra su historial de services', async ({ page }) => {
    await page.goto(`/admin/piletas/${FIXTURE.pools.pool1.id}`);
    await expect(page.getByText('Historial de services')).toBeVisible();
    await expect(page.getByText('Service', { exact: true }).first()).toBeVisible();
    await expect(page.getByText('Cloro: Pastillas · 1,5')).toBeVisible();
    await expect(page.getByText('Service de prueba')).toBeVisible();
  });

  test('una pileta sin services lo indica', async ({ page }) => {
    await page.goto(`/admin/piletas/${FIXTURE.pools.pool2.id}`);
    await expect(page.getByText('Sin services registrados')).toBeVisible();
  });
});

test.describe('gestión de roles', () => {
  test('el super_admin cambia el rol de un usuario y esa persona entra a su nuevo panel', async ({ browser }) => {
    const t = await tempUser();
    await svc().from('profiles').update({ full_name: 'Persona Rol E2E' }).eq('id', t.id);

    const ctx = await browser.newContext({ storageState: 'playwright/.auth/admin.json' });
    const page = await ctx.newPage();
    await page.goto('/admin/roles');
    await expect(page.getByRole('heading', { name: 'Gestión de roles' })).toBeVisible();
    for (const label of ['Super Admin', 'Owner', 'Marketing', 'Empleado', 'Cliente']) await expect(page.getByText(label, { exact: true }).locator('visible=true').first()).toBeVisible();

    const row = page.locator('div').filter({ hasText: 'Persona Rol E2E' }).filter({ has: page.getByRole('combobox') }).last();
    await selectOption(page, row.getByRole('combobox'), 'Empleado');
    await confirmar(page);
    await expectToast(page, 'Rol actualizado');
    expect((await svc().from('profiles').select('role').eq('id', t.id).single()).data?.role).toBe('employee');

    // la persona inicia sesión y llega a la app de empleados
    const ctx2 = await browser.newContext();
    const p2 = await ctx2.newPage();
    await p2.goto('/login');
    await p2.getByLabel('Email').fill(t.email);
    await p2.getByLabel('Contraseña', { exact: true }).fill('TmpPass123!');
    await p2.getByRole('button', { name: 'Ingresar' }).click();
    await p2.waitForURL(/\/employee\/itinerario/);
    await ctx2.close();

    await ctx.close();
    await t.cleanup();
  });

  test('el super_admin crea un usuario con rol; la persona elige su contraseña y entra a su panel', async ({ browser }) => {
    const email = `${rand('alta')}@piletaspancho.test`;
    const ctx = await browser.newContext({ storageState: 'playwright/.auth/admin.json' });
    const page = await ctx.newPage();
    await page.goto('/admin/roles');
    const form = page.getByTestId('crear-usuario');
    await form.getByLabel('Nombre completo').fill('Alta Empleado E2E');
    await form.getByLabel('Email').fill(email);
    await form.getByLabel('Rol').selectOption('employee');
    await form.getByRole('button', { name: 'Crear usuario' }).click();
    await expectToast(page, 'Usuario creado. Que elija su contraseña desde ¿Olvidaste tu contraseña? en el ingreso.');

    const { data } = await svc().auth.admin.listUsers({ perPage: 200 });
    const u = data.users.find((x) => x.email === email)!;
    expect(u.email_confirmed_at).toBeTruthy();
    expect((await svc().from('profiles').select('role,full_name').eq('id', u.id).single()).data).toMatchObject({ role: 'employee', full_name: 'Alta Empleado E2E' });

    // repetir el email avisa
    await form.getByLabel('Nombre completo').fill('Otra');
    await form.getByLabel('Email').fill(email);
    await form.getByRole('button', { name: 'Crear usuario' }).click();
    await expect(page.getByText('Ya existe un usuario con ese email')).toBeVisible();

    // la persona elige su contraseña y entra a la app de empleados
    await clearMailbox();
    const ctx2 = await browser.newContext();
    const p2 = await ctx2.newPage();
    await p2.goto('/recover');
    await p2.getByLabel('Email').fill(email);
    await p2.getByRole('button', { name: /Enviar|Recuperar/ }).click();
    await p2.goto(authLink(await waitForEmail(email)));
    await p2.waitForURL(/\/reset-password/);
    await p2.getByLabel('Nueva contraseña').fill('ClaveNueva123!');
    await p2.getByLabel('Confirmar contraseña').fill('ClaveNueva123!');
    await p2.getByRole('button', { name: /Guardar|Actualizar|Cambiar/ }).click();
    await p2.waitForURL(/\/employee\/itinerario/);
    await ctx2.close();
    await ctx.close();
    await svc().auth.admin.deleteUser(u.id);
  });

  test('el owner no puede crear usuarios', async ({ browser }) => {
    const ctx = await browser.newContext({ storageState: 'playwright/.auth/owner.json' });
    const page = await ctx.newPage();
    await page.goto('/admin/roles');
    const form = page.getByTestId('crear-usuario');
    await form.getByLabel('Nombre completo').fill('No Debe');
    await form.getByLabel('Email').fill(`${rand('no')}@piletaspancho.test`);
    await form.getByRole('button', { name: 'Crear usuario' }).click();
    await expect(page.getByText('Solo los super_admin pueden crear usuarios')).toBeVisible();
    await ctx.close();
  });

  test('el super_admin no puede cambiarse su propio rol', async ({ browser }) => {
    const ctx = await browser.newContext({ storageState: 'playwright/.auth/admin.json' });
    const page = await ctx.newPage();
    await page.goto('/admin/roles');
    const row = page.locator('div').filter({ hasText: 'test-admin' }).filter({ has: page.getByRole('combobox') }).last();
    await selectOption(page, row.getByRole('combobox'), 'Cliente');
    await confirmar(page);
    await expectToast(page, 'No podés cambiar tu propio rol');
    expect((await svc().from('profiles').select('role').eq('id', (await userIds()).admin).single()).data?.role).toBe('super_admin');
    await ctx.close();
  });

  test('el owner no ve "Roles" en el menú y, aunque entre por URL, no puede cambiar roles', async ({ browser }) => {
    const t = await tempUser();
    await svc().from('profiles').update({ full_name: 'Persona Intocable E2E' }).eq('id', t.id);
    const ctx = await browser.newContext({ storageState: 'playwright/.auth/owner.json' });
    const page = await ctx.newPage();
    await page.goto('/admin/roles');
    const row = page.locator('div').filter({ hasText: 'Persona Intocable E2E' }).filter({ has: page.getByRole('combobox') }).last();
    await selectOption(page, row.getByRole('combobox'), 'Marketing');
    await confirmar(page);
    await expectToast(page, 'Solo los super_admin pueden cambiar roles');
    expect((await svc().from('profiles').select('role').eq('id', t.id).single()).data?.role).toBe('client');
    await ctx.close();
    await t.cleanup();
  });

  test('los usuarios de prueba aparecen agrupados bajo su rol', async ({ browser }) => {
    const ctx = await browser.newContext({ storageState: 'playwright/.auth/admin.json' });
    const page = await ctx.newPage();
    await page.goto('/admin/roles');
    for (const key of Object.keys(TEST_USERS)) await expect(page.getByText(`test-${key}`, { exact: true })).toBeVisible();
    await ctx.close();
  });
});
