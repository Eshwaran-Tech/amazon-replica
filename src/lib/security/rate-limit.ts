import { createHash } from 'node:crypto';

import { ObjectId } from 'mongodb';

import { rateLimitsCollection } from '@/lib/db/collections';

import '@/lib/server-guard';

/**
 * Distributed rate limiting, backed by MongoDB.
 *
 * The store is deliberately *not* process memory. A serverless or
 * multi-instance deployment runs many isolated processes, so an in-memory
 * counter gives an attacker N times the allowance simply by being
 * load-balanced across N instances -- and resets to zero on every cold start.
 * Correctness here requires a counter every instance shares.
 *
 * The mechanism is a fixed window incremented with one atomic `findOneAndUpdate`
 * (`$inc` plus `$setOnInsert`). Atomicity is what makes it safe under
 * concurrency: two simultaneous requests cannot both read "4" and both write
 * "5". A TTL index on `expiresAt` clears old windows without a cron job.
 *
 * Fixed windows allow a burst across a boundary (up to 2x the limit spanning
 * two adjacent windows). That is an accepted trade-off for one round trip per
 * check; a sliding-log or token-bucket implementation costs more. If you need
 * the tighter guarantee, Redis with `INCR`+`EXPIRE` or a Lua token bucket is
 * the drop-in upgrade -- `checkRateLimit` is the only function to reimplement.
 */

export interface RateLimitRule {
  /** Requests permitted per window. */
  limit: number;
  /** Window length in seconds. */
  windowSeconds: number;
}

export interface RateLimitResult {
  allowed: boolean;
  limit: number;
  remaining: number;
  /** When the current window ends. Drives the `Retry-After` header. */
  resetAt: Date;
  retryAfterSeconds: number;
}

/**
 * Named rules.
 *
 * Login is the tightest because it guards a credential. It is enforced twice --
 * per IP *and* per email -- because each alone is bypassable: an attacker with
 * a proxy pool defeats the per-IP limit, and an attacker spraying one password
 * across many accounts defeats the per-account limit. Together they cover both
 * brute force and credential stuffing.
 */
export const RATE_LIMIT_RULES = {
  'auth:login:ip': { limit: 20, windowSeconds: 600 },
  'auth:login:account': { limit: 8, windowSeconds: 900 },
  'auth:register:ip': { limit: 5, windowSeconds: 3600 },
  'auth:forgot-password:ip': { limit: 5, windowSeconds: 3600 },
  'auth:forgot-password:account': { limit: 3, windowSeconds: 3600 },
  'auth:reset-password:ip': { limit: 10, windowSeconds: 3600 },
  'auth:verify-email:ip': { limit: 10, windowSeconds: 3600 },
  'auth:change-password:user': { limit: 10, windowSeconds: 3600 },
  // The identifier step reveals whether an account exists (the storefront's
  // chosen sign-in UX), so it is throttled harder than anything else here.
  'auth:identify:ip': { limit: 20, windowSeconds: 600 },
  'auth:identify:identifier': { limit: 8, windowSeconds: 3600 },
  // OTP delivery costs money on a real SMS provider and is a harassment
  // vector; verification is the online guessing surface for a 6-digit code.
  'auth:otp:send:ip': { limit: 10, windowSeconds: 3600 },
  'auth:otp:send:identifier': { limit: 5, windowSeconds: 3600 },
  'auth:otp:verify:identifier': { limit: 12, windowSeconds: 900 },

  'search:ip': { limit: 120, windowSeconds: 60 },
  'suggest:ip': { limit: 300, windowSeconds: 60 },

  'cart:user': { limit: 120, windowSeconds: 60 },
  'checkout:user': { limit: 10, windowSeconds: 600 },
  'payment:user': { limit: 15, windowSeconds: 600 },
  'account:user': { limit: 30, windowSeconds: 600 },
  'orders:cancel:user': { limit: 10, windowSeconds: 3600 },
  // A top-up opens a ledger row; paying one is a payment attempt. Both are
  // throttled per user so neither can be used to flood the ledger.
  'wallet:topup:user': { limit: 10, windowSeconds: 600 },
  'wallet:pay:user': { limit: 15, windowSeconds: 600 },
  // A gift card code is bearer money, so redemption is the one place someone
  // would sit and guess. Codes are long and random, but the attempt rate is
  // capped anyway.
  'wallet:giftcard:user': { limit: 10, windowSeconds: 600 },

  'review:user': { limit: 5, windowSeconds: 3600 },

  // The bulk-gifting enquiry form is open to anyone, signed in or not, which is
  // exactly why it needs a bound by address rather than by account.
  'contact:ip': { limit: 5, windowSeconds: 3600 },

  'admin:mutation:user': { limit: 200, windowSeconds: 60 },
  'api:general:ip': { limit: 300, windowSeconds: 60 },
} as const satisfies Record<string, RateLimitRule>;

