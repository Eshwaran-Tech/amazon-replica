import type { Metadata } from 'next';
import Link from 'next/link';

import { CsrfField } from '@/components/security/csrf-field';
import { getRequestContext, getSession } from '@/lib/auth/guards';
import { tokenSchema } from '@/lib/validations/auth';
import { verifyEmail } from '@/services/auth';

import { AuthAlert, AuthCard, AuthDivider, AuthHeading, AuthLink } from '../ui';
import { ResendVerificationForm } from './resend-form';

export const metadata: Metadata = {
  title: 'Verify your email',
  robots: { index: false, follow: false, nocache: true },
};

interface PageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

const yellowLink =
  'flex h-[31px] w-full items-center justify-center rounded-full border border-[#FCD200] bg-[#FFD814] text-[13px] text-neutral-900 shadow-[0_2px_5px_rgba(15,17,17,.15)] hover:bg-[#F7CA00]';

/**
 * Email verification by link (the sign-up flow itself verifies by OTP; this
 * page serves accounts that still have an unverified email address).
 *
 *  - `?token=` -- following the link from the email
 *  - no token   -- a signed-in user asking for a link ("verify now")
 *
 * Consuming the token on a GET is a deliberate exception to "GET must not
 * change state". Email clients cannot POST, so a verification link has to work
 * as a plain navigation. The risk that rule normally guards against -- a
 * prefetcher or scanner triggering the action -- is acceptable here because the
 * only effect is marking an address the recipient controls as verified, and the
 * token is single-use and short-lived either way.
 */
export default async function VerifyEmailPage({ searchParams }: PageProps) {
  const params = await searchParams;
  const session = await getSession();

  // Signed in, has an email, not verified: the one situation where "send me a
  // new link" is both useful and safe to show.
  const canResend = session !== null && session.user.email !== null && !session.user.emailVerified;
  const resend = canResend ? (
    <>
      <AuthDivider />
      <p className="mb-2 text-[13px]">
        Did the email not arrive? Check your spam folder, or ask for a fresh link.
      </p>
      <ResendVerificationForm csrfField={<CsrfField />} />
    </>
  ) : null;

  const raw = typeof params.token === 'string' ? params.token : '';
  const parsed = tokenSchema.safeParse(raw);

  if (!parsed.success) {
    if (raw === '' && session) {
      return (
        <AuthCard>
          <AuthHeading>Verify your email</AuthHeading>
          {session.user.emailVerified ? (
            <AuthAlert tone="success">Your email address is already verified.</AuthAlert>
          ) : session.user.email ? (
            <AuthAlert tone="info">
              Your address <span className="font-semibold">{session.user.email}</span> is not
              verified yet. Verification is required before placing an order or writing a review.
            </AuthAlert>
          ) : (
            <AuthAlert tone="info">
              This account signs in with a mobile number and has no email address to verify.
              {session.user.phoneVerified ? ' Your mobile number is verified.' : ''}
            </AuthAlert>
          )}
          {resend}
          <div className="mt-4">
            <AuthLink href="/account">Back to your account</AuthLink>
          </div>
        </AuthCard>
      );
    }

    return (
      <AuthCard>
        <AuthHeading>Verification link problem</AuthHeading>
        <AuthAlert tone="error">
          This verification link is not valid. It may have been mistyped or already used.
        </AuthAlert>
        {resend ?? (
          <p className="text-[13px]">
            <AuthLink href="/auth/login">Sign in</AuthLink> to request a new link.
          </p>
        )}
      </AuthCard>
    );
  }

  const context = await getRequestContext();
  const result = await verifyEmail(parsed.data, context);

  return (
    <AuthCard>
      <AuthHeading>{result.ok ? 'Email verified' : 'Verification failed'}</AuthHeading>

      {result.ok ? (
        <AuthAlert tone="success">
          Your email address is verified. You can now place orders and write reviews.
        </AuthAlert>
      ) : (
        <>
          <AuthAlert tone="error">{result.message}</AuthAlert>
          {resend}
        </>
      )}

      <div className="mt-4 space-y-3">
        <Link href={session ? '/account' : '/auth/login'} className={yellowLink}>
          {session ? 'Go to your account' : 'Sign in'}
        </Link>
        <AuthLink href="/" className="block text-center">
          Continue shopping
        </AuthLink>
      </div>
    </AuthCard>
  );
}
