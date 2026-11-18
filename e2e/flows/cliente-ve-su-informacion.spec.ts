/**
 * Lo que ve el cliente en su portal: puntos y nivel, compras (online y manuales), servicios.
 * Incluye aislamiento entre clientes y un recorrido de tres personas:
 * el empleado marca la pileta → el cliente lo ve en sus servicios → el owner lo ve en el itinerario.
 */
import { expect, test } from '../support/pw';
import { FIXTURE } from '../support/seed';
import { expectToast } from '../support/ui';
import { svc } from '../../tests/support/clients';
import { todayInArgentina } from '../../src/lib/dates';

test.describe('cliente con datos', () => {
  test.use({ storageState: 'playwright/.auth/client.json' });

  test('el panel muestra puntos, nivel y el avance al próximo nivel', async ({ page }) => {
    await page.goto('/client/dashboard');
    await expect(page.getByRole('heading', { name: 'Hola, test-client' })).toBeVisible();
    await expect(page.getByText('Bronce')).toBeVisible();
    await expect(page.getByText(`${FIXTURE.clientPoints}`, { exact: true })).toBeVisible();
    await expect(page.getByText(/490 puntos más/)).toBeVisible();
    await expect(page.getByText(/Plata/)).toBeVisible();
  });

  test('desde el panel se llega a compras, servicios y puntos', async ({ page }) => {
    await page.goto('/client/dashboard');
    for (const [label, url] of [['Mis compras', 'compras'], ['Mis servicios', 'servicios'], ['Mis puntos', 'puntos']] as const) {
      await page.goto('/client/dashboard');
      await page.getByRole('link', { name: new RegExp(label) }).first().click();
      await page.waitForURL(new RegExp(`/client/${url}$`));
    }
  });

  test('"Mis compras" muestra el pedido online y la venta registrada por Pancho', async ({ page }) => {
    await page.goto('/client/compras');
    await expect(page.getByRole('heading', { name: 'Mis compras' })).toBeVisible();
    await expect(page.getByText('$25.000')).toHaveCount(2); // pedido online + venta manual
    await expect(page.getByText('Venta de prueba')).toBeVisible();
    await expect(page.getByText(new RegExp(FIXTURE.products.pastilla.name))).toHaveCount(2);
  });

  test('"Mis servicios" muestra el service con su tipo, el cloro y las observaciones', async ({ page }) => {
    await page.goto('/client/servicios');
    await expect(page.getByRole('heading', { name: 'Mis servicios' })).toBeVisible();
    await expect(page.getByText('Service de prueba')).toBeVisible();
    await expect(page.getByText('Service', { exact: true })).toBeVisible();
    await expect(page.getByText('Cloro: Pastillas · 1,5')).toBeVisible();
    await expect(page.getByText('Casa de San Isidro')).toBeVisible();
  });

  test('"Mis puntos" muestra el saldo, los niveles y el movimiento', async ({ page }) => {
    await page.goto('/client/puntos');
    await expect(page.getByRole('heading', { name: 'Mis puntos' })).toBeVisible();
    await expect(page.getByText('Saldo actual')).toBeVisible();
    await expect(page.getByText('Tu nivel actual')).toBeVisible();
    for (const level of ['Bronce', 'Plata', 'Oro']) await expect(page.getByText(level, { exact: true }).first()).toBeVisible();
    await expect(page.getByText('Puntos de prueba')).toBeVisible();
    await expect(page.getByText('+10')).toBeVisible();
  });

  test('un cliente no puede abrir el backoffice ni la app de empleados', async ({ page }) => {
    for (const path of ['/admin/dashboard', '/admin/clientes', '/employee/itinerario']) {
      await page.goto(path);
      await expect(page).toHaveURL(/\/client\/dashboard/);
    }
  });
});

test.describe('otro cliente (aislamiento)', () => {
  test.use({ storageState: 'playwright/.auth/client2.json' });

  test('no ve compras, servicios ni puntos del otro cliente', async ({ page }) => {
    await page.goto('/client/compras');
    await expect(page.getByText('Sin compras registradas')).toBeVisible();
    await expect(page.getByText('Venta de prueba')).toHaveCount(0);

    await page.goto('/client/servicios');
    await expect(page.getByText('Sin servicios registrados')).toBeVisible();
    await expect(page.getByText('Service de prueba')).toHaveCount(0);

    await page.goto('/client/puntos');
    await expect(page.getByText('Aún no tenés movimientos de puntos')).toBeVisible();
    await expect(page.getByText('Puntos de prueba')).toHaveCount(0);
  });

  test('su panel muestra 0 puntos', async ({ page }) => {
    await page.goto('/client/dashboard');
    await expect(page.getByRole('heading', { name: 'Hola, test-client2' })).toBeVisible();
    await expect(page.getByText('0', { exact: true }).first()).toBeVisible();
  });
});

test.describe('recorrido de tres personas', () => {
  test.afterEach(async () => {
    await svc().from('service_logs').delete().like('notes', 'e2e-%');
    await svc().from('itinerary_items').update({ status: 'pending', completed_by: null, completed_at: null }).eq('pool_id', FIXTURE.pools.pool1.id);
  });

  test('el empleado marca la pileta → el cliente la ve en sus servicios → el owner la ve resuelta', async ({ browser }) => {
    const note = 'e2e-recorrido completo';

    // 1) el empleado, desde el celular
    const emp = await browser.newContext({ storageState: 'playwright/.auth/employee.json', viewport: { width: 390, height: 844 } });
    const ep = await emp.newPage();
    const { data: day } = await svc().from('itinerary_days').select('id').eq('date', todayInArgentina()).single();
    const { data: item } = await svc().from('itinerary_items').select('id').eq('itinerary_day_id', day!.id).eq('pool_id', FIXTURE.pools.pool1.id).single();
    await ep.goto(`/employee/piletas/${item!.id}`);
    await ep.getByRole('button', { name: 'Hecha', exact: true }).click();
    await ep.getByRole('radio', { name: 'Pastillas' }).click();
    await ep.getByLabel('Cantidad de pastillas').fill('3');
    await ep.getByPlaceholder(/Agua muy verde/).fill(note);
    await ep.getByRole('button', { name: 'Guardar', exact: true }).click();
    await expectToast(ep, '¡Pileta marcada como hecha!');
    await emp.close();

    // 2) el cliente dueño de esa pileta lo ve
    const cli = await browser.newContext({ storageState: 'playwright/.auth/client.json' });
    const cp = await cli.newPage();
    await cp.goto('/client/servicios');
    await expect(cp.getByText(note)).toBeVisible();
    await expect(cp.getByText('Cloro: Pastillas · 3')).toBeVisible();
    await cli.close();

    // 3) el otro cliente NO lo ve
    const cli2 = await browser.newContext({ storageState: 'playwright/.auth/client2.json' });
    const c2p = await cli2.newPage();
    await c2p.goto('/client/servicios');
    await expect(c2p.getByText(note)).toHaveCount(0);
    await cli2.close();

    // 4) el owner la ve resuelta en el itinerario del día
    const own = await browser.newContext({ storageState: 'playwright/.auth/owner.json' });
    const op = await own.newPage();
    await op.goto(`/admin/itinerario/${todayInArgentina()}`);
    await expect(op.getByText('Hecho').first()).toBeVisible();
    await own.close();
  });
});
