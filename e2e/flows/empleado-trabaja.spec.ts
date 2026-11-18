/**
 * Flujo del empleado desde el celular (pantalla nueva del 2026-11-07): ve la ruta de su auto con la tarjeta del día,
 * marca desde la lista con Hecha (cloro en botones, − / + y valores rápidos) o No se pudo (motivo y nota), abre la
 * ruta completa en Maps y usa el menú de abajo (solo Hoy y Ayuda: sin calendario ni historial; ve hoy y 7 días atrás). En la pantalla de la pileta suma,
 * corrige y borra registros, y la vuelve a pendiente. Verifica el registro en la base y lo que se ve después.
 */
import { expect, test } from '../support/pw';
import { FIXTURE } from '../support/seed';
import { expectToast } from '../support/ui';
import { rand, svc, userIds } from '../../tests/support/clients';
import { addDays, todayInArgentina } from '../../src/lib/dates';

test.use({ storageState: 'playwright/.auth/employee.json', viewport: { width: 390, height: 844 } });

const TODAY = todayInArgentina();
const todayId = async () => (await svc().from('itinerary_days').select('id').eq('date', TODAY).single()).data!.id as string;
const itemOf = async (poolId: string) =>
  (await svc().from('itinerary_items').select('id, status, completed_by').eq('pool_id', poolId).eq('itinerary_day_id', await todayId()).single()).data!;
const logsOf = async (itemId: string) =>
  (await svc().from('service_logs').select('*').eq('itinerary_item_id', itemId).order('created_at')).data ?? [];

// Lo que cada test crea de más (días, visitas, autos) y se borra al final
const created = { days: [] as string[], items: [] as string[], vehicles: [] as string[] };
async function visitOn(date: string, extra: Record<string, unknown> = {}) {
  const { data: existing } = await svc().from('itinerary_days').select('id').eq('date', date).maybeSingle();
  let dayId = existing?.id as string | undefined;
  if (!dayId) {
    dayId = (await svc().from('itinerary_days').insert({ date }).select('id').single()).data!.id as string;
    created.days.push(dayId);
  }
  const id = (await svc().from('itinerary_items').insert({ itinerary_day_id: dayId, pool_id: FIXTURE.pools.pool2.id, sort_order: 9, ...extra }).select('id').single()).data!.id as string;
  created.items.push(id);
  return { dayId, itemId: id };
}

test.afterEach(async () => {
  const s = svc();
  const items = created.items.splice(0);
  await s.from('service_logs').delete().like('notes', 'e2e-%');
  if (items.length) {
    await s.from('service_logs').delete().in('itinerary_item_id', items);
    await s.from('itinerary_items').delete().in('id', items);
  }
  const pools = [FIXTURE.pools.pool1.id, FIXTURE.pools.pool2.id];
  const day = await todayId();
  const { data: todayItems } = await s.from('itinerary_items').select('id').eq('itinerary_day_id', day).in('pool_id', pools);
  await s.from('service_logs').delete().in('itinerary_item_id', (todayItems ?? []).map((i) => i.id));
  await s.from('itinerary_items').update({ status: 'pending', status_note: null, completed_by: null, completed_at: null, assigned_employee_id: null, vehicle_id: null, service_type: 'service' }).in('pool_id', pools);
  const vehicles = created.vehicles.splice(0);
  if (vehicles.length) {
    await s.from('itinerary_day_crews').delete().in('vehicle_id', vehicles);
    await s.from('vehicles').delete().in('id', vehicles);
  }
  for (const id of created.days.splice(0)) await s.from('itinerary_days').delete().eq('id', id);
});

