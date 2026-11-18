/**
 * Landing pública (diseño V3): estructura, catálogo con productos reales, consulta guiada a WhatsApp,
 * service, pileta con cloro, preguntas, contacto y pie. Corre en escritorio (public:chromium) y celular (public:mobile).
 * Solo lecturas: la consulta guiada no guarda nada.
 */
import { test, expect, type Page } from './support/pw';
import { svc } from '../tests/support/clients';
import { FIXTURE } from './support/seed';

const WA = 'wa.me/5491100000000';

const abrirMenuSiHaceFalta = async (page: Page, isMobile: boolean) => {
  if (isMobile) await page.getByRole('button', { name: 'Abrir menú' }).click();
};

/** Decodifica el texto que el enlace de WhatsApp lleva escrito */
const textoDeWhatsApp = (href: string | null) => decodeURIComponent(new URL(href!).searchParams.get('text') ?? '');

test.describe('Landing — estructura', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
  });

  test('carga con título, un solo h1 y las secciones en orden', async ({ page }) => {
    await expect(page).toHaveTitle(/Pancho Piletas/);
    await expect(page.locator('h1')).toHaveCount(1);
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    const orden = await page.locator('main > section[id]').evaluateAll((s) => s.map((n) => n.id));
    expect(orden).toEqual(['hero', 'cloro', 'service', 'nosotros', 'antes-despues', 'preguntas', 'contacto']);
  });

  test('el menú lleva a cada sección', async ({ page, isMobile }) => {
    await abrirMenuSiHaceFalta(page, isMobile);
    const nav = page.getByRole('navigation', { name: 'Principal' });
    for (const [nombre, ancla] of [['Cloro', '#cloro'], ['Service', '#service'], ['Preguntas', '#preguntas']]) {
      await expect(nav.getByRole('link', { name: nombre, exact: true })).toHaveAttribute('href', ancla);
    }
    await expect(nav.getByRole('link', { name: 'Ingresar' })).toHaveCount(0);
    await nav.getByRole('link', { name: 'Service', exact: true }).click();
    await expect(page).toHaveURL(/#service$/);
    if (isMobile) await expect(page.getByRole('button', { name: 'Abrir menú' })).toBeVisible(); // el menú se cierra al elegir
  });

  test('el hero lleva al catálogo de cloro y el service va a WhatsApp', async ({ page }) => {
    const hero = page.locator('#hero');
    await expect(hero.getByRole('link', { name: /cloro/i }).first()).toHaveAttribute('href', '#cloro');
    const service = hero.getByRole('link', { name: 'Pedí el service' });
    await expect(service).toHaveAttribute('href', new RegExp(WA));
    await expect(service).toHaveAttribute('target', '_blank');
    await expect(hero.getByRole('button', { name: /video/ })).toBeVisible();
  });

  test('todos los enlaces a WhatsApp van al número del negocio', async ({ page }) => {
    const hrefs = await page.$$eval('a[href*="wa.me"]', (as) => as.map((a) => (a as HTMLAnchorElement).href));
    expect(hrefs.length).toBeGreaterThan(2);
    for (const h of hrefs) expect(h).toContain(WA);
  });

  test('no muestra precios inventados ni la vista de ejemplo como si fuera real', async ({ page }) => {
    await expect(page.getByText('$10.000')).toHaveCount(0);
  });
});

test.describe('Landing — catálogo', () => {
  test('muestra todos los productos activos con su precio y disponibilidad, y ninguno inactivo', async ({ page }) => {
    const { data: activos } = await svc().from('products').select('name, price_cents, stock_units').eq('is_active', true);
    await page.goto('/#cloro');
    const cards = page.locator('#cloro [data-testid="producto"]');
    await expect(cards).toHaveCount(activos!.length);
    for (const p of activos!) {
      const card = cards.filter({ has: page.getByRole('heading', { name: p.name, exact: true }) });
      await expect(card).toBeVisible();
      await expect(card).toContainText(`$${(p.price_cents / 100).toLocaleString('es-AR', { maximumFractionDigits: 0 })}`);
      await expect(card).toContainText(p.stock_units > 0 ? 'Disponible' : 'Consultar disponibilidad');
    }
    await expect(page.getByText(FIXTURE.inactiveProduct.name)).toHaveCount(0);
  });

  test('el filtro por tipo deja solo los productos de ese tipo', async ({ page }) => {
    await page.goto('/#cloro');
    const filtros = page.getByRole('tablist', { name: 'Tipos de producto' });
    await filtros.getByRole('tab', { name: 'Combos' }).click();
    await expect(filtros.getByRole('tab', { name: 'Combos' })).toHaveAttribute('aria-selected', 'true');
    const cards = page.locator('#cloro [data-testid="producto"]');
    await expect(cards.filter({ hasText: FIXTURE.products.combo.name })).toBeVisible();
    await expect(cards.filter({ hasText: FIXTURE.products.pastilla.name })).toHaveCount(0);
    await filtros.getByRole('tab', { name: 'Todos' }).click();
    await expect(cards.filter({ hasText: FIXTURE.products.pastilla.name })).toBeVisible();
  });
});

