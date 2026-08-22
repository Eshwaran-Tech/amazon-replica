import type { ObjectId } from 'mongodb';

import type { Address, UserRole } from './types';

/**
 * A user document as stored in MongoDB.
 *
 * `passwordHash` is in this type and in no DTO below. The only way it reaches a
 * response is if someone serialises a raw `UserDoc`, which is why every read
 * path returns one of the explicit projections at the bottom of this file.
 */
export interface UserDoc {
  _id: ObjectId;
  name: string;
  /**
   * Normalised to lowercase before storage; unique among accounts that have
   * one. Null for accounts created with a mobile number only.
   */
  email: string | null;
  /**
   * E.164, e.g. "+919876543210"; unique among accounts that have one. Null for
   * email-only accounts. At least one of `email` / `phone` is always set.
   */
  phone: string | null;
  /**
   * Always present. For accounts that sign in with a one-time code only, this
   * is the hash of a random secret nobody knows -- functionally no password --
   * and `hasPassword` is false so the sign-in flow never offers a password box.
   */
  passwordHash: string;
  hasPassword: boolean;
  role: UserRole;
  emailVerified: boolean;
  emailVerifiedAt?: Date | null;
  phoneVerified: boolean;
  phoneVerifiedAt?: Date | null;
  addresses: Address[];

  /** Soft ban. Checked on every session resolution, not just at login. */
  isDisabled: boolean;

  /** Brute-force throttling, per account (rate limiting also runs per IP). */
  failedLoginAttempts: number;
  lockedUntil?: Date | null;

  /**
   * Any session created before this instant is invalid. Bumping it is how a
   * password change signs out every other device, without a bulk delete race.
   */
  passwordChangedAt: Date;

  createdAt: Date;
  updatedAt: Date;
}

/** What the signed-in user may see about themselves. */
export interface PublicUser {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  role: UserRole;
  emailVerified: boolean;
  phoneVerified: boolean;
  hasPassword: boolean;
  createdAt: string;
}

/** What an admin may see about another user. Still no hash, ever. */
export interface AdminUserView extends PublicUser {
  isDisabled: boolean;
  addressCount: number;
  lockedUntil: string | null;
  updatedAt: string;
}

/**
 * DTO mappers.
 *
 * Written as explicit field lists rather than `{ ...doc, passwordHash: undefined }`.
 * A spread-and-delete is one forgotten field away from leaking, and it silently
 * starts leaking again the day someone adds a column. Building the object up
 * field by field fails closed: a new sensitive field is absent by default.
 */
export function toPublicUser(doc: UserDoc): PublicUser {
  return {
    id: doc._id.toHexString(),
    name: doc.name,
    email: doc.email ?? null,
    phone: doc.phone ?? null,
    role: doc.role,
    emailVerified: doc.emailVerified,
    // Documents written before mobile accounts existed lack these fields.
    phoneVerified: doc.phoneVerified ?? false,
    hasPassword: doc.hasPassword ?? true,
    createdAt: doc.createdAt.toISOString(),
  };
}

/** "+919876543210" -> "+91 98765 43210", for display. */
export function formatPhone(phone: string): string {
  const match = /^\+91(\d{5})(\d{5})$/.exec(phone);
  return match ? `+91 ${match[1]} ${match[2]}` : phone;
}

/** The identifier a user signs in with, for greeting/confirmation copy. */
export function primaryContact(user: { email: string | null; phone: string | null }): string {
  return user.email ?? (user.phone ? formatPhone(user.phone) : '');
}

export function toAdminUserView(doc: UserDoc): AdminUserView {
  return {
    ...toPublicUser(doc),
    isDisabled: doc.isDisabled,
    addressCount: doc.addresses.length,
    lockedUntil: doc.lockedUntil ? doc.lockedUntil.toISOString() : null,
    updatedAt: doc.updatedAt.toISOString(),
  };
}

/**
 * Projection that omits the hash at the database level, for the many reads that
 * never need it. Cheaper than fetching it and safer than trusting the caller.
 */
export const USER_SAFE_PROJECTION = { passwordHash: 0 } as const;
