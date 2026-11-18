/**
 * Owner: registrar ventas, ajustar stock, crear productos y ver su efecto en la landing y en el cliente.
 */
import { expect, test } from '../support/pw';
import { FIXTURE } from '../support/seed';
import { expectToast, selectOption, confirmar } from '../support/ui';
import { svc, userIds } from '../../tests/support/clients';

test.use({ storageState: 'playwright/.auth/owner.json' });

const stockOf = async (id: string) => (await svc().from('products').select('stock_units').eq('id', id).single()).data!.stock_units as number;
const created: string[] = [];
test.afterAll(async () => {
  await svc().from('manual_sales').delete().like('notes', 'e2e-%');
  for (const id of created) await svc().from('products').delete().eq('id', id);
  await svc().from('products').update({ stock_units: FIXTURE.products.combo.stock }).eq('id', FIXTURE.products.combo.id);
  await svc().from('products').update({ stock_units: FIXTURE.products.pastilla.stock - FIXTURE.manualSale.qty }).eq('id', FIXTURE.products.pastilla.id);
  await svc().from('products').update({ stock_units: FIXTURE.products.granulado.stock }).eq('id', FIXTURE.products.granulado.id);
});

test.describe.configure({ mode: 'serial' });

test.describe('registrar una venta', () => {
  test('con dos productos del catálogo: calcula el total, baja el stock y queda en el listado', async ({ page }) => {
    const combo0 = await stockOf(FIXTURE.products.combo.id);
    const pastilla0 = await stockOf(FIXTURE.products.pastilla.id);

    const ids = await userIds();
    await page.goto('/admin/ventas/nueva');
    await page.getByTestId('venta-cliente').selectOption(ids.client);
    await expect(page.getByTestId('venta-segmento')).toContainText('Cliente de service');

    // línea 1: combo × 2 (el precio se completa solo con el del catálogo)
    await page.getByTestId('venta-producto').first().selectOption({ label: FIXTURE.products.combo.name });
    await expect(page.getByPlaceholder('Descripción').first()).toHaveValue(FIXTURE.products.combo.name);
    await page.getByTestId('venta-cantidad').first().fill('2');

    // línea 2: pastillas × 3
    await page.getByRole('button', { name: 'Agregar línea' }).click();
    await page.getByTestId('venta-producto').nth(1).selectOption({ label: FIXTURE.products.pastilla.name });
    await page.getByTestId('venta-cantidad').nth(1).fill('3');

    await expect(page.getByTestId('venta-total')).toHaveText('$ 107.500'); // 2 × 35.000 + 3 × 12.500
    await page.getByLabel('Notas (opcional)').fill('e2e-venta de dos productos');
    await page.getByRole('button', { name: 'Registrar venta' }).click();

    await expectToast(page, 'Venta registrada');
    await page.waitForURL('**/admin/ventas');
    await expect(page.getByText('$107.500').first()).toBeVisible();

    const { data: sale } = await svc().from('manual_sales').select('id, total_cents, client_id, sold_by, segment').eq('notes', 'e2e-venta de dos productos').single();
    expect(sale).toMatchObject({ total_cents: 10_750_000, client_id: ids.client, sold_by: ids.owner, segment: 'service' });
    expect(await stockOf(FIXTURE.products.combo.id)).toBe(combo0 - 2);
    expect(await stockOf(FIXTURE.products.pastilla.id)).toBe(pastilla0 - 3);
  });

  test('el stock actualizado se ve en la pantalla de stock', async ({ page }) => {
    await page.goto('/admin/stock');
    const row = page.getByTestId('producto').filter({ hasText: FIXTURE.products.combo.name });
    await expect(row.getByText(`${FIXTURE.products.combo.stock - 2} unidad`)).toBeVisible();
  });

  test('el cliente ve la venta en "Mis compras"', async ({ browser }) => {
    const ctx = await browser.newContext({ storageState: 'playwright/.auth/client.json' });
    const page = await ctx.newPage();
    await page.goto('/client/compras');
    await expect(page.getByText('e2e-venta de dos productos')).toBeVisible();
    await expect(page.getByText('$107.500')).toBeVisible();
    await ctx.close();
  });

  test('otro cliente no la ve', async ({ browser }) => {
    const ctx = await browser.newContext({ storageState: 'playwright/.auth/client2.json' });
    const page = await ctx.newPage();
    await page.goto('/client/compras');
    await expect(page.getByText('e2e-venta de dos productos')).toHaveCount(0);
    await ctx.close();
  });

  test('con un producto "Otro (manual)": no toca ningún stock', async ({ page }) => {
    const before = await stockOf(FIXTURE.products.granulado.id);
    const ids = await userIds();
    await page.goto('/admin/ventas/nueva');
    await page.getByTestId('venta-cliente').selectOption(ids.client2);
    await page.getByTestId('venta-producto').first().selectOption({ label: 'Otro (manual)' });
    await page.getByPlaceholder('Descripción').first().fill('Reparación de bomba');
    await page.getByPlaceholder('0').first().fill('8000');
    await page.getByLabel('Notas (opcional)').fill('e2e-venta manual libre');
    await page.getByRole('button', { name: 'Registrar venta' }).click();
    await expectToast(page, 'Venta registrada');

    const { data } = await svc().from('manual_sales').select('id, total_cents').eq('notes', 'e2e-venta manual libre').single();
    expect(data!.total_cents).toBe(800_000);
    const { data: items } = await svc().from('manual_sale_items').select('product_id, product_name').eq('manual_sale_id', data!.id);
    expect(items).toEqual([{ product_id: null, product_name: 'Reparación de bomba' }]);
    expect(await stockOf(FIXTURE.products.granulado.id)).toBe(before);
  });

  test('no se puede registrar sin elegir cliente (en el mostrador sí)', async ({ page }) => {
    await page.goto('/admin/ventas/nueva');
    await expect(page.getByRole('button', { name: 'Registrar venta' })).toBeDisabled();
    await page.getByTestId('venta-modo-mostrador').click();
    await expect(page.getByRole('button', { name: 'Registrar venta' })).toBeEnabled();
  });

  test('se puede quitar una línea y el total se recalcula', async ({ page }) => {
    await page.goto('/admin/ventas/nueva');
    await page.getByTestId('venta-producto').first().selectOption({ label: FIXTURE.products.combo.name });
    await page.getByRole('button', { name: 'Agregar línea' }).click();
    await page.getByTestId('venta-producto').nth(1).selectOption({ label: FIXTURE.products.pastilla.name });
    await expect(page.getByTestId('venta-total')).toHaveText('$ 47.500');
    await page.getByRole('button', { name: 'Quitar línea' }).first().click();
    await expect(page.getByTestId('venta-total')).toHaveText('$ 12.500');
  });

  test('el dashboard cuenta las ventas del mes', async ({ page }) => {
    const start = new Date(); start.setUTCDate(1); start.setUTCHours(0, 0, 0, 0);
    const { count } = await svc().from('manual_sales').select('*', { count: 'exact', head: true }).gte('sold_at', start.toISOString());
    await page.goto('/admin/dashboard');
    await expect(page.getByText('Ventas este mes')).toBeVisible();
    await expect(page.locator('a[href="/admin/ventas"]').filter({ hasText: String(count) })).toBeVisible();
  });
});

