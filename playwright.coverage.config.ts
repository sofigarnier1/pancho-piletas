import { defineConfig, devices } from '@playwright/test';
import { buildE2eEnv, TEST_PORT } from './e2e/support/env';
import { getTarget } from './e2e/support/target';

// Suite "acción por acción": corre (casi) toda la suite existente a través del reporter de cobertura
// (e2e/support/prod-reporter.ts), que mide qué tanto del inventario real del código (acciones de
// servidor, endpoints, controles de pantalla) se ejecutó — no solo si los tests pasaron.
//
// Por defecto corre contra Supabase LOCAL, igual que el resto de la suite (ver e2e/support/target.ts).
// Contra producción: E2E_TARGET=prod + E2E_ALLOW_PROD_WRITE=1 + las variables E2E_PROD_* (crea y
// borra filas marcadas ZZE2E — ver e2e/support/cleanup.ts). Ese modo todavía no tiene su propio
// sembrado de datos: por ahora solo sirve para medir cobertura corriendo contra Supabase local.
const target = getTarget();
if (target.mode === 'local' && process.env.E2E_ENV_READY !== '1') {
  Object.assign(process.env, buildE2eEnv(), { E2E_ENV_READY: '1' });
}

export default defineConfig({
  testDir: './e2e',
  globalSetup: target.mode === 'local' ? './e2e/global-setup.ts' : undefined,
  fullyParallel: false,
  workers: 1,
  forbidOnly: !!process.env.CI,
  retries: 0,
  reporter: [['./e2e/support/prod-reporter.ts']],
  expect: { timeout: 10_000 },
  use: { baseURL: target.appUrl, trace: 'on-first-retry', screenshot: 'only-on-failure' },
  projects: [
    { name: 'setup', testMatch: /auth\.setup\.ts/ },
    // admin/employee/client.spec.ts dependen de la storageState del PROYECTO (no se loguean solos, a
    // diferencia de flows/health/quality/auth que manejan su propia sesión por archivo o por describe).
    { name: 'admin', use: { ...devices['Desktop Chrome'], storageState: 'playwright/.auth/admin.json' }, dependencies: ['setup'], testMatch: ['**/admin.spec.ts'] },
    { name: 'employee', use: { ...devices['Desktop Chrome'], storageState: 'playwright/.auth/employee.json' }, dependencies: ['setup'], testMatch: ['**/employee.spec.ts'] },
    { name: 'client', use: { ...devices['Desktop Chrome'], storageState: 'playwright/.auth/client.json' }, dependencies: ['setup'], testMatch: ['**/client.spec.ts'] },
    {
      name: 'coverage',
      use: { ...devices['Desktop Chrome'] },
      dependencies: ['setup'],
      testMatch: ['**/landing.spec.ts', '**/auth.spec.ts', '**/health.spec.ts', '**/quality.spec.ts', '**/flows/**/*.spec.ts'],
    },
  ],
  webServer: target.mode === 'local' ? {
    command: `npm run dev -- --port ${TEST_PORT}`,
    url: target.appUrl,
    reuseExistingServer: false, // nunca reutilizar un servidor que pueda apuntar a producción
    timeout: 120_000,
    env: buildE2eEnv(),
  } : undefined,
});
