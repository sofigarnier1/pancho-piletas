/**
 * Dueño: depósito de cloro (migración 34). Carga mercadería a granel, cuenta, saca merma, pone precio a granel,
 * vende en el mostrador a granel y lo ve en Movimientos y en "Cloro del mes". Marketing ve el depósito sin botones.
 */
import { expect, test } from '../support/pw';
import { expectToast } from '../support/ui';
import { svc } from '../../tests/support/clients';

test.use({ storageState: 'playwright/.auth/owner.json' });
test.describe.configure({ mode: 'serial' });

type Dep = { chlorine_type: string; quantity: number; bulk_price_cents: number | null; low_alert: number | null };
let original: Dep[] = [];
const START = new Date(Date.now() - 1000).toISOString();
const dep = async (t: string) => Number((await svc().from('chlorine_stock').select('quantity').eq('chlorine_type', t).single()).data!.quantity);

test.beforeAll(async () => {
  original = ((await svc().from('chlorine_stock').select('chlorine_type, quantity, bulk_price_cents, low_alert')).data ?? []) as Dep[];
  await svc().from('chlorine_stock').update({ quantity: 0, bulk_price_cents: null, low_alert: null }).eq('chlorine_type', 'granulado');
});
test.afterAll(async () => {
  await svc().from('manual_sales').delete().like('notes', 'e2e-cloro-%');
  for (const o of original) await svc().from('chlorine_stock').update({ quantity: o.quantity, bulk_price_cents: o.bulk_price_cents, low_alert: o.low_alert }).eq('chlorine_type', o.chlorine_type);
  await svc().from('stock_movements').delete().gte('created_at', START);
});

test('carga 25 kg de granulado a granel con proveedor', async ({ page }) => {
  await page.goto('/admin/stock');
  await page.getByTestId('cargar-mercaderia').click();
  await page.waitForURL('**/admin/stock/cargar');
  await page.getByTestId('cargar-granulado').click();
  await page.getByTestId('cargar-granel').click();
  await page.getByTestId('cargar-cantidad').fill('25');
  await expect(page.getByTestId('cargar-suma')).toContainText('Suma 25 kg al depósito');
  await page.getByTestId('cargar-proveedor').fill('Proveedor e2e');
  await page.getByTestId('cargar-guardar').click();
  await expectToast(page, 'Mercadería cargada');
  await expect(page.getByTestId('ingreso').first()).toContainText('25 kg');
  await expect(page.getByTestId('ingreso').first()).toContainText('Proveedor e2e');
  expect(await dep('granulado')).toBe(25);
});

test('cuenta el depósito, saca merma y pone precio y aviso', async ({ page }) => {
  await page.goto('/admin/stock');
  const card = page.getByTestId('deposito-granulado');
  await expect(card.getByTestId('deposito-cantidad')).toHaveText('25 kg');

  await card.getByTestId('deposito-contar').click();
  await page.getByTestId('deposito-cantidad-input').fill('24,5');
  await page.getByTestId('deposito-guardar').click();
  await expectToast(page, 'Conteo guardado');
  await expect(card.getByTestId('deposito-cantidad')).toHaveText('24,5 kg');

  await card.getByTestId('deposito-merma').click();
  await page.getByTestId('deposito-cantidad-input').fill('0,5');
  await page.getByTestId('deposito-nota').fill('Bolsa rota');
  await page.getByTestId('deposito-guardar').click();
  await expectToast(page, 'Merma registrada');
  await expect(card.getByTestId('deposito-cantidad')).toHaveText('24 kg');

  await card.getByTestId('deposito-config').click();
  await page.getByTestId('deposito-precio').fill('4.000');
  await page.getByTestId('deposito-aviso').fill('30');
  await page.getByTestId('deposito-guardar').click();
  await expectToast(page, 'Precio y aviso guardados');
  await expect(card).toContainText('Stock bajo');
  await expect(card).toContainText('$ 4.000 por kilo');
});

test('vende 2,5 kg a granel en el mostrador con el precio del depósito', async ({ page }) => {
  await page.goto('/admin/ventas/nueva');
  await page.getByTestId('venta-modo-mostrador').click();
  await page.getByTestId('venta-nombre-mostrador').fill('Vecino e2e');
  await page.getByTestId('venta-producto').first().selectOption('granel:granulado');
  await expect(page.getByTestId('venta-precio').first()).toHaveValue('4000');
  await page.getByTestId('venta-cantidad').first().fill('2,5');
  await expect(page.getByTestId('venta-total')).toHaveText('$ 10.000');
  await page.getByLabel('Notas (opcional)').fill('e2e-cloro-mostrador');
  await page.getByTestId('venta-registrar').click();
  await expectToast(page, 'Venta registrada');
  await page.waitForURL('**/admin/ventas');
  await expect(page.getByText('Mostrador · Vecino e2e').first()).toBeVisible();
  expect(await dep('granulado')).toBe(21.5);
});

test('el historial y el reporte del mes muestran todo', async ({ page }) => {
  await page.goto('/admin/stock/movimientos');
  const movs = page.getByTestId('movimiento');
  await expect(movs.filter({ hasText: 'Ingreso' }).filter({ hasText: 'Proveedor e2e' })).toHaveCount(1);
  await expect(movs.filter({ hasText: 'Merma' }).filter({ hasText: 'Bolsa rota' })).toHaveCount(1);
  await expect(movs.filter({ hasText: 'Venta' }).filter({ hasText: 'Mostrador' }).first()).toContainText('−2,5 kg');

  await page.goto('/admin/ventas');
  await page.getByTestId('ver-reporte').click();
  await page.waitForURL('**/admin/ventas/reporte');
  await expect(page.getByTestId('reporte-granulado-mostrador').first()).toContainText('2,5 kg');
});

test.describe('marketing', () => {
  test.use({ storageState: 'playwright/.auth/marketing.json' });
  test('ve el depósito pero no los botones ni la carga', async ({ page }) => {
    await page.goto('/admin/stock');
    await expect(page.getByTestId('deposito-granulado')).toBeVisible();
    await expect(page.getByTestId('deposito-contar')).toHaveCount(0);
    await expect(page.getByTestId('cargar-mercaderia')).toHaveCount(0);
    await page.goto('/admin/stock/cargar');
    await page.waitForURL('**/admin/stock');
  });
});
