import { afterEach, describe, expect, it, vi } from 'vitest';

/**
 * `SITE_URL` is the origin every canonical tag, every `<loc>` in the sitemap,
 * the `Host` line in `robots.txt` and every Open Graph URL is built from. If it
 * resolves to the wrong thing, the whole site points search engines somewhere
 * else -- which is exactly what happened on the first production deploy, where
 * a stale value sent all 113 sitemap URLs at a domain that returned 451.
 *
 * It is computed once at module load from the environment, so each case has to
 * reset the module registry before importing.
 */
async function loadSiteUrl(): Promise<string> {
  vi.resetModules();
  const { SITE_URL } = await import('@/lib/brand');
  return SITE_URL;
}

describe('SITE_URL resolution', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('uses NEXT_PUBLIC_APP_URL when it is set', async () => {
    vi.stubEnv('NEXT_PUBLIC_APP_URL', 'https://shop.example.in');
    await expect(loadSiteUrl()).resolves.toBe('https://shop.example.in');
  });

  it('strips trailing slashes so paths never double up', async () => {
    vi.stubEnv('NEXT_PUBLIC_APP_URL', 'https://shop.example.in///');
    await expect(loadSiteUrl()).resolves.toBe('https://shop.example.in');
  });

  it('treats a blank value as unset rather than as an empty origin', async () => {
    // The regression this guards: `??` accepts '', which yields a SITE_URL of
    // '' and turns every canonical into a relative URL.
    vi.stubEnv('NEXT_PUBLIC_APP_URL', '   ');
    vi.stubEnv('NEXT_PUBLIC_VERCEL_PROJECT_PRODUCTION_URL', '');
    await expect(loadSiteUrl()).resolves.toBe('http://localhost:3000');
  });

  it("falls back to Vercel's production domain and adds the scheme", async () => {
    vi.stubEnv('NEXT_PUBLIC_APP_URL', '');
    vi.stubEnv('NEXT_PUBLIC_VERCEL_PROJECT_PRODUCTION_URL', 'my-store.vercel.app');
    await expect(loadSiteUrl()).resolves.toBe('https://my-store.vercel.app');
  });

  it('prefers an explicit value over the Vercel domain', async () => {
    vi.stubEnv('NEXT_PUBLIC_APP_URL', 'https://eshwaran.in');
    vi.stubEnv('NEXT_PUBLIC_VERCEL_PROJECT_PRODUCTION_URL', 'my-store.vercel.app');
    await expect(loadSiteUrl()).resolves.toBe('https://eshwaran.in');
  });

  it('falls back to localhost when nothing is configured', async () => {
    vi.stubEnv('NEXT_PUBLIC_APP_URL', '');
    vi.stubEnv('NEXT_PUBLIC_VERCEL_PROJECT_PRODUCTION_URL', '');
    await expect(loadSiteUrl()).resolves.toBe('http://localhost:3000');
  });

  it('builds absolute URLs with exactly one slash', async () => {
    vi.stubEnv('NEXT_PUBLIC_APP_URL', 'https://shop.example.in/');
    vi.resetModules();
    const { absoluteUrl } = await import('@/lib/brand');
    expect(absoluteUrl('/products')).toBe('https://shop.example.in/products');
    expect(absoluteUrl('products')).toBe('https://shop.example.in/products');
    expect(absoluteUrl()).toBe('https://shop.example.in/');
  });
});
