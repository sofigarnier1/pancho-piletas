/**
 * Flujo del owner (Etapa 3 del roadmap de Pancho): modo campo.
 * Desde el backoffice, "Modo campo" abre la pantalla del empleado → se sube a un auto → "Agregar a mi día" suma una
 * pileta a su nombre → la ve en su ruta con los mismos botones que el empleado → vuelve al backoffice.
 * El empleado no ve el panel del modo campo; marketing no entra a la pantalla del empleado.
 */
import { expect, test } from '../support/pw';
import { rand, svc, userIds } from '../../tests/support/clients';
import { todayInArgentina } from '@/lib/dates';

const HOY = todayInArgentina();
const address = `Campo E2E ${Date.now() % 100000}`;
const autoName = `Auto campo ${Date.now() % 100000}`;
let poolId: string;
let autoId: string;
let ownerId: string;

test.describe('modo campo del dueño', () => {
  test.use({ storageState: 'playwright/.auth/owner.json' });
  test.describe.configure({ mode: 'serial' });

  test.beforeAll(async () => {
    const ids = await userIds();
    ownerId = ids.owner;
    poolId = (await svc().from('pools').insert({ client_id: ids.client2, address, neighborhood: rand('Barrio') }).select('id').single()).data!.id as string;
    autoId = (await svc().from('vehicles').insert({ name: autoName }).select('id').single()).data!.id as string;
  });

  test.afterAll(async () => {
    await svc().from('itinerary_items').delete().eq('pool_id', poolId);
    await svc().from('itinerary_day_crews').delete().eq('vehicle_id', autoId);
    await svc().from('pools').delete().eq('id', poolId);
    await svc().from('vehicles').delete().eq('id', autoId);
  });

  test('entra desde el backoffice, se sube a un auto, se agrega una pileta y la ve en su ruta', async ({ page }) => {
    await page.goto('/admin/dashboard');
    await page.getByTestId('modo-campo-boton').click();
    await page.waitForURL(/\/employee\/itinerario$/);
    const panel = page.getByTestId('modo-campo');
    await expect(panel).toBeVisible();

    await panel.getByTestId('campo-auto').selectOption({ label: autoName });
    await expect(page.getByText('Listo: hoy vas en ese auto')).toBeVisible();
    await expect(page.getByTestId('mi-auto')).toContainText(autoName);

    await panel.getByTestId('campo-agregar').click();
    await page.getByTestId('agregar-buscar').fill(address);
    await page.getByTestId('agregar-pileta').filter({ hasText: address }).click();
    await page.getByTestId('agregar-confirmar').click();
    await expect(page.getByText('Pileta agregada a tu día')).toBeVisible();

    const visita = page.getByTestId('visita').filter({ hasText: address });
    await expect(visita).toHaveCount(1);
    await expect(page.getByTestId('bloque-mias')).toContainText(address);

    const { data } = await svc().from('itinerary_items').select('vehicle_id, assigned_employee_id, itinerary_days(date)').eq('pool_id', poolId).single();
    expect(data).toMatchObject({ vehicle_id: autoId, assigned_employee_id: ownerId, itinerary_days: { date: HOY } });

    await panel.getByTestId('volver-backoffice').click();
    await page.waitForURL(/\/admin\/dashboard/);
  });
});

test.describe('el empleado no tiene modo campo', () => {
  test.use({ storageState: 'playwright/.auth/employee.json' });
  test('ni el panel ni el enlace al backoffice', async ({ page }) => {
    await page.goto('/employee/itinerario');
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    await expect(page.getByTestId('modo-campo')).toHaveCount(0);
    await expect(page.getByRole('link', { name: 'Backoffice' })).toHaveCount(0);
  });
});

test.describe('marketing no entra a la pantalla del empleado', () => {
  test.use({ storageState: 'playwright/.auth/marketing.json' });
  test('lo manda a su inicio', async ({ page }) => {
    await page.goto('/employee/itinerario');
    await expect(page).not.toHaveURL(/\/employee/);
    await expect(page.getByTestId('modo-campo-boton')).toHaveCount(0);
  });
});
