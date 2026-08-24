import { afterEach, describe, expect, it, vi } from 'vitest';

/**
 * Showing a one-time password on the page is account takeover offered as a
 * convenience: anyone can type someone else's address, request a code and read
 * it. It is meant only for a demonstration deployment with no real accounts.
 *
 * So the property worth pinning is not that the feature works -- it is that it
 * stays off unless somebody deliberately turned it on, and that a typo,
 * an empty value or a truthy-looking string does not turn it on by accident.
 *
 * The module is re-imported per test because the flag is read through `env()`.
 */

const demoShowOtp = vi.hoisted(() => ({ value: 'false' }));

vi.mock('@/lib/env', () => ({
  env: () => ({ DEMO_SHOW_OTP: demoShowOtp.value }),
  isProduction: () => false,
  isDevelopment: () => true,
}));

async function freshModule() {
  vi.resetModules();
  return import('@/lib/auth/demo-otp');
}

afterEach(() => {
  demoShowOtp.value = 'false';
});

describe('showOtpOnScreen', () => {
  it('is off by default', async () => {
    const { showOtpOnScreen } = await freshModule();
    expect(showOtpOnScreen()).toBe(false);
  });

  it('is on only for exactly "true"', async () => {
    demoShowOtp.value = 'true';
    const { showOtpOnScreen } = await freshModule();
    expect(showOtpOnScreen()).toBe(true);
  });

  for (const value of ['True', 'TRUE', '1', 'yes', 'on', '', ' true ']) {
    it(`fails closed for ${JSON.stringify(value)}`, async () => {
      demoShowOtp.value = value;
      const { showOtpOnScreen } = await freshModule();
      expect(showOtpOnScreen()).toBe(false);
    });
  }
});

describe('demoOtpFor', () => {
  it('withholds the code when the flag is off', async () => {
    const { demoOtpFor } = await freshModule();
    // An empty object rather than `{ demoOtp: undefined }`, so spreading it into
    // the flow cookie adds no key at all.
    expect(demoOtpFor('123456')).toEqual({});
    expect(Object.hasOwn(demoOtpFor('123456'), 'demoOtp')).toBe(false);
  });

  it('carries the code when the flag is on', async () => {
    demoShowOtp.value = 'true';
    const { demoOtpFor } = await freshModule();
    expect(demoOtpFor('123456')).toEqual({ demoOtp: '123456' });
  });
});
