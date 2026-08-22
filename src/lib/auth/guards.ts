import 'server-only';

import { headers } from 'next/headers';
import { notFound, redirect } from 'next/navigation';
import { ObjectId } from 'mongodb';

import { ApiException } from '@/lib/api/response';
import { clientIp, clientUserAgent } from '@/lib/security/request';
import { logSecurityEvent } from '@/lib/security/logger';
import { safeRedirectPath } from '@/lib/security/redirect';

import { LOGIN_PATH } from './constants';
import { readSessionCookie } from './cookies';
import { resolveSession, type ResolvedSession, type SessionUser } from './session';

/**
 * Authorisation guards.
 *
 * These run inside pages, Server Actions and Route Handlers -- *not* only in
 * `proxy.ts`. The Next.js documentation warns that a matcher change can
 * silently drop proxy coverage for a Server Function, so the proxy is treated
 * as a redirect convenience and these are treated as the control.
 *
 * Every guard re-reads the session from the database. Nothing is taken from the
 * request body, and the role is never read from anywhere a client can write.
 */

/** Current session, or null. No redirect, no throw -- for optional-auth pages. */
export async function getSession(): Promise<ResolvedSession | null> {
  const token = await readSessionCookie();
  return resolveSession(token);
}

export async function getCurrentUser(): Promise<SessionUser | null> {
  const session = await getSession();
  return session?.user ?? null;
}

export async function isAuthenticated(): Promise<boolean> {
  return (await getSession()) !== null;
}

// ------------------------------------------------------------------- pages

/**
 * Page guard: requires a signed-in user, else redirects to login.
 *
 * `nextPath` is passed through `safeRedirectPath` before it becomes a query
 * parameter, so a caller cannot accidentally construct an open redirect out of
 * a value that reached it from a URL.
 */
export async function requirePageUser(nextPath?: string): Promise<ResolvedSession> {
  const session = await getSession();
  if (session) return session;

  const target = safeRedirectPath(nextPath, '/');
  redirect(`${LOGIN_PATH}?next=${encodeURIComponent(target)}`);
}

/**
 * Page guard: requires an admin.
 *
 * Renders 404, not 403. A 403 confirms `/admin/users` exists and that the
 * account simply lacks permission, which is useful reconnaissance. A 404 makes
 * the admin area indistinguishable from a URL that was never there.
 *
 * A signed-in non-admin reaching an admin route is worth alerting on: it is
 * either a bug in our navigation or someone probing.
 */
export async function requirePageAdmin(): Promise<ResolvedSession> {
  const session = await getSession();

  if (!session) {
    redirect(`${LOGIN_PATH}?next=${encodeURIComponent('/admin')}`);
  }

  if (session.user.role !== 'ADMIN') {
    const requestHeaders = await headers();
    logSecurityEvent({
      type: 'authz.denied',
      severity: 'warn',
      userId: session.user.id,
      ip: clientIp(requestHeaders),
      detail: { area: 'admin', role: session.user.role },
    });
    notFound();
  }

  return session;
}

// --------------------------------------------------------------------- API

/**
 * API guard: requires a signed-in user, else throws a 401.
 *
 * Separate from the page guard because a `fetch` should receive a status code,
 * not a 307 to an HTML login page that its error handling cannot interpret.
 */
export async function requireApiUser(): Promise<ResolvedSession> {
  const session = await getSession();

  if (!session) {
    throw new ApiException('UNAUTHENTICATED', 'You need to sign in to do that.');
  }

  return session;
}

/**
 * API guard: requires an admin, else throws 403.
 *
 * 403 here rather than the 404 used for pages: an API client that authenticated
 * successfully but lacks permission needs to distinguish "sign in again" from
 * "your account cannot do this", and the endpoint's existence is not a secret
 * worth protecting once the caller is already authenticated.
 */
export async function requireApiAdmin(): Promise<ResolvedSession> {
  const session = await requireApiUser();

  if (session.user.role !== 'ADMIN') {
    const requestHeaders = await headers();
    logSecurityEvent({
      type: 'authz.denied',
      severity: 'warn',
      userId: session.user.id,
      ip: clientIp(requestHeaders),
      detail: { area: 'admin-api', role: session.user.role },
    });
    throw new ApiException('FORBIDDEN', 'You do not have permission to do that.');
  }

  return session;
}

/**
 * Requires a verified email address.
 *
 * Applied to actions with a real-world consequence (placing an order, writing a
 * review) rather than to browsing, so an unverified account is not a dead end
 * but also cannot be used to spam.
 */
export async function requireVerifiedUser(): Promise<ResolvedSession> {
  const session = await requireApiUser();

  if (!session.user.verified) {
    throw new ApiException(
      'FORBIDDEN',
      'Please verify your mobile number or email address before continuing.',
    );
  }

  return session;
}

// --------------------------------------------------------------- ownership

/**
 * Object-level authorisation: the caller owns this resource, or is an admin.
 *
 * This is the check that stops IDOR/BOLA. Having a valid session says *who you
 * are*; it says nothing about whether order `abc` is yours. Every read or write
 * of a per-user resource -- orders, addresses, carts, reviews -- passes through
 * here.
 *
 * Failure raises NOT_FOUND rather than FORBIDDEN. A 403 confirms the id exists,
 * which lets an attacker enumerate valid order ids by status code alone. The
 * caller learns nothing they did not already know.
 */
export function assertOwnership(
  resourceOwnerId: ObjectId | string,
  session: ResolvedSession,
  context?: { resourceType?: string; resourceId?: string },
): void {
  const ownerId =
    resourceOwnerId instanceof ObjectId ? resourceOwnerId.toHexString() : resourceOwnerId;

  if (ownerId === session.user.id) return;
  if (session.user.role === 'ADMIN') return;

  logSecurityEvent({
    type: 'authz.ownership.denied',
    severity: 'warn',
    userId: session.user.id,
    detail: {
      resourceType: context?.resourceType,
      resourceId: context?.resourceId,
    },
  });

  throw new ApiException('NOT_FOUND', 'We could not find that.');
}

/** Boolean form, for deciding whether to render an edit control. */
export function ownsResource(
  resourceOwnerId: ObjectId | string,
  session: ResolvedSession | null,
): boolean {
  if (!session) return false;
  const ownerId =
    resourceOwnerId instanceof ObjectId ? resourceOwnerId.toHexString() : resourceOwnerId;
  return ownerId === session.user.id || session.user.role === 'ADMIN';
}

// ------------------------------------------------------------- request info

export interface RequestContext {
  ip: string;
  userAgent: string | null;
}

export async function getRequestContext(): Promise<RequestContext> {
  const requestHeaders = await headers();
  return {
    ip: clientIp(requestHeaders),
    userAgent: clientUserAgent(requestHeaders),
  };
}
