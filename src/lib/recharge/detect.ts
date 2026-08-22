import { CIRCLES, OPERATORS, type Operator } from '@/data/recharge-plans';

/**
 * Which operator and circle a mobile number belongs to.
 *
 * Deliberately in `lib/` rather than in the service: the page shows the
 * operator the moment ten digits are typed, and the server has to agree with
 * what the customer was shown when the recharge is charged. One function, both
 * sides -- a second implementation in the browser is how the two drift apart.
 *
 * **What this is not.** A real recharge page queries the operator's
 * number-portability database. There is no such integration here, so the answer
 * is derived from the number itself: stable for a given number, and wrong as
 * often as any guess would be. The page says so, and lets the customer correct
 * it -- which a real page needs anyway, because numbers get ported.
 */

/** Indian mobile numbers are ten digits and start 6, 7, 8 or 9. */
export function isValidMobile(value: unknown): value is string {
  return typeof value === 'string' && /^[6-9][0-9]{9}$/.test(value);
}

/** FNV-1a, matching the rest of the project's deterministic derivations. */
function hash(value: string): number {
  let h = 0x811c9dc5;
  for (let index = 0; index < value.length; index += 1) {
    h ^= value.charCodeAt(index);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

export interface Detected {
  mobile: string;
  operator: Operator;
  circle: string;
}

export function detectOperator(mobile: string): Detected | null {
  if (!isValidMobile(mobile)) return null;

  const seed = hash(mobile);
  const operator = OPERATORS[seed % OPERATORS.length];
  const circle = CIRCLES[(seed >>> 8) % CIRCLES.length];
  if (!operator || !circle) return null;

  return { mobile, operator, circle };
}
