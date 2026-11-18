// Inventario de TODO lo que la web permite hacer, leído del código (no se mantiene a mano):
//  - acciones de servidor: cada `export async function` de un archivo "use server"
//  - endpoints de la API: cada método exportado por un route.ts de src/app/api
//  - pantallas: cada page.tsx (con los segmentos dinámicos como :id)
// Lo usan el reporter (cobertura de una corrida) y el tablero.
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(__dirname, '../..');
const SRC = path.join(ROOT, 'src');

function walk(dir: string, out: string[] = []): string[] {
  if (!existsSync(dir)) return out;
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, out);
    else out.push(p);
  }
  return out;
}

/** reachable = alguna pantalla o componente la usa; si no, es código muerto o solo de servidor (se informa aparte). */
export type ActionItem = { name: string; file: string; reachable: boolean };
export type ApiItem = { method: string; route: string; pattern: RegExp; file: string };
export type PageItem = { route: string; pattern: RegExp; area: 'admin' | 'client' | 'employee' | 'public' | 'auth'; dynamic: boolean };

/** Acciones que no se pueden ejecutar desde una prueba de navegador (OAuth, callbacks) — se prueban por su pantalla. */
export const ACTIONS_NOT_IN_BROWSER = new Set<string>([]);

export function serverActions(): ActionItem[] {
  const out: ActionItem[] = [];
  const files = walk(SRC).filter((f) => /\.(ts|tsx)$/.test(f));
  const fileText = new Map(files.map((f) => [f, readFileSync(f, 'utf8')] as const));
  // Las acciones viven en src/app/**/actions.ts: si se las buscara en TODO src/app, cada una se "vería a
  // sí misma" en su propia declaración y saldría siempre reachable. Se busca en el resto del código, no en
  // el propio archivo que la define.
  const uiFiles = files.filter((f) => f.includes(`${path.sep}components${path.sep}`) || f.includes(`${path.sep}app${path.sep}`));
  for (const f of files) {
    const text = fileText.get(f)!;
    if (!/^\s*['"]use server['"]/m.test(text.slice(0, 400))) continue;
    for (const m of text.matchAll(/^export async function (\w+)/gm)) {
      const name = m[1];
      const re = new RegExp(`\\b${name}\\b`);
      const reachable = uiFiles.some((uf) => uf !== f && re.test(fileText.get(uf)!));
      out.push({ name, file: path.relative(ROOT, f), reachable });
    }
  }
  return out;
}

const toPattern = (route: string) => new RegExp('^' + route.replace(/\[\.\.\.[^\]]+\]/g, '.+').replace(/\[[^\]]+\]/g, '[^/]+') + '/?$');

export function apiEndpoints(): ApiItem[] {
  const out: ApiItem[] = [];
  for (const f of walk(path.join(SRC, 'app/api')).filter((f) => f.endsWith('/route.ts'))) {
    const route = '/' + path.relative(path.join(SRC, 'app'), path.dirname(f)).split(path.sep).join('/');
    const text = readFileSync(f, 'utf8');
    for (const m of text.matchAll(/^export (?:async )?function (GET|POST|PUT|PATCH|DELETE)\b/gm)) {
      out.push({ method: m[1], route, pattern: toPattern(route), file: path.relative(ROOT, f) });
    }
    for (const m of text.matchAll(/^export const (GET|POST|PUT|PATCH|DELETE)\b/gm)) {
      out.push({ method: m[1], route, pattern: toPattern(route), file: path.relative(ROOT, f) });
    }
  }
  return out;
}

/** Primer segmento real (no-grupo) de la ruta: admin/client/employee, o "public" para el resto. */
function areaOf(routeSegments: string[]): PageItem['area'] {
  const first = routeSegments[0];
  if (first === 'admin' || first === 'client' || first === 'employee') return first;
  return 'public';
}

let pagesCache: PageItem[] | null = null;
export function pages(): PageItem[] {
  if (pagesCache) return pagesCache;
  const out: PageItem[] = [];
  for (const f of walk(path.join(SRC, 'app')).filter((f) => f.endsWith('/page.tsx') || f === path.join(SRC, 'app', 'page.tsx'))) {
    const parts = path.relative(path.join(SRC, 'app'), path.dirname(f)).split(path.sep).filter(Boolean);
    const inAuthGroup = parts.some((p) => p === '(auth)');
    const realParts = parts.filter((p) => !/^\(.*\)$/.test(p));
    const route = '/' + realParts.join('/');
    const area: PageItem['area'] = inAuthGroup ? 'auth' : areaOf(realParts);
    const normalized = route === '/' ? '/' : route.replace(/\/$/, '');
    out.push({ route: normalized, pattern: toPattern(normalized === '/' ? '/' : normalized), area, dynamic: normalized.includes('[') });
  }
  pagesCache = out.sort((a, b) => a.route.localeCompare(b.route));
  return pagesCache;
}

/** "/admin/clientes/123/editar" → "/admin/clientes/:id/editar" (para agrupar controles por pantalla). */
export function routeTemplate(pathname: string): string {
  const p = pathname.replace(/\/$/, '') || '/';
  // una ruta fija ("/admin/clientes/nuevo") gana sobre una dinámica ("/admin/clientes/[id]")
  const page = pages()
    .filter((x) => x.pattern.test(p))
    .sort((a, b) => Number(a.dynamic) - Number(b.dynamic))[0];
  if (page) return page.route.replace(/\[[^\]]+\]/g, ':id');
  return p.replace(/\/[0-9a-f-]{8,}(?=\/|$)/gi, '/:id');
}
