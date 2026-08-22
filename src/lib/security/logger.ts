/**
 * Structured security logging with redaction at the boundary.
 *
 * The rule this file enforces: a secret must never reach a log sink, even by
 * accident. Logs get shipped to third-party aggregators, pasted into tickets,
 * and read by people who should not see a password reset token. So redaction
 * happens *here*, on the way out, rather than relying on every call site to
 * remember what is sensitive.
 *
 * Output is one JSON object per line, which is what log aggregators want and
 * what makes "alert when `auth.login.failed` exceeds N per minute per IP"
 * a query rather than a regex.
 */

export type Severity = 'info' | 'warn' | 'error';

export interface SecurityEvent {
  /** Dotted event name, e.g. `auth.login.failed`, `authz.denied`. */
  type: string;
  severity: Severity;
  /** Actor, when known. Never an email -- ids are not PII in a log line. */
  userId?: string;
  /** Client IP, best-effort. */
  ip?: string;
  /** Route or action the event happened in. */
  route?: string;
  detail?: Record<string, unknown>;
}

/**
 * Keys whose values are dropped entirely. Matched case-insensitively as a
 * substring, so `passwordHash`, `reset_token` and `PAYMENT_SECRET_KEY` are all
 * covered by the stems below.
 */
const REDACTED_KEY_PATTERN =
  /(pass|secret|token|cookie|authorization|credential|apikey|api_key|privatekey|mongodb|connectionstring|session|cvv|cardnumber|card_number|ssn|otp)/i;

/**
 * Value-level catch-all for secrets that arrive under an innocent key name --
 * a connection string in an error message, a bearer token in a stack trace.
 */
const SECRET_VALUE_PATTERNS: RegExp[] = [
  /mongodb(\+srv)?:\/\/[^\s]*/gi, // connection strings (with credentials)
  /\bBearer\s+[A-Za-z0-9._~+/-]{16,}=*/gi,
  /\bsk_(live|test)_[A-Za-z0-9]{8,}/gi, // Stripe secret keys
  /\bwhsec_[A-Za-z0-9]{8,}/gi, // Stripe webhook secrets
  /\$2[aby]\$\d{2}\$[./A-Za-z0-9]{53}/g, // bcrypt hashes
];

const REDACTION = '[REDACTED]';
const MAX_STRING_LENGTH = 500;
const MAX_DEPTH = 4;

function scrubString(value: string): string {
  let out = value;
  for (const pattern of SECRET_VALUE_PATTERNS) {
    out = out.replace(pattern, REDACTION);
  }
  return out.length > MAX_STRING_LENGTH ? `${out.slice(0, MAX_STRING_LENGTH)}...[truncated]` : out;
}

function redact(value: unknown, depth = 0): unknown {
  if (value === null || value === undefined) return value;

  if (typeof value === 'string') return scrubString(value);
  if (typeof value === 'number' || typeof value === 'boolean') return value;
  if (typeof value === 'bigint') return value.toString();

  // Functions, symbols: never useful in a log, sometimes a closure over secrets.
  if (typeof value === 'function' || typeof value === 'symbol') return undefined;

  if (depth >= MAX_DEPTH) return '[depth-limit]';

  if (value instanceof Date) return value.toISOString();

  if (value instanceof Error) {
    return {
      name: value.name,
      message: scrubString(value.message),
      // Stacks contain absolute filesystem paths; keep them out of shipped logs.
      stack: process.env.NODE_ENV === 'production' ? undefined : scrubString(value.stack ?? ''),
    };
  }

  if (Array.isArray(value)) {
    return value.slice(0, 50).map((item) => redact(item, depth + 1));
  }

  if (typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
      out[key] = REDACTED_KEY_PATTERN.test(key) ? REDACTION : redact(item, depth + 1);
    }
    return out;
  }

  return undefined;
}

function emit(severity: Severity, payload: Record<string, unknown>): void {
  const line = JSON.stringify(payload);

  /* eslint-disable no-console */
  if (severity === 'error') {
    console.error(line);
  } else if (severity === 'warn') {
    console.warn(line);
  } else {
    console.info(line);
  }
  /* eslint-enable no-console */
}

export function logSecurityEvent(event: SecurityEvent): void {
  emit(event.severity, {
    ts: new Date().toISOString(),
    level: event.severity,
    channel: 'security',
    type: event.type,
    userId: event.userId,
    ip: event.ip,
    route: event.route,
    detail: event.detail ? redact(event.detail) : undefined,
  });
}

/**
 * Application errors. Uses the same redaction path so a thrown MongoServerError
 * (whose message can echo the connection string) cannot leak on its way out.
 */
export function logError(message: string, error: unknown, context?: Record<string, unknown>): void {
  emit('error', {
    ts: new Date().toISOString(),
    level: 'error',
    channel: 'app',
    message,
    error: redact(error),
    context: context ? redact(context) : undefined,
  });
}

/** Exported for unit tests -- redaction is a security control and gets tested. */
export const __testing = { redact, scrubString };