test.describe('la ruta del día', () => {
  test('muestra las piletas de hoy con su cliente, el tipo de visita y los botones Hecha y No se pudo en cada una', async ({ page }) => {
    await page.goto('/employee/itinerario');
    await expect(page.getByText('Casa de San Isidro')).toBeVisible();
    await expect(page.getByText('Casa de Tigre')).toBeVisible();
    await expect(page.getByText(/test-client · San Isidro/)).toBeVisible();
    await expect(page.getByTestId('ruta').getByText('Service', { exact: true })).toHaveCount(2);
    await expect(page.getByTestId('ruta').getByRole('button', { name: 'Hecha', exact: true })).toHaveCount(2);
    await expect(page.getByTestId('ruta').getByRole('button', { name: 'No se pudo' })).toHaveCount(2);
    await expect(page.getByRole('link', { name: 'Cómo llegar' }).first()).toHaveAttribute('href', /google\.com\/maps\/dir/);
    await expect(page.getByTestId('avance')).toContainText('0 de 2');
    await expect(page.getByTestId('bloque-equipo')).toContainText('Piletas del día');
    await expect(page.getByTestId('bloque-mias')).toHaveCount(0);
  });

  test('con auto asignado: dice en qué auto va y con quién, y solo ve las visitas de su auto', async ({ page }) => {
    const ids = await userIds();
    const day = await todayId();
    const [carA, carB] = await Promise.all([rand('Auto Blanco'), rand('Auto Rojo')].map(async (name) =>
      (await svc().from('vehicles').insert({ name }).select('id, name').single()).data!));
    created.vehicles.push(carA.id, carB.id);
    await svc().from('itinerary_day_crews').insert([
      { itinerary_day_id: day, vehicle_id: carA.id, employee_id: ids.employee },
      { itinerary_day_id: day, vehicle_id: carA.id, employee_id: ids.owner },
    ]);
    await svc().from('itinerary_items').update({ vehicle_id: carA.id, service_type: 'desagote' }).eq('pool_id', FIXTURE.pools.pool1.id).eq('itinerary_day_id', day);
    await svc().from('itinerary_items').update({ vehicle_id: carB.id }).eq('pool_id', FIXTURE.pools.pool2.id).eq('itinerary_day_id', day);

    await page.goto('/employee/itinerario');
    await expect(page.getByTestId('mi-auto')).toContainText(carA.name);
    await expect(page.getByTestId('mi-auto')).toContainText('test-owner');
    await expect(page.getByText('Casa de San Isidro')).toBeVisible();
    await expect(page.getByText('Casa de Tigre')).toHaveCount(0);
    await expect(page.getByTestId('ruta').getByText('Desagote', { exact: true })).toBeVisible();
  });

  test('no ve los días que vienen: desde hoy no hay "Día siguiente" y pedir mañana muestra hoy', async ({ page }) => {
    const tomorrow = addDays(TODAY, 1);
    const { itemId } = await visitOn(tomorrow, { sort_order: 99 });
    await svc().from('itinerary_items').update({ status: 'done' }).eq('itinerary_day_id', await todayId());
    await page.goto('/employee/itinerario');
    await expect(page.getByTestId('dia-siguiente')).toHaveCount(0);
    await page.goto(`/employee/itinerario?fecha=${tomorrow}`);
    // Volvió a hoy: sin "Día siguiente" ni "Volver a hoy"
    await expect(page.getByTestId('dia-anterior')).toBeVisible();
    await expect(page.getByTestId('dia-siguiente')).toHaveCount(0);
    await expect(page.getByRole('link', { name: 'Volver a hoy' })).toHaveCount(0);
    await expect(page.getByTestId('ruta').getByRole('button', { name: 'Hecha', exact: true })).toHaveCount(0);

    // Abrir la visita de mañana por su dirección tampoco deja marcarla
    await page.goto(`/employee/piletas/${itemId}`);
    await expect(page.getByText(/la vas a poder marcar ese día/)).toBeVisible();
    await expect(page.getByRole('button', { name: 'Hecha', exact: true })).toHaveCount(0);
  });

  test('puede volver a un día anterior y marcar una visita que le quedó pendiente', async ({ page }) => {
    const yesterday = addDays(TODAY, -1);
    const { itemId } = await visitOn(yesterday);
    await page.goto('/employee/itinerario');
    await page.getByTestId('dia-anterior').click();
    await page.waitForURL(`**/employee/itinerario?fecha=${yesterday}`);
    await expect(page.getByText('Ayer')).toBeVisible();
    await page.getByTestId('ruta').getByRole('button', { name: 'Hecha', exact: true }).click();
    await page.getByPlaceholder(/Agua muy verde/).fill('e2e-de ayer');
    await page.getByRole('button', { name: 'Guardar', exact: true }).click();
    await expectToast(page, '¡Pileta marcada como hecha!');
    const [log] = await logsOf(itemId);
    expect(log).toMatchObject({ date: yesterday, notes: 'e2e-de ayer' });
  });

  test('puede ir hasta 7 días atrás, no más', async ({ page }) => {
    await page.goto(`/employee/itinerario?fecha=${addDays(TODAY, -7)}`);
    await expect(page.getByText('Hace 7 días')).toBeVisible();
    await expect(page.getByTestId('dia-anterior')).toHaveCount(0);
    await expect(page.getByTestId('dia-siguiente')).toBeVisible();
    await page.goto(`/employee/itinerario?fecha=${addDays(TODAY, -8)}`);
    await expect(page.getByTestId('dia-siguiente')).toHaveCount(0);
    await expect(page.getByRole('link', { name: 'Volver a hoy' })).toHaveCount(0);
  });

  test('la pantalla de una pileta muestra dirección, cliente y cómo llegar', async ({ page }) => {
    await page.goto('/employee/itinerario');
    await page.getByTestId('visita-abrir').first().click();
    await page.waitForURL(/\/employee\/piletas\//);
    await expect(page.getByRole('heading', { name: 'Casa de San Isidro' })).toBeVisible();
    await expect(page.getByText('Av. Libertador 1234').first()).toBeVisible();
    await expect(page.getByText('test-client')).toBeVisible();
    await expect(page.getByRole('link', { name: 'Cómo llegar' })).toHaveAttribute('href', /Libertador/);
    await page.getByRole('link', { name: 'Volver al itinerario' }).click();
    await page.waitForURL('**/employee/itinerario');
  });
});

test.describe('registrar el service', () => {
  test('con cloro granulado en gramos: guarda el registro y cierra la pileta', async ({ page }) => {
    await page.goto('/employee/itinerario');
    await page.getByTestId('ruta').getByRole('button', { name: 'Hecha', exact: true }).first().click();
    await expect(page.getByTestId('hoja-hecha')).toBeVisible();
    await page.getByRole('radio', { name: 'Granulado' }).click();
    await page.getByLabel('Gramos').fill('300');
    await page.getByPlaceholder(/Agua muy verde/).fill('e2e-agua cristalina');
    await page.getByRole('button', { name: 'Guardar', exact: true }).click();

    await expectToast(page, '¡Pileta marcada como hecha!');
    await expect(page.getByTestId('hoja-hecha')).toHaveCount(0);
    const card = page.getByTestId('visita').filter({ hasText: 'Casa de San Isidro' });
    await expect(card.getByTestId('visita-cloro')).toHaveText('Granulado · 300 g');
    await expect(page.getByTestId('ruta').getByRole('button', { name: 'Hecha', exact: true })).toHaveCount(1); // queda la otra
    await expect(page.getByTestId('avance')).toContainText('1 de 2');

    const item = await itemOf(FIXTURE.pools.pool1.id);
    const ids = await userIds();
    expect(item).toMatchObject({ status: 'done', completed_by: ids.employee });
    const [log] = await logsOf(item.id);
    expect(log).toMatchObject({
      employee_id: ids.employee, pool_id: FIXTURE.pools.pool1.id, client_id: ids.client, date: TODAY,
      chlorine_applied: true, chlorine_type: 'granulado', chlorine_amount: 300, chlorine_unit: 'g',
      service_type: 'service', notes: 'e2e-agua cristalina',
    });
  });

  test('pastillas sin cantidad (se puede no saber) y sin cloro también se puede cerrar', async ({ page }) => {
    const item2 = await itemOf(FIXTURE.pools.pool2.id);
    await page.goto(`/employee/piletas/${item2.id}`);
    await page.getByRole('button', { name: 'Hecha', exact: true }).click();
    await page.getByRole('radio', { name: 'Pastillas' }).click();
    await page.getByPlaceholder(/Agua muy verde/).fill('e2e-sin cantidad');
    await page.getByRole('button', { name: 'Guardar', exact: true }).click();
    await expectToast(page, '¡Pileta marcada como hecha!');
    expect((await logsOf(item2.id))[0]).toMatchObject({ chlorine_applied: true, chlorine_type: 'pastilla', chlorine_amount: null });

    const item1 = await itemOf(FIXTURE.pools.pool1.id);
    await page.goto(`/employee/piletas/${item1.id}`);
    await page.getByRole('button', { name: 'Hecha', exact: true }).click();
    await page.getByRole('button', { name: 'Guardar', exact: true }).click();
    await expectToast(page, '¡Pileta marcada como hecha!');
    expect((await logsOf(item1.id))[0]).toMatchObject({ chlorine_applied: false, chlorine_type: null });
  });

  test('pastillas de a media; una cantidad que no corresponde a la unidad se rechaza', async ({ page }) => {
    const item = await itemOf(FIXTURE.pools.pool1.id);
    await page.goto(`/employee/piletas/${item.id}`);
    await page.getByRole('button', { name: 'Hecha', exact: true }).click();
    await page.getByRole('radio', { name: 'Pastillas' }).click();
    await page.getByLabel('Cantidad de pastillas').fill('1.3');
    await page.getByRole('button', { name: 'Guardar', exact: true }).click();
    await expectToast(page, 'Cantidad de cloro inválida');
    expect((await itemOf(FIXTURE.pools.pool1.id)).status).toBe('pending');

    await page.getByLabel('Cantidad de pastillas').fill('1.5');
    await page.getByRole('button', { name: 'Guardar', exact: true }).click();
    await expectToast(page, '¡Pileta marcada como hecha!');
    expect((await logsOf(item.id))[0]).toMatchObject({ chlorine_type: 'pastilla', chlorine_amount: 1.5, chlorine_unit: 'u' });
  });

  test('REGRESIÓN: tocar Confirmar dos veces seguidas guarda un solo registro', async ({ page }) => {
    const item = await itemOf(FIXTURE.pools.pool1.id);
    await page.goto(`/employee/piletas/${item.id}`);
    await page.getByRole('button', { name: 'Hecha', exact: true }).click();
    await page.getByPlaceholder(/Agua muy verde/).fill('e2e-doble toque');
    await page.getByRole('button', { name: 'Guardar', exact: true }).dblclick();
    await expectToast(page, '¡Pileta marcada como hecha!');
    await page.waitForURL('**/employee/itinerario');
    expect(await logsOf(item.id)).toHaveLength(1);
  });

  test('"Cancelar" cierra la ventana sin guardar nada', async ({ page }) => {
    await page.goto(`/employee/piletas/${(await itemOf(FIXTURE.pools.pool1.id)).id}`);
    await page.getByRole('button', { name: 'Hecha', exact: true }).click();
    await page.getByRole('button', { name: 'Cancelar' }).click();
    await expect(page.getByTestId('hoja-hecha')).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'No se pudo' })).toBeVisible();
    expect((await itemOf(FIXTURE.pools.pool1.id)).status).toBe('pending');
  });
});

