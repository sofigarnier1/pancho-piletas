import { defineConfig, devices } from '@playwright/test';
import { buildE2eEnv, TEST_APP_URL, TEST_PORT } from './e2e/support/env';

// Capturas y PDF del manual de usuario: leen la base local recién sembrada.
//  - npm run manual:capturas  → una foto por pantalla declarada en src/content/manual
//  - npm run manual:pdf       → el manual de cada rol en PDF (docs/manual/)
//  - npm run manual:generar   → las dos cosas, en ese orden
// Necesitan Docker y `npm run db:test:start`.
if (process.env.E2E_ENV_READY !== '1') {
  Object.assign(process.env, buildE2eEnv(), { E2E_ENV_READY: '1' });
}

export default defineConfig({
  testDir: './e2e',
  globalSetup: './e2e/global-setup.ts',
  fullyParallel: false,
  workers: 1,
  reporter: 'line',
  expect: { timeout: 15_000 },
  use: { baseURL: TEST_APP_URL },
  projects: [
    { name: 'setup', testMatch: /auth\.setup\.ts/ },
    { name: 'manual', use: { ...devices['Desktop Chrome'] }, dependencies: ['setup'], testMatch: ['**/manual-capturas.spec.ts', '**/manual-pdf.spec.ts'] },
  ],
  webServer: {
    command: `npm run dev -- --port ${TEST_PORT}`,
    url: TEST_APP_URL,
    reuseExistingServer: false, // nunca reutilizar un servidor que pueda apuntar a producción
    timeout: 120_000,
    env: buildE2eEnv(),
  },
});
