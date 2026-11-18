/**
 * Salud de todas las páginas, por rol: cada pantalla que un rol puede abrir debe cargar sin
 * respuestas 5xx, sin errores de JavaScript, sin errores en la consola y sin pedidos fallidos.
 * Son solo lecturas: corre en paralelo con el resto.
 */
import { expect, test, type Page } from './support/pw';
import { FIXTURE } from './support/seed';
import { todayInArgentina } from '../src/lib/dates';
import { svc } from '../tests/support/clients';

type Role = 'admin' | 'owner' | 'marketing' | 'employee' | 'client';

/** Páginas que cada rol abre desde su menú (las dinámicas se completan con datos del seed). */
const pages = async (): Promise<Record<Role, string[]>> => {
  const { data: items } = await svc().from('itinerary_items').select('id').limit(1);
  const itemId = items![0].id;
  const clientId = (await svc().from('client_profiles').select('id').limit(1).single()).data!.id;
  const today = todayInArgentina();

  const ownerPages = [
    '/admin/dashboard', '/admin/clientes', '/admin/clientes/nuevo', `/admin/clientes/${clientId}`,
    '/admin/piletas', '/admin/piletas/nueva', `/admin/piletas/${FIXTURE.pools.pool1.id}`, '/admin/piletas?activas=no',
    '/admin/itinerario', `/admin/itinerario/${today}`, '/admin/ventas', '/admin/ventas/nueva', '/admin/ventas/reporte', '/admin/stock', '/admin/stock/nuevo',
    '/admin/stock/cargar', '/admin/stock/movimientos', '/admin/manual', '/admin/manual/clientes', '/admin/manual/completo',
  ];
  const marketingPages = ['/admin/dashboard', '/admin/stock', '/admin/stock/nuevo', '/admin/landing-cms', '/admin/puntos', '/admin/puntos/niveles', '/admin/puntos/asignar', '/admin/manual', '/admin/manual/puntos'];
  return {
    owner: ownerPages,
    marketing: marketingPages,
    admin: [...new Set([...ownerPages, ...marketingPages, '/admin/roles', '/admin/manual/roles'])],
    employee: ['/employee/itinerario', `/employee/piletas/${itemId}`, '/employee/ayuda', '/employee/ayuda/hoy'],
    client: ['/client/dashboard', '/client/compras', '/client/servicios', '/client/puntos', '/client/ayuda', '/client/ayuda/inicio'],
  };
};

const PUBLIC = ['/', '/login', '/recover', '/reset-password'];

type Problems = string[];

function watch(page: Page): Problems {
  const problems: Problems = [];
  page.on('pageerror', (e) => problems.push(`error de JavaScript: ${e.message}`));
  page.on('console', (m) => { if (m.type() === 'error') problems.push(`consola: ${m.text()}`); });
  page.on('response', (r) => { if (r.status() >= 500) problems.push(`respuesta ${r.status()}: ${r.url()}`); });
  page.on('requestfailed', (r) => {
    const reason = r.failure()?.errorText ?? '';
    if (!/ERR_ABORTED/.test(reason)) problems.push(`pedido fallido (${reason}): ${r.url()}`);
  });
  return problems;
}

async function visit(page: Page, path: string): Promise<Problems> {
  const problems = watch(page);
  const res = await page.goto(path, { waitUntil: 'networkidle' });
  if (res && res.status() >= 400) problems.push(`la página respondió ${res.status()}`);
  await page.waitForTimeout(300);
  return problems;
}

test.describe('páginas públicas (sin sesión)', () => {
  for (const path of PUBLIC) {
    test(`${path} carga sin errores`, async ({ page }) => {
      const problems = await visit(page, path);
      expect(problems, problems.join('\n')).toEqual([]);
    });
  }

  test('una ruta inexistente muestra la página 404 sin romperse', async ({ page }) => {
    const problems = watch(page);
    const res = await page.goto('/esta-pagina-no-existe');
    expect(res?.status()).toBe(404);
    await expect(page.getByText(/404|not found|no se encontr/i).first()).toBeVisible();
    expect(problems.filter((p) => !/404/.test(p)), problems.join('\n')).toEqual([]);
  });
});

for (const role of ['admin', 'owner', 'marketing', 'employee', 'client'] as const) {
  test.describe(`páginas como ${role}`, () => {
    test.use({ storageState: `playwright/.auth/${role}.json` });

    test(`todas las pantallas de ${role} cargan sin errores`, async ({ page }) => {
      // recorre todas las pantallas del rol (y Next compila cada una la primera vez): necesita más que los 30 s de siempre
      test.setTimeout(120_000);
      const list = (await pages())[role];
      const failures: string[] = [];
      for (const path of list) {
        const problems = await visit(page, path);
        // una página protegida no debe redirigir al login con una sesión válida
        if (page.url().includes('/login')) problems.push('redirigió a /login con la sesión iniciada');
        if (problems.length) failures.push(`${path}\n   - ${problems.join('\n   - ')}`);
      }
      expect(failures, failures.join('\n')).toEqual([]);
    });
  });
}
