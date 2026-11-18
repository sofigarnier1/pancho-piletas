// Reemplazo de "@playwright/test" para los specs: es el mismo `test`, más un registro automático de cobertura real.
// En cada test anota, de TODOS los contextos del navegador (también los creados con browser.newContext):
//  - acciones de servidor ejecutadas (cabecera next-action) y los chunks JS que permiten traducir su id a nombre,
//  - endpoints de /api llamados (desde la página o desde context.request / request),
//  - controles (botones, enlaces, pestañas, campos) vistos en cada pantalla y los que se clickearon.
// El reporter (e2e/support/prod-reporter.ts) junta todo y calcula la cobertura contra el inventario.
import { test as base, type APIRequestContext, type Browser, type BrowserContext } from '@playwright/test';

export * from '@playwright/test';

export type CovControl = { path: string; kind: string; name: string };
export type Coverage = { actions: string[]; api: string[]; chunks: string[]; clicks: CovControl[]; seen: CovControl[] };
/** Lo que se ve de una falla sin abrir nada: dónde estaba, qué avisó la pantalla, qué respondió el servidor. */
export type FailureContext = { pages: { url: string; title: string; toasts: string[]; alerts: string[]; heading: string }[]; consoleErrors: string[]; badResponses: string[] };

type Cov = { actions: Set<string>; api: Set<string>; chunks: Set<string>; clicks: CovControl[]; seen: CovControl[]; consoleErrors: string[]; badResponses: string[] };

const API_METHODS = ['get', 'post', 'put', 'patch', 'delete', 'fetch', 'head'] as const;

/** Script que corre en cada página: avisa cada click y lista los controles visibles al cargar y después de cada click. */
const PAGE_SCRIPT = () => {
  const w = window as unknown as { __covClick?: (c: unknown) => void; __covSeen?: (c: unknown) => void };
  const SEL = 'button, a[href], [role="button"], [role="tab"], [role="menuitem"], [role="option"], [role="checkbox"], [role="switch"], [role="combobox"], input:not([type="hidden"]), select, textarea, summary';
  const kindOf = (el: Element) => el.getAttribute('role') || el.tagName.toLowerCase() + (el.getAttribute('type') ? ':' + el.getAttribute('type') : '');
  const nameOf = (el: Element) => {
    const aria = el.getAttribute('aria-label');
    if (aria) return aria;
    const id = el.getAttribute('id');
    if (id) {
      const lab = document.querySelector(`label[for="${CSS.escape(id)}"]`);
      if (lab?.textContent) return lab.textContent;
    }
    return el.getAttribute('name') || el.getAttribute('placeholder') || el.getAttribute('title') || el.textContent || '';
  };
  const clean = (s: string) => s.replace(/\s+/g, ' ').trim().slice(0, 90);
  const visible = (el: Element) => {
    const r = (el as HTMLElement).getBoundingClientRect();
    return r.width > 0 && r.height > 0 && getComputedStyle(el).visibility !== 'hidden';
  };
  const snapshot = () => {
    if (!w.__covSeen) return;
    const out = Array.from(document.querySelectorAll(SEL))
      .filter(visible)
      .map((el) => ({ path: location.pathname, kind: kindOf(el), name: clean(nameOf(el)) }))
      .filter((c) => c.name);
    w.__covSeen(out);
  };
  document.addEventListener(
    'click',
    (e) => {
      const el = (e.target as Element | null)?.closest?.(SEL);
      if (el && w.__covClick) w.__covClick({ path: location.pathname, kind: kindOf(el), name: clean(nameOf(el)) });
      setTimeout(snapshot, 700); // diálogos y menús que se abren con el click
    },
    true,
  );
  // Escribir o elegir en un campo también es usarlo (fill no genera click)
  const onField = (e: Event) => {
    const el = (e.target as Element | null)?.closest?.(SEL);
    if (el && w.__covClick) w.__covClick({ path: location.pathname, kind: kindOf(el), name: clean(nameOf(el)) });
  };
  document.addEventListener('change', onField, true);
  document.addEventListener('input', onField, true);
  window.addEventListener('load', () => setTimeout(snapshot, 800));
};

