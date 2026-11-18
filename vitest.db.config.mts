import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';

// Tests contra el Supabase LOCAL real (RLS, triggers, acciones del servidor). Requiere `npm run db:test:start`.
// Los archivos corren de a uno: comparten la misma base y varios modifican y restauran filas.
export default defineConfig({
  resolve: { alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) } },
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    globalSetup: ['./tests/support/global-setup.ts'],
    fileParallelism: false,
    testTimeout: 30_000,
    hookTimeout: 120_000,
    env: { TZ: 'UTC' },
  },
});
