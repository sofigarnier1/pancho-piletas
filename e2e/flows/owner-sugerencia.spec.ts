/**
 * Flujo del owner (Etapa 6 del roadmap de Pancho): sugerencia del itinerario (sin IA) y frecuencia/ubicación de la pileta.
 * Una pileta semanal hecha el mismo día de la semana pasada → "Sugerir" en el día la propone con su motivo →
 * se carga solo esa → queda en el día. En la ficha de la pileta se cambia la frecuencia y se corrige la ubicación a mano.
 */
import { randomUUID } from 'node:crypto';
import { expect, test } from '../support/pw';
import { svc, userIds } from '../../tests/support/clients';
import { addDays, todayInArgentina } from '@/lib/dates';

const MANANA = addDays(todayInArgentina(), 1);
const address = `Sugerencia E2E ${Date.now() % 100000}`;
let poolId: string;

test.describe('sugerencia del itinerario', () => {
  test.use({ storageState: 'playwright/.auth/owner.json' });
  test.describe.configure({ mode: 'serial' });

  test.beforeAll(async () => {
    const ids = await userIds();
    poolId = (await svc().from('pools').insert({ client_id: ids.client2, address, neighborhood: 'Tigre' }).select('id').single()).data!.id as string;
    const day = (await svc().from('itinerary_days').upsert({ date: addDays(MANANA, -7) }, { onConflict: 'date' }).select('id').single()).data!.id as string;
    const item = (await svc().from('itinerary_items').insert({ itinerary_day_id: day, pool_id: poolId, sort_order: 990 }).select('id').single()).data!.id as string;
    const { error } = await svc().from('service_logs').insert({ itinerary_item_id: item, employee_id: ids.employee, pool_id: poolId, client_id: ids.client2, request_id: randomUUID() });
    if (error) throw error;
  });

  test.afterAll(async () => {
    await svc().from('service_logs').delete().eq('pool_id', poolId);
    await svc().from('itinerary_items').delete().eq('pool_id', poolId);
    await svc().from('pools').delete().eq('id', poolId);
  });

  test('Sugerir propone la del mismo día de la semana pasada y se carga solo lo elegido', async ({ page }) => {
    await page.goto(`/admin/itinerario/${MANANA}`);
    await page.getByTestId('sugerir').click();
    const lista = page.getByTestId('sugerencia-lista');
    const nuestra = lista.getByTestId('sugerencia-item').filter({ hasText: address });
    await expect(nuestra.getByTestId('sugerencia-motivo')).toHaveText('Fue el mismo día la semana pasada');

    // Solo la nuestra
    for (const cb of await lista.getByRole('checkbox').all()) if (await cb.isChecked()) await cb.uncheck();
    await nuestra.getByRole('checkbox').check();
    await page.getByTestId('sugerencia-cargar').click();
    await expect(page.getByText('Sugerencia cargada: 1 pileta')).toBeVisible();
    await expect(page.getByTestId('itinerario-item').filter({ hasText: address })).toHaveCount(1);
  });

  test('en la ficha: frecuencia y ubicación a mano', async ({ page }) => {
    await page.goto(`/admin/piletas/${poolId}`);
    const panel = page.getByTestId('visitas-ubicacion');
    await panel.getByTestId('pileta-frecuencia').selectOption('quincenal');
    await expect(page.getByText('Frecuencia guardada')).toBeVisible();
    await expect(panel.getByTestId('pileta-ubicacion')).toContainText('Sin ubicar');
    await panel.getByTestId('ubicacion-texto').fill('-34.4260, -58.5796');
    await panel.getByTestId('ubicacion-guardar').click();
    await expect(page.getByText('Ubicación guardada')).toBeVisible();
    await expect(panel.getByTestId('pileta-ubicacion')).toContainText('Ubicada en el mapa');
    const { data } = await svc().from('pools').select('frequency, lat, lng, location_source').eq('id', poolId).single();
    expect(data).toMatchObject({ frequency: 'quincenal', lat: -34.426, lng: -58.5796, location_source: 'manual' });
  });
});