test.describe('varios registros, corregir y borrar', () => {
  test('en una visita hecha se puede agregar otro registro; se ven los dos con su autor', async ({ page }) => {
    const ids = await userIds();
    const item = await itemOf(FIXTURE.pools.pool1.id);
    await svc().from('service_logs').insert({ itinerary_item_id: item.id, employee_id: ids.owner, pool_id: FIXTURE.pools.pool1.id, client_id: ids.client, notes: 'e2e-del dueño' });

    await page.goto(`/employee/piletas/${item.id}`);
    await expect(page.getByText('Hecha', { exact: true }).first()).toBeVisible();
    await expect(page.getByRole('button', { name: 'Hecha', exact: true })).toHaveCount(0);
    // El registro de otro se ve con su nombre y sin botones para cambiarlo
    await expect(page.getByTestId('registro').filter({ hasText: 'e2e-del dueño' })).toContainText('test-owner');
    await expect(page.getByTestId('registro').filter({ hasText: 'e2e-del dueño' }).getByTitle('Editar registro')).toHaveCount(0);

    await page.getByRole('button', { name: 'Agregar otro registro' }).click();
    await page.getByRole('radio', { name: 'Líquido' }).click();
    await page.getByLabel('Litros').fill('2.5');
    await page.getByPlaceholder(/Agua muy verde/).fill('e2e-segundo');
    await page.getByRole('button', { name: 'Guardar', exact: true }).click();
    await expectToast(page, 'Registro agregado');
    await expect(page.getByTestId('registro')).toHaveCount(2);
    await expect(page.getByTestId('registro').filter({ hasText: 'e2e-segundo' })).toContainText('Líquido · 2,5 L');
    expect((await itemOf(FIXTURE.pools.pool1.id)).completed_by).toBe(ids.owner);
  });

  test('corrige un registro propio y queda marcado como corregido', async ({ page }) => {
    const item = await itemOf(FIXTURE.pools.pool2.id);
    await page.goto(`/employee/piletas/${item.id}`);
    await page.getByRole('button', { name: 'Hecha', exact: true }).click();
    await page.getByPlaceholder(/Agua muy verde/).fill('e2e-original');
    await page.getByRole('button', { name: 'Guardar', exact: true }).click();
    await expectToast(page, '¡Pileta marcada como hecha!');
    await page.waitForTimeout(1200); // "(corregido)" aparece si la edición es más de 1 segundo posterior a la carga

    await page.goto(`/employee/piletas/${item.id}`);
    await page.getByTitle('Editar registro').click();
    await page.getByRole('radio', { name: 'Granulado' }).click();
    await page.getByLabel('Gramos').fill('500');
    await page.getByPlaceholder(/Agua muy verde/).fill('e2e-corregido');
    await page.getByRole('button', { name: 'Guardar cambios' }).click();
    await expectToast(page, 'Registro actualizado');
    await expect(page.getByTestId('registro')).toContainText('(corregido)');
    expect((await logsOf(item.id))[0]).toMatchObject({ chlorine_type: 'granulado', chlorine_amount: 500, notes: 'e2e-corregido' });
  });

  test('borrar el único registro vuelve la pileta a pendiente', async ({ page }) => {
    const item = await itemOf(FIXTURE.pools.pool2.id);
    await page.goto(`/employee/piletas/${item.id}`);
    await page.getByRole('button', { name: 'Hecha', exact: true }).click();
    await page.getByPlaceholder(/Agua muy verde/).fill('e2e-a borrar');
    await page.getByRole('button', { name: 'Guardar', exact: true }).click();
    await expectToast(page, '¡Pileta marcada como hecha!');

    await page.goto(`/employee/piletas/${item.id}`);
    await page.getByTitle('Borrar registro').click();
    await page.getByRole('button', { name: 'Sí, borrar' }).click();
    await expectToast(page, 'Registro borrado');
    await expect(page.getByRole('button', { name: 'Hecha', exact: true })).toBeVisible();
    expect(await logsOf(item.id)).toEqual([]);
    expect((await itemOf(FIXTURE.pools.pool2.id)).status).toBe('pending');
  });
});

