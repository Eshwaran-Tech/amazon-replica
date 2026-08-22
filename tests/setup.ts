/**
 * Per-worker test environment.
 *
 * `MONGODB_URI` and `MONGODB_DB` are set by `tests/global-setup.ts`, which
 * starts an in-process replica set before workers fork. Everything else is
 * pinned here so tests never depend on the developer's `.env.local`.
 */

// @types/node marks NODE_ENV readonly on ProcessEnv. Assert it explicitly so a
// stray NODE_ENV in the shell cannot flip production-only code paths.
Object.assign(process.env, { NODE_ENV: 'test' });

process.env.NEXT_PUBLIC_APP_URL = 'http://localhost:3000';
process.env.PAYMENT_PROVIDER = 'mock';
process.env.EMAIL_TRANSPORT = 'console';
process.env.AUTH_SECRET ??= 'test-secret-value-that-is-long-enough-for-hmac-use';
