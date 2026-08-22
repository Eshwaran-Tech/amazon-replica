import { NextResponse } from 'next/server';
import { ZodError } from 'zod';

import { fieldErrors } from '@/lib/validations/common';
import { logError } from '@/lib/security/logger';

/**
 * Uniform JSON envelope and error taxonomy.
 *
 * Two goals:
 *
 * 1. **Correct status codes.** Returning 200 with `{ok:false}` for every
 *    failure breaks caching, monitoring, retry logic and client error handling.
 *    Each failure here maps to the status that describes it.
 *
 * 2. **No internal detail escapes.** A response carries a stable machine code,
 *    a sentence a customer can act on, and -- for validation only -- which
 *    fields were wrong. Never a stack trace, a driver message, a file path, or
 *    the text of a database error.
 */

export type ApiErrorCode =
  | 'VALIDATION_ERROR'
  | 'UNAUTHENTICATED'
  | 'FORBIDDEN'
  | 'NOT_FOUND'
  | 'CONFLICT'
  | 'RATE_LIMITED'
  | 'CSRF_INVALID'
  | 'PAYMENT_REQUIRED'
  | 'OUT_OF_STOCK'
  | 'METHOD_NOT_ALLOWED'
  | 'PAYLOAD_TOO_LARGE'
  | 'INTERNAL_ERROR';

const STATUS_BY_CODE: Record<ApiErrorCode, number> = {
  VALIDATION_ERROR: 400,
  UNAUTHENTICATED: 401,
  PAYMENT_REQUIRED: 402,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  METHOD_NOT_ALLOWED: 405,
  CONFLICT: 409,
  PAYLOAD_TOO_LARGE: 413,
  // 422 for a business-rule failure on a well-formed request: the request was
  // understood, but the world is not in a state where it can be satisfied.
  OUT_OF_STOCK: 422,
  RATE_LIMITED: 429,
  CSRF_INVALID: 403,
  INTERNAL_ERROR: 500,
};

export interface ApiSuccess<T> {
  ok: true;
  data: T;
}

export interface ApiFailure {
  ok: false;
  error: {
    code: ApiErrorCode;
    message: string;
    /** Present only for VALIDATION_ERROR. Field name -> message. */
    fields?: Record<string, string>;
  };
}

export type ApiResult<T> = ApiSuccess<T> | ApiFailure;

/** Nothing under /api is cacheable: it is personal data or a mutation. */
const NO_STORE = { 'Cache-Control': 'no-store, no-cache, must-revalidate' };

export function apiSuccess<T>(
  data: T,
  init?: { status?: number; headers?: Record<string, string> },
): NextResponse<ApiSuccess<T>> {
  return NextResponse.json(
    { ok: true as const, data },
    { status: init?.status ?? 200, headers: { ...NO_STORE, ...init?.headers } },
  );
}

export function apiError(
  code: ApiErrorCode,
  message: string,
  init?: { fields?: Record<string, string>; headers?: Record<string, string> },
): NextResponse<ApiFailure> {
  return NextResponse.json(
    {
      ok: false as const,
      error: { code, message, ...(init?.fields ? { fields: init.fields } : {}) },
    },
    { status: STATUS_BY_CODE[code], headers: { ...NO_STORE, ...init?.headers } },
  );
}

/** 400 with per-field messages drawn from the schemas, never from input. */
export function apiValidationError(error: ZodError): NextResponse<ApiFailure> {
  return apiError('VALIDATION_ERROR', 'Some of the details you entered need attention.', {
    fields: fieldErrors(error),
  });
}

/**
 * Last-resort handler for an unexpected throw.
 *
 * The real error goes to the server log with a correlation id; the client gets
 * that id and nothing else. Support can find the entry, an attacker learns
 * only that something failed.
 */
export function apiInternalError(error: unknown, context?: Record<string, unknown>): NextResponse<ApiFailure> {
  const reference = crypto.randomUUID().slice(0, 8);

  logError('Unhandled API error', error, { ...context, reference });

  return apiError(
    'INTERNAL_ERROR',
    `Something went wrong on our end. Reference: ${reference}`,
  );
}

/**
 * Typed error that route handlers and services can throw to produce a specific
 * response, instead of returning a discriminated union through every layer.
 */
export class ApiException extends Error {
  constructor(
    readonly code: ApiErrorCode,
    message: string,
    readonly fields?: Record<string, string>,
  ) {
    super(message);
    this.name = 'ApiException';
  }
}

/** Converts anything thrown into a safe response. */
export function toApiResponse(error: unknown, context?: Record<string, unknown>): NextResponse<ApiFailure> {
  if (error instanceof ApiException) {
    return apiError(error.code, error.message, error.fields ? { fields: error.fields } : undefined);
  }

  if (error instanceof ZodError) {
    return apiValidationError(error);
  }

  return apiInternalError(error, context);
}