test.describe('salteada y sin cliente', () => {
  test('"Saltear por hoy" la deja como salteada, y se puede volver a pendiente', async ({ page }) => {
    const item = await itemOf(FIXTURE.pools.pool1.id);
    await page.goto(`/employee/piletas/${item.id}`);
    await page.getByRole('button', { name: 'No se pudo' }).click();
    await page.getByRole('radio', { name: /Saltear por hoy/ }).click();
    await page.getByRole('button', { name: 'Guardar', exact: true }).click();
    await expectToast(page, 'Pileta salteada');
    await page.waitForURL('**/employee/itinerario');
    await expect(page.getByTestId('ruta').getByText('Salteada', { exact: true })).toBeVisible();
    expect((await itemOf(FIXTURE.pools.pool1.id)).status).toBe('skipped');
    expect(await logsOf(item.id)).toEqual([]);

    await page.goto(`/employee/piletas/${item.id}`);
    await page.getByRole('button', { name: 'Volver a pendiente' }).click();
    await expectToast(page, 'La pileta volvió a pendiente');
    await expect(page.getByRole('button', { name: 'Hecha', exact: true })).toBeVisible();
    expect((await itemOf(FIXTURE.pools.pool1.id)).status).toBe('pending');
  });

  test('"No estaba el cliente" la deja así; si al final se hizo, se registra igual', async ({ page }) => {
    const item = await itemOf(FIXTURE.pools.pool2.id);
    await page.goto(`/employee/piletas/${item.id}`);
    await page.getByRole('button', { name: 'No se pudo' }).click();
    await page.getByRole('radio', { name: /No estaba el cliente/ }).click();
    await page.getByRole('button', { name: 'Guardar', exact: true }).click();
    await expectToast(page, 'Registrado: no estaba el cliente');
    await page.waitForURL('**/employee/itinerario');
    await expect(page.getByText('No estaba', { exact: true })).toBeVisible();
    expect((await itemOf(FIXTURE.pools.pool2.id)).status).toBe('no_client');

    await page.goto(`/employee/piletas/${item.id}`);
    await page.getByRole('button', { name: /Al final se hizo/ }).click();
    await page.getByPlaceholder(/Agua muy verde/).fill('e2e-volvió el cliente');
    await page.getByRole('button', { name: 'Guardar', exact: true }).click();
    await expectToast(page, '¡Pileta marcada como hecha!');
    expect((await itemOf(FIXTURE.pools.pool2.id)).status).toBe('done');
  });
});

