import { defineConfig, devices } from '@playwright/test';
import { buildE2eEnv, TEST_APP_URL, TEST_PORT } from './e2e/support/env';

// Los tests corren SIEMPRE contra Supabase local (ver e2e/support/env.ts). Se asignan las
// variables al proceso: los workers las heredan y el servidor de Next las recibe por `env`.
if (process.env.E2E_ENV_READY !== '1') {
  Object.assign(process.env, buildE2eEnv(), { E2E_ENV_READY: '1' });
}

export default defineConfig({
  testDir: './e2e',
  globalSetup: './e2e/global-setup.ts',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  reporter: process.env.CI ? [['line'], ['junit', { outputFile: 'results/junit.xml' }], ['html', { open: 'never' }]] : 'html',
  use: {
    baseURL: TEST_APP_URL,
    trace: 'on-first-retry',
  },
  projects: [
    // ─── Auth setup (runs once before authenticated projects) ────────────────
    {
      name: 'setup',
      testMatch: /auth\.setup\.ts/,
    },

    // ─── Public tests (no auth) ──────────────────────────────────────────────
    {
      name: 'public:chromium',
      use: { ...devices['Desktop Chrome'] },
      testMatch: ['**/landing.spec.ts', '**/auth.spec.ts'],
    },
    {
      name: 'public:mobile',
      use: { ...devices['iPhone 13'] },
      testMatch: ['**/landing.spec.ts'],
    },

    // ─── Salud de todas las páginas por rol (solo lectura) ───────────────────
    {
      name: 'health',
      use: { ...devices['Desktop Chrome'] },
      dependencies: ['setup'],
      testMatch: ['**/health.spec.ts', '**/quality.spec.ts', '**/manual-ayuda.spec.ts'],
    },

    // ─── Regresión visual (bajo demanda: npm run test:visual) ────────────────
    {
      name: 'visual',
      use: { ...devices['Desktop Chrome'] },
      dependencies: ['setup'],
      testMatch: ['**/visual.spec.ts'],
    },

    // ─── Admin tests ─────────────────────────────────────────────────────────
    {
      name: 'admin',
      use: { ...devices['Desktop Chrome'], storageState: 'playwright/.auth/admin.json' },
      dependencies: ['setup'],
      testMatch: ['**/admin.spec.ts'],
    },

    // ─── Employee tests ──────────────────────────────────────────────────────
    {
      name: 'employee',
      use: { ...devices['Desktop Chrome'], storageState: 'playwright/.auth/employee.json' },
      dependencies: ['setup'],
      testMatch: ['**/employee.spec.ts'],
    },

    // ─── Seguridad: rutas por rol, redirecciones y (opcional) RLS ────────────
    {
      name: 'security',
      use: { ...devices['Desktop Chrome'] },
      dependencies: ['setup'],
      testMatch: ['**/security.spec.ts'],
    },

    // ─── Client tests ────────────────────────────────────────────────────────
    {
      name: 'client',
      use: { ...devices['Desktop Chrome'], storageState: 'playwright/.auth/client.json' },
      dependencies: ['setup'],
      testMatch: ['**/client.spec.ts'],
    },
  ],
  webServer: {
    command: `npm run dev -- --port ${TEST_PORT}`,
    url: TEST_APP_URL,
    // Nunca reutilizar un servidor ya levantado: podría estar apuntando a producción.
    reuseExistingServer: false,
    timeout: 120_000,
    env: buildE2eEnv(),
  },
});
