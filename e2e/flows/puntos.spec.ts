/**
 * Marketing: reglas de puntos, niveles y asignación manual; y lo que el cliente ve como resultado.
 * También verifica que el owner ve el módulo en solo lectura (migración 25): sin formularios ni asignación.
 */
import { expect, test, type Page } from '../support/pw';
import { FIXTURE } from '../support/seed';
import { expectToast, selectOption, confirmar } from '../support/ui';
import { restoreClientPoints, svc, userIds } from '../../tests/support/clients';

test.describe.configure({ mode: 'serial' });

test.afterAll(async () => {
  const ids = await userIds();
  await restoreClientPoints(ids.client, FIXTURE.clientPoints);
  await svc().from('point_rules').delete().like('name', 'E2E %');
  await svc().from('client_levels').delete().like('name', 'E2E %');
});

// "test-client" también coincide con "test-client2": se elige el resultado exacto
const pickClient = (page: Page) => page.getByRole('button').filter({ has: page.getByText('test-client', { exact: true }) }).first();

const balance = async () => (await svc().from('profiles').select('points_balance').eq('id', (await userIds()).client).single()).data!.points_balance as number;

test.describe('marketing', () => {
  test.use({ storageState: 'playwright/.auth/marketing.json' });

  test('ve las reglas existentes, con las inactivas marcadas', async ({ page }) => {
    await page.goto('/admin/puntos');
    await expect(page.getByRole('heading', { name: 'Sistema de puntos' })).toBeVisible();
    await expect(page.getByText(FIXTURE.pointRule.name)).toBeVisible();
    await expect(page.getByText(FIXTURE.inactiveRule.name)).toBeVisible();
    await expect(page.getByText('Inactiva', { exact: true })).toBeVisible();
  });

  test('crea una regla de puntos', async ({ page }) => {
    await page.goto('/admin/puntos');
    await page.getByRole('button', { name: 'Nueva regla' }).click();
    await page.getByPlaceholder('Ej: Puntos por compra online').fill('E2E Regla doble');
    await selectOption(page, page.getByRole('combobox'), 'Compra online (e-commerce)');
    await page.locator('input[name="points_per_100_ars"]').fill('2');
    await page.locator('input[name="min_amount"]').fill('1000');
    await page.getByRole('button', { name: 'Crear regla' }).click();

    await expectToast(page, 'Regla creada');
    await expect(page.getByText('E2E Regla doble')).toBeVisible();
    const { data } = await svc().from('point_rules').select('trigger_type, points_per_100_ars, min_amount_cents, is_active').eq('name', 'E2E Regla doble').single();
    expect(data).toEqual({ trigger_type: 'purchase_online', points_per_100_ars: 2, min_amount_cents: 100_000, is_active: true });
  });

  test('desactiva y reactiva una regla con el interruptor', async ({ page }) => {
    await page.goto('/admin/puntos');
    const toggle = page.getByTestId('regla').filter({ hasText: 'E2E Regla doble' }).getByTestId('regla-interruptor');
    await toggle.click();
    await confirmar(page);
    await expectToast(page, 'Regla desactivada');
    expect((await svc().from('point_rules').select('is_active').eq('name', 'E2E Regla doble').single()).data?.is_active).toBe(false);
    await toggle.click();
    await expectToast(page, 'Regla activada');
    expect((await svc().from('point_rules').select('is_active').eq('name', 'E2E Regla doble').single()).data?.is_active).toBe(true);
  });

  test('asigna puntos a un cliente buscándolo por nombre', async ({ page }) => {
    const before = await balance();
    await page.goto('/admin/puntos/asignar');
    await page.getByPlaceholder('Buscar por nombre...').fill('test-client');
    await pickClient(page).click();
    await expect(page.getByText(`${before.toLocaleString('es-AR')} puntos actuales`)).toBeVisible();

    await page.locator('input[name="points"]').fill('50');
    await page.getByPlaceholder(/Compra por WhatsApp/).fill('e2e-promo de octubre');
    await page.getByRole('button', { name: 'Sumar puntos' }).click();

    await expectToast(page, 'Puntos asignados correctamente');
    expect(await balance()).toBe(before + 50);
  });

  test('puede restar puntos', async ({ page }) => {
    const before = await balance();
    await page.goto('/admin/puntos/asignar');
    await page.getByPlaceholder('Buscar por nombre...').fill('test-client');
    await pickClient(page).click();
    await page.getByRole('button', { name: 'Restar', exact: true }).click();
    await page.locator('input[name="points"]').fill('20');
    await page.getByRole('button', { name: 'Restar puntos' }).click();
    await expectToast(page, 'Puntos asignados correctamente');
    expect(await balance()).toBe(before - 20);
  });

  test('crea un nivel nuevo con sus beneficios y luego lo edita', async ({ page }) => {
    await page.goto('/admin/puntos/niveles');
    await page.getByRole('button', { name: 'Nuevo nivel' }).click();
    await page.getByPlaceholder('Ej: Plata').fill('E2E Platino');
    await page.locator('input[name="min_points"]').fill('99999');
    await page.locator('textarea[name="benefits"]').fill('20% descuento\nEnvío prioritario');
    await page.getByRole('button', { name: 'Guardar' }).click();
    await expectToast(page, 'Nivel creado');
    await expect(page.getByText('E2E Platino')).toBeVisible();
    await expect(page.getByText('Envío prioritario')).toBeVisible();

    // editar
    const card = page.locator('div').filter({ hasText: 'E2E Platino' }).filter({ has: page.getByTitle('Editar') }).last();
    await card.getByTitle('Editar').click();
    await page.locator('input[name="name"]').fill('E2E Platino Plus');
    await page.getByRole('button', { name: 'Guardar' }).click();
    await expectToast(page, 'Nivel actualizado');
    await expect(page.getByText('E2E Platino Plus')).toBeVisible();
    expect((await svc().from('client_levels').select('id').eq('name', 'E2E Platino Plus')).data).toHaveLength(1);
  });

  test('rechaza un color de nivel inválido', async ({ page }) => {
    await page.goto('/admin/puntos/niveles');
    await page.getByRole('button', { name: 'Nuevo nivel' }).click();
    await page.getByPlaceholder('Ej: Plata').fill('E2E Color malo');
    await page.locator('input[name="color_text"]').fill('rojo');
    await page.getByRole('button', { name: 'Guardar' }).click();
    // el formulario no se cierra y no se crea el nivel
    await expect(page.getByRole('button', { name: 'Guardar' })).toBeVisible();
    expect((await svc().from('client_levels').select('id').eq('name', 'E2E Color malo')).data).toEqual([]);
  });
});

