import 'server-only';

import type { NextRequest, NextResponse } from 'next/server';
import type { ZodType } from 'zod';

import { CSRF_HEADER_NAME, SESSION_COOKIE_NAME } from '@/lib/auth/constants';
import { readCsrfCookie } from '@/lib/auth/cookies';
import {
  getSession,
  requireApiAdmin,
  requireApiUser,
  requireVerifiedUser,
} from '@/lib/auth/guards';
import type { ResolvedSession } from '@/lib/auth/session';
import { csrfSubject, verifyCsrf } from '@/lib/security/csrf';
import { logSecurityEvent } from '@/lib/security/logger';
import {
  checkRateLimits,
  rateLimitHeaders,
  type RateLimitName,
} from '@/lib/security/rate-limit';
import { clientIp } from '@/lib/security/request';
import { isStateChangingMethod } from '@/lib/security/origin';

import { ApiException, apiError, toApiResponse } from './response';

/**
 * Route handler composition.
 *
 * Every endpoint declares its requirements once, and the checks run in a fixed
 * order that cannot be reordered or skipped by accident:
 *
 *     body size -> CSRF -> rate limit -> authentication -> authorisation
 *              -> schema validation -> handler
 *
 * The order is not arbitrary. The cheapest rejections come first, so an attacker
 * cannot make us do expensive work (a bcrypt comparison, a database read) before
 * we decide to refuse. Authentication precedes validation so an anonymous
 * caller cannot use a well-crafted 400 to probe which fields an endpoint accepts.
 *
 * The point of the wrapper is that "I forgot the auth check" stops being
 * possible: `auth` is a required field on the options object, so writing a new
 * endpoint forces an explicit decision about who may call it.
 */

export type AuthRequirement = 'none' | 'user' | 'verified' | 'admin';

export interface RateLimitSpec {
  name: RateLimitName;
  /** `ip` works for anonymous endpoints; `user` requires `auth` to be set. */
  by: 'ip' | 'user';
}

export interface HandlerContext<TInput> {
  request: NextRequest;
  /** Non-null whenever `auth` is anything other than 'none'. */
  session: ResolvedSession | null;
  /** Parsed and validated input. `undefined` when no schema was declared. */
  input: TInput;
  ip: string;
}

export interface HandlerOptions<TInput> {
  /** Required: forces an explicit access decision on every endpoint. */
  auth: AuthRequirement;
  schema?: ZodType<TInput>;
  rateLimit?: RateLimitSpec[];
  /**
   * CSRF verification. Defaults to on for state-changing methods.
   * Set false only for endpoints authenticated by another means -- a provider
   * webhook verified by signature, for example, where no browser is involved.
   */
  csrf?: boolean;
  /** Body cap. Rejects before parsing, so a huge body costs us nothing. */
  maxBodyBytes?: number;
  /** Where the input comes from. Defaults to the JSON body for mutations. */
  source?: 'json' | 'searchParams' | 'none';
}

const DEFAULT_MAX_BODY_BYTES = 100 * 1024;

/** Reads a JSON body with a hard size cap, before `JSON.parse` sees it. */
async function readJsonBody(request: NextRequest, maxBytes: number): Promise<unknown> {
  const declared = Number(request.headers.get('content-length') ?? '0');
  if (Number.isFinite(declared) && declared > maxBytes) {
    throw new ApiException('PAYLOAD_TOO_LARGE', 'That request was too large.');
  }

  let raw: string;
  try {
    raw = await request.text();
  } catch {
    throw new ApiException('VALIDATION_ERROR', 'Could not read the request body.');
  }

  if (raw.length > maxBytes) {
    throw new ApiException('PAYLOAD_TOO_LARGE', 'That request was too large.');
  }

  if (raw.length === 0) return {};

  try {
    return JSON.parse(raw) as unknown;
  } catch {
    throw new ApiException('VALIDATION_ERROR', 'That request was not valid JSON.');
  }
}