test.describe('jornada', () => {
  test('al terminar todas aparece "¡Jornada completa!"', async ({ page }) => {
    await svc().from('itinerary_items').update({ status: 'done' }).in('pool_id', [FIXTURE.pools.pool1.id, FIXTURE.pools.pool2.id]);
    await page.goto('/employee/itinerario');
    await expect(page.getByText('¡Jornada completa!')).toBeVisible();
    await expect(page.getByTestId('ruta').getByRole('button', { name: 'Hecha', exact: true })).toHaveCount(0);
  });

});

test.describe('pantalla nueva: marcar desde la lista', () => {
  test('"No se pudo" desde la lista con motivo y nota: la tarjeta muestra la nota y el dueño la ve en la visita', async ({ page, browser }) => {
    await page.goto('/employee/itinerario');
    const card = page.getByTestId('visita').filter({ hasText: 'Casa de Tigre' });
    await card.getByRole('button', { name: 'No se pudo' }).click();
    const hoja = page.getByTestId('hoja-no-se-pudo');
    await expect(hoja.getByRole('button', { name: 'Guardar', exact: true })).toBeDisabled();
    await hoja.getByRole('radio', { name: /No estaba el cliente/ }).click();
    await hoja.getByLabel('Nota para el dueño (opcional)').fill('Portón cerrado, toqué timbre');
    await hoja.getByRole('button', { name: 'Guardar', exact: true }).click();
    await expectToast(page, 'Registrado: no estaba el cliente');
    await expect(card.getByTestId('visita-motivo')).toHaveText('“Portón cerrado, toqué timbre”');
    await expect(card.getByRole('button', { name: 'Hecha', exact: true })).toHaveCount(0);
    const item = await svc().from('itinerary_items').select('id, status, status_note').eq('pool_id', FIXTURE.pools.pool2.id).eq('itinerary_day_id', await todayId()).single();
    expect(item.data).toMatchObject({ status: 'no_client', status_note: 'Portón cerrado, toqué timbre' });

    const owner = await browser.newContext({ storageState: 'playwright/.auth/owner.json' });
    const op = await owner.newPage();
    await op.goto(`/admin/itinerario/visita/${item.data!.id}`);
    await expect(op.getByTestId('visita-motivo')).toContainText('Portón cerrado, toqué timbre');
    await owner.close();
  });

  test('Hecha con valores rápidos y − / +: guarda la cantidad elegida; cambiar de tipo borra la cantidad', async ({ page }) => {
    await page.goto('/employee/itinerario');
    const card = page.getByTestId('visita').filter({ hasText: 'Casa de San Isidro' });
    await card.getByRole('button', { name: 'Hecha', exact: true }).click();
    const hoja = page.getByTestId('hoja-hecha');
    await expect(hoja.getByRole('radio', { name: 'Sin cloro' })).toHaveAttribute('aria-checked', 'true');
    await hoja.getByRole('radio', { name: 'Granulado' }).click();
    await hoja.getByRole('button', { name: '300 g' }).click();
    await expect(hoja.getByLabel('Gramos')).toHaveValue('300');
    await hoja.getByRole('radio', { name: 'Líquido' }).click();
    await expect(hoja.getByLabel('Litros')).toHaveValue('');
    await hoja.getByRole('button', { name: '2 L' }).click();
    await hoja.getByRole('button', { name: 'Más' }).click();
    await hoja.getByRole('button', { name: 'Más' }).click();
    await hoja.getByRole('button', { name: 'Menos' }).click();
    await expect(hoja.getByLabel('Litros')).toHaveValue('2.5');
    await hoja.getByRole('button', { name: 'Guardar', exact: true }).click();
    await expectToast(page, '¡Pileta marcada como hecha!');
    await expect(card.getByTestId('visita-cloro')).toHaveText('Líquido · 2,5 L');
    const [log] = await logsOf((await itemOf(FIXTURE.pools.pool1.id)).id);
    expect(log).toMatchObject({ chlorine_type: 'liquido', chlorine_amount: 2.5 });
  });

  test('"Abrir la ruta completa" lleva a Google Maps con las pendientes en orden; las hechas salen de la ruta', async ({ page }) => {
    await page.goto('/employee/itinerario');
    const ruta = page.getByTestId('ruta-completa').getByRole('link', { name: 'Abrir la ruta completa' });
    await expect(ruta).toHaveAttribute('href', /google\.com\/maps\/dir\/\?api=1&destination=.*&waypoints=/);
    await svc().from('itinerary_items').update({ status: 'done' }).eq('pool_id', FIXTURE.pools.pool1.id).eq('itinerary_day_id', await todayId());
    await page.reload();
    await expect(ruta).not.toHaveAttribute('href', /waypoints=/);
  });

  test('las que le asignaron van en "Te tocan a vos" y el resto en "Del equipo"', async ({ page }) => {
    const ids = await userIds();
    const day = await todayId();
    // Las dos van en el auto del empleado: así ve también la que le toca al dueño
    const car = (await svc().from('vehicles').insert({ name: rand('Auto Bloques') }).select('id').single()).data!;
    created.vehicles.push(car.id);
    await svc().from('itinerary_day_crews').insert({ itinerary_day_id: day, vehicle_id: car.id, employee_id: ids.employee });
    await svc().from('itinerary_items').update({ vehicle_id: car.id, assigned_employee_id: ids.employee }).eq('pool_id', FIXTURE.pools.pool2.id).eq('itinerary_day_id', day);
    await svc().from('itinerary_items').update({ vehicle_id: car.id, assigned_employee_id: ids.owner }).eq('pool_id', FIXTURE.pools.pool1.id).eq('itinerary_day_id', day);
    await page.goto('/employee/itinerario');
    const mias = page.getByTestId('bloque-mias');
    await expect(mias).toContainText('Te tocan a vos');
    await expect(mias).toContainText('Casa de Tigre');
    await expect(mias.getByRole('button', { name: 'Hecha', exact: true })).toHaveCount(1);
    const equipo = page.getByTestId('bloque-equipo');
    await expect(equipo).toContainText('Del equipo');
    await expect(equipo.getByTestId('ruta-encargado')).toHaveText('Le toca a test-owner');
    await expect(equipo.getByRole('button', { name: 'Hecha', exact: true })).toHaveCount(0);
    // El avance cuenta solo la suya; abajo, el auto entero
    await expect(page.getByTestId('avance')).toContainText('0 de 1');
    await expect(page.getByTestId('avance')).toContainText('tuya hecha');
    await expect(page.getByTestId('avance-auto')).toContainText('0 de 2 hechas');
    await svc().from('itinerary_items').update({ status: 'done' }).eq('pool_id', FIXTURE.pools.pool1.id).eq('itinerary_day_id', day);
    await page.reload();
    await expect(page.getByTestId('avance')).toContainText('0 de 1');
    await expect(page.getByTestId('avance-auto')).toContainText('1 de 2 hechas');
  });
});

