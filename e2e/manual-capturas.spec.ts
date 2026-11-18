/**
 * Genera las capturas del manual de usuario (public/manual/<zona>/<tema>/<archivo>.webp) a partir de lo que declara cada
 * sección en src/content/manual. Se apaga solo: npm run manual:capturas
 *
 * Usa la base local de pruebas con los datos fijos del seed (clientes y piletas de ejemplo): no hay datos reales en las fotos.
 */
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { expect, test, type Page } from '@playwright/test';
import { TEMAS_ADMIN } from '../src/content/manual/admin';
import { TEMAS_EMPLEADO } from '../src/content/manual/empleado';
import { TEMAS_CLIENTE } from '../src/content/manual/cliente';
import type { Area, Tema } from '../src/content/manual/tipos';
import { todayInArgentina } from '../src/lib/dates';
import { svc, userIds } from '../tests/support/clients';
import { FIXTURE } from './support/seed';

test.skip(!process.env.MANUAL_CAPTURAS, 'Solo con MANUAL_CAPTURAS=1 (npm run manual:capturas)');
test.setTimeout(120_000);

const OUT = path.resolve(__dirname, '../public/manual');
const req = createRequire(require.resolve('next/package.json'));
const sharp = req('sharp') as (input: Buffer) => { resize(o: object): { webp(o: { quality: number }): { toFile(f: string): Promise<unknown> } } };

// Tamaño de pantalla con el que se usa cada zona: el equipo desde la compu, el empleado desde el celular
const VIEWPORT: Record<Area, { width: number; height: number }> = {
  admin: { width: 1360, height: 820 },
  employee: { width: 430, height: 900 },
  client: { width: 1100, height: 800 },
};

type Mundo = { cliente: string; pileta: string; itemHoy: string; hoy: string; manana: string; empleado: string };
let mundo: Mundo;
test.beforeAll(async () => {
  const ids = await userIds();
  const { data } = await svc().from('itinerary_items').select('id').eq('pool_id', FIXTURE.pools.pool1.id).limit(1).single();
  const hoy = todayInArgentina();
  const m = new Date(`${hoy}T12:00:00Z`);
  m.setUTCDate(m.getUTCDate() + 1);
  mundo = { cliente: ids.client, pileta: FIXTURE.pools.pool1.id, itemHoy: data!.id as string, hoy, manana: m.toISOString().slice(0, 10), empleado: ids.employee };

  // Autos y equipos de ejemplo para hoy: San Isidro en el Auto 1 con el empleado; Tigre (desagote) en el Auto 2 con el dueño
  // (si un test anterior cortó la corrida, el worker vuelve a empezar: se parte de cero)
  await svc().from('itinerary_day_crews').delete().not('id', 'is', null);
  await svc().from('itinerary_items').update({ vehicle_id: null }).not('vehicle_id', 'is', null);
  await svc().from('vehicles').delete().in('name', ['Auto 1 (Fiorino)', 'Auto 2 (Kangoo)']);
  const { data: cars } = await svc()
    .from('vehicles')
    .insert([{ name: 'Auto 1 (Fiorino)', plate: 'AB 123 CD', sort_order: 1 }, { name: 'Auto 2 (Kangoo)', sort_order: 2 }])
    .select('id');
  ejemplo.autos = (cars ?? []).map((c) => c.id as string);
  const [auto1, auto2] = ejemplo.autos;
  const { data: day } = await svc().from('itinerary_days').select('id').eq('date', hoy).single();
  ejemplo.dia = day!.id as string;
  await svc().from('itinerary_items').update({ vehicle_id: auto1 }).eq('itinerary_day_id', ejemplo.dia).eq('pool_id', FIXTURE.pools.pool1.id);
  await svc().from('itinerary_items').update({ vehicle_id: auto2, service_type: 'desagote' }).eq('itinerary_day_id', ejemplo.dia).eq('pool_id', FIXTURE.pools.pool2.id);
  await svc().from('itinerary_day_crews').insert([
    { itinerary_day_id: ejemplo.dia, vehicle_id: auto1, employee_id: ids.employee },
    { itinerary_day_id: ejemplo.dia, vehicle_id: auto2, employee_id: ids.owner },
  ]);
});

const ejemplo: { autos: string[]; dia: string | null } = { autos: [], dia: null };
test.afterAll(async () => {
  if (ejemplo.dia) {
    await svc().from('itinerary_day_crews').delete().eq('itinerary_day_id', ejemplo.dia);
    await svc().from('itinerary_items').update({ vehicle_id: null, service_type: 'service' }).eq('itinerary_day_id', ejemplo.dia);
  }
  if (ejemplo.autos.length) await svc().from('vehicles').delete().in('id', ejemplo.autos);
});

const resolver = (ruta: string) => ruta.replace(/\{(\w+)\}/g, (_, k: string) => mundo[k as keyof Mundo]);

async function sacar(page: Page, area: Area, url: string, destino: string, abrir: string[] = []) {
  await page.setViewportSize(VIEWPORT[area]);
  await page.goto(url, { waitUntil: 'networkidle' });
  // Sin el indicador del servidor de desarrollo de Next
  await page.addStyleTag({ content: 'nextjs-portal { display: none !important }' });
  await expect(page.locator('h1, h2').first()).toBeVisible({ timeout: 20_000 });
  await page.waitForTimeout(500);
  for (const nombre of abrir) {
    await page.getByRole('button', { name: new RegExp(nombre, 'i') }).first().click({ timeout: 10_000 });
    await page.waitForTimeout(600);
  }
  // Si se abrió la ayuda rápida, esperar a que termine de cargar
  await expect(page.getByText('Buscando la ayuda de esta pantalla')).toHaveCount(0, { timeout: 15_000 });
  const png = await page.screenshot({ type: 'png', fullPage: false });
  fs.mkdirSync(path.dirname(destino), { recursive: true });
  await sharp(png).resize({ width: 1200, withoutEnlargement: true }).webp({ quality: 80 }).toFile(destino);
}

function casos(temas: Tema[], area: Area) {
  const primero = area === 'admin' ? 'owner' : area;
  return temas.flatMap((t) => t.secciones.flatMap((s) => (s.capturas ?? []).map((c) => ({ area, tema: t.id, como: c.como ?? primero, ...c }))));
}

for (const [area, temas] of [['admin', TEMAS_ADMIN], ['employee', TEMAS_EMPLEADO], ['client', TEMAS_CLIENTE]] as [Area, Tema[]][]) {
  test.describe(`Capturas del manual · ${area}`, () => {
    for (const c of casos(temas, area)) {
      test(`${c.area}/${c.tema}/${c.archivo}`, async ({ browser }) => {
        const ctx = await browser.newContext({ storageState: `playwright/.auth/${c.como}.json` });
        const page = await ctx.newPage();
        await sacar(page, area, resolver(c.ruta), path.join(OUT, area, c.tema, `${c.archivo}.webp`), c.abrir);
        await ctx.close();
      });
    }
  });
}
