import { BRAND_NAME } from '@/lib/brand';
import { env } from '@/lib/env';
import { logError } from '@/lib/security/logger';

import '@/lib/server-guard';

/**
 * Outbound SMS -- used only for one-time passwords.
 *
 * `console` (the only transport wired today) writes the message to the server
 * log, exactly like the development email transport: the OTP is readable in
 * the terminal running `next dev`, so the whole mobile sign-in and sign-up flow
 * can be exercised without an SMS gateway or a real phone.
 *
 * A production deployment must add a real gateway here (MSG91, Twilio, AWS
 * SNS, ...) and extend `SMS_TRANSPORT` in `src/lib/env.ts`. Until then the
 * mobile flow is development-only, and that is stated rather than hidden.
 */

export interface SmsMessage {
  /** E.164, e.g. +919876543210. */
  to: string;
  body: string;
}

async function sendViaConsole(message: SmsMessage): Promise<void> {
  // eslint-disable-next-line no-console
  console.info(
    `\n--- SMS (development transport) ---\nTo:   ${message.to}\n\n${message.body}\n--- END SMS ---\n`,
  );
}

/** Never throws: delivery problems are logged, not surfaced to the caller. */
export async function sendSms(message: SmsMessage): Promise<void> {
  try {
    // Only one transport exists; the switch is where the real one plugs in.
    if (env().SMS_TRANSPORT === 'console') {
      await sendViaConsole(message);
    }
  } catch (error) {
    logError('SMS send failed', error, { to: message.to });
  }
}

export async function sendOtpSms(to: string, code: string, ttlMinutes: number): Promise<void> {
  await sendSms({
    to,
    body:
      `${code} is your ${BRAND_NAME} one-time password (OTP). It is valid for ${ttlMinutes} minutes. ` +
      `Do not share it with anyone -- ${BRAND_NAME} will never ask you for it.`,
  });
}
