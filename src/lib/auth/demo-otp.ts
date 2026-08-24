import { env } from '@/lib/env';

import '@/lib/server-guard';

/**
 * Whether one-time passwords are shown on screen instead of being delivered.
 *
 * This replaces an earlier in-memory buffer that captured codes on their way to
 * the console transport. That buffer could not work on a serverless host: the
 * action that sends a code and the request that renders the verification page
 * are separate invocations with separate module state, so the code was usually
 * gone by the time the page looked for it. The code now travels in the signed
 * auth-flow cookie instead -- see `demoOtp` in `flow.ts`.
 *
 * **This is account takeover as a feature.** Anyone who can reach the sign-in
 * page can enter another person's address, ask for a code and read it. It is
 * meant for a demonstration deployment with no real accounts, and it is off
 * unless DEMO_SHOW_OTP is exactly "true".
 *
 * Deliberately not `NEXT_PUBLIC_`: the server decides, and the code only
 * reaches a browser that asked for it.
 */
export function showOtpOnScreen(): boolean {
  return env().DEMO_SHOW_OTP === 'true';
}

/** The code to put in the flow cookie: the real one, or nothing. */
export function demoOtpFor(code: string): { demoOtp?: string } {
  return showOtpOnScreen() ? { demoOtp: code } : {};
}
