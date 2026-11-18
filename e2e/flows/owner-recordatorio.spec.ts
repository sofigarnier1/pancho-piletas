/**
 * Flujo del owner (Etapa 2 del roadmap de Pancho): que no se pase ningún cliente.
 * Una visita salteada ayer → al armar mañana aparece en el recordatorio "sin hacer de la semana pasada" →
 * Agregar la suma al día (en su auto o sin auto) y sale del recordatorio. Nunca se agrega sola.
 */
import { expect, test } from '../support/pw';
import { svc, userIds } from '../../tests/support/clients';
import { addDays, todayInArgentina } from '@/lib/dates';

const HOY = todayInArgentina();
const AYER = addDays(HOY, -1);
const MANANA = addDays(HOY, 1);
const address = `Recordatorio E2E ${Date.now() % 100000}`;
let poolId: string;

test.describe('recordatorio de visitas sin hacer', () => {
  test.use({ storageState: 'playwright/.auth/owner.json' });
  test.describe.configure({ mode: 'serial' });

  test.beforeAll(async () => {
    const ids = await userIds();
    poolId = (await svc().from('pools').insert({ client_id: ids.client2, address, neighborhood: 'Tigre' }).select('id').single()).data!.id as string;
    const day = (await svc().from('itinerary_days').upsert({ date: AYER }, { onConflict: 'date' }).select('id').single()).data!.id as string;
    const { error } = await svc()
      .from('itinerary_items')
      .insert({ itinerary_day_id: day, pool_id: poolId, sort_order: 980, status: 'skipped', status_note: 'Portón cerrado' });
    if (error) throw error;
  });

  test.afterAll(async () => {
    await svc().from('itinerary_items').update({ rescheduled_from_item_id: null }).eq('pool_id', poolId);
    await svc().from('itinerary_items').delete().eq('pool_id', poolId);
    await svc().from('pools').delete().eq('id', poolId);
  });

  test('la salteada de ayer aparece al armar mañana y Agregar la suma al día', async ({ page }) => {
    await page.goto(`/admin/itinerario/${MANANA}`);
    const recordatorio = page.getByTestId('pendientes-recordatorio');
    await expect(recordatorio).toBeVisible();
    await expect(recordatorio).toContainText(/sin hacer de la semana pasada/);
    const fila = recordatorio.getByTestId('pendiente-sin-reprogramar').filter({ hasText: address });
    await expect(fila).toContainText('Salteada');
    await expect(fila).toContainText('Portón cerrado');

    // No se agregó sola
    await expect(page.getByTestId('itinerario-item').filter({ hasText: address })).toHaveCount(0);

    await fila.getByTestId('pendiente-agregar').click();
    await expect(page.getByText('Visita agregada al día')).toBeVisible();
    await expect(page.getByTestId('itinerario-item').filter({ hasText: address })).toHaveCount(1);
    await expect(page.getByTestId('pendiente-sin-reprogramar').filter({ hasText: address })).toHaveCount(0);
  });

  test('en un día pasado no aparece el recordatorio', async ({ page }) => {
    await page.goto(`/admin/itinerario/${addDays(HOY, -1)}`);
    await expect(page.getByTestId('itinerario-autos')).toBeVisible();
    await expect(page.getByTestId('pendientes-recordatorio')).toHaveCount(0);
  });
});
