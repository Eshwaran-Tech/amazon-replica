import { ObjectId } from 'mongodb';

import { usersCollection } from '@/lib/db/collections';
import type { Address } from '@/models/types';
import type { AddressInput, UpdateProfileInput } from '@/lib/validations/user';

import '@/lib/server-guard';

/**
 * Profile and address-book operations.
 *
 * Every write is filtered by `_id: userId` from the session -- the address id
 * arriving from the form only ever selects *within* the caller's own embedded
 * array. There is no query in this module that could touch another user's
 * document, whatever ids the client submits.
 */

export const MAX_ADDRESSES = 10;

export type AccountResult = { ok: true } | { ok: false; message: string };

export async function updateProfile(
  userId: ObjectId,
  input: UpdateProfileInput,
): Promise<AccountResult> {
  const users = await usersCollection();
  const updated = await users.updateOne(
    { _id: userId },
    { $set: { name: input.name, updatedAt: new Date() } },
  );
  return updated.matchedCount === 1
    ? { ok: true }
    : { ok: false, message: 'Account not found.' };
}

export async function listAddresses(userId: ObjectId): Promise<Address[]> {
  const users = await usersCollection();
  const user = await users.findOne({ _id: userId }, { projection: { addresses: 1 } });
  return user?.addresses ?? [];
}

export async function addAddress(userId: ObjectId, input: AddressInput): Promise<AccountResult> {
  const users = await usersCollection();
  const now = new Date();

  const current = await users.findOne({ _id: userId }, { projection: { addresses: 1 } });
  if (!current) return { ok: false, message: 'Account not found.' };
  if (current.addresses.length >= MAX_ADDRESSES) {
    return {
      ok: false,
      message: `You can save up to ${MAX_ADDRESSES} addresses. Remove one to add another.`,
    };
  }

  const address: Address = {
    ...input,
    line2: input.line2 || undefined,
    id: new ObjectId().toHexString(),
    // The first address is always the default, whatever the checkbox said.
    isDefault: input.isDefault || current.addresses.length === 0,
  };

  if (address.isDefault) {
    await users.updateOne({ _id: userId }, { $set: { 'addresses.$[].isDefault': false } });
  }

  // The length guard re-checked in the filter: a double-submit racing past the
  // read above still cannot push an eleventh address.
  const updated = await users.updateOne(
    { _id: userId, [`addresses.${MAX_ADDRESSES - 1}`]: { $exists: false } },
    { $push: { addresses: address }, $set: { updatedAt: now } },
  );

  return updated.modifiedCount === 1
    ? { ok: true }
    : { ok: false, message: 'The address could not be saved. Please try again.' };
}

export async function updateAddress(
  userId: ObjectId,
  addressId: string,
  input: AddressInput,
): Promise<AccountResult> {
  const users = await usersCollection();
  const now = new Date();

  const current = await users.findOne({ _id: userId }, { projection: { addresses: 1 } });
  const existing = current?.addresses.find((address) => address.id === addressId);
  if (!existing) return { ok: false, message: 'We could not find that address.' };

  const address: Address = {
    ...input,
    line2: input.line2 || undefined,
    id: existing.id,
    // Editing never *removes* default status; promoting is explicit.
    isDefault: existing.isDefault || input.isDefault,
  };

  if (address.isDefault && !existing.isDefault) {
    await users.updateOne({ _id: userId }, { $set: { 'addresses.$[].isDefault': false } });
  }

  const updated = await users.updateOne(
    { _id: userId, 'addresses.id': addressId },
    { $set: { 'addresses.$': address, updatedAt: now } },
  );

  return updated.matchedCount === 1
    ? { ok: true }
    : { ok: false, message: 'We could not find that address.' };
}

export async function deleteAddress(userId: ObjectId, addressId: string): Promise<AccountResult> {
  const users = await usersCollection();
  const now = new Date();

  // Existence is part of the filter: without it, the `updatedAt` write makes
  // `modifiedCount` read 1 even when the $pull matched nothing, and a foreign
  // address id would report success.
  const updated = await users.updateOne(
    { _id: userId, 'addresses.id': addressId },
    { $pull: { addresses: { id: addressId } }, $set: { updatedAt: now } },
  );

  if (updated.matchedCount === 0) {
    return { ok: false, message: 'We could not find that address.' };
  }

  // Deleting the default leaves the book without one; promote the oldest
  // remaining address so checkout always has a sensible preselection.
  const remaining = await users.findOne({ _id: userId }, { projection: { addresses: 1 } });
  const oldest = remaining?.addresses[0];
  if (oldest && !remaining.addresses.some((address) => address.isDefault)) {
    await users.updateOne(
      { _id: userId, 'addresses.id': oldest.id },
      { $set: { 'addresses.$.isDefault': true, updatedAt: now } },
    );
  }

  return { ok: true };
}

export async function setDefaultAddress(
  userId: ObjectId,
  addressId: string,
): Promise<AccountResult> {
  const users = await usersCollection();

  // One atomic update: the filter proves the id exists in *this* user's book
  // before anything is touched, so an unknown id changes nothing at all --
  // including the current default.
  const updated = await users.updateOne(
    { _id: userId, 'addresses.id': addressId },
    {
      $set: {
        'addresses.$[chosen].isDefault': true,
        'addresses.$[rest].isDefault': false,
        updatedAt: new Date(),
      },
    },
    { arrayFilters: [{ 'chosen.id': addressId }, { 'rest.id': { $ne: addressId } }] },
  );

  return updated.matchedCount === 1
    ? { ok: true }
    : { ok: false, message: 'We could not find that address.' };
}
