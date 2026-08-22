/**
 * Runtime guard for modules that must never reach the browser.
 *
 * Why not the `server-only` package here?
 * `server-only` throws at *bundle* time, which is stricter and is what we use
 * in modules consumed exclusively by Next.js (see `src/lib/auth/*`). But it
 * also throws under plain Node, because Node does not set the `react-server`
 * export condition -- which would break `pnpm seed` and the index scripts that
 * legitimately reuse the database layer.
 *
 * So: shared-with-scripts modules import this guard, Next-only modules import
 * `server-only`. Both paths end with "this code cannot run in a browser".
 */
if (typeof window !== 'undefined') {
  throw new Error(
    'A server-only module was imported into client code. ' +
      'Check for a missing "use server" boundary or an import from a "use client" component.',
  );
}

export {};
