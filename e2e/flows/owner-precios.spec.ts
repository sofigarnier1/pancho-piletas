/**
 * Flujo del owner (Etapa 4 del roadmap de Pancho): precios por cliente en la ficha.
 * Carga el precio del service desde hoy → es el de hoy → carga un aumento a futuro → "todavía no rige" → lo borra.
 * Marketing no entra a la ficha; los precios nunca salen en la pantalla del empleado.
 */
import { confirmar } from '../support/ui';
import { expect, test } from '../support/pw';
import { svc, userIds } from '../../tests/support/clients';
import { addDays, todayInArgentina } from '@/lib/dates';

let clientId: string;

test.describe('precios del cliente', () => {
  test.use({ storageState: 'playwright/.auth/owner.json' });
  test.describe.configure({ mode: 'serial' });

  test.beforeAll(async () => {
    clientId = (await userIds()).client2;
    await svc().from('client_prices').delete().eq('client_id', clientId);
  });
  test.afterAll(async () => { await svc().from('client_prices').delete().eq('client_id', clientId); });

  test('carga, aumento a futuro y borrado', async ({ page }) => {
    await page.goto(`/admin/clientes/${clientId}`);
    const panel = page.getByTestId('precios');
    await expect(panel.getByTestId('precio-service').getByTestId('precio-vigente')).toHaveText('Sin precio');

    await panel.getByTestId('precio-monto').fill('12.500');
    await panel.getByTestId('precio-guardar').click();
    await expect(page.getByText('Precio guardado')).toBeVisible();
    await expect(panel.getByTestId('precio-service').getByTestId('precio-vigente')).toHaveText('$ 12.500');

    await panel.getByTestId('precio-monto').fill('15000');
    await panel.getByTestId('precio-desde').fill(addDays(todayInArgentina(), 30));
    await panel.getByTestId('precio-guardar').click();
    const futuro = panel.getByTestId('precio-service').getByTestId('precio-historial').filter({ hasText: 'todavía no rige' });
    await expect(futuro).toContainText('$ 15.000');
    await expect(panel.getByTestId('precio-service').getByTestId('precio-vigente')).toHaveText('$ 12.500');

    await futuro.getByRole('button', { name: 'Borrar precio' }).click();
    await confirmar(page);
    await expect(page.getByText('Precio borrado')).toBeVisible();
    await expect(panel.getByTestId('precio-service').getByTestId('precio-historial')).toHaveCount(1);
  });

  test('la tabla de clientes muestra el precio del service y se cambia desde la ventana de la fila', async ({ page }) => {
    await page.goto('/admin/clientes');
    const fila = page.getByTestId('tabla-clientes').getByTestId('tabla-fila').filter({ hasText: 'test-client2' });
    await expect(fila).toContainText('$ 12.500');

    await fila.click();
    const ficha = page.getByTestId('ficha-panel');
    const panel = ficha.getByTestId('precios');
    await expect(panel.getByTestId('precio-service').getByTestId('precio-vigente')).toHaveText('$ 12.500');
    await panel.getByTestId('precio-monto').fill('13.000');
    await panel.getByTestId('precio-guardar').click();
    await expect(page.getByText('Precio guardado')).toBeVisible();
    await expect(panel.getByTestId('precio-service').getByTestId('precio-vigente')).toHaveText('$ 13.000');

    await page.keyboard.press('Escape');
    await expect(fila).toContainText('$ 13.000');
  });
});

test.describe('marketing no ve precios', () => {
  test.use({ storageState: 'playwright/.auth/marketing.json' });
  test('no entra a la ficha del cliente', async ({ page }) => {
    await page.goto(`/admin/clientes/${(await userIds()).client2}`);
    await expect(page.getByTestId('precios')).toHaveCount(0);
  });
});
