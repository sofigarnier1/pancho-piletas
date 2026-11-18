/**
 * Genera el manual de usuario de cada rol en PDF (docs/manual/*.pdf), listo para imprimir o compartir sin entrar al sistema.
 * Usa la misma página "completo" del manual: lo que sale en el PDF es lo que ve cada rol. Se corre con `npm run manual:pdf`
 * (antes hay que tener las capturas: `npm run manual:capturas`).
 */
import fs from 'node:fs';
import path from 'node:path';
import { expect, test } from '@playwright/test';

test.skip(!process.env.MANUAL_PDF, 'Solo con MANUAL_PDF=1 (npm run manual:pdf)');
test.setTimeout(180_000);

const OUT = path.resolve(__dirname, '../docs/manual');

const MANUALES = [
  { rol: 'admin', url: '/admin/manual/completo', archivo: 'manual-super-admin.pdf' },
  { rol: 'owner', url: '/admin/manual/completo', archivo: 'manual-dueno.pdf' },
  { rol: 'marketing', url: '/admin/manual/completo', archivo: 'manual-marketing.pdf' },
  { rol: 'employee', url: '/employee/ayuda/completo', archivo: 'manual-empleado.pdf' },
  { rol: 'client', url: '/client/ayuda/completo', archivo: 'manual-cliente.pdf' },
];

for (const m of MANUALES) {
  test(`PDF · ${m.archivo}`, async ({ browser }) => {
    const ctx = await browser.newContext({ storageState: `playwright/.auth/${m.rol}.json`, viewport: { width: 1100, height: 900 } });
    const page = await ctx.newPage();
    await page.goto(m.url, { waitUntil: 'networkidle' });
    await expect(page.getByRole('button', { name: 'Imprimir todo el manual' })).toBeVisible();
    await page.addStyleTag({ content: 'nextjs-portal { display: none !important }' });
    // Las capturas cargan "perezosas" y las preguntas frecuentes arrancan cerradas: para el PDF se muestran todas
    await page.evaluate(async () => {
      document.querySelectorAll('img').forEach((i) => { i.loading = 'eager'; });
      document.querySelectorAll('details').forEach((d) => { d.open = true; });
      await Promise.all([...document.images].map((i) => (i.complete ? 1 : new Promise((r) => { i.onload = i.onerror = r; }))));
    });
    await page.emulateMedia({ media: 'print' });
    fs.mkdirSync(OUT, { recursive: true });
    await page.pdf({
      path: path.join(OUT, m.archivo),
      format: 'A4',
      printBackground: true,
      margin: { top: '16mm', bottom: '16mm', left: '14mm', right: '14mm' },
      displayHeaderFooter: true,
      headerTemplate: '<span></span>',
      footerTemplate: '<div style="width:100%;font-size:8px;color:#666;text-align:center;font-family:sans-serif">Cloro y Piletas Pancho · Manual de usuario · <span class="pageNumber"></span>/<span class="totalPages"></span></div>',
    });
    await ctx.close();
  });
}
