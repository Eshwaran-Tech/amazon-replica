import { z } from 'zod';

import { ADDRESS_TYPES } from '@/models/types';

import { objectIdString, phoneSchema, postalCodeSchema, singleLineText } from './common';

/**
 * Profile and address schemas.
 *
 * Note what is absent from every schema in this file: `role`, `emailVerified`,
 * `isDisabled`, `passwordHash`, `_id`. A user editing their profile cannot
 * submit any of them -- and because these are strict objects, attempting to is
 * a 400 rather than a silently ignored field.
 *
 * Email is also absent from `updateProfileSchema`: changing an address is an
 * account-takeover-relevant action that needs re-verification, so it has its
 * own flow rather than riding along with a display-name edit.
 */

export const updateProfileSchema = z.strictObject({
  name: singleLineText(2, 80, 'Name'),
});

export type UpdateProfileInput = z.infer<typeof updateProfileSchema>;

export const addressSchema = z.strictObject({
  fullName: singleLineText(2, 80, 'Full name'),
  phone: phoneSchema,
  line1: singleLineText(4, 120, 'Address line 1'),
  line2: singleLineText(0, 120, 'Address line 2').optional().or(z.literal('')),
  city: singleLineText(2, 60, 'City'),
  state: singleLineText(2, 60, 'State'),
  postalCode: postalCodeSchema,
  // Single-country storefront. An allow-list of one is still an allow-list:
  // it keeps a free-text country out of the address that ships to a courier.
  country: z.literal('India').default('India'),
  type: z.enum(ADDRESS_TYPES).default('HOME'),
  isDefault: z.boolean().default(false),
});

export type AddressInput = z.infer<typeof addressSchema>;

/** Address ids are generated server-side as ObjectId hex strings. */
export const addressIdSchema = objectIdString;

export const updateAddressSchema = z.strictObject({
  addressId: addressIdSchema,
  address: addressSchema,
});

export const deleteAddressSchema = z.strictObject({
  addressId: addressIdSchema,
});

export const setDefaultAddressSchema = z.strictObject({
  addressId: addressIdSchema,
});
