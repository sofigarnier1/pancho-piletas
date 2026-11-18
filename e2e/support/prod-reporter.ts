import type { FullConfig, FullResult, Reporter, Suite, TestCase, TestResult } from '@playwright/test/reporter';
import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { execSync } from 'node:child_process';
import path from 'node:path';
import { ACTIONS_NOT_IN_BROWSER, apiEndpoints, routeTemplate, serverActions } from './inventory';
import type { CovControl, Coverage, FailureContext } from './pw';
import { cleanupE2E } from './cleanup';

// Resultado de cada prueba + cobertura REAL de la corrida contra el inventario del código. Archivos (todos opcionales de configurar):
//  - E2E_REPORT_FILE   e2e-results.json   estado, tiempo, error y NOTA AUTOMÁTICA de cada prueba (se reescribe tras cada una)
//  - E2E_PLAN_FILE     e2e-plan.json      todas las pruebas de la corrida, en orden: sirve para saber desde dónde reanudar
//  - E2E_COVERAGE_FILE e2e-coverage.json  acciones, endpoints y controles ejecutados vs. existentes (al terminar)
//  - E2E_RAW_FILE      e2e-raw.json       lo ya cubierto, para que una corrida reanudada sume sobre lo anterior
//  - E2E_LIVE_FILE     e2e-live.json      qué prueba corre ahora (lo lee el tablero)
// E2E_RESUME=1: no parte de cero, conserva lo ya probado (lo reanuda scripts/e2e-reanudar.mjs).
// E2E_REQUIRE_FULL_COVERAGE=1: la corrida termina en rojo si algo del inventario no se ejecutó, aunque todo pase.
type Entry = {
  project: string; file: string; line: number; title: string; status: string; ms: number;
  error: string; url: string; autoNote: string; screenshot: string; video: string; trace: string;
};

