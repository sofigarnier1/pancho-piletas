/**
 * Usabilidad del dueño (2026-11-07): el Dashboard del día (registrar un service desde la ventana y agendar una
 * pileta para otro día), Services y Desagotes con las notas del mes, el estado de cada día en el calendario, el
 * encargado de una visita y el "Nuevo auto" de arriba de la pantalla del día.
 */
import { expect, test } from '../support/pw';
import { addDays, todayInArgentina } from '../../src/lib/dates';
import { expectToast, selectOption } from '../support/ui';
import { rand, svc, userIds } from '../../tests/support/clients';

test.use({ storageState: 'playwright/.auth/owner.json' });
test.describe.configure({ mode: 'serial' });

const hoy = todayInArgentina();
const diaAgenda = addDays(hoy, 45);
const diaEncargado = addDays(hoy, 46);
const address = `Calle Tablero ${Date.now() % 100000}`;
const autoNuevo = rand('Auto Arriba').replace(/-/g, ' ');
const created = { pool: '', days: [] as string[], items: [] as string[] };
let ids: Awaited<ReturnType<typeof userIds>>;
let itemHoy: string;

/** Una visita a la pileta temporal en esa fecha (crea el día si no existe). */
async function nuevaVisita(fecha: string) {
  let { data: day } = await svc().from('itinerary_days').select('id').eq('date', fecha).maybeSingle();
  if (!day) {
    day = (await svc().from('itinerary_days').insert({ date: fecha }).select('id').single()).data;
    created.days.push(fecha);
  }
  const { data: item } = await svc().from('itinerary_items').insert({ itinerary_day_id: day!.id, pool_id: created.pool, sort_order: 60 }).select('id').single();
  created.items.push(item!.id as string);
  return item!.id as string;
}

test.beforeAll(async () => {
  ids = await userIds();
  const { data: pool } = await svc().from('pools').insert({ client_id: ids.client2, address, nickname: 'Pileta Tablero E2E' }).select('id').single();
  created.pool = pool!.id as string;
  itemHoy = await nuevaVisita(hoy);
});

test.afterAll(async () => {
  const { data: todas } = await svc().from('itinerary_items').select('id').eq('pool_id', created.pool);
  const itemIds = (todas ?? []).map((i) => i.id as string);
  if (itemIds.length) {
    await svc().from('service_logs').delete().in('itinerary_item_id', itemIds);
    await svc().from('itinerary_items').delete().in('id', itemIds);
  }
  for (const d of created.days) await svc().from('itinerary_days').delete().eq('date', d);
  await svc().from('pool_month_notes').delete().eq('pool_id', created.pool);
  await svc().from('pools').delete().eq('id', created.pool);
  await svc().from('vehicles').delete().eq('name', autoNuevo);
});

test('Dashboard: "Registrar service" abre la ventana, se elige la visita de hoy y queda hecha', async ({ page }) => {
  await page.goto('/admin/dashboard');
  await page.getByTestId('registrar-service').click();
  const ventana = page.getByTestId('ventana-visita');
  // El buscador filtra la lista (sin importar mayúsculas): primero algo que no existe, después la dirección
  const buscar = ventana.getByTestId('elegir-visita-buscar');
  await buscar.fill('zzz no existe zzz');
  await expect(ventana.getByTestId('elegir-visita-fila')).toHaveCount(0);
  await expect(ventana.getByText('Ninguna visita de hoy coincide con la búsqueda.')).toBeVisible();
  await buscar.fill(address.toUpperCase());
  await expect(ventana.getByTestId('elegir-visita-fila')).toHaveCount(1);
  await ventana.getByTestId('elegir-visita-fila').filter({ hasText: address }).click();
  await ventana.getByRole('button', { name: 'Registrar el service' }).click();
  await selectOption(page, ventana.getByRole('combobox', { name: 'Cloro aplicado' }), 'Líquido');
  await ventana.getByLabel('Litros').fill('3');
  await ventana.getByRole('button', { name: 'Confirmar' }).click();
  await expectToast(page, 'Service registrado');
  await expect(ventana).toHaveCount(0);

  await expect.poll(async () => (await svc().from('itinerary_items').select('status').eq('id', itemHoy).single()).data!.status).toBe('done');
  const { data: logs } = await svc().from('service_logs').select('chlorine_type, chlorine_amount').eq('itinerary_item_id', itemHoy);
  expect(logs).toEqual([{ chlorine_type: 'liquido', chlorine_amount: 3 }]);

  // La tabla de hoy lo muestra como hecho
  const fila = page.getByTestId('tabla-hoy').getByTestId('tabla-fila').filter({ hasText: address });
  await expect(fila).toContainText('Hecho');
});

test('Dashboard: "Agendar pileta" la deja en otro día, sin auto', async ({ page }) => {
  await page.goto('/admin/dashboard');
  await page.getByTestId('agendar-pileta').click();
  const ventana = page.getByRole('dialog');
  await ventana.getByTestId('agendar-dia').fill(diaAgenda);
  await ventana.getByTestId('agendar-auto').selectOption({ label: 'Sin auto' });
  await ventana.getByTestId('agregar-buscar').fill(address);
  await ventana.getByTestId('agregar-pileta').filter({ hasText: address }).click();
  await ventana.getByTestId('agregar-confirmar').click();
  await expectToast(page, 'Pileta agregada al itinerario');
  created.days.push(diaAgenda);

  const { data: day } = await svc().from('itinerary_days').select('id').eq('date', diaAgenda).single();
  const { data: items } = await svc().from('itinerary_items').select('pool_id, vehicle_id, service_type, status').eq('itinerary_day_id', day!.id).eq('pool_id', created.pool);
  expect(items).toEqual([{ pool_id: created.pool, vehicle_id: null, service_type: 'service', status: 'pending' }]);
});

