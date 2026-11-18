#!/usr/bin/env node
/**
 * Planilla de cobertura de tests: cruza lo que la web TIENE (acciones del servidor, páginas, tablas,
 * módulos de lógica) con lo que los tests EJERCITAN, y escribe docs/test-coverage.md.
 * Termina con error si queda alguna celda vacía → es el criterio para dar por cubierta una funcionalidad.
 *
 *   npm run test:coverage
 *
 * "Cubierto" = el nombre aparece en un archivo de test. Es un chequeo de existencia: confirma que
 * nadie quedó sin test, no que el test sea bueno (eso lo comprueban las mutaciones manuales).
 */
import { readdirSync, readFileSync, statSync, writeFileSync, mkdirSync } from 'node:fs';
import { join, relative } from 'node:path';

const root = process.cwd();
const walk = (dir, out = []) => {
  for (const name of readdirSync(dir)) {
    if (name === 'node_modules' || name === '.next' || name.startsWith('.')) continue;
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else out.push(p);
  }
  return out;
};
const rel = (p) => relative(root, p);
const read = (p) => readFileSync(p, 'utf8');

const all = [...walk(join(root, 'src')), ...walk(join(root, 'tests')), ...walk(join(root, 'e2e')), ...walk(join(root, 'supabase/migrations'))];
const isTest = (p) => /\.(test|spec)\.ts$/.test(p);
const actionTests = all.filter((p) => rel(p).startsWith('tests/actions/') && isTest(p));
const dbTests = all.filter((p) => rel(p).startsWith('tests/db/') && isTest(p));
const unitTests = all.filter((p) => rel(p).startsWith('src/') && isTest(p));
const e2eTests = all.filter((p) => rel(p).startsWith('e2e/') && isTest(p));
const contentOf = (files) => files.map((f) => ({ f: rel(f), c: read(f) }));
const where = (files, needle) => contentOf(files).filter(({ c }) => c.includes(needle)).map(({ f }) => f.replace(/^(tests|e2e)\//, '').replace('.spec.ts', '').replace('.test.ts', ''));

const gaps = [];
const lines = ['# Cobertura de tests', '', `_Generado por \`npm run test:coverage\` (${new Date().toISOString().slice(0, 10)}). No editar a mano._`, '', '> **Esto es un inventario, no una medida de cobertura.** Verifica que cada acción, tabla y trigger aparezca *nombrado* en algún test; no demuestra que se prueben los casos de error, la concurrencia ni los permisos. "Sin huecos" significa "nada sin nombrar", no "todo verificado".', ''];

// ── 1) Acciones del servidor ───────────────────────────────────────────────────────────────
const actionFiles = all.filter((p) => /src\/app\/.*actions\.ts$/.test(p));
const tsx = contentOf(all.filter((p) => p.endsWith('.tsx') && rel(p).startsWith('src/')));
const actions = actionFiles.flatMap((f) => [...read(f).matchAll(/export async function (\w+Action)\b/g)].map((m) => ({ name: m[1], file: rel(f) })));

lines.push('## Acciones del servidor', '', '| Acción | Tests de la acción | ¿Tiene botón/formulario en la web? |', '|---|---|---|');
for (const a of actions) {
  const covered = where(actionTests, a.name);
  const ui = tsx.filter(({ c }) => c.includes(a.name)).length > 0;
  if (!covered.length) gaps.push(`Acción sin tests: ${a.name} (${a.file})`);
  lines.push(`| \`${a.name}\` | ${covered.length ? covered.join(', ') : '❌ **sin tests**'} | ${ui ? 'sí' : '⚠️ no (solo existe en el código)'} |`);
}

// ── 2) Páginas ─────────────────────────────────────────────────────────────────────────────
const pages = all.filter((p) => /src\/app\/.*page\.tsx$/.test(p)).map((p) => {
  const route = '/' + rel(p).replace(/^src\/app\//, '').replace(/\/?page\.tsx$/, '').replace(/\([^)]*\)\/?/g, '');
  return route === '/' ? '/' : route.replace(/\/$/, '');
}).sort();

/** Una ruta con parámetro ([id]) se considera visitada si algún test navega a su prefijo. */
const needleFor = (route) => (route.includes('[') ? route.slice(0, route.indexOf('[')) : route);
lines.push('', '## Páginas', '', '| Página | Pruebas que la abren |', '|---|---|');
const pageSources = [...e2eTests, ...dbTests, ...actionTests];
for (const route of pages) {
  const needle = needleFor(route);
  const quoted = route === '/' ? ["'/'", '"/"', '`/`', "goto('/'", 'goto("/"'] : [`'${needle}`, `\`${needle}`, `"${needle}`];
  const hits = contentOf(pageSources).filter(({ c }) => quoted.some((q) => c.includes(q))).map(({ f }) => f.replace(/^e2e\//, '').replace('.spec.ts', ''));
  if (!hits.length) gaps.push(`Página sin tests: ${route}`);
  lines.push(`| \`${route}\` | ${hits.length ? [...new Set(hits)].slice(0, 5).join(', ') + (new Set(hits).size > 5 ? ', …' : '') : '❌ **sin tests**'} |`);
}

// ── 3) Tablas de la base ───────────────────────────────────────────────────────────────────
const tables = [...new Set(all.filter((p) => p.endsWith('.sql')).flatMap((p) => [...read(p).matchAll(/create table if not exists public\.(\w+)/g)].map((m) => m[1])))].sort();
const matrix = read(join(root, 'tests/db/rls-matrix.test.ts'));
lines.push('', '## Tablas (permisos por rol: leer, crear, editar, borrar × 7 actores)', '', '| Tabla | En la matriz de permisos | En el chequeo de esquema |', '|---|---|---|');
const schema = read(join(root, 'tests/db/schema.test.ts'));
for (const t of tables) {
  const inMatrix = new RegExp(`table:\\s*'${t}'`).test(matrix);
  const inSchema = schema.includes(`'${t}'`);
  if (!inMatrix) gaps.push(`Tabla fuera de la matriz de permisos: ${t}`);
  if (!inSchema) gaps.push(`Tabla fuera del chequeo de esquema: ${t}`);
  lines.push(`| \`${t}\` | ${inMatrix ? '✅' : '❌'} | ${inSchema ? '✅' : '❌'} |`);
}

// ── 4) Triggers y funciones SQL ────────────────────────────────────────────────────────────
const sql = all.filter((p) => p.endsWith('.sql')).sort().map(read).join('\n');
// Estado final de los triggers: se recorren las migraciones en orden; un "drop trigger" sin un "create" posterior lo saca
const triggerState = new Map();
for (const m of sql.matchAll(/(create|drop) trigger (?:if exists )?(\w+)/g)) triggerState.set(m[2], m[1] === 'create');
const triggers = [...triggerState].filter(([, alive]) => alive).map(([name]) => name).sort();
lines.push('', '## Triggers', '', '| Trigger | Probado en |', '|---|---|');
for (const tr of triggers) {
  // los triggers de updated_at se prueban por comportamiento en todas las tablas (triggers.test.ts) y por esquema (schema.test.ts)
  const generic = /_updated_at$/.test(tr) && schema.includes('set_updated_at');
  const hits = generic ? ['db/triggers (updated_at por tabla)', 'db/schema'] : where(dbTests, tr);
  const behaviours = hits.length;
  if (!behaviours) gaps.push(`Trigger sin chequeo: ${tr}`);
  lines.push(`| \`${tr}\` | ${behaviours ? hits.join(', ') : '❌ **sin tests**'} |`);
}

// ── 5) Lógica pura (src/lib) ───────────────────────────────────────────────────────────────
const libs = all.filter((p) => /src\/lib\/[^/]+\.ts$/.test(p) && !isTest(p) && !/motion\.ts$|utils\.ts$/.test(p)).map(rel).sort();
lines.push('', '## Módulos de lógica (`src/lib`)', '', '| Módulo | Test unitario |', '|---|---|');
for (const l of libs) {
  const t = l.replace(/\.ts$/, '.test.ts');
  const has = unitTests.some((u) => rel(u) === t);
  // los módulos que dependen del servidor (supabase, auth) se prueban a través de las acciones
  const indirect = /require-role|landing-products|landing\.ts/.test(l);
  if (!has && !indirect) gaps.push(`Módulo sin test unitario: ${l}`);
  lines.push(`| \`${l}\` | ${has ? '✅' : indirect ? 'cubierto vía acciones y e2e' : '❌ **sin tests**'} |`);
}

// ── Resumen ────────────────────────────────────────────────────────────────────────────────
const count = (re) => all.filter((p) => re.test(rel(p)) && isTest(p)).map(read).join('\n').match(/\b(it|test)(\.each\([^)]*\))?\(/g)?.length ?? 0;
lines.push('', '## Resumen', '', '| | |', '|---|---|',
  `| Acciones del servidor | ${actions.length} (${actions.filter((a) => where(actionTests, a.name).length).length} con tests) |`,
  `| Páginas | ${pages.length} |`, `| Tablas | ${tables.length} |`, `| Triggers | ${triggers.length} |`,
  `| Archivos de test | unitarios ${unitTests.length} · base y acciones ${dbTests.length + actionTests.length} · e2e ${e2eTests.length} |`,
  `| Huecos | ${gaps.length ? '**' + gaps.length + '**' : '0 ✅'} |`);
if (gaps.length) lines.push('', '### Huecos', '', ...gaps.map((g) => `- ${g}`));

mkdirSync(join(root, 'docs'), { recursive: true });
writeFileSync(join(root, 'docs/test-coverage.md'), lines.join('\n') + '\n');
void count;

console.log(gaps.length ? `❌ ${gaps.length} hueco(s):\n` + gaps.map((g) => '  - ' + g).join('\n') : `✅ Todo aparece nombrado en algún test (inventario, no cobertura real): ${actions.length} acciones, ${pages.length} páginas, ${tables.length} tablas, ${triggers.length} triggers.`);
console.log('Planilla escrita en docs/test-coverage.md');
process.exit(gaps.length ? 1 : 0);
