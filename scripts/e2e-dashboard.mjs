#!/usr/bin/env node
// Tablero local de las corridas de Playwright acción-por-acción. Lee los archivos que escribe el reporter
// (e2e-live.json, e2e-results.json, e2e-coverage.json, e2e-runs/) y guarda tus notas en e2e-notes.json.
// Es independiente de la corrida: se puede abrir antes, durante o después, y mostrar corridas anteriores.
//   node scripts/e2e-dashboard.mjs            → http://localhost:9323
//   E2E_DASHBOARD_PORT=9400 node scripts/e2e-dashboard.mjs
import http from 'node:http';
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = process.cwd();
const PORT = Number(process.env.E2E_DASHBOARD_PORT ?? 9323);
const HTML = path.join(path.dirname(fileURLToPath(import.meta.url)), '../e2e/support/dashboard.html');
const F = {
  live: process.env.E2E_LIVE_FILE ?? 'e2e-live.json',
  results: process.env.E2E_REPORT_FILE ?? 'e2e-results.json',
  coverage: process.env.E2E_COVERAGE_FILE ?? 'e2e-coverage.json',
  notes: process.env.E2E_NOTES_FILE ?? 'e2e-notes.json',
  runs: process.env.E2E_RUNS_DIR ?? 'e2e-runs',
  plan: process.env.E2E_PLAN_FILE ?? 'e2e-plan.json',
};
const read = (f, fallback) => { try { return JSON.parse(readFileSync(path.resolve(ROOT, f), 'utf8')); } catch { return fallback; } };
const send = (res, code, body, type = 'application/json; charset=utf-8') => { res.writeHead(code, { 'content-type': type, 'cache-control': 'no-store' }); res.end(typeof body === 'string' ? body : JSON.stringify(body)); };
const runsList = () => (existsSync(F.runs) ? readdirSync(F.runs).filter((d) => existsSync(path.join(F.runs, d, 'results.json'))).sort().reverse() : []);

const server = http.createServer((req, res) => {
  const url = new URL(req.url ?? '/', `http://localhost:${PORT}`);
  if (url.pathname === '/') return send(res, 200, readFileSync(HTML, 'utf8'), 'text/html; charset=utf-8');
  if (url.pathname === '/api/state') {
    const results = read(F.results, { entries: [] });
    return send(res, 200, { live: read(F.live, null), results, coverage: read(F.coverage, null), notes: read(F.notes, {}), runs: runsList(), plan: read(F.plan, null) });
  }
  // Capturas y videos de las fallas (solo imágenes/videos dentro del proyecto o de la carpeta de salida de Playwright)
  if (url.pathname === '/api/file') {
    const f = path.resolve(url.searchParams.get('p') ?? '');
    const okDir = [ROOT, path.resolve(process.env.E2E_OUTPUT_DIR ?? 'test-results')].some((d) => f.startsWith(d + path.sep));
    const type = { '.png': 'image/png', '.jpg': 'image/jpeg', '.webm': 'video/webm' }[path.extname(f).toLowerCase()];
    if (!okDir || !type || !existsSync(f)) return send(res, 404, { error: 'no existe' });
    res.writeHead(200, { 'content-type': type, 'cache-control': 'no-store' });
    return res.end(readFileSync(f));
  }
  if (url.pathname === '/api/run') {
    const id = (url.searchParams.get('id') ?? '').replace(/[^0-9A-Za-z_-]/g, '');
    const dir = path.join(F.runs, id);
    if (!id || !existsSync(dir)) return send(res, 404, { error: 'no existe esa corrida' });
    return send(res, 200, { id, results: read(path.join(dir, 'results.json'), { entries: [] }), coverage: read(path.join(dir, 'coverage.json'), null) });
  }
  if (url.pathname === '/api/note' && req.method === 'POST') {
    let body = '';
    req.on('data', (c) => { body += c; if (body.length > 20_000) req.destroy(); });
    req.on('end', () => {
      try {
        const { key, text } = JSON.parse(body);
        if (typeof key !== 'string' || typeof text !== 'string') return send(res, 400, { error: 'datos inválidos' });
        const notes = read(F.notes, {});
        if (text.trim()) notes[key] = { text: text.slice(0, 2000), at: new Date().toISOString() };
        else delete notes[key];
        mkdirSync(path.dirname(path.resolve(ROOT, F.notes)), { recursive: true });
        writeFileSync(path.resolve(ROOT, F.notes), JSON.stringify(notes, null, 1));
        send(res, 200, { ok: true });
      } catch { send(res, 400, { error: 'JSON inválido' }); }
    });
    return;
  }
  send(res, 404, { error: 'no encontrado' });
});

server.on('error', (e) => {
  if (e.code === 'EADDRINUSE') console.log(`El tablero ya está abierto en http://localhost:${PORT}`);
  else console.error(e);
  process.exit(e.code === 'EADDRINUSE' ? 0 : 1);
});
// Solo localhost: el tablero muestra errores y notas de la base real
server.listen(PORT, '127.0.0.1', () => console.log(`Tablero de pruebas: http://localhost:${PORT}  (Ctrl+C para cerrar)`));
