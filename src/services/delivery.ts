/**
 * Delivery-slot estimates for the Now store.
 *
 * **What is real here and what is not.** The postal geography is real: the
 * first two digits of an Indian PIN code identify the postal circle (the
 * state), and the first three identify the sorting district, which for the
 * metros is a city. Those tables below are that mapping, not invention -- type
 * 600007 and it says Chennai because 600 *is* Chennai.
 *
 * The *slot* is a deterministic estimate, not a courier lookup. This store has
 * no logistics integration, so rather than call an API that does not exist, the
 * minutes are derived from the PIN itself: the same code always produces the
 * same window, on every machine and every load. The Now page says so in as many
 * words rather than letting a made-up "12 minutes" read as a promise.
 */

/** Postal circles, keyed by the first two digits of the PIN. */
const CIRCLES: Record<string, string> = {
  '11': 'Delhi',
  '12': 'Haryana',
  '13': 'Haryana',
  '14': 'Punjab',
  '15': 'Punjab',
  '16': 'Punjab',
  '17': 'Himachal Pradesh',
  '18': 'Jammu & Kashmir',
  '19': 'Jammu & Kashmir',
  '20': 'Uttar Pradesh',
  '21': 'Uttar Pradesh',
  '22': 'Uttar Pradesh',
  '23': 'Uttar Pradesh',
  '24': 'Uttar Pradesh',
  '25': 'Uttar Pradesh',
  '26': 'Uttar Pradesh',
  '27': 'Uttar Pradesh',
  '28': 'Uttar Pradesh',
  '30': 'Rajasthan',
  '31': 'Rajasthan',
  '32': 'Rajasthan',
  '33': 'Rajasthan',
  '34': 'Rajasthan',
  '36': 'Gujarat',
  '37': 'Gujarat',
  '38': 'Gujarat',
  '39': 'Gujarat',
  '40': 'Maharashtra',
  '41': 'Maharashtra',
  '42': 'Maharashtra',
  '43': 'Maharashtra',
  '44': 'Maharashtra',
  '45': 'Madhya Pradesh',
  '46': 'Madhya Pradesh',
  '47': 'Madhya Pradesh',
  '48': 'Madhya Pradesh',
  '49': 'Chhattisgarh',
  '50': 'Telangana',
  '51': 'Andhra Pradesh',
  '52': 'Andhra Pradesh',
  '53': 'Andhra Pradesh',
  '56': 'Karnataka',
  '57': 'Karnataka',
  '58': 'Karnataka',
  '59': 'Karnataka',
  '60': 'Tamil Nadu',
  '61': 'Tamil Nadu',
  '62': 'Tamil Nadu',
  '63': 'Tamil Nadu',
  '64': 'Tamil Nadu',
  '67': 'Kerala',
  '68': 'Kerala',
  '69': 'Kerala',
  '70': 'West Bengal',
  '71': 'West Bengal',
  '72': 'West Bengal',
  '73': 'West Bengal',
  '74': 'West Bengal',
  '75': 'Odisha',
  '76': 'Odisha',
  '77': 'Odisha',
  '78': 'Assam',
  '79': 'Arunachal Pradesh',
  '80': 'Bihar',
  '81': 'Bihar',
  '82': 'Jharkhand',
  '83': 'Jharkhand',
  '84': 'Bihar',
  '85': 'Bihar',
};

/** Sorting districts that are a single city, keyed by the first three digits. */
const CITIES: Record<string, string> = {
  '110': 'New Delhi',
  '122': 'Gurugram',
  '160': 'Chandigarh',
  '201': 'Ghaziabad',
  '226': 'Lucknow',
  '248': 'Dehradun',
  '302': 'Jaipur',
  '380': 'Ahmedabad',
  '395': 'Surat',
  '400': 'Mumbai',
  '411': 'Pune',
  '440': 'Nagpur',
  '452': 'Indore',
  '462': 'Bhopal',
  '500': 'Hyderabad',
  '530': 'Visakhapatnam',
  '560': 'Bengaluru',
  '570': 'Mysuru',
  '575': 'Mangaluru',
  '600': 'Chennai',
  '620': 'Tiruchirappalli',
  '625': 'Madurai',
  '641': 'Coimbatore',
  '682': 'Kochi',
  '695': 'Thiruvananthapuram',
  '700': 'Kolkata',
  '751': 'Bhubaneswar',
  '781': 'Guwahati',
  '800': 'Patna',
  '834': 'Ranchi',
};

export interface DeliveryEstimate {
  pin: string;
  /** City when the sorting district is one, otherwise null. */
  city: string | null;
  /** Postal circle. Null for a PIN whose circle is not in the table. */
  state: string | null;
  /** Estimated minutes to the door. */
  minutes: number;
  /** "Chennai, Tamil Nadu", "Tamil Nadu", or "India" -- whatever is known. */
  label: string;
}

/** FNV-1a, matching the rest of the project's deterministic generators. */
function hash(value: string): number {
  let h = 0x811c9dc5;
  for (let index = 0; index < value.length; index += 1) {
    h ^= value.charCodeAt(index);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/** A PIN is six digits and never starts with zero. */
export function isValidPin(value: unknown): value is string {
  return typeof value === 'string' && /^[1-9][0-9]{5}$/.test(value);
}

/** The slot for a PIN, or null if it is not a PIN at all. */
export function estimateDelivery(pin: string): DeliveryEstimate | null {
  if (!isValidPin(pin)) return null;

  const city = CITIES[pin.slice(0, 3)] ?? null;
  const state = CIRCLES[pin.slice(0, 2)] ?? null;

  // 8-29 minutes, fixed per PIN. A metro sorting district gets the faster half
  // of the range, which is the one thing about this estimate that is not
  // arbitrary: those are the areas a quick-commerce network actually covers.
  const spread = hash(pin) % (city ? 12 : 22);
  const minutes = (city ? 8 : 18) + spread;

  const label = city && state ? `${city}, ${state}` : (state ?? 'India');

  return { pin, city, state, minutes, label };
}

/** The default shown before anyone has chosen a PIN. */
export const FALLBACK_PIN = '600001';
