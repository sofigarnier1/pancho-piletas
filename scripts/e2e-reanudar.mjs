#!/usr/bin/env node
// Reanuda una corrida acción-por-acción DESDE LA PRIMERA PRUEBA QUE NO PASÓ, sin repetir lo que ya pasó.
//   node scripts/e2e-reanudar.mjs               reanuda desde la primera falla (si lo arreglado no puede afectar a lo anterior)
//   node scripts/e2e-reanudar.mjs --continuar   reanuda aunque se hayan tocado archivos compartidos (bajo tu responsabilidad)
//   node scripts/e2e-reanudar.mjs --ver         solo muestra qué reanudaría, sin correr nada
//   scripts/e2e-run.sh                          corrida completa desde cero
//
// Regla: se reanuda por ARCHIVO. Dentro de un archivo las pruebas suelen depender una de otra (bloques seriales con datos
// compartidos), así que el archivo donde falló se vuelve a correr entero y después todos los que faltaban.
// Si desde la corrida se tocó código COMPARTIDO (base/auth/componentes comunes/soporte de los tests/config), lo ya
// probado pudo quedar afectado: en ese caso se rechaza reanudar y hay que correr todo de nuevo.
import { spawnSync } from 'node:child_process';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';

const F = { plan: process.env.E2E_PLAN_FILE ?? 'e2e-plan.json', results: process.env.E2E_REPORT_FILE ?? 'e2e-results.json' };
const args = new Set(process.argv.slice(2));
const read = (f) => { try { return JSON.parse(readFileSync(f, 'utf8')); } catch { return null; } };

// Lo que, si cambió, puede afectar a pruebas que ya pasaron
const SHARED = [
  /^src\/lib\//, /^src\/proxy\.ts$/, /^src\/components\/ui\//, /^src\/components\/(layout|auth)\//,
  /^src\/app\/admin\/layout\.tsx$/, /^src\/app\/employee\/layout\.tsx$/, /^src\/app\/client\/layout\.tsx$/, /^src\/app\/\(auth\)\/layout\.tsx$/,
  /^next\.config/, /^package\.json$/, /^playwright.*\.config\.ts$/, /^supabase\/migrations\//,
  /^e2e\/support\//,
];
const walk = (d, out = []) => { for (const e of readdirSync(d, { withFileTypes: true })) { const p = path.join(d, e.name); if (e.isDirectory()) { if (!['node_modules', '.next', '.git', 'test-results', 'e2e-runs', 'playwright-report', 'playwright-report-flows'].includes(e.name)) walk(p, out); } else out.push(p); } return out; };

const plan = read(F.plan), res = read(F.results);
if (!plan || !res) { console.error('No hay una corrida anterior (faltan e2e-plan.json y e2e-results.json). Corré scripts/e2e-run.sh.'); process.exit(1); }

const key = (e) => `${e.project}|${e.file}|${e.title}`;
const done = new Map(res.entries.map((e) => [key(e), e.status]));
// Pendiente = todo lo del plan que no pasó (falló, no corrió, se cortó o nunca llegó a correr). Las omitidas a propósito no.
const pending = plan.tests.filter((t) => { const s = done.get(key(t)); return s !== 'passed' && s !== 'skipped'; });
if (!pending.length) { console.log('No queda nada pendiente: todo lo planeado pasó.'); process.exit(0); }

const files = [...new Set(pending.map((t) => t.file))];
const projects = [...new Set(pending.map((t) => t.project))].filter((p) => !/^(setup|setup-client|e2e-setup|e2e-teardown)$/.test(p));
const firstBad = res.entries.find((e) => ['failed', 'timedOut', 'interrupted'].includes(e.status));

// ¿Se tocó algo compartido desde que empezó la corrida?
const since = new Date(plan.started).getTime();
const changed = walk('.').filter((f) => /^(src|e2e|scripts|supabase)\//.test(f.replace(/^\.\//, '')) || /^(next\.config|package\.json|playwright.*\.config)/.test(f.replace(/^\.\//, '')))
  .map((f) => f.replace(/^\.\//, '')).filter((f) => { try { return statSync(f).mtimeMs > since; } catch { return false; } });
// El tablero (HTML) solo muestra resultados: cambiarlo no puede afectar a pruebas ya hechas
const shared = changed.filter((f) => SHARED.some((r) => r.test(f)) && f !== 'e2e/support/dashboard.html');

console.log(`Corrida original: ${plan.started} (commit ${plan.commit || '?'})`);
if (firstBad) console.log(`Primera falla: ${firstBad.file} › ${firstBad.title}`);
console.log(`Pendiente: ${pending.length} pruebas en ${files.length} archivos, en los proyectos: ${projects.join(', ')}`);
console.log(`Archivos modificados desde la corrida: ${changed.length}${changed.length ? '\n  ' + changed.slice(0, 12).join('\n  ') + (changed.length > 12 ? `\n  … y ${changed.length - 12} más` : '') : ''}`);

if (shared.length && !args.has('--continuar')) {
  console.log(`\n⚠ Se modificó código COMPARTIDO, que puede afectar a pruebas que ya habían pasado:\n  ${shared.slice(0, 12).join('\n  ')}`);
  console.log('\nNo se reanuda. Corré TODO de nuevo:   scripts/e2e-run.sh');
  console.log('(Si estás seguro de que no afecta a lo anterior: node scripts/e2e-reanudar.mjs --continuar)');
  process.exit(2);
}
if (args.has('--ver')) { console.log('\n--ver: no se corrió nada. Archivos que se correrían:\n  ' + files.join('\n  ')); process.exit(0); }

console.log(shared.length ? '\nReanudando con --continuar (se tocó código compartido, sin garantía sobre lo anterior)…' : '\nLo modificado no es compartido: se reanuda desde la falla.');
const r = spawnSync('scripts/e2e-run.sh', [...files, ...projects.map((p) => `--project=${p}`)], { stdio: 'inherit', env: { ...process.env, E2E_RESUME: '1' } });
process.exit(r.status ?? 1);
