import { describe, expect, it } from 'vitest';

import { allowedOrigins, checkRequestOrigin } from '@/lib/security/origin';

/**
 * The regression these guard is a live one: the first production deploy had
 * NEXT_PUBLIC_APP_URL naming one Vercel alias while the site was actually
 * reached on another. Every state-changing request -- sign in, register, add to
 * cart, buy now -- was rejected as `untrusted-origin`, and the only thing the
 * visitor saw was "Something went wrong".
 *
 * The check must keep failing closed for genuinely foreign origins while
 * accepting the other names the platform serves this same deployment under.
 */
const PROD = {
  appUrl: 'https://shop.example.in',
  isDev: false,
  host: 'shop.example.in',
};

describe('allowedOrigins', () => {
  it('accepts the configured app URL in production', () => {
    expect([...allowedOrigins(PROD)]).toEqual(['https://shop.example.in']);
  });

  it('does not trust the Host header in production', () => {
    // Host is attacker-controllable behind some proxies, so `Host: evil.com`
    // must not be able to satisfy its own check.
    const origins = allowedOrigins({ ...PROD, host: 'evil.example' });
    expect(origins.has('https://evil.example')).toBe(false);
  });

  it('trusts the Host header in development, where localhost has many names', () => {
    const origins = allowedOrigins({
      appUrl: 'http://localhost:3000',
      host: '192.168.1.20:3000',
      isDev: true,
    });
    expect(origins.has('http://192.168.1.20:3000')).toBe(true);
  });

  it('adds platform-supplied origins for the same deployment', () => {
    const origins = allowedOrigins({
      ...PROD,
      extraOrigins: ['https://shop-pearl.vercel.app', 'https://shop-abc123.vercel.app'],
    });
    expect(origins.has('https://shop-pearl.vercel.app')).toBe(true);
    expect(origins.has('https://shop-abc123.vercel.app')).toBe(true);
    expect(origins.has('https://shop.example.in')).toBe(true);
  });

  it('ignores unparseable extra origins rather than throwing', () => {
    const origins = allowedOrigins({ ...PROD, extraOrigins: ['', 'not a url', '///'] });
    expect([...origins]).toEqual(['https://shop.example.in']);
  });
});

describe('checkRequestOrigin', () => {
  const post = (origin: string | null, extraOrigins?: string[]) =>
    checkRequestOrigin({
      method: 'POST',
      origin,
      referer: null,
      host: PROD.host,
      appUrl: PROD.appUrl,
      extraOrigins,
      isDev: false,
    });

  it('allows a POST from the configured origin', () => {
    expect(post('https://shop.example.in')).toEqual({ ok: true });
  });

  it('rejects a POST from an alias that is not declared anywhere', () => {
    expect(post('https://shop-pearl.vercel.app')).toEqual({
      ok: false,
      reason: 'untrusted-origin',
    });
  });

  it('allows that same alias once the platform reports it', () => {
    expect(post('https://shop-pearl.vercel.app', ['https://shop-pearl.vercel.app'])).toEqual({
      ok: true,
    });
  });

  it('still rejects a genuinely foreign origin when extras are present', () => {
    expect(post('https://evil.example', ['https://shop-pearl.vercel.app'])).toEqual({
      ok: false,
      reason: 'untrusted-origin',
    });
  });

  it('fails closed when the browser sends no origin at all', () => {
    expect(post(null)).toEqual({ ok: false, reason: 'missing-origin' });
  });

  it("treats a literal 'null' origin as absent", () => {
    expect(post('null')).toEqual({ ok: false, reason: 'missing-origin' });
  });

  it('leaves safe methods alone', () => {
    expect(
      checkRequestOrigin({
        method: 'GET',
        origin: 'https://evil.example',
        referer: null,
        host: PROD.host,
        appUrl: PROD.appUrl,
        isDev: false,
      }),
    ).toEqual({ ok: true });
  });
});