/**
 * Next transmite las páginas por partes: hasta que termina, el DOM tiene a la vez el contenido provisional y el final
 * (div oculto con id "S:n" / template "B:n"), y un selector estricto (getByText, locator("h1")) ve DOS elementos y falla
 * aunque la pantalla esté bien. Después de cada goto/reload se espera a que el streaming termine.
 */
async function settleStreaming(pg: import('@playwright/test').Page) {
  await pg.waitForFunction(() => !document.querySelector('div[hidden][id^="S:"], template[id^="B:"]'), null, { timeout: 8_000 }).catch(() => {});
  // Un click justo después de cargar puede llegar antes de que React active los controles y se pierde: se espera a que la red se calme
  await pg.waitForLoadState('networkidle', { timeout: 6_000 }).catch(() => {});
  // ...y a que cada control visible esté conectado a React (al hidratar, React marca cada nodo con __reactProps$): sin esto un
  // click puede caer en un botón que todavía no tiene su manejador (la acción nunca ocurre). Los controles de terceros (mapa) no cuentan.
  await pg
    .waitForFunction(
      () => {
        const els = Array.from(document.querySelectorAll('main button, main a[href], main input, main select, main textarea, header button, nav button, [role="dialog"] button, [role="dialog"] input'));
        return els.every((el) => {
          if (el.closest('[hidden], nextjs-portal, next-route-announcer')) return true;
          const r = (el as HTMLElement).getBoundingClientRect();
          if (r.width === 0 || r.height === 0) return true;
          return Object.keys(el).some((k) => k.startsWith('__reactProps$'));
        });
      },
      null,
      { timeout: 8_000 },
    )
    .catch(() => {});
}
function patchNavigation(pg: import('@playwright/test').Page) {
  const p = pg as unknown as Record<string, unknown> & { __settle?: boolean };
  if (p.__settle) return;
  p.__settle = true;
  for (const m of ['goto', 'reload'] as const) {
    const orig = (pg[m] as (...a: unknown[]) => Promise<unknown>).bind(pg);
    (p as Record<string, unknown>)[m] = async (...a: unknown[]) => {
      const r = await orig(...a);
      await settleStreaming(pg);
      return r;
    };
  }
}

function wrapRequest(req: APIRequestContext, add: (s: string) => void) {
  const r = req as unknown as Record<string, (...a: unknown[]) => unknown> & { __cov?: boolean };
  if (r.__cov) return;
  r.__cov = true;
  for (const m of API_METHODS) {
    const orig = r[m]?.bind(req);
    if (!orig) continue;
    r[m] = async (url: unknown, opts?: unknown) => {
      const res = (await orig(url, opts)) as { status(): number };
      try {
        const method = m === 'fetch' ? String((opts as { method?: string } | undefined)?.method ?? 'GET').toUpperCase() : m.toUpperCase();
        const path = new URL(String(url), 'http://x').pathname;
        if (path.startsWith('/api/')) add(`${method} ${path} ${res.status()}`);
      } catch {
        /* url rara: no se anota */
      }
      return res;
    };
  }
}

