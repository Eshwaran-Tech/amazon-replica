import { rememberDevOtp } from '@/lib/auth/dev-otp-inbox';
import { env } from '@/lib/env';
import { logError } from '@/lib/security/logger';

import '@/lib/server-guard';

/**
 * Outbound email.
 *
 * Two transports:
 *  - `console` (default) writes the message to the server log, so the whole
 *    verification and reset flow is exercisable in development without an SMTP
 *    account. The link is printed because in development it is the only way to
 *    follow it -- which is also why the seed and this transport both refuse to
 *    be the production default.
 *  - `smtp` is the production path.
 *
 * Messages are plain text. No HTML email means no HTML templating, which means
 * no place for an injected `<script>` or a spoofed link to hide, and no
 * user-controlled value ever reaches a markup context.
 */

export interface EmailMessage {
  to: string;
  subject: string;
  body: string;
}

/**
 * Escapes nothing and interpolates nothing structural -- values are placed into
 * plain text only. `name` is already length- and charset-constrained by Zod.
 */
function renderPlainText(message: EmailMessage): string {
  return [
    `To:      ${message.to}`,
    `From:    ${env().EMAIL_FROM}`,
    `Subject: ${message.subject}`,
    '',
    message.body,
  ].join('\n');
}

async function sendViaConsole(message: EmailMessage): Promise<void> {
  // eslint-disable-next-line no-console
  console.info(
    `\n--- EMAIL (development transport) ---\n${renderPlainText(message)}\n--- END EMAIL ---\n`,
  );
}

async function sendViaSmtp(message: EmailMessage): Promise<void> {
  // Intentionally not implemented: adding an SMTP client is a dependency and a
  // deployment decision, not something to guess at. Wire your provider here
  // (Resend, SES, Postmark, nodemailer) and keep the credentials in SMTP_URL.
  throw new Error(
    `SMTP transport is not configured. Set EMAIL_TRANSPORT=console for development, ` +
      `or implement sendViaSmtp() in src/lib/email/index.ts. (message to ${message.to})`,
  );
}

/**
 * Sends a message.
 *
 * Never throws to the caller. An auth flow must not fail because the mail
 * provider is down -- and more importantly, "we could not send the email" must
 * not become a way to tell whether an address is registered. The caller gets no
 * signal either way; failures go to the server log.
 */
export async function sendEmail(message: EmailMessage): Promise<void> {
  try {
    if (env().EMAIL_TRANSPORT === 'smtp') {
      await sendViaSmtp(message);
    } else {
      await sendViaConsole(message);
    }
  } catch (error) {
    logError('Email send failed', error, { to: message.to, subject: message.subject });
  }
}

// ------------------------------------------------------------------ templates

function appUrl(path: string): string {
  return `${env().NEXT_PUBLIC_APP_URL}${path}`;
}

export async function sendVerificationEmail(
  to: string,
  name: string,
  token: string,
): Promise<void> {
  const link = appUrl(`/auth/verify-email?token=${encodeURIComponent(token)}`);

  await sendEmail({
    to,
    subject: 'Verify your amazon email address',
    body: [
      `Hello ${name},`,
      '',
      'Confirm your email address to finish setting up your amazon account:',
      '',
      link,
      '',
      'This link expires in 24 hours and can be used once.',
      'If you did not create an account, you can ignore this message.',
      '',
      '-- amazon',
    ].join('\n'),
  });
}

/** One-time password for sign-in or sign-up by email. */
export async function sendOtpEmail(to: string, code: string, ttlMinutes: number): Promise<void> {
  // Captured before delivery so the verify screen can show it in development.
  // A no-op in production -- see `dev-otp-inbox.ts`.
  rememberDevOtp(to, code);

  await sendEmail({
    to,
    subject: `${code} is your amazon OTP`,
    body: [
      `Your amazon one-time password (OTP) is: ${code}`,
      '',
      `It is valid for ${ttlMinutes} minutes and can be used once.`,
      'Do not share it with anyone -- amazon will never ask you for it.',
      '',
      'If you did not request this, you can ignore this message; nothing changes',
      'without the code.',
      '',
      '-- amazon',
    ].join('\n'),
  });
}

/**
 * Sent to the *existing* owner when someone registers with an address that
 * already has an account. The registering party sees the same "check your
 * email" screen as a real sign-up (no enumeration); the owner gets a truthful
 * notification rather than a verification link that leads nowhere.
 */
export async function sendExistingAccountEmail(to: string, name: string): Promise<void> {
  await sendEmail({
    to,
    subject: 'You already have an amazon account',
    body: [
      `Hello ${name},`,
      '',
      'Someone just tried to create an amazon account with this email address --',
      'but you already have one.',
      '',
      `If that was you, simply sign in: ${appUrl('/auth/login')}`,
      `Forgotten your password? Reset it here: ${appUrl('/auth/forgot-password')}`,
      '',
      'If this was not you, no action is needed: no account was created and',
      'nothing about yours has changed.',
      '',
      '-- amazon',
    ].join('\n'),
  });
}

export async function sendPasswordResetEmail(
  to: string,
  name: string,
  token: string,
): Promise<void> {
  const link = appUrl(`/auth/reset-password?token=${encodeURIComponent(token)}`);

  await sendEmail({
    to,
    subject: 'Reset your amazon password',
    body: [
      `Hello ${name},`,
      '',
      'We received a request to reset your amazon password. Use this link:',
      '',
      link,
      '',
      'This link expires in 30 minutes and can be used once.',
      '',
      'If you did not request this, no action is needed -- your password has not',
      'changed. Someone may have mistyped their address.',
      '',
      '-- amazon',
    ].join('\n'),
  });
}

export async function sendOrderConfirmationEmail(
  to: string,
  name: string,
  orderNumber: string,
  totalFormatted: string,
): Promise<void> {
  await sendEmail({
    to,
    subject: `Order ${orderNumber} confirmed`,
    body: [
      `Hello ${name},`,
      '',
      `Thanks for your order. Your order number is ${orderNumber} and the total`,
      `is ${totalFormatted}.`,
      '',
      'You can follow its progress from Your Orders once signed in.',
      '',
      '-- amazon',
    ].join('\n'),
  });
}

export async function sendOrderCancelledEmail(
  to: string,
  name: string,
  orderNumber: string,
  refund: 'NONE' | 'REFUNDED' | 'REFUND_PENDING',
): Promise<void> {
  const refundLine =
    refund === 'REFUNDED'
      ? 'Your refund has been issued and should reach you in 5-7 business days.'
      : refund === 'REFUND_PENDING'
        ? 'Your refund is being processed; we will confirm once it has been issued.'
        : 'No payment was taken for this order.';

  await sendEmail({
    to,
    subject: `Order ${orderNumber} cancelled`,
    body: [
      `Hello ${name},`,
      '',
      `Your order ${orderNumber} has been cancelled as requested.`,
      refundLine,
      '',
      '-- amazon',
    ].join('\n'),
  });
}

/**
 * Sent after a password actually changes.
 *
 * This is a security control, not a courtesy: if an attacker changes the
 * password, this message is the owner's first and possibly only signal that it
 * happened while they can still act on it.
 */
export async function sendPasswordChangedEmail(to: string, name: string): Promise<void> {
  await sendEmail({
    to,
    subject: 'Your amazon password was changed',
    body: [
      `Hello ${name},`,
      '',
      'Your amazon password was just changed, and all other devices have been',
      'signed out.',
      '',
      'If this was not you, reset your password immediately and contact support.',
      '',
      '-- amazon',
    ].join('\n'),
  });
}