test.describe('Landing — consulta guiada', () => {
  test('desde un producto: lleva el producto, pide la zona, conserva los datos al volver y arma el mensaje', async ({ page }) => {
    await page.goto('/#cloro');
    await page.getByRole('button', { name: `Pedir ${FIXTURE.products.combo.name} por WhatsApp` }).click();
    const dialog = page.getByRole('dialog', { name: 'Preparemos tu pedido.' });
    await expect(dialog).toBeVisible();
    await expect(dialog.getByText('Paso 1 de 3 · Qué necesitás')).toBeVisible();
    await expect(dialog.getByRole('radio', { name: /Quiero cloro/ })).toBeChecked();
    await expect(dialog.getByRole('combobox', { name: 'Tu consulta' })).toHaveValue('Combos de cloro');
    await expect(dialog.getByText(`Producto elegido: ${FIXTURE.products.combo.name}`)).toBeVisible();

    await dialog.getByRole('button', { name: 'Seguir →' }).click();
    await expect(dialog.getByText('Paso 2 de 3 · Tu pileta')).toBeVisible();
    await dialog.getByRole('button', { name: 'Seguir →' }).click();
    await expect(dialog.getByRole('alert')).toHaveText('Contanos tu localidad o barrio para consultar la cobertura.');
    await expect(dialog.getByText('Paso 2 de 3 · Tu pileta')).toBeVisible();

    await dialog.getByRole('textbox', { name: /Localidad o barrio/ }).fill('San Isidro & Tigre');
    await dialog.getByRole('combobox', { name: '¿Cómo está el agua?' }).selectOption('Verde, necesito recuperarla');
    await dialog.getByRole('button', { name: 'Seguir →' }).click();
    await dialog.getByRole('button', { name: '← Atrás' }).click();
    await expect(dialog.getByRole('textbox', { name: /Localidad o barrio/ })).toHaveValue('San Isidro & Tigre');
    await dialog.getByRole('button', { name: 'Seguir →' }).click();

    await expect(dialog.getByText('Paso 3 de 3 · Revisar consulta')).toBeVisible();
    await dialog.getByRole('textbox', { name: /Algo más/ }).fill('¿Tienen envío el sábado?');
    const mensaje = dialog.getByTestId('mensaje-consulta');
    await expect(mensaje).toContainText(`Producto: ${FIXTURE.products.combo.name}.`);
    await expect(mensaje).toContainText('Mi zona: San Isidro & Tigre.');
    const link = dialog.getByRole('link', { name: 'Continuar en WhatsApp ↗' });
    await expect(link).toHaveAttribute('target', '_blank');
    expect(await link.getAttribute('href')).toContain(WA);
    const texto = textoDeWhatsApp(await link.getAttribute('href'));
    expect(texto).toBe(await mensaje.innerText());
    expect(texto).toContain('Estado del agua: Verde, necesito recuperarla.');
    expect(texto.endsWith('¿Tienen envío el sábado?')).toBe(true);

    await page.keyboard.press('Escape');
    await expect(dialog).toHaveCount(0);
  });

  test('al abrirla de nuevo arranca vacía, y la X la cierra', async ({ page }) => {
    await page.goto('/#contacto');
    await page.getByRole('button', { name: /Pedí por WhatsApp/ }).click();
    const dialog = page.getByRole('dialog');
    await dialog.getByRole('button', { name: 'Seguir →' }).click();
    await dialog.getByRole('textbox', { name: /Localidad o barrio/ }).fill('Pilar');
    await dialog.getByRole('button', { name: 'Cerrar consulta' }).click();
    await expect(dialog).toHaveCount(0);
    await page.getByRole('button', { name: /Pedí por WhatsApp/ }).click();
    await expect(dialog.getByText('Paso 1 de 3 · Qué necesitás')).toBeVisible();
    await expect(dialog.getByRole('combobox', { name: 'Tu consulta' })).toHaveValue('Quiero orientación');
  });

  test('cambiar de necesidad propone un interés acorde', async ({ page }) => {
    await page.goto('/#contacto');
    await page.getByRole('button', { name: /Pedí por WhatsApp/ }).click();
    const dialog = page.getByRole('dialog');
    await dialog.getByText('Necesito service').click();
    await expect(dialog.getByRole('combobox', { name: 'Tu consulta' })).toHaveValue('Mantenimiento');
  });
});

