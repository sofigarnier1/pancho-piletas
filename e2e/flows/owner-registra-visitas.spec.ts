/**
 * Flujo del owner (Etapa 3b): abre una visita desde el itinerario, registra el service a nombre de un empleado
 * (de hace más de 7 días: el empleado ya no podría), lo corrige, lo borra, saltea la visita y la vuelve a pendiente.
 * Una visita de un día que no llegó no se puede registrar.
 */
import { expect, test } from '../support/pw';
import { todayInArgentina, addDays } from '../../src/lib/dates';
import { expectToast, selectOption } from '../support/ui';
import { svc, userIds } from '../../tests/support/clients';

test.use({ storageState: 'playwright/.auth/owner.json' });
test.describe.configure({ mode: 'serial' });

const pastDay = addDays(todayInArgentina(), -10);
const futureDay = addDays(todayInArgentina(), 5);
const created = { pool: '', days: [] as string[], items: [] as string[] };
let itemId: string;
let futureItemId: string;
let ids: Awaited<ReturnType<typeof userIds>>;

/** Una visita a una pileta temporal en esa fecha (crea el día si no existe). */
async function nuevaVisita(fecha: string) {
  let { data: day } = await svc().from('itinerary_days').select('id').eq('date', fecha).maybeSingle();
  if (!day) {
    day = (await svc().from('itinerary_days').insert({ date: fecha }).select('id').single()).data;
    created.days.push(fecha);
  }
  const { data: item } = await svc().from('itinerary_items').insert({ itinerary_day_id: day!.id, pool_id: created.pool, sort_order: 50 }).select('id').single();
  created.items.push(item!.id as string);
  return item!.id as string;
}

test.beforeAll(async () => {
  ids = await userIds();
  const { data: pool } = await svc().from('pools').insert({ client_id: ids.client2, address: 'Calle Visita 100', nickname: 'Pileta Visita E2E' }).select('id').single();
  created.pool = pool!.id as string;
  itemId = await nuevaVisita(pastDay);
  futureItemId = await nuevaVisita(futureDay);
});

test.afterAll(async () => {
  await svc().from('service_logs').delete().in('itinerary_item_id', created.items);
  await svc().from('itinerary_items').delete().in('id', created.items);
  for (const d of created.days) await svc().from('itinerary_days').delete().eq('date', d);
  await svc().from('pools').delete().eq('id', created.pool);
});

test('el owner abre la visita desde el itinerario y registra el service a nombre del empleado', async ({ page }) => {
  await page.goto(`/admin/itinerario/${pastDay}`);
  await page.getByRole('link', { name: 'Pileta Visita E2E' }).click();
  await page.waitForURL(`**/admin/itinerario/visita/${itemId}`);
  await expect(page.getByText('Pendiente').first()).toBeVisible();

  await page.getByRole('button', { name: 'Registrar el service' }).click();
  await selectOption(page, page.getByRole('combobox', { name: 'Quién lo hizo' }), /test-employee/);
  await selectOption(page, page.getByRole('combobox', { name: 'Cloro aplicado' }), 'Pastillas');
  await page.getByLabel('Cantidad de pastillas').fill('1.5');
  await page.getByLabel('Observaciones (opcional)').fill('Lo cargó el dueño');
  await page.getByRole('button', { name: 'Confirmar' }).click();
  await expectToast(page, 'Service registrado');

  await expect(page.getByText('Hecha').first()).toBeVisible();
  const registro = page.getByTestId('registro');
  await expect(registro).toHaveCount(1);
  await expect(registro).toContainText('test-employee');
  await expect(registro).toContainText('Lo cargó el dueño');

  const { data: logs } = await svc().from('service_logs').select('employee_id, chlorine_type, chlorine_amount').eq('itinerary_item_id', itemId);
  expect(logs).toEqual([{ employee_id: ids.employee, chlorine_type: 'pastilla', chlorine_amount: 1.5 }]);

  // En el día se ve quién la hizo
  await page.getByRole('link', { name: 'Volver al día' }).click();
  const row = page.getByTestId('itinerario-item').filter({ hasText: 'Pileta Visita E2E' });
  await expect(row.getByTestId('itinerario-hecho-por')).toHaveText('Hecha por test-employee');
});

test('el owner corrige quién hizo el registro y queda en el historial', async ({ page }) => {
  await page.goto(`/admin/itinerario/visita/${itemId}`);
  await page.getByRole('button', { name: 'Editar registro' }).click();
  await selectOption(page, page.getByRole('combobox', { name: 'Quién lo hizo' }), /\(vos\)/);
  await page.getByRole('button', { name: 'Guardar cambios' }).click();
  await expectToast(page, 'Registro actualizado');
  await expect(page.getByTestId('registro')).toContainText('(corregido)');

  const { data: log } = await svc().from('service_logs').select('id, employee_id').eq('itinerary_item_id', itemId).single();
  expect(log!.employee_id).toBe(ids.owner);
  const { data: hist } = await svc().from('service_log_history').select('action, changed_by').eq('service_log_id', log!.id).order('changed_at');
  expect(hist).toEqual([{ action: 'insert', changed_by: ids.owner }, { action: 'update', changed_by: ids.owner }]);
});

test('el owner borra el único registro y la visita vuelve a pendiente', async ({ page }) => {
  await page.goto(`/admin/itinerario/visita/${itemId}`);
  await page.getByRole('button', { name: 'Borrar registro' }).click();
  await page.getByRole('button', { name: 'Sí, borrar' }).click();
  await expectToast(page, 'Registro borrado');
  await expect(page.getByTestId('registro')).toHaveCount(0);
  await expect(page.getByText('Pendiente').first()).toBeVisible();
  expect((await svc().from('itinerary_items').select('status').eq('id', itemId).single()).data!.status).toBe('pending');
});

test('el owner saltea la visita y la vuelve a pendiente', async ({ page }) => {
  await page.goto(`/admin/itinerario/visita/${itemId}`);
  await page.getByRole('button', { name: 'Saltear' }).click();
  await expectToast(page, 'Visita salteada');
  await expect(page.getByTestId('visita-cierre')).toContainText('la cerró test-owner');
  expect((await svc().from('itinerary_items').select('status, completed_by').eq('id', itemId).single()).data).toEqual({ status: 'skipped', completed_by: ids.owner });

  await page.getByRole('button', { name: 'Volver a pendiente' }).click();
  await expectToast(page, 'La visita volvió a pendiente');
  expect((await svc().from('itinerary_items').select('status').eq('id', itemId).single()).data!.status).toBe('pending');
});

test('una visita de un día que todavía no llegó no se puede registrar', async ({ page }) => {
  await page.goto(`/admin/itinerario/visita/${futureItemId}`);
  await expect(page.getByText('Esta visita es de un día que todavía no llegó')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Registrar el service' })).toHaveCount(0);
});
