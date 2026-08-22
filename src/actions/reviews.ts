'use server';

import { ObjectId } from 'mongodb';
import { cookies } from 'next/headers';
import { revalidatePath } from 'next/cache';

import { CSRF_FIELD_NAME, SESSION_COOKIE_NAME } from '@/lib/auth/constants';
import { readCsrfCookie } from '@/lib/auth/cookies';
import { getRequestContext, getSession } from '@/lib/auth/guards';
import type { FormState } from '@/lib/forms/state';
import { csrfSubject, verifyCsrf } from '@/lib/security/csrf';
import { logSecurityEvent } from '@/lib/security/logger';
import { checkRateLimit } from '@/lib/security/rate-limit';
import { createReviewSchema, deleteReviewSchema, updateReviewSchema } from '@/lib/validations/review';
import { fieldErrors } from '@/lib/validations/common';
import { createReview, deleteReview, updateReview } from '@/services/reviews';

/**
 * Review Server Actions.
 *
 * The author is always the session. There is no schema field for a user id, a
 * user name, or a verified-purchase flag -- the service derives all three, and
 * a form that submits them anyway fails strict validation.
 */

async function verifyActionCsrf(formData: FormData): Promise<boolean> {
  const submitted = formData.get(CSRF_FIELD_NAME);
  const cookieToken = await readCsrfCookie();
  const store = await cookies();
  const subject = csrfSubject(store.get(SESSION_COOKIE_NAME)?.value ?? null);

  const result = verifyCsrf(cookieToken, typeof submitted === 'string' ? submitted : null, subject);
  if (!result.ok) {
    logSecurityEvent({
      type: 'csrf.rejected',
      severity: 'warn',
      detail: { surface: 'reviews-action', reason: result.reason },
    });
  }
  return result.ok;
}

const CSRF_FAILURE: FormState = {
  ok: false,
  message: 'Your session expired. Please refresh the page and try again.',
};

interface ReviewContext {
  userId: ObjectId;
  userName: string;
}

async function requireReviewContext(): Promise<ReviewContext | FormState> {
  const session = await getSession();
  if (!session) return { ok: false, message: 'Please sign in to manage reviews.' };
  if (!session.user.verified) {
    return {
      ok: false,
      message: 'Please verify your mobile number or email address before writing reviews.',
    };
  }

  const limit = await checkRateLimit('review:user', session.user.id);
  if (!limit.allowed) {
    return { ok: false, message: 'Too many review changes. Please try again later.' };
  }

  return { userId: new ObjectId(session.user.id), userName: session.user.name };
}

function isFormState(value: ReviewContext | FormState): value is FormState {
  return 'ok' in value;
}

export async function createReviewAction(
  _previous: FormState,
  formData: FormData,
): Promise<FormState> {
  if (!(await verifyActionCsrf(formData))) return CSRF_FAILURE;

  const context = await requireReviewContext();
  if (isFormState(context)) return context;

  const parsed = createReviewSchema.safeParse({
    productId: formData.get('productId'),
    rating: formData.get('rating'),
    title: formData.get('title'),
    comment: formData.get('comment'),
  });
  if (!parsed.success) {
    return { ok: false, fields: fieldErrors(parsed.error), message: 'Please check the highlighted fields.' };
  }

  const request = await getRequestContext();
  const result = await createReview(context.userId, context.userName, parsed.data, request);
  if (!result.ok) return { ok: false, message: result.message };

  revalidatePath(`/products/${result.productSlug}`);
  return { ok: true, message: 'Thank you -- your review has been published.' };
}

export async function updateReviewAction(
  _previous: FormState,
  formData: FormData,
): Promise<FormState> {
  if (!(await verifyActionCsrf(formData))) return CSRF_FAILURE;

  const context = await requireReviewContext();
  if (isFormState(context)) return context;

  const parsed = updateReviewSchema.safeParse({
    reviewId: formData.get('reviewId'),
    rating: formData.get('rating'),
    title: formData.get('title'),
    comment: formData.get('comment'),
  });
  if (!parsed.success) {
    return { ok: false, fields: fieldErrors(parsed.error), message: 'Please check the highlighted fields.' };
  }

  const result = await updateReview(context.userId, parsed.data);
  if (!result.ok) return { ok: false, message: result.message };

  if (result.productSlug) revalidatePath(`/products/${result.productSlug}`);
  return { ok: true, message: 'Your review has been updated.' };
}

export async function deleteReviewAction(
  _previous: FormState,
  formData: FormData,
): Promise<FormState> {
  if (!(await verifyActionCsrf(formData))) return CSRF_FAILURE;

  const context = await requireReviewContext();
  if (isFormState(context)) return context;

  const parsed = deleteReviewSchema.safeParse({ reviewId: formData.get('reviewId') });
  if (!parsed.success) return { ok: false, message: 'We could not find that review.' };

  const request = await getRequestContext();
  const result = await deleteReview(context.userId, parsed.data.reviewId, request);
  if (!result.ok) return { ok: false, message: result.message };

  if (result.productSlug) revalidatePath(`/products/${result.productSlug}`);
  return { ok: true, message: 'Your review has been deleted.' };
}
