import type { Transporter } from 'nodemailer';

import { BRAND_NAME } from '@/lib/brand';
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

export interface SmtpConnection {
  host: string;
  port: number;
  secure: boolean;
  auth?: { user: string; pass: string };
}

/**
 * Turns an SMTP connection URL into explicit settings.
 *
 * Parsed here rather than handed to nodemailer as a string so the credentials
 * can be percent-decoded deliberately: a password containing `@`, `/` or `:`
 * must be encoded in the URL, exactly as in MONGODB_URI, and would otherwise be
 * silently mis-split at the wrong character.
 *
 * The port defaults by scheme -- 465 for implicit TLS, 587 for STARTTLS --
 * because getting `secure` and the port out of step is the classic way to make
 * a working provider look broken.
 */
export function parseSmtpUrl(value: string): SmtpConnection {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error('SMTP_URL is not a valid URL (expected smtp:// or smtps://)');
  }

  if (url.protocol !== 'smtp:' && url.protocol !== 'smtps:') {
    throw new Error(`SMTP_URL must use smtp:// or smtps://, not ${url.protocol}//`);
  }

  const secure = url.protocol === 'smtps:';

  return {
    host: url.hostname,
    port: Number(url.port) || (secure ? 465 : 587),
    secure,
    ...(url.username
      ? { auth: { user: decodeURIComponent(url.username), pass: decodeURIComponent(url.password) } }
      : {}),
  };
}

/**
 * One connection pool per process, built lazily.
 *
 * Built on first use rather than at module load so importing this file never
 * opens a socket -- the console transport, and every test, must stay offline.
 * `nodemailer` is imported dynamically for the same reason: it is a Node-only
 * package and must not be pulled into a bundle that never sends mail.
 */
let transporter: Transporter | null = null;

async function getTransporter(): Promise<Transporter> {
  if (transporter) return transporter;

  const { createTransport } = await import('nodemailer');

  // A URL rather than a pile of host/port/user/pass variables: one secret to
  // set, one to rotate, and it is the form every provider documents.
  //   smtps://user:pass@smtp.provider.com:465   (implicit TLS)
  //   smtp://user:pass@smtp.provider.com:587    (STARTTLS)
  transporter = createTransport({
    ...parseSmtpUrl(env().SMTP_URL),
    pool: true,
    // A serverless invocation is short-lived; waiting the 2-minute default on a
    // dead provider would hold the request open long past the point the user
    // gave up and pressed the button again.
    connectionTimeout: 10_000,
    greetingTimeout: 10_000,
    socketTimeout: 15_000,
  });

  return transporter;
}

async function sendViaSmtp(message: EmailMessage): Promise<void> {
  const mailer = await getTransporter();

  await mailer.sendMail({
    from: env().EMAIL_FROM,
    to: message.to,
    subject: message.subject,
    // Plain text only, deliberately -- see the note at the top of this file.
    text: message.body,
  });
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
    subject: `Verify your ${BRAND_NAME} email address`,
    body: [
      `Hello ${name},`,
      '',
      `Confirm your email address to finish setting up your ${BRAND_NAME} account:`,
      '',
      link,
      '',
      'This link expires in 24 hours and can be used once.',
      'If you did not create an account, you can ignore this message.',
      '',
      `-- ${BRAND_NAME}`,
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
    subject: `${code} is your ${BRAND_NAME} OTP`,
    body: [
      `Your ${BRAND_NAME} one-time password (OTP) is: ${code}`,
      '',
      `It is valid for ${ttlMinutes} minutes and can be used once.`,
      `Do not share it with anyone -- ${BRAND_NAME} will never ask you for it.`,
      '',
      'If you did not request this, you can ignore this message; nothing changes',
      'without the code.',
      '',
      `-- ${BRAND_NAME}`,
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
    subject: 'You already have an account',
    body: [
      `Hello ${name},`,
      '',
      'Someone just tried to create an account with this email address --',
      'but you already have one.',
      '',
      `If that was you, simply sign in: ${appUrl('/auth/login')}`,
      `Forgotten your password? Reset it here: ${appUrl('/auth/forgot-password')}`,
      '',
      'If this was not you, no action is needed: no account was created and',
      'nothing about yours has changed.',
      '',
      `-- ${BRAND_NAME}`,
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
    subject: `Reset your ${BRAND_NAME} password`,
    body: [
      `Hello ${name},`,
      '',
      `We received a request to reset your ${BRAND_NAME} password. Use this link:`,
      '',
      link,
      '',
      'This link expires in 30 minutes and can be used once.',
      '',
      'If you did not request this, no action is needed -- your password has not',
      'changed. Someone may have mistyped their address.',
      '',
      `-- ${BRAND_NAME}`,
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
      `-- ${BRAND_NAME}`,
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
      `-- ${BRAND_NAME}`,
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
    subject: `Your ${BRAND_NAME} password was changed`,
    body: [
      `Hello ${name},`,
      '',
      `Your ${BRAND_NAME} password was just changed, and all other devices have been`,
      'signed out.',
      '',
      'If this was not you, reset your password immediately and contact support.',
      '',
      `-- ${BRAND_NAME}`,
    ].join('\n'),
  });
}
