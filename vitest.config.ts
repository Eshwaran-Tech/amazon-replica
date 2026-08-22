import { fileURLToPath } from 'node:url';

import { defineConfig } from 'vitest/config';

export default defineConfig({
  // Vite resolves tsconfig `paths` (our `@/*` alias) natively; the
  // vite-tsconfig-paths plugin is no longer needed.
  resolve: {
    tsconfigPaths: true,
    alias: {
      // `server-only` throws under plain Node because the `react-server` export
      // condition is absent. Stub it so tests can import modules that carry the
      // real build-time guard in the application bundle.
      'server-only': fileURLToPath(new URL('./tests/stubs/server-only.ts', import.meta.url)),
    },
  },

  test: {
    environment: 'node',
    globals: false,
    include: ['tests/**/*.test.ts'],

    // One in-process MongoDB replica set for the whole run.
    globalSetup: ['tests/global-setup.ts'],
    setupFiles: ['tests/setup.ts'],

    // A cold mongod start and bcrypt at cost 12 both exceed the 5s default.
    testTimeout: 30_000,
    hookTimeout: 120_000,

    // Security tests assert on shared state (rate-limit counters, unique
    // indexes, stock levels). Running files in parallel against one database
    // makes those assertions flaky, so serialise at the file level.
    fileParallelism: false,
  },
});
