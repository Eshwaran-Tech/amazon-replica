/**
 * The delivery PIN cookie name.
 *
 * Its own module for the same reason `lib/forms/state.ts` is: a `'use server'`
 * file may only export async functions, so the constant cannot live beside the
 * action that writes it.
 */
export const DELIVERY_PIN_COOKIE = 'now_pin';
