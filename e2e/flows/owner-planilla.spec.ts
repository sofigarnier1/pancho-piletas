/**
 * Flujo del owner (Etapa 3e): planilla mensual del service.
 * Una pileta con visitas en tres semanas del mes (hecha, desagote, salteada) → la planilla la muestra con el N° y el titular,
 * cada marca en su semana y el cloro del mes → la marca abre la visita. Un mes sin visitas la muestra igual, "sin agendar" (Etapa 2). Marketing y el empleado no entran (ni a Empleados).
 */
import { expect, test } from '../support/pw';
import { as, svc, userIds } from '../../tests/support/clients';

const MES = '2024-05'; // un mes pasado que no usa ningún otro test
const address = `Planilla E2E ${Date.now() % 100000}`;
let ids: Awaited<ReturnType<typeof userIds>>;
let poolId: string;
const dayIds: string[] = [];
const itemIds: string[] = [];

test.describe('planilla del dueño', () => {
  test.use({ storageState: 'playwright/.auth/owner.json' });
  test.describe.configure({ mode: 'serial' });

  test.beforeAll(async () => {
    ids = await userIds();
    // Titular con N° de cliente 777001
    await svc().from('client_profiles').upsert({ id: ids.client2, client_number: 777001 });
    poolId = (await svc().from('pools').insert({ client_id: ids.client2, address, neighborhood: 'Tigre' }).select('id').single()).data!.id as string;
    for (const [date, type] of [['2024-05-02', 'service'], ['2024-05-09', 'desagote'], ['2024-05-30', 'service']] as const) {
      await svc().from('itinerary_days').delete().eq('date', date);
      const day = (await svc().from('itinerary_days').insert({ date }).select('id').single()).data!.id as string;
      dayIds.push(day);
      itemIds.push((await svc().from('itinerary_items').insert({ itinerary_day_id: day, pool_id: poolId, sort_order: 1, service_type: type }).select('id').single()).data!.id as string);
    }
    // Las dos primeras, hechas (con cloro); la tercera, salteada
    const owner = await as('owner');
    for (const [i, extra] of [[0, { chlorine_applied: true, chlorine_type: 'pastilla', chlorine_amount: 2 }], [1, {}]] as const) {
      const { error } = await owner.from('service_logs').insert({
        itinerary_item_id: itemIds[i], employee_id: ids.employee, pool_id: poolId, client_id: ids.client2, request_id: crypto.randomUUID(), ...extra,
      });
      if (error) throw error;
    }
    await svc().from('itinerary_items').update({ status: 'skipped' }).eq('id', itemIds[2]);
  });

  test.afterAll(async () => {
    await svc().from('service_logs').delete().in('itinerary_item_id', itemIds);
    await svc().from('itinerary_items').delete().in('id', itemIds);
    await svc().from('itinerary_days').delete().in('id', dayIds);
    if (poolId) await svc().from('pools').delete().eq('id', poolId);
    await svc().from('client_profiles').update({ client_number: null }).eq('id', ids.client2);
  });

  test('desde Services se abre la planilla del mes con cada marca en su semana', async ({ page }) => {
    await page.goto(`/admin/services?mes=${MES}`);
    await page.getByTestId('services-pestana-planilla').click();
    await page.waitForURL(new RegExp(`/admin/services/planilla\\?mes=${MES}`));
    await expect(page.getByRole('heading', { name: 'Planilla del mes', level: 1 })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Imprimir' })).toBeVisible();

    const fila = page.getByTestId('planilla-fila').filter({ hasText: address });
    await expect(fila).toHaveCount(1);
    await expect(fila).toContainText('777001');
    await expect(fila).toContainText('test-client2');
    await expect(fila).toContainText('Tigre');
    await expect(fila.getByTestId('sem-1')).toHaveText(/S\s*2/);
    await expect(fila.getByTestId('sem-2')).toHaveText(/D\s*9/);
    await expect(fila.getByTestId('sem-3')).toHaveText('');
    await expect(fila.getByTestId('sem-5')).toHaveText(/X\s*30/);
    await expect(fila).toContainText('Pastillas · 2');

    await fila.getByTestId('sem-2').getByRole('link').click();
    await page.waitForURL(new RegExp(`/admin/itinerario/visita/${itemIds[1]}`));
  });

  test('una pileta activa sin visitas en el mes sale igual, resaltada, y el filtro "Sin agendar" la deja sola', async ({ page }) => {
    await page.goto('/admin/services/planilla?mes=2001-01');
    const fila = page.getByTestId('planilla-fila').filter({ hasText: address });
    await expect(fila).toHaveCount(1);
    await expect(fila).toHaveAttribute('data-sin-agendar', 'true');
    await expect(fila.getByTestId('planilla-marca-sin-agendar')).toHaveText('Sin agendar este mes');

    // En el mes con visitas no está entre las "sin agendar"
    await page.goto(`/admin/services/planilla?mes=${MES}`);
    await page.getByTestId('planilla-sin-agendar').click();
    await page.waitForURL(new RegExp(`mes=${MES}&ver=sin-agendar`));
    await expect(page.getByTestId('planilla-fila').filter({ hasText: address })).toHaveCount(0);
    for (const f of await page.getByTestId('planilla-fila').all()) await expect(f).toHaveAttribute('data-sin-agendar', 'true');
  });
});

for (const who of ['marketing', 'employee'] as const) {
  test.describe(`${who} no entra a las pantallas del dueño`, () => {
    test.use({ storageState: `playwright/.auth/${who}.json` });
    test(`${who}: planilla, empleados e historial`, async ({ page }) => {
      for (const url of ['/admin/services', '/admin/services/planilla', '/admin/empleados', '/admin/empleados/cambios', `/admin/empleados/${(await userIds()).employee}`]) {
        await page.goto(url);
        await expect(page).not.toHaveURL(new RegExp(url.replace(/[/?]/g, '\\$&') + '$'));
        await expect(page.getByTestId('planilla')).toHaveCount(0);
        await expect(page.getByTestId('empleados')).toHaveCount(0);
        await expect(page.getByTestId('cambios')).toHaveCount(0);
      }
    });
  });
}
