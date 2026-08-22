import { z } from 'zod';

import {
  emailSchema,
  loginPasswordSchema,
  newPasswordSchema,
  redirectPathSchema,
  singleLineText,
} from './common';

/**
 * Authentication schemas.
 *
 * Every object here is a `z.strictObject`, so an unexpected key is a validation
 * *error* rather than being quietly dropped. That is the property that makes
 * `{ email, password, role: "ADMIN" }` fail outright instead of succeeding with
 * the extra field ignored -- privilege fields are not merely unread, they are
 * actively rejected.
 */

/** Opaque single-use token from a reset or verification link. */
export const tokenSchema = z
  .string()
  .trim()
  .regex(/^[A-Za-z0-9_-]{32,128}$/, 'This link is not valid');

export const registerSchema = z
  .strictObject({
    name: singleLineText(2, 80, 'Name'),
    email: emailSchema,
    password: newPasswordSchema,
    confirmPassword: z.string(),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: 'Passwords do not match',
    path: ['confirmPassword'],
  })
  .refine(
    // A password containing the email local part is trivially guessable from
    // the address itself.
    (data) => {
      const localPart = data.email.split('@')[0] ?? '';
      return localPart.length < 3 || !data.password.toLowerCase().includes(localPart.toLowerCase());
    },
    { message: 'Password must not contain your email address', path: ['password'] },
  );

export type RegisterInput = z.infer<typeof registerSchema>;

export const loginSchema = z.strictObject({
  email: emailSchema,
  password: loginPasswordSchema,
  /** Optional post-login destination; re-validated by `safeRedirectPath`. */
  next: redirectPathSchema.optional(),
});

export type LoginInput = z.infer<typeof loginSchema>;

// -------------------------------------------------- identifier / OTP flow

/**
 * The single "mobile number or email" field. Loose here on purpose -- shape is
 * decided by `parseIdentifier`, which normalises both kinds; this only bounds
 * the size of what reaches it.
 */
export const identifierInputSchema = z.string().trim().min(1, 'Enter your mobile number or email').max(254);

/** Six digits, whitespace tolerated (people paste "123 456"). */
export const otpCodeSchema = z
  .string()
  .transform((value) => value.replace(/\s+/g, ''))
  .pipe(z.string().regex(/^\d{6}$/, 'Enter the 6-digit code'));

export const passwordStepSchema = z.strictObject({
  password: loginPasswordSchema,
});

export const otpStepSchema = z.strictObject({
  code: otpCodeSchema,
});

/** "Create Account" details for a mobile-number sign-up (no password). */
export const signUpPhoneSchema = z.strictObject({
  via: z.literal('phone'),
  identifier: identifierInputSchema,
  name: singleLineText(2, 80, 'Your name'),
});

/** "Create Account" details for an email sign-up (password chosen up front). */
export const signUpEmailSchema = z
  .strictObject({
    via: z.literal('email'),
    identifier: identifierInputSchema,
    name: singleLineText(2, 80, 'Your name'),
    password: newPasswordSchema,
    confirmPassword: z.string(),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: 'Passwords do not match',
    path: ['confirmPassword'],
  });

export const forgotPasswordSchema = z.strictObject({
  email: emailSchema,
});

export type ForgotPasswordInput = z.infer<typeof forgotPasswordSchema>;

export const resetPasswordSchema = z
  .strictObject({
    token: tokenSchema,
    password: newPasswordSchema,
    confirmPassword: z.string(),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: 'Passwords do not match',
    path: ['confirmPassword'],
  });

export type ResetPasswordInput = z.infer<typeof resetPasswordSchema>;

export const changePasswordSchema = z
  .strictObject({
    // Looser schema: we are verifying the existing password, not setting it.
    currentPassword: loginPasswordSchema,
    newPassword: newPasswordSchema,
    confirmPassword: z.string(),
  })
  .refine((data) => data.newPassword === data.confirmPassword, {
    message: 'Passwords do not match',
    path: ['confirmPassword'],
  })
  .refine((data) => data.currentPassword !== data.newPassword, {
    message: 'New password must be different from your current password',
    path: ['newPassword'],
  });

export type ChangePasswordInput = z.infer<typeof changePasswordSchema>;

export const verifyEmailSchema = z.strictObject({
  token: tokenSchema,
});

export const resendVerificationSchema = z.strictObject({
  email: emailSchema,
});
