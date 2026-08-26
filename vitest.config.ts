import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';

export default defineConfig({
  resolve: {
    alias: { '@': fileURLToPath(new URL('./', import.meta.url)) },
  },
  test: {
    // Integration tests share one disposable database and apply DDL, so test
    // files must not run concurrently. Unit tests are fast enough that losing
    // parallelism costs nothing here.
    fileParallelism: false,
    projects: [
      {
        resolve: { alias: { '@': fileURLToPath(new URL('./', import.meta.url)) } },
        test: {
          name: 'unit',
          include: ['tests/unit/**/*.test.ts'],
          environment: 'node',
        },
      },
      {
        resolve: { alias: { '@': fileURLToPath(new URL('./', import.meta.url)) } },
        test: {
          name: 'integration',
          include: ['tests/integration/**/*.test.ts'],
          environment: 'node',
          // Integration tests talk to a disposable local PostgreSQL; they are
          // opt-in via TEST_DATABASE_URL so a clean checkout without a
          // database still passes `pnpm test:unit`.
          testTimeout: 30_000,
          hookTimeout: 60_000,
        },
      },
    ],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'lcov'],
      include: ['lib/domain/**/*.ts'],
      thresholds: {
        // Decision A1: the domain is pure, so it is cheap to cover well.
        // Raised to 90% branches when Phase 4 lands the real domain logic.
        branches: 0,
        functions: 0,
        lines: 0,
        statements: 0,
      },
    },
  },
});
