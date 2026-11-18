/**
 * Flujo de cobros (Etapa 5 del roadmap de Pancho).
 * Precio del service de un cliente + una visita hecha → el empleado toca "Cobré" y anota el monto (sin ver precios) →
 * el dueño ve la deuda (lo hecho − lo pagado), el cobro "en mano" del empleado y lo confirma → carga un pago directo →
 * el detalle del cliente muestra los movimientos con el saldo.
 */
import { randomUUID } from 'node:crypto';
import { expect, test } from '../support/pw';
import { svc, userIds } from '../../tests/support/clients';
import { todayInArgentina } from '@/lib/dates';

const HOY = todayInArgentina();
const address = `Cobros E2E ${Date.now() % 100000}`;
let ids: Awaited<ReturnType<typeof userIds>>;
let poolId: string;
let itemId: string;

test.describe.configure({ mode: 'serial' });

test.beforeAll(async () => {
  ids = await userIds();
  await svc().from('payments').delete().eq('client_id', ids.client2);
  await svc().from('client_prices').delete().eq('client_id', ids.client2);
  await svc().from('client_prices').insert({ client_id: ids.client2, kind: 'service', price_cents: 2_000_000, valid_from: '2020-01-01' });
  poolId = (await svc().from('pools').insert({ client_id: ids.client2, address }).select('id').single()).data!.id as string;
  const day = (await svc().from('itinerary_days').upsert({ date: HOY }, { onConflict: 'date' }).select('id').single()).data!.id as string;
  itemId = (await svc().from('itinerary_items').insert({ itinerary_day_id: day, pool_id: poolId, sort_order: 990 }).select('id').single()).data!.id as string;
  const { error } = await svc().from('service_logs').insert({
    itinerary_item_id: itemId, employee_id: ids.employee, pool_id: poolId, client_id: ids.client2, request_id: randomUUID(),
  });
  if (error) throw error;
});

test.afterAll(async () => {
  await svc().from('payments').delete().eq('client_id', ids.client2);
  await svc().from('service_logs').delete().eq('pool_id', poolId);
  await svc().from('itinerary_items').delete().eq('pool_id', poolId);
  await svc().from('pools').delete().eq('id', poolId);
  await svc().from('client_prices').delete().eq('client_id', ids.client2);
});

test.describe('el empleado anota lo que cobró', () => {
  test.use({ storageState: 'playwright/.auth/employee.json' });
  test('Cobré: solo el monto, sin precios', async ({ page }) => {
    await page.goto(`/employee/piletas/${itemId}`);
    const cobros = page.getByTestId('cobros');
    await expect(cobros).toBeVisible();
    await expect(page.getByText('$ 20.000')).toHaveCount(0); // el precio no se ve
    await cobros.getByTestId('cobre').click();
    await cobros.getByTestId('cobro-monto').fill('15.000');
    await cobros.getByTestId('cobro-guardar').click();
    await expect(page.getByText('Cobro anotado')).toBeVisible();
    await expect(cobros.getByTestId('cobro')).toContainText('Cobraste $ 15.000');
    await expect(cobros.getByTestId('cobro')).toContainText('Falta entregárselo al dueño');
  });
});

test.describe('el dueño ve la deuda y confirma', () => {
  test.use({ storageState: 'playwright/.auth/owner.json' });

  test('deuda, en mano del empleado, confirmar y pago directo', async ({ page }) => {
    await page.goto('/admin/cobros');
    await expect(page.getByRole('heading', { name: 'Cobros', level: 1 })).toBeVisible();

    const enMano = page.getByTestId('en-mano');
    await expect(enMano.getByTestId('en-mano-cobro').filter({ hasText: 'test-client2' })).toContainText('$ 15.000');
    await expect(page.getByTestId('total-en-mano')).not.toHaveText('$ 0');

    await enMano.getByTestId('en-mano-cobro').filter({ hasText: 'test-client2' }).getByTestId('confirmar-cobro').click();
    await expect(page.getByText('Cobro confirmado')).toBeVisible();

    const carga = page.getByTestId('cargar-pago');
    await carga.getByTestId('pago-cliente').selectOption({ label: 'test-client2' });
    await carga.getByTestId('pago-monto').fill('1.000');
    await carga.getByTestId('pago-guardar').click();
    await expect(page.getByText('Pago guardado')).toBeVisible();

    await page.goto(`/admin/cobros/${ids.client2}`);
    await expect(page.getByTestId('cuenta-saldo')).toHaveText('$ 4.000'); // 20.000 − 15.000 − 1.000
    await expect(page.getByTestId('movimiento').filter({ hasText: 'Service' })).toContainText('$ 20.000');
  });
});

test.describe('marketing y el empleado no ven cobros', () => {
  for (const who of ['marketing', 'employee'] as const) {
    test.describe(who, () => {
      test.use({ storageState: `playwright/.auth/${who}.json` });
      test(`${who} no entra a Cobros`, async ({ page }) => {
        await page.goto('/admin/cobros');
        await expect(page).not.toHaveURL(/\/admin\/cobros$/);
        await expect(page.getByTestId('en-mano')).toHaveCount(0);
      });
    });
  }
});