test.describe('Landing — calculadora de cloro', () => {
  test('pregunta de a una medida y muestra una cantidad orientativa', async ({ page }) => {
    await page.goto('/#calculadora');
    const calc = page.locator('#calculadora');
    await calc.getByRole('textbox', { name: 'Largo de la pileta en metros' }).fill('8');
    await calc.getByRole('button', { name: /Siguiente/ }).click();
    await calc.getByRole('textbox', { name: 'Ancho de la pileta en metros' }).fill('4');
    await calc.getByRole('textbox', { name: 'Ancho de la pileta en metros' }).press('Enter');
    await calc.getByRole('radio', { name: /Media/ }).click();
    await expect(calc.getByRole('status')).toContainText('44.800');
    await expect(calc.getByText('Es una cantidad orientativa.')).toBeVisible();
    await calc.getByRole('button', { name: 'Calcular de nuevo' }).click();
    await expect(calc.getByRole('textbox', { name: 'Largo de la pileta en metros' })).toHaveValue('');
  });
});

test.describe('Landing — service y pileta con cloro', () => {
  test('el service muestra mantenimiento y desagote y cada uno pide por WhatsApp', async ({ page }) => {
    await page.goto('/#service');
    const service = page.locator('#service');
    await expect(service.getByRole('heading', { name: 'Mantenimiento', exact: true })).toBeVisible();
    await expect(service.getByRole('heading', { name: 'Desagote y limpieza', exact: true })).toBeVisible();
    await expect(service.getByText('Semanal o mensual')).toHaveCount(0);
    await service.getByRole('button', { name: 'Pedir mantenimiento' }).click();
    await expect(page.getByRole('dialog').getByRole('radio', { name: /Necesito service/ })).toBeChecked();
    await expect(page.getByRole('dialog').getByRole('combobox', { name: 'Tu consulta' })).toHaveValue('Mantenimiento');
    await page.keyboard.press('Escape');
    await service.getByRole('button', { name: 'Pedir desagote' }).click();
    await expect(page.getByRole('dialog').getByRole('combobox', { name: 'Tu consulta' })).toHaveValue('Desagote y limpieza');
  });

  test('aclara lo que el service no incluye', async ({ page }) => {
    await page.goto('/#service');
    await expect(page.locator('#service').getByText(/No (realizamos|hacemos) arreglos de pérdidas ni instalación de piletas\.$/)).toBeVisible();
  });

  test('la pileta se aclara al ponerle cloro y se puede reiniciar', async ({ page }) => {
    await page.goto('/#antes-despues');
    const seccion = page.locator('#antes-despues');
    await seccion.getByRole('button', { name: '¡Ponele cloro a la pileta!' }).click();
    await expect(seccion.getByRole('status')).toHaveText('Aclarando el agua…');
    await expect(seccion.getByRole('status')).toHaveText('Pileta clara. Ahora sí, a disfrutar.', { timeout: 10_000 });
    await seccion.getByRole('button', { name: 'Volver a empezar' }).click();
    await expect(seccion.getByRole('status')).toHaveText('Una muestra del cuidado de cada visita.');
  });

});

test.describe('Landing — preguntas, contacto y pie', () => {
  test('las preguntas se abren y muestran su respuesta', async ({ page }) => {
    await page.goto('/#preguntas');
    const preguntas = page.locator('#preguntas details');
    await expect(preguntas).toHaveCount(8);
    await page.getByText('¿Cómo guardo las pastillas?').click();
    await expect(page.getByText('No mezcles productos químicos')).toBeVisible();
    await page.getByText('¿Qué incluye el service?').click();
    await expect(page.getByText(/Confirmamos el alcance y la frecuencia/)).toBeVisible();
  });

  test('el cierre ofrece pedir por WhatsApp y las condiciones de entrega', async ({ page }) => {
    await page.goto('/#contacto');
    const cierre = page.locator('#contacto');
    await expect(cierre.getByRole('button', { name: /Pedí por WhatsApp/ })).toBeVisible();
    await expect(cierre.getByRole('list', { name: 'Condiciones de compra y entrega' })).toBeVisible();
  });

  test('el pie tiene WhatsApp, Instagram y la zona', async ({ page }) => {
    await page.goto('/');
    const footer = page.locator('footer');
    await expect(footer.getByRole('link').filter({ hasText: /\+54/ })).toHaveAttribute('href', new RegExp(WA));
    await expect(footer.getByRole('link').filter({ hasText: /@piletaspancho/ })).toHaveAttribute('href', /instagram\.com\/piletaspancho/);
    await expect(footer.getByText(/Zona Norte/).first()).toBeVisible();
  });
});

