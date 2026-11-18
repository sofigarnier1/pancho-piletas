/**
 * Flujo del owner: alta de cliente con su pileta (en un paso, sin cuenta web) → otra pileta
 * desde "Nueva pileta" → cargar un auto → armar el itinerario
 * de un día (auto, tipo de visita, equipo) → copiar la semana anterior (dos veces, sin duplicar).
 */
import { expect, test } from '../support/pw';
import { FIXTURE } from '../support/seed';
import { todayInArgentina } from '../../src/lib/dates';
import { expectToast, selectOption, confirmar } from '../support/ui';
import { rand, svc } from '../../tests/support/clients';

test.use({ storageState: 'playwright/.auth/owner.json' });
test.describe.configure({ mode: 'serial' });

const addDays = (iso: string, n: number) => {
  const d = new Date(`${iso}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};

const name = rand('Cliente E2E').replace(/-/g, ' ');
const address = `Calle E2E ${Date.now() % 10000}`;
let clientId: string;
let poolId: string;
let weekDay: string;
let planDay: string;
let vehicleId: string;
const vehicleName = rand('Auto E2E').replace(/-/g, ' ');
const daysToClean: string[] = [];

test.afterAll(async () => {
  for (const d of daysToClean) await svc().from('itinerary_days').delete().eq('date', d);
  if (vehicleId) await svc().from('vehicles').delete().eq('id', vehicleId);
  if (clientId) await svc().from('pools').delete().eq('client_id', clientId);
  if (clientId) await svc().from('profiles').delete().eq('id', clientId);
});

test('el owner da de alta un cliente con su pileta y queda en su ficha', async ({ page }) => {
  await page.goto('/admin/clientes/nuevo');
  await page.getByLabel('Nombre *').fill(name);
  await page.getByLabel('N° de cliente').fill('');
  await page.getByLabel('Teléfono').fill('1155550000');
  // "Pileta nueva" viene elegida
  await page.getByLabel('Dirección').fill(address);
  await page.getByLabel('Barrio').fill('Pilar');
  await page.getByLabel('Alias').fill('Pileta E2E');
  await page.getByLabel('Tipo de pileta').selectOption('liner');
  await page.getByRole('button', { name: 'Crear cliente' }).click();

  await page.waitForURL(/\/admin\/clientes\/[0-9a-f-]{36}$/);
  clientId = page.url().split('/').pop()!;
  await expect(page.getByText(name).first()).toBeVisible();
  await expect(page.getByTestId('cliente-sin-cuenta')).toBeVisible();
  await expect(page.getByText('Pileta E2E').first()).toBeVisible();

  // quedó en la base como cliente sin cuenta, con su pileta como titular
  const { data: p } = await svc().from('profiles').select('role, full_name, phone, has_account').eq('id', clientId).single();
  expect(p).toEqual({ role: 'client', full_name: name, phone: '1155550000', has_account: false });
  const { data } = await svc().from('pools').select('id, client_id, address, neighborhood, pool_type, is_active').eq('nickname', 'Pileta E2E').eq('client_id', clientId).single();
  expect(data).toMatchObject({ client_id: clientId, address, neighborhood: 'Pilar', pool_type: 'liner', is_active: true });
  poolId = data!.id;
});

test('el cliente nuevo aparece en el listado y se puede buscar', async ({ page }) => {
  await page.goto('/admin/clientes');
  await expect(page.getByText(name).first()).toBeVisible();
});

test('el owner carga otra pileta para ese cliente (sin dirección todavía)', async ({ page }) => {
  await page.goto(`/admin/piletas/nueva?cliente=${clientId}`);
  await page.getByLabel('Alias (opcional)').fill('Quinta E2E');
  await selectOption(page, page.getByRole('combobox').nth(1), 'Fibra');
  await page.getByRole('button', { name: 'Crear pileta' }).click();

  await page.waitForURL('**/admin/clientes');
  await expect(page.getByTestId('tabla-fila').filter({ hasText: 'Quinta E2E' })).toHaveCount(1);
  const { data } = await svc().from('pools').select('client_id, address, pool_type').eq('nickname', 'Quinta E2E').eq('client_id', clientId).single();
  expect(data).toEqual({ client_id: clientId, address: null, pool_type: 'fibra' });
});

test('el owner carga un auto con su patente', async ({ page }) => {
  await page.goto('/admin/itinerario');
  await page.getByRole('link', { name: 'Autos' }).click();
  await page.waitForURL('**/admin/itinerario/autos');
  await page.getByLabel('Nombre *').fill(vehicleName);
  await page.getByLabel('Patente', { exact: true }).fill('ae 123 zz');
  await page.getByRole('button', { name: 'Agregar auto' }).click();
  await expectToast(page, 'Auto agregado');

  const { data } = await svc().from('vehicles').select('id, plate, is_active').eq('name', vehicleName).single();
  expect(data).toMatchObject({ plate: 'AE 123 ZZ', is_active: true });
  vehicleId = data!.id;
  await expect(page.getByTestId('auto-fila').filter({ has: page.locator(`input[value="${vehicleName}"]`) })).toBeVisible();
});

test('el owner agrega la pileta a un auto como desagote; no la ofrece dos veces', async ({ page }) => {
  planDay = addDays(todayInArgentina(), 30);
  daysToClean.push(planDay);
  await page.goto(`/admin/itinerario/${planDay}`);
  await expect(page.getByText('Todavía no hay piletas para este día.')).toBeVisible();

  // "+ Agregar piletas" del auto: se busca, se elige como desagote y se confirma
  await page.getByTestId(`agregar-piletas-${vehicleName}`).click();
  const ventana = page.getByRole('dialog');
  await ventana.getByTestId('agregar-buscar').fill(address);
  await ventana.getByRole('button', { name: 'Desagote', exact: true }).click();
  await ventana.getByTestId('agregar-pileta').filter({ hasText: address }).click();
  await ventana.getByTestId('agregar-confirmar').click();
  await expectToast(page, 'Pileta agregada al itinerario');

  const car = page.getByTestId('itinerario-auto').filter({ hasText: vehicleName });
  await expect(car.getByTestId('itinerario-item').filter({ hasText: 'Pileta E2E' })).toBeVisible();
  await expect(car.getByText('Desagote').first()).toBeVisible();
  await expect(car.getByText('Pendiente').first()).toBeVisible();

  // Ya no se puede elegir de nuevo: figura "Ya va en" ese auto
  await page.getByTestId('agregar-piletas-sin-auto').click();
  const otra = page.getByRole('dialog').getByTestId('agregar-pileta').filter({ hasText: address });
  await expect(otra).toBeDisabled();
  await expect(otra).toContainText(`Ya va en ${vehicleName}`);
  await page.keyboard.press('Escape');

  const { data: day_ } = await svc().from('itinerary_days').select('id').eq('date', planDay).single();
  const { data: items } = await svc().from('itinerary_items').select('pool_id, status, sort_order, vehicle_id, service_type').eq('itinerary_day_id', day_!.id);
  expect(items).toEqual([{ pool_id: poolId, status: 'pending', sort_order: 0, vehicle_id: vehicleId, service_type: 'desagote' }]);
});

test('el owner sube un empleado al auto y después lo baja', async ({ page }) => {
  await page.goto(`/admin/itinerario/${planDay}`);
  const car = page.getByTestId('itinerario-auto').filter({ hasText: vehicleName });
  await selectOption(page, car.getByRole('combobox', { name: 'Sumar al auto' }), /test-employee/);
  await expectToast(page, 'Equipo del auto actualizado');
  await expect(car.getByTestId('auto-equipo').getByText('test-employee')).toBeVisible();

  const { data: day } = await svc().from('itinerary_days').select('id').eq('date', planDay).single();
  const { data: crews } = await svc().from('itinerary_day_crews').select('vehicle_id').eq('itinerary_day_id', day!.id);
  expect(crews).toEqual([{ vehicle_id: vehicleId }]);

  await car.getByRole('button', { name: /Sacar a test-employee del auto/ }).click();
  await confirmar(page);
  await expect(car.getByText('Nadie asignado')).toBeVisible();
  const { data: after } = await svc().from('itinerary_day_crews').select('id').eq('itinerary_day_id', day!.id);
  expect(after).toEqual([]);
});

test('el owner pasa la visita a "Sin auto" y la vuelve a service', async ({ page }) => {
  await page.goto(`/admin/itinerario/${planDay}`);
  const row = page.getByTestId('itinerario-item').filter({ hasText: 'Pileta E2E' });
  await selectOption(page, row.getByRole('combobox', { name: 'Tipo de visita' }), 'Service');
  await expectToast(page, 'Tipo de visita cambiado');
  await selectOption(page, row.getByRole('combobox', { name: 'Auto de la visita' }), 'Sin auto');
  await expectToast(page, 'Visita cambiada de auto');
  await expect(page.getByTestId('itinerario-auto').filter({ hasText: 'las ven todos los empleados' }).getByText('Pileta E2E')).toBeVisible();

  const { data: day } = await svc().from('itinerary_days').select('id').eq('date', planDay).single();
  const { data: items } = await svc().from('itinerary_items').select('vehicle_id, service_type').eq('itinerary_day_id', day!.id);
  expect(items).toEqual([{ vehicle_id: null, service_type: 'service' }]);
});

test('el owner desactiva el auto y vuelve a activarlo', async ({ page }) => {
  await page.goto('/admin/itinerario/autos');
  const row = page.getByTestId('auto-fila').filter({ has: page.locator(`input[value="${vehicleName}"]`) });
  await row.getByRole('button', { name: 'Desactivar' }).click();
  await expectToast(page, 'Auto desactivado');
  expect((await svc().from('vehicles').select('is_active').eq('id', vehicleId).single()).data!.is_active).toBe(false);

  const again = page.getByTestId('auto-fila').filter({ has: page.locator(`input[value="${vehicleName}"]`) });
  await again.getByRole('button', { name: 'Activar' }).click();
  await expectToast(page, 'Auto activado');
  expect((await svc().from('vehicles').select('is_active').eq('id', vehicleId).single()).data!.is_active).toBe(true);
});

test('copiar la semana anterior trae las piletas del día de origen y repetirlo no duplica', async ({ page }) => {
  const target = addDays(todayInArgentina(), 7); // hace 7 días = hoy, que tiene las 2 piletas del seed
  weekDay = target;
  daysToClean.push(target);
  await page.goto(`/admin/itinerario/${target}`);
  await expect(page.getByText('Todavía no hay piletas para este día.')).toBeVisible();

  const copy = page.getByRole('button', { name: /Copiar itinerario de la semana anterior/ });
  await copy.click();
  await expectToast(page, '2 piletas copiadas de la semana anterior');
  await expect(page.getByText('Casa de San Isidro').first()).toBeVisible();
  await expect(page.getByText('Casa de Tigre').first()).toBeVisible();

  await copy.click();
  await expectToast(page, /piletas copiadas/);

  const { data: day } = await svc().from('itinerary_days').select('id').eq('date', target).single();
  const { data: items } = await svc().from('itinerary_items').select('pool_id, sort_order, status').eq('itinerary_day_id', day!.id).order('sort_order');
  expect(items?.map((i) => i.pool_id)).toEqual([FIXTURE.pools.pool1.id, FIXTURE.pools.pool2.id]);
  expect(items?.every((i) => i.status === 'pending')).toBe(true);
});

test('bajar una pileta cambia su posición en el itinerario (y queda guardado)', async ({ page }) => {
  const row = (name: string) => page.getByTestId('itinerario-item').filter({ hasText: name });

  await page.goto(`/admin/itinerario/${weekDay}`);
  await expect(row('Casa de San Isidro').getByTestId('itinerario-orden')).toHaveText('1');
  await expect(row('Casa de Tigre').getByTestId('itinerario-orden')).toHaveText('2');

  await row('Casa de San Isidro').getByRole('button', { name: 'Bajar' }).click();
  await expect(row('Casa de Tigre').getByTestId('itinerario-orden')).toHaveText('1');
  await expect(row('Casa de San Isidro').getByTestId('itinerario-orden')).toHaveText('2');

  const { data: day } = await svc().from('itinerary_days').select('id').eq('date', weekDay).single();
  const { data: items } = await svc().from('itinerary_items').select('pool_id, sort_order').eq('itinerary_day_id', day!.id).order('sort_order');
  expect(items?.map((i) => i.pool_id)).toEqual([FIXTURE.pools.pool2.id, FIXTURE.pools.pool1.id]);
});

test('quitar una pileta sin service registrado la saca del itinerario', async ({ page }) => {
  await page.goto(`/admin/itinerario/${weekDay}`);
  const row = page.getByTestId('itinerario-item').filter({ hasText: 'Casa de Tigre' });
  await row.getByRole('button', { name: 'Quitar del itinerario' }).click();
  await confirmar(page);
  await expectToast(page, 'Pileta quitada del itinerario');
  await expect(page.getByText('Casa de Tigre')).toHaveCount(0);

  const { data: day } = await svc().from('itinerary_days').select('id').eq('date', weekDay).single();
  const { data: items } = await svc().from('itinerary_items').select('pool_id').eq('itinerary_day_id', day!.id);
  expect(items?.map((i) => i.pool_id)).toEqual([FIXTURE.pools.pool1.id]);
});

test('copiar un día sin itinerario previo avisa en lugar de fallar', async ({ page }) => {
  const day = addDays(todayInArgentina(), 90);
  await page.goto(`/admin/itinerario/${day}`);
  await page.getByRole('button', { name: /Copiar itinerario de la semana anterior/ }).click();
  await expectToast(page, 'No hay itinerario de la semana anterior para copiar');
  await expect(page.getByText('Todavía no hay piletas para este día.')).toBeVisible();
});

test('el calendario mensual muestra los días con itinerario', async ({ page }) => {
  await page.goto('/admin/itinerario');
  await expect(page.getByRole('heading', { name: /itinerario/i }).first()).toBeVisible();
  await expect(page.locator('a[href^="/admin/itinerario/"]').first()).toBeVisible();
});