export type RateLimitName = keyof typeof RATE_LIMIT_RULES;

/**
 * Builds the counter key.
 *
 * The identifier is hashed, for two reasons: an email address is personal data
 * that should not sit in a collection with a permissive read scope, and hashing
 * bounds the key length so a crafted 10KB identifier cannot bloat the index.
 */
function buildKey(name: RateLimitName, identifier: string, windowStart: number): string {
  const digest = createHash('sha256')
    .update(identifier.toLowerCase(), 'utf8')
    .digest('base64url')
    .slice(0, 32);

  return `${name}:${digest}:${windowStart}`;
}

/**
 * Consumes one unit from a bucket.
 *
 * Fails **open** on a database error: a transient outage should degrade the
 * rate limiter, not take the whole site down with it. That is a deliberate
 * availability trade-off, and it is safe only because rate limiting is not the
 * control that protects data -- authentication, authorisation and ownership
 * checks are, and none of them fail open.
 */
export async function checkRateLimit(
  name: RateLimitName,
  identifier: string,
): Promise<RateLimitResult> {
  const rule: RateLimitRule = RATE_LIMIT_RULES[name];
  const now = Date.now();
  const windowMs = rule.windowSeconds * 1000;
  const windowStart = Math.floor(now / windowMs) * windowMs;
  const resetAt = new Date(windowStart + windowMs);

  const allow = (remaining: number): RateLimitResult => ({
    allowed: true,
    limit: rule.limit,
    remaining,
    resetAt,
    retryAfterSeconds: 0,
  });

  try {
    const collection = await rateLimitsCollection();

    // One round trip, atomic. `upsert` plus `$inc` means concurrent requests
    // serialise on the document rather than racing a read-then-write.
    const document = await collection.findOneAndUpdate(
      { key: buildKey(name, identifier, windowStart) },
      {
        $inc: { count: 1 },
        $setOnInsert: {
          _id: new ObjectId(),
          windowStart: new Date(windowStart),
          expiresAt: resetAt,
        },
      },
      { upsert: true, returnDocument: 'after' },
    );

    const count = document?.count ?? 1;

    if (count > rule.limit) {
      return {
        allowed: false,
        limit: rule.limit,
        remaining: 0,
        resetAt,
        retryAfterSeconds: Math.max(1, Math.ceil((resetAt.getTime() - now) / 1000)),
      };
    }

    return allow(Math.max(0, rule.limit - count));
  } catch {
    // Never let the limiter's own failure become an outage.
    return allow(rule.limit);
  }
}

/**
 * Checks several buckets and returns the first rejection.
 *
 * Used where one action has two independent budgets, e.g. login is limited per
 * IP and per account at the same time.
 */
export async function checkRateLimits(
  checks: Array<{ name: RateLimitName; identifier: string }>,
): Promise<RateLimitResult> {
  let strictest: RateLimitResult | null = null;

  for (const check of checks) {
    const result = await checkRateLimit(check.name, check.identifier);
    if (!result.allowed) return result;
    if (!strictest || result.remaining < strictest.remaining) strictest = result;
  }

  return (
    strictest ?? {
      allowed: true,
      limit: 0,
      remaining: 0,
      resetAt: new Date(),
      retryAfterSeconds: 0,
    }
  );
}

/**
 * Clears a bucket. Called after a *successful* login so that a user who
 * mistyped their password several times is not left throttled.
 */
export async function resetRateLimit(name: RateLimitName, identifier: string): Promise<void> {
  const rule: RateLimitRule = RATE_LIMIT_RULES[name];
  const windowMs = rule.windowSeconds * 1000;
  const windowStart = Math.floor(Date.now() / windowMs) * windowMs;

  try {
    const collection = await rateLimitsCollection();
    await collection.deleteOne({ key: buildKey(name, identifier, windowStart) });
  } catch {
    // Best effort: failing to clear a bucket is a minor annoyance, not a fault.
  }
}

/** Standard headers so clients can back off intelligently. */
export function rateLimitHeaders(result: RateLimitResult): Record<string, string> {
  const headers: Record<string, string> = {
    'RateLimit-Limit': String(result.limit),
    'RateLimit-Remaining': String(result.remaining),
    'RateLimit-Reset': String(Math.ceil(result.resetAt.getTime() / 1000)),
  };

  if (!result.allowed) {
    headers['Retry-After'] = String(result.retryAfterSeconds);
  }

  return headers;
}