test.describe('menú de abajo', () => {
  test('el menú fijo de abajo tiene solo Hoy y Ayuda', async ({ page }) => {
    await page.goto('/employee/itinerario');
    const menu = page.getByTestId('menu-abajo');
    await expect(menu.getByRole('link')).toHaveCount(2);
    await expect(menu.getByRole('link', { name: 'Hoy' })).toHaveAttribute('aria-current', 'page');
    await menu.getByRole('link', { name: 'Ayuda' }).click();
    await page.waitForURL('**/employee/ayuda');
  });
});

test.describe('en vivo', () => {
  test('cuando el empleado marca una pileta, el Dashboard del dueño se actualiza solo', async ({ page, browser }) => {
    const owner = await browser.newContext({ storageState: 'playwright/.auth/owner.json' });
    const op = await owner.newPage();
    await op.goto('/admin/dashboard');
    await expect(op.getByTestId('en-vivo')).toBeVisible({ timeout: 15_000 });
    // En la computadora es una fila de la tabla; si el dueño eligió tarjetas, una tarjeta
    const fila = op.locator('[data-testid="tabla-fila"], [data-testid="tabla-tarjeta"]').filter({ hasText: 'Calle Falsa' }).first();
    await expect(fila).toContainText('Pendiente');

    await page.goto('/employee/itinerario');
    await expect(page.getByTestId('en-vivo')).toBeVisible({ timeout: 15_000 });
    const card = page.getByTestId('visita').filter({ hasText: 'Casa de Tigre' });
    await card.getByRole('button', { name: 'No se pudo' }).click();
    await page.getByRole('radio', { name: /Saltear por hoy/ }).click();
    await page.getByLabel('Nota para el dueño (opcional)').fill('e2e en vivo');
    await page.getByRole('button', { name: 'Guardar', exact: true }).click();
    await expectToast(page, 'Pileta salteada');

    // Sin recargar: llega el aviso y la fila cambia sola
    await expectToast(op, 'Hay novedades del equipo: la pantalla se actualizó');
    await expect(fila).toContainText('Salteado', { timeout: 15_000 });
    await expect(fila).toContainText('e2e en vivo');
    await owner.close();
  });
});
