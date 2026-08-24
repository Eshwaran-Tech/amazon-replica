import { showOtpOnScreen } from '@/lib/auth/demo-otp';

import { DevOtpPanel } from './dev-otp-panel';

/**
 * The current one-time password, shown on the page rather than delivered.
 *
 * A Server Component, so the decision is made on the server and the flag never
 * reaches the client bundle. Two gates have to agree before a code renders:
 * `DEMO_SHOW_OTP` must be exactly "true", and the signed flow cookie must
 * actually carry a code -- which only happens for the browser that asked for
 * one, in the same fifteen-minute flow.
 *
 * Showing a one-time password to whoever loads the page is account takeover,
 * not a convenience. This exists for a demonstration deployment with no real
 * accounts; see `lib/auth/demo-otp.ts`.
 */
export function DevOtpNotice({ code }: { code: string | null | undefined }) {
  if (!code || !showOtpOnScreen()) return null;

  return <DevOtpPanel code={code} />;
}
