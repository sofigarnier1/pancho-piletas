/**
 * Flujo del owner (Etapa 3c): pileta compartida entre dos clientes.
 * Alta del primero con pileta nueva → aviso de nombre repetido (no bloquea) → alta del segundo
 * sumándolo a esa pileta → hacer titular, quitar y volver a sumar → editar el N° y buscarlo.
 */
import { expect, test } from '../support/pw';
import { expectToast, confirmar } from '../support/ui';
import { rand, svc } from '../../tests/support/clients';

test.use({ storageState: 'playwright/.auth/owner.json' });
test.describe.configure({ mode: 'serial' });

const first = rand('Hermano E2E').replace(/-/g, ' ');
const second = rand('Hermana E2E').replace(/-/g, ' ');
const address = `Compartida E2E ${Date.now() % 100000}`;
const number = String(900000 + (Date.now() % 90000));
let firstId: string;
let secondId: string;
let poolId: string;

test.afterAll(async () => {
  if (poolId) await svc().from('pools').delete().eq('id', poolId);
  for (const id of [firstId, secondId]) if (id) await svc().from('profiles').delete().eq('id', id);
});

const links = async () =>
  (await svc().from('pool_clients').select('client_id, is_primary').eq('pool_id', poolId).order('is_primary', { ascending: false })).data;

test('alta del primer cliente con una pileta nueva', async ({ page }) => {
  await page.goto('/admin/clientes/nuevo');
  await page.getByLabel('Nombre *').fill(first);
  await page.getByLabel('N° de cliente').fill('');
  await page.getByLabel('Dirección').fill(address);
  await page.getByRole('button', { name: 'Crear cliente' }).click();
  await page.waitForURL(/\/admin\/clientes\/[0-9a-f-]{36}$/);
  firstId = page.url().split('/').pop()!;
  poolId = (await svc().from('pools').select('id').eq('address', address).single()).data!.id;
  expect(await links()).toEqual([{ client_id: firstId, is_primary: true }]);
});

test('el nombre repetido solo avisa; el segundo cliente se suma a la pileta que ya existe', async ({ page }) => {
  await page.goto('/admin/clientes/nuevo');
  await page.getByLabel('Nombre *').fill(first.toUpperCase());
  await expect(page.getByTestId('cliente-nombre-repetido')).toBeVisible();
  await page.getByLabel('Nombre *').fill(second);
  await expect(page.getByTestId('cliente-nombre-repetido')).toHaveCount(0);

  await page.getByRole('button', { name: 'Una pileta que ya existe' }).click();
  const create = page.getByRole('button', { name: 'Crear cliente' });
  await expect(create).toBeDisabled(); // hasta elegir la pileta
  await page.getByLabel('Buscar pileta').fill(address);
  await page.getByTestId('cliente-pileta-opcion').filter({ hasText: address }).click();
  await create.click();

  await page.waitForURL(/\/admin\/clientes\/[0-9a-f-]{36}$/);
  secondId = page.url().split('/').pop()!;
  await expect(page.getByText('Co-cliente')).toBeVisible();
  expect(await links()).toEqual([{ client_id: firstId, is_primary: true }, { client_id: secondId, is_primary: false }]);
});

test('en la pileta: hacer titular, quitar al anterior y volver a sumarlo', async ({ page }) => {
  await page.goto(`/admin/piletas/${poolId}`);
  const panel = page.getByTestId('pileta-clientes');
  await expect(panel.getByTestId('pileta-cliente')).toHaveCount(2);

  await panel.getByTestId('pileta-cliente').filter({ hasText: second }).getByRole('button', { name: 'Hacer titular' }).click();
  await expectToast(page, 'Titular actualizado');
  await expect.poll(links).toEqual([{ client_id: secondId, is_primary: true }, { client_id: firstId, is_primary: false }]);

  await panel.getByTestId('pileta-cliente').filter({ hasText: first }).getByRole('button', { name: 'Quitar' }).click();
  await confirmar(page);
  await expectToast(page, 'Cliente quitado de la pileta');
  await expect.poll(links).toEqual([{ client_id: secondId, is_primary: true }]);

  await panel.getByLabel('Cliente para sumar').selectOption({ label: first });
  await panel.getByRole('button', { name: 'Agregar cliente' }).click();
  await expectToast(page, 'Cliente sumado a la pileta');
  await expect.poll(links).toEqual([{ client_id: secondId, is_primary: true }, { client_id: firstId, is_primary: false }]);
});

test('editar el N° de cliente y encontrarlo por número', async ({ page }) => {
  await page.goto(`/admin/clientes/${secondId}`);
  await page.getByRole('button', { name: 'Editar datos' }).click();
  const form = page.getByTestId('cliente-editar');
  await form.getByLabel('N° de cliente').fill(number);
  await form.getByLabel('Teléfono').fill('1144443333');
  await form.getByRole('button', { name: 'Guardar' }).click();
  await expectToast(page, 'Datos guardados');
  await expect(page.getByText('1144443333')).toBeVisible();
  expect((await svc().from('client_profiles').select('client_number').eq('id', secondId).single()).data?.client_number).toBe(Number(number));

  await page.goto('/admin/clientes');
  await page.getByTestId('tabla-clientes-buscar').fill(number);
  const filas = page.getByTestId('tabla-clientes').getByTestId('tabla-fila');
  await expect(filas.filter({ hasText: second })).toHaveCount(1);
  await expect(filas.filter({ hasText: second }).locator('td').first()).toHaveText(number);
});