test('el calendario marca cada día según su estado', async ({ page }) => {
  await page.goto(`/admin/itinerario?y=${Number(diaAgenda.slice(0, 4))}&m=${Number(diaAgenda.slice(5, 7))}`);
  await expect(page.getByTestId('calendario-dia').and(page.locator(`[data-fecha="${diaAgenda}"]`))).toHaveAttribute('data-estado', 'programado');
  await expect(page.getByTestId('calendario-dia').and(page.locator(`[data-fecha="${addDays(diaAgenda, 1)}"]`))).toHaveAttribute('data-estado', /sin-programar|programado/);
});

test('el encargado de una visita: "Le toca a" en el día y la base lo guarda', async ({ page }) => {
  const item = await nuevaVisita(diaEncargado);
  await page.goto(`/admin/itinerario/${diaEncargado}`);
  const fila = page.getByTestId('itinerario-item').filter({ hasText: 'Pileta Tablero E2E' });
  await selectOption(page, fila.getByTestId('item-encargado'), /test-employee/);
  await expectToast(page, 'Encargado de la visita actualizado');
  await expect(fila.getByTestId('itinerario-encargado')).toContainText('Le toca a test-employee');
  expect((await svc().from('itinerary_items').select('assigned_employee_id').eq('id', item).single()).data!.assigned_employee_id).toBe(ids.employee);

  await selectOption(page, fila.getByTestId('item-encargado'), 'Cualquiera del auto');
  await expectToast(page, 'Encargado de la visita actualizado');
  await expect(fila.getByTestId('itinerario-encargado')).toHaveCount(0);
});

test('"Nuevo auto" de arriba lo carga en una ventana y aparece como tarjeta del día', async ({ page }) => {
  await page.goto(`/admin/itinerario/${diaEncargado}`);
  await page.getByTestId('nuevo-auto-arriba').click();
  const form = page.getByTestId('nuevo-auto-ventana');
  await form.getByLabel('Nombre del auto').fill(autoNuevo);
  await form.getByRole('button', { name: 'Agregar auto' }).click();
  await expectToast(page, 'Auto agregado');
  await expect(page.getByTestId('itinerario-auto').filter({ hasText: autoNuevo })).toBeVisible();
  expect((await svc().from('vehicles').select('is_active').eq('name', autoNuevo).single()).data!.is_active).toBe(true);
});

test('Services: la nota del mes se escribe en la ventana, se ve en la planilla y se borra dejándola vacía', async ({ page }) => {
  const mes = `${hoy.slice(0, 7)}-01`;
  const filaDe = () => page.getByTestId('tabla-control').getByTestId('tabla-fila').filter({ hasText: address });
  await page.goto('/admin/services');
  await expect(page.getByTestId('services-pestana-services')).toHaveAttribute('aria-current', 'page');
  await page.getByTestId('tabla-control-buscar').fill(address);
  await expect(filaDe().getByTestId('control-fuimos')).toHaveText('1');

  await filaDe().click();
  const nota = page.getByTestId('nota-mes');
  await nota.getByRole('textbox').fill('Cobrar el mes y cambiar el filtro');
  await nota.getByTestId('nota-guardar').click();
  await expectToast(page, 'Nota guardada');
  await page.keyboard.press('Escape');
  await expect(filaDe().getByTestId('control-nota')).toHaveText('Cobrar el mes y cambiar el filtro');
  const { data: guardada } = await svc().from('pool_month_notes').select('notes, month, updated_by').eq('pool_id', created.pool).single();
  expect(guardada).toEqual({ notes: 'Cobrar el mes y cambiar el filtro', month: mes, updated_by: ids.owner });

  // El filtro "Con notas" la muestra
  await page.getByRole('button', { name: 'Con notas', exact: true }).click();
  await expect(filaDe()).toHaveCount(1);

  // Desagotes: esta pileta no tuvo desagotes en el mes, no aparece
  await page.getByTestId('services-pestana-desagotes').click();
  await page.waitForURL(/tipo=desagote/);
  await expect(page.getByTestId('tabla-control-desagotes').getByTestId('tabla-fila').filter({ hasText: address })).toHaveCount(0);

  // Vacía, la nota se borra
  await page.getByTestId('services-pestana-services').click();
  await page.waitForURL((u) => !u.search.includes('tipo='));
  await page.getByTestId('tabla-control-buscar').fill(address);
  await filaDe().click();
  await page.getByTestId('nota-mes').getByRole('textbox').fill('');
  await page.getByTestId('nota-guardar').click();
  await expectToast(page, 'Nota borrada');
  await expect.poll(async () => (await svc().from('pool_month_notes').select('id').eq('pool_id', created.pool)).data).toEqual([]);
});