async function track(ctx: BrowserContext, cov: Cov) {
  const c = ctx as BrowserContext & { __cov?: boolean };
  if (c.__cov) return;
  c.__cov = true;
  // Se anota con la respuesta: una acción o un endpoint cuenta como probado solo si respondió bien (< 400)
  ctx.on('response', (res) => {
    const r = res.request();
    try {
      const action = r.headers()['next-action'];
      if (action && res.status() < 400) cov.actions.add(action);
      const u = new URL(r.url());
      if (u.pathname.startsWith('/api/')) cov.api.add(`${r.method()} ${u.pathname} ${res.status()}`);
      if (u.pathname.includes('/_next/static/chunks/') && u.pathname.endsWith('.js')) cov.chunks.add(r.url());
      // Respuestas con error (para la nota de la falla): páginas, API y acciones de servidor; sin ruido de imágenes/mapas
      if (res.status() >= 400 && !/\.(png|jpg|svg|ico|woff2?|map)$/.test(u.pathname)) {
        const what = action ? `acción ${action.slice(0, 8)}…` : r.method();
        if (cov.badResponses.length < 12) cov.badResponses.push(`${res.status()} ${what} ${u.pathname}`);
      }
    } catch {
      /* sin URL */
    }
  });
  ctx.on('page', (pg) => {
    patchNavigation(pg);
    pg.on('console', (m) => {
      if (m.type() === 'error' && cov.consoleErrors.length < 12 && !/favicon|DevTools/i.test(m.text())) cov.consoleErrors.push(m.text().replace(/\s+/g, ' ').slice(0, 220));
    });
    pg.on('pageerror', (e) => {
      if (cov.consoleErrors.length < 12) cov.consoleErrors.push('pageerror: ' + e.message.replace(/\s+/g, ' ').slice(0, 220));
    });
  });
  wrapRequest(ctx.request, (s) => cov.api.add(s));
  ctx.pages().forEach(patchNavigation);
  await ctx.exposeBinding('__covClick', (_src, c: CovControl) => { cov.clicks.push(c); }).catch(() => {});
  await ctx.exposeBinding('__covSeen', (_src, list: CovControl[]) => { cov.seen.push(...list); }).catch(() => {});
  await ctx.addInitScript(PAGE_SCRIPT).catch(() => {});
}

export const test = base.extend<{ _coverage: void }>({
  _coverage: [
    async ({ browser, context, request }, use, testInfo) => {
      const cov: Cov = { actions: new Set<string>(), api: new Set<string>(), chunks: new Set<string>(), clicks: [], seen: [], consoleErrors: [], badResponses: [] };
      const opened: BrowserContext[] = [context];
      await track(context, cov);
      wrapRequest(request, (s) => cov.api.add(s));
      // Los tests que abren contextos propios (otro rol, visitante sin sesión) también cuentan
      const b = browser as Browser & { newContext: Browser['newContext'] };
      const origNew = b.newContext.bind(browser);
      b.newContext = (async (opts?: Parameters<Browser['newContext']>[0]) => {
        const ctx = await origNew(opts);
        opened.push(ctx);
        await track(ctx, cov);
        return ctx;
      }) as Browser['newContext'];
      try {
        // eslint-disable-next-line react-hooks/rules-of-hooks -- fixture de Playwright, no un hook de React
        await use();
      } finally {
        b.newContext = origNew;
        // Si la prueba falló, se deja anotado dónde estaba cada pestaña y qué decía la pantalla (para la nota automática)
        if (testInfo.status !== testInfo.expectedStatus && testInfo.status !== 'skipped') {
          const pages: FailureContext['pages'] = [];
          for (const ctx of opened) {
            for (const pg of ctx.pages()) {
              if (pg.isClosed()) continue;
              const one = async (sel: string) =>
                (await pg.locator(sel).allInnerTexts().catch(() => [])).map((t) => t.replace(/\s+/g, ' ').trim()).filter(Boolean).slice(0, 4);
              pages.push({
                url: pg.url(),
                title: await pg.title().catch(() => ''),
                toasts: await one('[data-sonner-toast]'),
                alerts: await one('[role="alert"]'),
                heading: ((await pg.locator('h1, h2').first().innerText({ timeout: 1500 }).catch(() => '')) || '').replace(/\s+/g, ' ').trim().slice(0, 120),
              });
            }
          }
          const fc: FailureContext = { pages: pages.slice(0, 4), consoleErrors: cov.consoleErrors, badResponses: cov.badResponses };
          await testInfo.attach('failure-context', { body: JSON.stringify(fc), contentType: 'application/json' }).catch(() => {});
        }
        const data: Coverage = { actions: [...cov.actions], api: [...cov.api], chunks: [...cov.chunks], clicks: cov.clicks, seen: cov.seen };
        await testInfo.attach('coverage', { body: JSON.stringify(data), contentType: 'application/json' });
      }
    },
    { auto: true },
  ],
});