test.describe('ajustar stock', () => {
  test('los botones + y − suman y restan de a uno', async ({ page }) => {
    const id = FIXTURE.products.granulado.id;
    const s0 = await stockOf(id);
    await page.goto('/admin/stock');
    const row = page.getByTestId('producto').filter({ hasText: FIXTURE.products.granulado.name });
    await row.locator('button:has(svg.lucide-plus)').click();
    await expect(row.getByText(`${s0 + 1} kg`)).toBeVisible();
    expect(await stockOf(id)).toBe(s0 + 1);
    await row.locator('button:has(svg.lucide-minus)').click();
    await expect(row.getByText(`${s0} kg`)).toBeVisible();
    expect(await stockOf(id)).toBe(s0);
  });

  test('con stock 0 el botón − queda deshabilitado', async ({ page }) => {
    await svc().from('products').update({ stock_units: 0 }).eq('id', FIXTURE.products.granulado.id);
    await page.goto('/admin/stock');
    const row = page.getByTestId('producto').filter({ hasText: FIXTURE.products.granulado.name });
    await expect(row.locator('button:has(svg.lucide-minus)')).toBeDisabled();
    await svc().from('products').update({ stock_units: FIXTURE.products.granulado.stock }).eq('id', FIXTURE.products.granulado.id);
  });

  test('los productos inactivos aparecen en su propio grupo', async ({ page }) => {
    await page.goto('/admin/stock');
    await expect(page.getByText('Inactivos', { exact: true })).toBeVisible();
    await expect(page.getByText(FIXTURE.inactiveProduct.name)).toBeVisible();
  });

  test('desactivar un producto lo pasa al grupo "Inactivos", y activarlo lo vuelve a traer', async ({ page }) => {
    const id = FIXTURE.products.granulado.id;
    await page.goto('/admin/stock');
    const row = () => page.getByTestId('producto').filter({ hasText: FIXTURE.products.granulado.name });
    await row().getByRole('button', { name: 'Desactivar', exact: true }).click();
    await confirmar(page);
    await expect(row().getByRole('button', { name: 'Activar', exact: true })).toBeVisible();
    expect((await svc().from('products').select('is_active').eq('id', id).single()).data?.is_active).toBe(false);

    await row().getByRole('button', { name: 'Activar', exact: true }).click();
    await expect(row().getByRole('button', { name: 'Desactivar', exact: true })).toBeVisible();
    expect((await svc().from('products').select('is_active').eq('id', id).single()).data?.is_active).toBe(true);
  });
});