function searchParamsToObject(request: NextRequest): Record<string, string | string[]> {
  const output: Record<string, string | string[]> = Object.create(null) as Record<
    string,
    string | string[]
  >;

  const params = request.nextUrl.searchParams;
  for (const key of new Set(params.keys())) {
    // Prototype-pollution guard, same as the search-params normaliser.
    if (key === '__proto__' || key === 'constructor' || key === 'prototype') continue;
    const values = params.getAll(key);
    const first = values[0];
    if (values.length > 1) output[key] = values;
    else if (first !== undefined) output[key] = first;
  }

  return output;
}

export function defineHandler<TInput = undefined>(
  options: HandlerOptions<TInput>,
  handler: (context: HandlerContext<TInput>) => Promise<NextResponse> | NextResponse,
): (request: NextRequest) => Promise<NextResponse> {
  return async function route(request: NextRequest): Promise<NextResponse> {
    const ip = clientIp(request.headers);

    try {
      const mutating = isStateChangingMethod(request.method);
      const requireCsrf = options.csrf ?? mutating;

      // --- 1. CSRF -------------------------------------------------------
      // Before rate limiting: a forged cross-site request should not consume
      // the victim's rate-limit budget.
      if (requireCsrf) {
        const cookieToken = await readCsrfCookie();
        const submitted = request.headers.get(CSRF_HEADER_NAME);

        // Subject comes from the raw session cookie, matching what the proxy
        // used to mint the token -- no database round trip needed to check it.
        const subject = csrfSubject(request.cookies.get(SESSION_COOKIE_NAME)?.value ?? null);

        const result = verifyCsrf(cookieToken, submitted, subject);

        if (!result.ok) {
          logSecurityEvent({
            type: 'csrf.rejected',
            severity: 'warn',
            ip,
            route: request.nextUrl.pathname,
            detail: { reason: result.reason, method: request.method },
          });
          return apiError('CSRF_INVALID', 'Your session expired. Please refresh and try again.');
        }
      }

      // --- 2. Authentication and authorisation ---------------------------
      let session: ResolvedSession | null = null;

      if (options.auth === 'user') session = await requireApiUser();
      else if (options.auth === 'verified') session = await requireVerifiedUser();
      else if (options.auth === 'admin') session = await requireApiAdmin();
      else session = await getSession();

      // --- 3. Rate limiting ----------------------------------------------
      // After authentication so a `user`-keyed bucket has a user to key on.
      if (options.rateLimit && options.rateLimit.length > 0) {
        const checks = options.rateLimit.map((spec) => ({
          name: spec.name,
          identifier: spec.by === 'user' && session ? session.user.id : ip,
        }));

        const result = await checkRateLimits(checks);

        if (!result.allowed) {
          logSecurityEvent({
            type: 'ratelimit.exceeded',
            severity: 'warn',
            ip,
            userId: session?.user.id,
            route: request.nextUrl.pathname,
          });
          return apiError('RATE_LIMITED', 'Too many requests. Please wait and try again.', {
            headers: rateLimitHeaders(result),
          });
        }
      }

      // --- 4. Input validation -------------------------------------------
      let input = undefined as TInput;

      if (options.schema) {
        const source = options.source ?? (mutating ? 'json' : 'searchParams');

        const raw =
          source === 'json'
            ? await readJsonBody(request, options.maxBodyBytes ?? DEFAULT_MAX_BODY_BYTES)
            : source === 'searchParams'
              ? searchParamsToObject(request)
              : {};

        const parsed = options.schema.safeParse(raw);
        if (!parsed.success) {
          // ZodError is converted by `toApiResponse` into a 400 with per-field
          // messages that come from the schemas, never from the input.
          throw parsed.error;
        }
        input = parsed.data;
      }

      // --- 5. Handler ------------------------------------------------------
      return await handler({ request, session, input, ip });
    } catch (error) {
      return toApiResponse(error, { route: request.nextUrl.pathname, method: request.method });
    }
  };
}

/**
 * Rejects unsupported methods on a route with 405 rather than 404.
 *
 * Next.js returns 405 automatically for a method with no export; this is for
 * routes that need an explicit `Allow` header.
 */
export function methodNotAllowed(allowed: string[]): NextResponse {
  return apiError('METHOD_NOT_ALLOWED', 'That method is not supported here.', {
    headers: { Allow: allowed.join(', ') },
  });
}
