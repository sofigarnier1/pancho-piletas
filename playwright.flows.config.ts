import { defineConfig, devices } from '@playwright/test';
import { buildE2eEnv, TEST_APP_URL, TEST_PORT } from './e2e/support/env';

// Flujos de punta a punta: MODIFICAN datos y comparten filas (piletas, stock, puntos), por eso
// corren de a uno (1 worker, sin paralelismo) y arrancan desde una base recién sembrada.
if (process.env.E2E_ENV_READY !== '1') {
  Object.assign(process.env, buildE2eEnv(), { E2E_ENV_READY: '1' });
}

export default defineConfig({
  testDir: './e2e',
  globalSetup: './e2e/global-setup.ts',
  fullyParallel: false,
  workers: 1,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['line'], ['junit', { outputFile: 'results/junit-flows.xml' }], ['html', { open: 'never', outputFolder: 'playwright-report-flows' }]] : 'html',
  expect: { timeout: 10_000 },
  use: { baseURL: TEST_APP_URL, trace: 'on-first-retry', screenshot: 'only-on-failure' },
  projects: [
    { name: 'setup', testMatch: /auth\.setup\.ts/ },
    {
      name: 'flows',
      use: { ...devices['Desktop Chrome'] },
      dependencies: ['setup'],
      testMatch: ['**/flows/**/*.spec.ts'],
    },
  ],
  webServer: {
    command: `npm run dev -- --port ${TEST_PORT}`,
    url: TEST_APP_URL,
    reuseExistingServer: false, // nunca reutilizar un servidor que pueda apuntar a producción
    timeout: 120_000,
    env: buildE2eEnv(),
  },
});