test.describe('crear un producto y verlo en la landing', () => {
  const name = `Combo E2E ${Date.now() % 100000}`;

  test('el owner crea un combo con precio, stock y etiqueta', async ({ page }) => {
    await page.goto('/admin/stock/nuevo');
    await page.getByLabel('Nombre *').fill(name);
    await page.getByLabel('Descripción').fill('Producto de prueba e2e');
    await selectOption(page, page.getByRole('combobox').first(), 'Combo');
    await selectOption(page, page.getByRole('combobox').nth(1), 'unidad');
    await page.getByLabel('Precio ($) *').fill('1999.99');
    await page.getByLabel('Stock inicial').fill('7');
    await page.getByLabel('Etiqueta promo').fill('E2E PROMO');
    await page.getByLabel('Destacar en la landing').check();
    await page.getByRole('button', { name: /Crear producto|Guardar/ }).click();

    await page.waitForURL('**/admin/stock');
    await expect(page.getByText(name)).toBeVisible();
    const { data } = await svc().from('products').select('id, price_cents, stock_units, unit, chlorine_type, is_featured, promo_label, is_active').eq('name', name).single();
    created.push(data!.id);
    expect(data).toMatchObject({ price_cents: 199999, stock_units: 7, unit: 'unidad', chlorine_type: 'combo', is_featured: true, promo_label: 'E2E PROMO', is_active: true });
  });

  test('el combo nuevo aparece en la landing con su precio y etiqueta', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByText(name)).toBeVisible();
    await expect(page.getByText('E2E PROMO')).toBeVisible();
  });

  test('si se desactiva, desaparece de la landing', async ({ page }) => {
    await svc().from('products').update({ is_active: false }).eq('name', name);
    await page.goto('/');
    await expect(page.getByText(name)).toHaveCount(0);
  });

  test('la foto se sube como archivo: no hay un campo para escribir una URL', async ({ page }) => {
    await page.goto('/admin/stock/nuevo');
    await expect(page.getByLabel('URL pública de la foto')).toHaveCount(0);
    await expect(page.locator('input[type="file"]')).toHaveCount(1);
  });

});
