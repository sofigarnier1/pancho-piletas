import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';

export default defineConfig({
  resolve: { alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) } },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
    // TZ distinta de Argentina a propósito: demuestra que dates.ts no depende del huso del servidor
    env: { TZ: 'UTC' },
  },
});
