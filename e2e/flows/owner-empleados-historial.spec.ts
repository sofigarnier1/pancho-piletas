/**
 * Flujo del owner (Etapa 3d): trabajo del equipo e historial de cambios.
 * Una visita de hoy con dos registros del empleado → Empleados muestra sus visitas y su cloro → el detalle lleva a la visita →
 * el dueño corrige un registro y borra el otro → "Ver cambios", "Registros borrados" y el historial filtrado por persona lo muestran.
 */
import { expect, test } from '../support/pw';
import { expectToast, selectOption } from '../support/ui';
import { as, svc, userIds } from '../../tests/support/clients';
import { todayInArgentina } from '@/lib/dates';

test.use({ storageState: 'playwright/.auth/owner.json' });
test.describe.configure({ mode: 'serial' });

const address = `Historial E2E ${Date.now() % 100000}`;
let ids: Awaited<ReturnType<typeof userIds>>;
let poolId: string;
let itemId: string;

test.beforeAll(async () => {
  ids = await userIds();
  poolId = (await svc().from('pools').insert({ client_id: ids.client2, address }).select('id').single()).data!.id as string;
  const hoy = todayInArgentina();
  let { data: day } = await svc().from('itinerary_days').select('id').eq('date', hoy).maybeSingle();
  if (!day) day = (await svc().from('itinerary_days').insert({ date: hoy }).select('id').single()).data;
  itemId = (await svc().from('itinerary_items').insert({ itinerary_day_id: day!.id, pool_id: poolId, sort_order: 99 }).select('id').single()).data!.id as string;
  // El empleado cargó dos registros (el segundo, por error)
  const employee = await as('employee');
  for (const extra of [{ chlorine_applied: true, chlorine_type: 'liquido', chlorine_amount: 4 }, { notes: 'Cargado dos veces' }]) {
    const { error } = await employee.from('service_logs').insert({
      itinerary_item_id: itemId, employee_id: ids.employee, pool_id: poolId, client_id: ids.client2, request_id: crypto.randomUUID(), ...extra,
    });
    if (error) throw error;
  }
});

test.afterAll(async () => {
  if (itemId) {
    await svc().from('service_logs').delete().eq('itinerary_item_id', itemId);
    await svc().from('service_log_history').delete().eq('new_data->>itinerary_item_id', itemId);
    await svc().from('service_log_history').delete().eq('old_data->>itinerary_item_id', itemId);
    await svc().from('itinerary_items').delete().eq('id', itemId);
  }
  if (poolId) await svc().from('pools').delete().eq('id', poolId);
});

test('Empleados muestra el trabajo del mes y el detalle lleva a la visita', async ({ page }) => {
  await page.goto('/admin/empleados');
  await expect(page.getByRole('heading', { name: 'Empleados', level: 1 })).toBeVisible();
  const row = page.getByTestId('tabla-empleados').getByTestId('tabla-fila').filter({ hasText: 'test-employee' });
  await expect(row).toHaveCount(1);
  await expect(row.getByTestId('visitas')).not.toHaveText('0');

  // Mes anterior y vuelta
  await page.getByRole('link', { name: 'Mes anterior' }).click();
  await expect(page).toHaveURL(/mes=\d{4}-\d{2}/);
  await page.getByRole('link', { name: 'Mes siguiente' }).click();
  await page.waitForURL(new RegExp(`mes=${todayInArgentina().slice(0, 7)}`));

  await page.getByTestId('tabla-empleados').getByTestId('tabla-fila').filter({ hasText: 'test-employee' }).click();
  await page.waitForURL(new RegExp(`/admin/empleados/${ids.employee}`));
  await expect(page.getByTestId('cloro-mes')).toContainText('Líquido · 4 L');
  const registro = page.getByTestId('registro-mes').filter({ hasText: address });
  await expect(registro).toHaveCount(2);
  await registro.first().getByRole('link', { name: address }).click();
  await page.waitForURL(new RegExp(`/admin/itinerario/visita/${itemId}`));
});

test('el dueño corrige un registro y borra el otro: queda en "Ver cambios" y en "Registros borrados"', async ({ page }) => {
  await page.goto(`/admin/itinerario/visita/${itemId}`);
  const registros = page.getByTestId('registro');
  await expect(registros).toHaveCount(2);

  // Corrige el primero: pasa a granulado
  await registros.first().getByRole('button', { name: 'Editar registro' }).click();
  await selectOption(page, page.getByRole('combobox', { name: 'Cloro aplicado' }), 'Granulado');
  await page.getByLabel('Gramos').fill('300');
  await page.getByRole('button', { name: 'Guardar cambios' }).click();
  await expectToast(page, 'Registro actualizado');

  // Borra el segundo
  await page.getByTestId('registro').nth(1).getByRole('button', { name: 'Borrar registro' }).click();
  await page.getByRole('button', { name: 'Sí, borrar' }).click();
  await expectToast(page, 'Registro borrado');
  await expect(page.getByTestId('registro')).toHaveCount(1);

  const ver = page.getByTestId('ver-cambios');
  await expect(ver).toContainText('Ver cambios (2)');
  await ver.locator('summary').click();
  const cambios = ver.getByTestId('cambio');
  await expect(cambios.nth(0)).toContainText('Registró');
  await expect(cambios.nth(1)).toContainText('Editó');
  await expect(cambios.nth(1)).toContainText('Líquido · 4 L');
  await expect(cambios.nth(1)).toContainText('Granulado · 300 g');

  const borrados = page.getByTestId('registros-borrados');
  await expect(borrados).toContainText('Borró');
  await expect(borrados).toContainText('Cargado dos veces');
});

test('el historial filtrado por persona muestra lo que hizo el dueño sobre los registros del empleado', async ({ page }) => {
  await page.goto('/admin/empleados');
  await page.getByRole('link', { name: 'Historial de cambios' }).click();
  await page.waitForURL(/\/admin\/empleados\/cambios/);
  await selectOption(page, page.getByRole('combobox', { name: 'Filtrar por persona' }), 'test-employee');
  await page.waitForURL(new RegExp(`persona=${ids.employee}`));

  const deEsta = page.getByTestId('cambio').filter({ hasText: address });
  await expect(deEsta).toHaveCount(4); // 2 altas del empleado, la edición y el borrado del dueño
  await expect(deEsta.filter({ hasText: 'Editó' })).toHaveCount(1);
  await expect(deEsta.filter({ hasText: 'Borró' })).toHaveCount(1);

  // Filtrado por otra persona (el cliente no es del equipo: no aparece) → todas las personas
  await selectOption(page, page.getByRole('combobox', { name: 'Filtrar por persona' }), 'Todas las personas');
  await expect(page).not.toHaveURL(/persona=/);
  await expect(page.getByTestId('cambio').filter({ hasText: address })).toHaveCount(4);
});
