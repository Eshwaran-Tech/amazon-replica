import { afterEach, describe, expect, it, vi } from 'vitest';

/**
 * The development OTP helper exists so a tester can finish signing up without
 * reading the server log. Showing a one-time password to whoever loads the
 * page is account takeover, so the only thing that really matters here is that
 * it is inert in production -- these tests pin that.
 *
 * The module is re-imported per test because the production check is read
 * through `isProduction()`, which the stub below controls.
 */

const isProduction = vi.hoisted(() => vi.fn(() => false));

vi.mock('@/lib/env', () => ({
  isProduction,
  isDevelopment: () => !isProduction(),
  env: () => ({ NODE_ENV: isProduction() ? 'production' : 'development' }),
}));

async function freshModule() {
  vi.resetModules();
  return import('@/lib/auth/dev-otp-inbox');
}

afterEach(() => {
  isProduction.mockReturnValue(false);
});

describe('dev OTP inbox: production is inert', () => {
  it('never returns a code when NODE_ENV is production', async () => {
    isProduction.mockReturnValue(true);
    const { rememberDevOtp, peekDevOtp, devOtpAvailable } = await freshModule();

    rememberDevOtp('someone@example.com', '123456');

    expect(peekDevOtp('someone@example.com')).toBeNull();
    expect(devOtpAvailable()).toBe(false);
  });

  it('does not leak a code remembered before the environment flipped', async () => {
    const { rememberDevOtp, peekDevOtp } = await freshModule();
    rememberDevOtp('someone@example.com', '123456');
    expect(peekDevOtp('someone@example.com')).toBe('123456');

    isProduction.mockReturnValue(true);
    expect(peekDevOtp('someone@example.com')).toBeNull();
  });
});

describe('dev OTP inbox: development behaviour', () => {
  it('returns the most recent code for an address', async () => {
    const { rememberDevOtp, peekDevOtp } = await freshModule();

    rememberDevOtp('a@example.com', '111111');
    rememberDevOtp('a@example.com', '222222');

    expect(peekDevOtp('a@example.com')).toBe('222222');
  });

  it('matches an address regardless of case or padding', async () => {
    const { rememberDevOtp, peekDevOtp } = await freshModule();

    rememberDevOtp('Ramesh21@Gmail.com', '424242');

    expect(peekDevOtp('  ramesh21@gmail.com ')).toBe('424242');
  });

  it('keeps one address code out of another address', async () => {
    const { rememberDevOtp, peekDevOtp } = await freshModule();

    rememberDevOtp('a@example.com', '111111');

    expect(peekDevOtp('b@example.com')).toBeNull();
  });

  it('forgets a code on request', async () => {
    const { rememberDevOtp, peekDevOtp, forgetDevOtp } = await freshModule();

    rememberDevOtp('a@example.com', '111111');
    forgetDevOtp('a@example.com');

    expect(peekDevOtp('a@example.com')).toBeNull();
  });

  it('expires a code after its ten-minute window', async () => {
    vi.useFakeTimers();
    try {
      const { rememberDevOtp, peekDevOtp } = await freshModule();

      rememberDevOtp('a@example.com', '111111');
      vi.advanceTimersByTime(10 * 60 * 1000 + 1);

      expect(peekDevOtp('a@example.com')).toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });

  it('does not grow without bound', async () => {
    const { rememberDevOtp, peekDevOtp } = await freshModule();

    for (let index = 0; index < 200; index += 1) {
      rememberDevOtp(`user${index}@example.com`, '000000');
    }

    // The earliest entries are evicted; the most recent survives.
    expect(peekDevOtp('user0@example.com')).toBeNull();
    expect(peekDevOtp('user199@example.com')).toBe('000000');
  });
});