test.describe('el cliente ve el resultado', () => {
  test.use({ storageState: 'playwright/.auth/client.json' });

  test('el saldo y los movimientos aparecen en "Mis puntos"', async ({ page }) => {
    await page.goto('/client/puntos');
    await expect(page.getByText('e2e-promo de octubre')).toBeVisible();
    await expect(page.getByText('+50')).toBeVisible();
    await expect(page.getByText('-20')).toBeVisible();
    await expect(page.getByText(String(await balance()), { exact: true })).toBeVisible();
  });

  test('al cruzar los 500 puntos pasa a nivel Plata', async ({ page, browser }) => {
    const ids = await userIds();
    // marketing asigna lo que falta para llegar a 500
    const ctx = await browser.newContext({ storageState: 'playwright/.auth/marketing.json' });
    const mp = await ctx.newPage();
    await mp.goto('/admin/puntos/asignar');
    await mp.getByPlaceholder('Buscar por nombre...').fill('test-client');
    await pickClient(mp).click();
    await mp.locator('input[name="points"]').fill(String(500 - (await balance())));
    await mp.getByRole('button', { name: 'Sumar puntos' }).click();
    await expectToast(mp, 'Puntos asignados correctamente');
    await ctx.close();

    expect(await balance()).toBe(500);
    await page.goto('/client/dashboard');
    await expect(page.getByText('Plata', { exact: true }).first()).toBeVisible();
    await page.goto('/client/puntos');
    const level = (await svc().from('profiles').select('client_levels(name)').eq('id', ids.client).single()).data as unknown as { client_levels: { name: string } };
    expect(level.client_levels.name).toBe('Plata');
    await expect(page.getByText('Tu nivel actual')).toBeVisible();
  });
});

test.describe('el owner ve el módulo en solo lectura', () => {
  test.use({ storageState: 'playwright/.auth/owner.json' });

  test('ve las reglas sin formulario, interruptores ni "Asignar puntos"', async ({ page }) => {
    await page.goto('/admin/puntos');
    await expect(page.getByRole('heading', { name: 'Sistema de puntos' })).toBeVisible();
    await expect(page.getByText(FIXTURE.pointRule.name)).toBeVisible();
    await expect(page.getByTestId('puntos-solo-lectura')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Nueva regla' })).toHaveCount(0);
    await expect(page.getByTestId('regla-interruptor')).toHaveCount(0);
    await expect(page.getByRole('link', { name: 'Asignar puntos' })).toHaveCount(0);
  });

  test('ve los niveles sin poder crearlos ni editarlos', async ({ page }) => {
    await page.goto('/admin/puntos/niveles');
    await expect(page.getByRole('heading', { name: 'Niveles', level: 1 })).toBeVisible();
    await expect(page.getByText('Oro', { exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Nuevo nivel' })).toHaveCount(0);
    await expect(page.locator('button[title="Editar"]')).toHaveCount(0);
  });

  test('si entra a "Asignar puntos" por dirección, vuelve a Puntos', async ({ page }) => {
    await page.goto('/admin/puntos/asignar');
    await page.waitForURL(/\/admin\/puntos$/);
    await expect(page.locator('input[name="points"]')).toHaveCount(0);
  });
});
