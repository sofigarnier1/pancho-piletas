/**
 * Auth setup — loguea una vez por rol y guarda storageState.
 * Si no hay variables de entorno, guarda un estado vacío y los tests
 * autenticados se saltean solos.
 *
 * Variables requeridas (en .env.test o en el entorno):
 *   TEST_ADMIN_EMAIL / TEST_ADMIN_PASSWORD
 *   TEST_EMPLOYEE_EMAIL / TEST_EMPLOYEE_PASSWORD
 *   TEST_CLIENT_EMAIL / TEST_CLIENT_PASSWORD
 */

import { test as setup, expect } from '@playwright/test';
import path from 'path';
import fs from 'fs';

const AUTH_DIR = 'playwright/.auth';

async function loginAs(
  page: import('@playwright/test').Page,
  email: string,
  password: string,
  expectedUrl: string,
) {
  await page.goto('/login');
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Contraseña', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'Ingresar' }).click();
  await page.waitForURL(expectedUrl, { timeout: 60_000 });
  expect(page.url()).toContain(expectedUrl);
}

function ensureAuthDir() {
  if (!fs.existsSync(AUTH_DIR)) fs.mkdirSync(AUTH_DIR, { recursive: true });
}

function writeEmptyState(filename: string) {
  const p = path.join(AUTH_DIR, filename);
  if (!fs.existsSync(p)) {
    fs.writeFileSync(p, JSON.stringify({ cookies: [], origins: [] }));
  }
}

setup('admin auth', async ({ page }) => {
  ensureAuthDir();
  const email = process.env.TEST_ADMIN_EMAIL;
  const password = process.env.TEST_ADMIN_PASSWORD;

  if (!email || !password) {
    writeEmptyState('admin.json');
    return;
  }

  await loginAs(page, email, password, '/admin/dashboard');
  await page.context().storageState({ path: path.join(AUTH_DIR, 'admin.json') });
});

setup('employee auth', async ({ page }) => {
  ensureAuthDir();
  const email = process.env.TEST_EMPLOYEE_EMAIL;
  const password = process.env.TEST_EMPLOYEE_PASSWORD;

  if (!email || !password) {
    writeEmptyState('employee.json');
    return;
  }

  await loginAs(page, email, password, '/employee/itinerario');
  await page.context().storageState({ path: path.join(AUTH_DIR, 'employee.json') });
});

setup('client auth', async ({ page }) => {
  ensureAuthDir();
  const email = process.env.TEST_CLIENT_EMAIL;
  const password = process.env.TEST_CLIENT_PASSWORD;

  if (!email || !password) {
    writeEmptyState('client.json');
    return;
  }

  await loginAs(page, email, password, '/client/dashboard');
  await page.context().storageState({ path: path.join(AUTH_DIR, 'client.json') });
});

setup('owner auth', async ({ page }) => {
  ensureAuthDir();
  const email = process.env.TEST_OWNER_EMAIL;
  const password = process.env.TEST_OWNER_PASSWORD;

  if (!email || !password) {
    writeEmptyState('owner.json');
    return;
  }

  await loginAs(page, email, password, '/admin/dashboard');
  await page.context().storageState({ path: path.join(AUTH_DIR, 'owner.json') });
});

setup('marketing auth', async ({ page }) => {
  ensureAuthDir();
  const email = process.env.TEST_MARKETING_EMAIL;
  const password = process.env.TEST_MARKETING_PASSWORD;

  if (!email || !password) {
    writeEmptyState('marketing.json');
    return;
  }

  await loginAs(page, email, password, '/admin/dashboard');
  await page.context().storageState({ path: path.join(AUTH_DIR, 'marketing.json') });
});

setup('client2 auth', async ({ page }) => {
  ensureAuthDir();
  const email = process.env.TEST_CLIENT2_EMAIL;
  const password = process.env.TEST_CLIENT2_PASSWORD;

  if (!email || !password) {
    writeEmptyState('client2.json');
    return;
  }

  await loginAs(page, email, password, '/client/dashboard');
  await page.context().storageState({ path: path.join(AUTH_DIR, 'client2.json') });
});