const strip = (s: string) => s.replace(/\u001b\[[0-9;]*m/g, '');
const secrets = () => Object.entries(process.env).filter(([k]) => /PASSWORD/i.test(k)).map(([, v]) => v).filter((x): x is string => !!x);
const readJson = <T,>(f: string, fallback: T): T => { try { return JSON.parse(readFileSync(f, 'utf8')) as T; } catch { return fallback; } };
const git = (cmd: string) => { try { return execSync(`git ${cmd}`, { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim(); } catch { return ''; } };

/** Nombre de control sin los datos de la fila ("Editar ZZE2E Pago x1" → "editar") para contar botones, no filas. */
export function controlKey(c: CovControl): string {
  const name = c.name
    .replace(/ZZE2E.*$/i, '')
    .replace(/\S+@\S+/g, '')
    .replace(/\$?\s?[\d][\d.,:/%-]*/g, ' ')
    .replace(/[«»"""'`]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
  return `${routeTemplate(c.path)} | ${c.kind} | ${name}`;
}

/** "Esperado / Recibido" y el motivo, sacados del mensaje de Playwright, en una línea legible. */
function reason(error: string): string {
  const lines = strip(error).split('\n').map((l) => l.trim()).filter(Boolean);
  const first = lines.find((l) => /^(Error|TimeoutError|expect|Se esperaba|[A-Za-z]*Error)/.test(l)) ?? lines[0] ?? '';
  const grab = (k: string) => lines.find((l) => l.startsWith(k))?.slice(k.length).trim();
  const bits = [first.replace(/^Error:\s*/, '').slice(0, 260)];
  const loc = grab('Locator:'), exp = grab('Expected:'), rec = grab('Received:');
  if (loc) bits.push(`elemento: ${loc.slice(0, 140)}`);
  if (exp) bits.push(`esperado: ${exp.slice(0, 120)}`);
  if (rec) bits.push(`obtenido: ${rec.slice(0, 120)}`);
  return bits.join(' · ');
}

export default class ProdReporter implements Reporter {
  private entries: Entry[] = [];
  private root = '';
  private started = new Date().toISOString();
  private out = process.env.E2E_REPORT_FILE ?? 'e2e-results.json';
  private covOut = process.env.E2E_COVERAGE_FILE ?? 'e2e-coverage.json';
  private planOut = process.env.E2E_PLAN_FILE ?? 'e2e-plan.json';
  private rawOut = process.env.E2E_RAW_FILE ?? 'e2e-raw.json';
  private live = process.env.E2E_LIVE_FILE ?? 'e2e-live.json';
  private resume = process.env.E2E_RESUME === '1';
  private running = '';
  private total = 0;
  private actionIds = new Set<string>();
  private api = new Set<string>();
  private chunks = new Set<string>();
  private seen = new Map<string, CovControl>();
  private used = new Set<string>();
  private actionTests = new Map<string, Set<string>>(); // id → títulos de tests que la ejecutaron y pasaron

  onBegin(config: FullConfig, suite: Suite) {
    this.root = config.rootDir;
    const all = suite.allTests();
    this.total = all.length;
    if (this.resume && existsSync(this.planOut)) {
      // Reanudar: el plan completo sigue siendo el de la corrida original; solo se anota la reanudación
      const old = readJson<{ resumes?: string[] }>(this.planOut, {});
      writeFileSync(this.planOut, JSON.stringify({ ...old, resumes: [...(old.resumes ?? []), this.started] }, null, 1));
      this.entries = readJson<{ entries: Entry[] }>(this.out, { entries: [] }).entries;
      const raw = readJson<{ actionIds?: string[]; api?: string[]; chunks?: string[]; seen?: [string, CovControl][]; used?: string[]; actionTests?: [string, string[]][] }>(this.rawOut, {});
      raw.actionIds?.forEach((x) => this.actionIds.add(x)); raw.api?.forEach((x) => this.api.add(x)); raw.chunks?.forEach((x) => this.chunks.add(x));
      raw.seen?.forEach(([k, c]) => this.seen.set(k, c)); raw.used?.forEach((x) => this.used.add(x));
      raw.actionTests?.forEach(([k, v]) => this.actionTests.set(k, new Set(v)));
    } else {
      mkdirSync(path.dirname(path.resolve(this.planOut)), { recursive: true });
      writeFileSync(this.planOut, JSON.stringify({
        started: this.started, commit: git('rev-parse --short HEAD'),
        tests: all.map((t) => ({ project: t.parent.project()?.name ?? '', file: path.relative(this.root, t.location.file), line: t.location.line, title: t.titlePath().slice(3).join(' › ') })),
      }, null, 1));
    }
    this.writeLive(false);
  }

  /** Qué prueba corre ahora y cuánto lleva (lo lee el tablero: e2e/support/dashboard.html + scripts/e2e-dashboard.mjs). */
  onTestBegin(test: TestCase) {
    this.running = `${path.relative(this.root, test.location.file)} › ${test.titlePath().slice(3).join(' › ')}`;
    this.writeLive(false);
  }

  private writeLive(finished: boolean) {
    writeFileSync(this.live, JSON.stringify({
      started: this.started, updated: new Date().toISOString(), finished, running: finished ? '' : this.running, total: this.total, resume: this.resume,
      coverage: { actionIds: this.actionIds.size, api: this.api.size, controlsSeen: this.seen.size, controlsUsed: this.used.size },
    }));
  }

  /** Nota que escribe sola la prueba al fallar: dónde estaba, qué decía la pantalla, qué contestó el servidor. */
  private autoNote(test: TestCase, result: TestResult, error: string): string {
    const fc = result.attachments.find((a) => a.name === 'failure-context')?.body;
    const ctx = fc ? (JSON.parse(fc.toString()) as FailureContext) : null;
    const lines: string[] = [`Qué falló: ${reason(error)}`];
    const pg = ctx?.pages.find((p) => p.url && p.url !== 'about:blank') ?? ctx?.pages[0];
    if (pg) {
      let where = pg.url;
      try { const u = new URL(pg.url); where = u.pathname + u.search; } catch { /* url rara */ }
      lines.push(`Dónde: ${where}${pg.heading ? ` («${pg.heading}»)` : ''}`);
      const said = [...pg.toasts, ...pg.alerts].filter(Boolean);
      if (said.length) lines.push(`La pantalla decía: ${said.join(' | ').slice(0, 300)}`);
    }
    if (ctx?.badResponses.length) lines.push(`El servidor respondió con error: ${ctx.badResponses.join('; ')}`);
    if (ctx?.consoleErrors.length) lines.push(`Errores de consola: ${ctx.consoleErrors.slice(0, 4).join(' || ')}`);
    lines.push(`Prueba: ${test.titlePath().slice(3).join(' › ')} (${path.relative(this.root, test.location.file)}:${test.location.line})`);
    let txt = lines.join('\n');
    for (const s of secrets()) txt = txt.split(s).join('***');
    return txt.slice(0, 1600);
  }

  onTestEnd(test: TestCase, result: TestResult) {
    let error = result.errors.map((e) => strip(e.message ?? '')).join('\n---\n').slice(0, 900);
    for (const s of secrets()) error = error.split(s).join('***');
    const title = test.titlePath().slice(3).join(' › ');
    // "blocked" = no corrió porque una prueba anterior del mismo bloque serial falló; "skipped" = omitida a propósito
    const status = result.status === 'skipped' ? (test.annotations.some((x) => x.type === 'skip' || x.type === 'fixme') ? 'skipped' : 'blocked') : result.status;
    const att = (n: string) => result.attachments.find((a) => a.name === n)?.path ?? '';
    const entry: Entry = {
      project: test.parent.project()?.name ?? '',
      file: path.relative(this.root, test.location.file),
      line: test.location.line, title, status, ms: result.duration, error, url: '',
      autoNote: status === 'failed' || status === 'timedOut' || status === 'interrupted' ? this.autoNote(test, result, error) : '',
      screenshot: att('screenshot'), video: att('video'), trace: att('trace'),
    };
    // Al reanudar, el resultado nuevo reemplaza al anterior de la misma prueba
    this.entries = this.entries.filter((e) => !(e.project === entry.project && e.file === entry.file && e.title === entry.title));
    this.entries.push(entry);
    // La cobertura solo cuenta lo que hicieron tests que PASARON: una acción que se ejecutó en un test fallido no está probada
    const cov = result.attachments.find((a) => a.name === 'coverage')?.body;
    if (cov) {
      const c = JSON.parse(cov.toString()) as Coverage;
      for (const x of c.chunks) this.chunks.add(x);
      for (const x of c.seen) { const k = controlKey(x); if (!this.seen.has(k)) this.seen.set(k, x); }
      if (result.status === 'passed') {
        for (const a of c.actions) { this.actionIds.add(a); if (!this.actionTests.has(a)) this.actionTests.set(a, new Set()); this.actionTests.get(a)!.add(title); }
        for (const a of c.api) this.api.add(a);
        for (const x of c.clicks) this.used.add(controlKey(x));
      }
    }
    this.flush();
    this.writeLive(false);
  }

  async onEnd(result: FullResult): Promise<{ status?: FullResult['status'] } | undefined> {
    this.flush();
    const coverage = await this.coverage();
    mkdirSync(path.dirname(path.resolve(this.covOut)), { recursive: true });
    writeFileSync(this.covOut, JSON.stringify(coverage, null, 1));
    this.writeLive(true);
    // Historial: cada corrida queda guardada para compararla con la siguiente en el tablero
    try {
      const dir = path.join(process.env.E2E_RUNS_DIR ?? 'e2e-runs', this.started.replace(/[:.]/g, '-'));
      mkdirSync(dir, { recursive: true });
      copyFileSync(this.out, path.join(dir, 'results.json'));
      copyFileSync(this.covOut, path.join(dir, 'coverage.json'));
    } catch { /* el historial es un extra: no debe romper la corrida */ }
    const s = coverage.summary;
    console.log(`\nCobertura real: acciones ${s.actions.done}/${s.actions.total} · API ${s.api.done}/${s.api.total} · controles ${s.controls.done}/${s.controls.total}`);
    const bad = this.entries.filter((e) => e.status === 'failed' || e.status === 'timedOut' || e.status === 'interrupted');
    // Siempre se limpia al terminar la corrida (verde o cortada): solo borra filas marcadas ZZE2E.
    // La captura, el error y la nota de la falla ya están guardados; E2E_SKIP_CLEANUP=1 deja los datos para inspeccionarlos.
    if (process.env.E2E_SKIP_CLEANUP !== '1') {
      try { const n = await cleanupE2E(); console.log(`\nLimpieza: ${n} filas de prueba (ZZE2E) borradas de la base.`); }
      catch (e) { console.log('\nNo se pudo limpiar (quedaron filas ZZE2E sin borrar):', String(e).slice(0, 160)); }
    }
    if (bad.length) {
      console.log(`\nLa corrida se cortó en la primera falla: ${bad[0].file} › ${bad[0].title}`);
      console.log('Mirá la nota en el tablero (http://localhost:9323), arreglalo y reanudá con:  node scripts/e2e-reanudar.mjs');
    }
    const full = s.actions.done === s.actions.total && s.api.done === s.api.total && s.controls.done === s.controls.total;
    if (process.env.E2E_REQUIRE_FULL_COVERAGE === '1' && !full && result.status === 'passed') {
      console.log('La corrida queda en ROJO: pasaron todos los tests pero hay partes de la web sin probar (ver E2E_COVERAGE_FILE).');
      return { status: 'failed' };
    }
    return undefined;
  }

  /**
   * Traduce los ids de acción (cabecera next-action) a nombres leyendo el manifiesto que el propio
   * Next genera (server-reference-manifest.json: { node: { [actionId]: { filename, exportedName } } }).
   * Más confiable que parsear los chunks JS (su formato cambia entre webpack y Turbopack).
   * Dev: .next/dev/server/…  ·  Build de producción: .next/server/…
   */
  private async actionNames(): Promise<Map<string, string>> {
    const names = new Map<string, string>();
    type Manifest = { node?: Record<string, { filename?: string; exportedName?: string }> };
    // config.rootDir es el testDir ("./e2e"), no la raíz del repo: la raíz se calcula desde este archivo.
    const repoRoot = path.resolve(__dirname, '../..');
    const candidates = [path.join(repoRoot, '.next/dev/server/server-reference-manifest.json'), path.join(repoRoot, '.next/server/server-reference-manifest.json')];
    for (const p of candidates) {
      try {
        const m = JSON.parse(readFileSync(p, 'utf8')) as Manifest;
        for (const [id, entry] of Object.entries(m.node ?? {})) if (entry.exportedName) names.set(id, entry.exportedName);
      } catch { /* no existe en este modo (dev/prod) */ }
    }
    return names;
  }

  private async coverage() {
    const names = await this.actionNames();
    const executed = new Map<string, string[]>();
    for (const id of this.actionIds) {
      const n = names.get(id) ?? `id:${id.slice(0, 10)}`;
      executed.set(n, [...(executed.get(n) ?? []), ...(this.actionTests.get(id) ?? [])]);
    }
    const all = serverActions().filter((a) => !ACTIONS_NOT_IN_BROWSER.has(a.name));
    // Las que ninguna pantalla usa no se pueden probar como una persona: se informan aparte para revisar si sobran
    const unreachable = all.filter((a) => !a.reachable && !executed.has(a.name)).map((a) => `${a.name} (${a.file})`);
    const inv = all.filter((a) => a.reachable || executed.has(a.name));
    const actionsMissing = inv.filter((a) => !executed.has(a.name)).map((a) => `${a.name} (${a.file})`);

    const endpoints = apiEndpoints();
    // Solo cuentan las llamadas que funcionaron: un 403 o un 500 no prueban el endpoint
    const hit = (e: (typeof endpoints)[number]) => [...this.api].some((x) => { const [m, p, st] = x.split(' '); return m === e.method && e.pattern.test(p) && Number(st) < 400; });
    const apiMissing = endpoints.filter((e) => !hit(e)).map((e) => `${e.method} ${e.route}`);

    const controlsMissing = [...this.seen.keys()].filter((k) => !this.used.has(k)).sort();
    return {
      generated: new Date().toISOString(),
      summary: {
        actions: { total: inv.length, done: inv.length - actionsMissing.length },
        api: { total: endpoints.length, done: endpoints.length - apiMissing.length },
        controls: { total: this.seen.size, done: this.seen.size - controlsMissing.length },
      },
      actionsMissing, apiMissing, controlsMissing,
      actionsWithoutScreen: unreachable,
      actionsExecuted: Object.fromEntries([...executed.entries()].map(([k, v]) => [k, [...new Set(v)].slice(0, 5)])),
      unknownActionIds: [...executed.keys()].filter((k) => k.startsWith('id:')),
    };
  }

  private flush() {
    mkdirSync(path.dirname(path.resolve(this.out)), { recursive: true });
    writeFileSync(this.out, JSON.stringify({ started: this.started, updated: new Date().toISOString(), entries: this.entries }, null, 1));
    // Lo cubierto hasta ahora, para que una corrida reanudada continúe sumando
    writeFileSync(this.rawOut, JSON.stringify({
      actionIds: [...this.actionIds], api: [...this.api], chunks: [...this.chunks], seen: [...this.seen.entries()], used: [...this.used],
      actionTests: [...this.actionTests.entries()].map(([k, v]) => [k, [...v]]),
    }));
  }
}
