/**
 * Test stub for the `server-only` package.
 *
 * The real package resolves to a module that throws unless the bundler sets the
 * `react-server` export condition -- which is exactly the guarantee we want in
 * the application build, and exactly what breaks a plain-Node test runner.
 *
 * Aliasing it here (see `vitest.config.ts`) lets production code keep the real
 * build-time guard while the test suite can still import those modules.
 */
export {};
