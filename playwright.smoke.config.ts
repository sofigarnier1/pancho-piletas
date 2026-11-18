import { defineConfig, devices } from '@playwright/test';
import { buildE2eEnv, TEST_APP_URL, TEST_PORT, TEST_USERS } from './e2e/support/env';

// Smoke post-deploy. Con SMOKE_URL prueba esa URL (producción o preview) sin tocar ninguna base.
// Sin SMOKE_URL levanta un servidor local contra Supabase local, con los usuarios de test.
const remote = process.env.SMOKE_URL;

if (!remote && process.env.E2E_ENV_READY !== '1') {
  Object.assign(process.env, buildE2eEnv(), { E2E_ENV_READY: '1' });
  for (const [role, u] of Object.entries(TEST_USERS)) {
    process.env[`SMOKE_${role.toUpperCase()}_EMAIL`] ??= u.email;
    process.env[`SMOKE_${role.toUpperCase()}_PASSWORD`] ??= u.password;
  }
}

export default defineConfig({
  testDir: './e2e/smoke',
  globalSetup: remote ? undefined : './e2e/global-setup.ts',
  fullyParallel: false,
  workers: 1,
  retries: remote ? 1 : 0,
  reporter: process.env.CI ? [['line'], ['junit', { outputFile: 'results/junit-smoke.xml' }]] : 'list',
  use: { baseURL: remote ?? TEST_APP_URL, trace: 'on-first-retry' },
  projects: [{ name: 'smoke', use: { ...devices['Desktop Chrome'] } }],
  webServer: remote ? undefined : {
    command: `npm run dev -- --port ${TEST_PORT}`,
    url: TEST_APP_URL,
    reuseExistingServer: false,
    timeout: 120_000,
    env: buildE2eEnv(),
  },
});
