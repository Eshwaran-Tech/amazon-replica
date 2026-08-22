import type { Slab } from '@/lib/bills/derive';

/**
 * Tariff books for the metered bills.
 *
 * The **rates are illustrative**, like every other price in this store. The
 * **structures are real**, and they are the part worth being right about:
 *
 *  - Electricity is **telescopic**. 250 units is not 250 at the 201-400 rate;
 *    it is 100 at the first rate, 100 at the second and 50 at the third.
 *  - Water carries a **sewerage cess set as a percentage of the water charge**,
 *    so it moves when consumption moves, and a fixed meter rent that does not.
 *  - Piped gas is read **every two months** and sits **outside GST**, so it
 *    carries VAT instead. A gas bill showing 18% GST is wrong about the tax.
 *  - Property tax is assessed on a **rateable value**, not on a market price,
 *    and carries a rebate for paying early and a penalty for paying late.
 */

// ------------------------------------------------------------- electricity

/** Telescopic domestic slabs, in units (kWh). */
export const ELECTRICITY_SLABS: readonly Slab[] = [
  { upTo: 100, rate: 4.0 },
  { upTo: 200, rate: 5.6 },
  { upTo: 400, rate: 7.2 },
  { upTo: 800, rate: 8.4 },
  { upTo: Number.POSITIVE_INFINITY, rate: 9.6 },
];

/**
 * Fixed charge per sanctioned kilowatt, per month.
 *
 * A real bill charges this whether or not a single unit was drawn -- it pays
 * for the connection being there, not for the electricity.
 */
export const ELECTRICITY_FIXED_PER_KW = 45;

/** Electricity duty, as a percentage of the energy charge. */
export const ELECTRICITY_DUTY_PERCENT = 6;

/**
 * A surcharge some discoms carry, per unit.
 *
 * Keyed by biller because this is genuinely one of the things that differs
 * between them -- a wheeling charge, a pension trust surcharge, a fuel
 * adjustment. The label matters: a customer who sees a line they cannot name
 * assumes they are being padded.
 */
export const ELECTRICITY_SURCHARGES: Record<string, { label: string; perUnit: number }> = {
  'coromandel-power': { label: 'Fuel cost adjustment', perUnit: 0.3 },
  'deccan-electric': { label: 'Fuel surcharge adjustment', perUnit: 0.42 },
  'harbour-power': { label: 'Wheeling charge', perUnit: 1.12 },
  'capital-grid': { label: 'Pension trust surcharge', perUnit: 0.62 },
  'garden-power': { label: 'Fixed cost adjustment', perUnit: 0.35 },
};

// ------------------------------------------------------------------- water

/** Bi-monthly domestic slabs, in kilolitres. */
export const WATER_SLABS: readonly Slab[] = [
  { upTo: 10, rate: 6 },
  { upTo: 20, rate: 13 },
  { upTo: 30, rate: 24 },
  { upTo: 50, rate: 37 },
  { upTo: Number.POSITIVE_INFINITY, rate: 52 },
];

/** Sewerage cess, as a percentage of the water charge. */
export const SEWERAGE_CESS_PERCENT = 55;

/** Meter rent per connection, per cycle, in whole rupees. */
export const WATER_METER_RENT = 60;

/** A sanitary or conservancy charge, where the board levies one. */
export const WATER_EXTRAS: Record<string, { label: string; rupees: number }> = {
  'capital-water': { label: 'Service charge', rupees: 45 },
  'coromandel-water': { label: 'Conservancy charge', rupees: 30 },
  'garden-water': { label: 'Sanitary charge', rupees: 70 },
};

/**
 * Litres per person per day the national standard plans for.
 *
 * A real figure -- 135 lpcd is what urban water supply in India is designed
 * around -- and the only honest way to tell somebody whether their reading is
 * high without inventing a neighbourhood average nobody measured.
 */
export const LPCD_STANDARD = 135;

// --------------------------------------------------------------- piped gas

/** Bi-monthly slabs, in standard cubic metres. */
export const GAS_SLABS: readonly Slab[] = [
  { upTo: 30, rate: 48 },
  { upTo: 75, rate: 53 },
  { upTo: Number.POSITIVE_INFINITY, rate: 59 },
];

/** Fixed charge per bi-monthly cycle. */
export const GAS_FIXED_PER_CYCLE = 70;

/** Piped gas sits outside GST, so it carries state VAT. */
export const GAS_VAT_PERCENT = 5;

/**
 * How much cooking gas one cylinder holds, in standard cubic metres.
 *
 * A 14.2 kg domestic LPG cylinder is roughly 34 SCM of piped-gas equivalent by
 * calorific value. It is the comparison anybody switching actually wants, and
 * it is a physical fact rather than a marketing figure.
 */
export const SCM_PER_CYLINDER = 34;

// ----------------------------------------------------------- property tax

/**
 * Property tax, assessed on a rateable value.
 *
 * Rateable value = built-up area x base rate for the zone x usage factor x age
 * factor. Tax is a percentage of that. Every term here is a real one; the
 * numbers are this store's.
 */
export const PROPERTY_ZONE_RATES: ReadonlyArray<{ zone: string; perSqFtPerYear: number }> = [
  { zone: 'A', perSqFtPerYear: 46 },
  { zone: 'B', perSqFtPerYear: 38 },
  { zone: 'C', perSqFtPerYear: 31 },
  { zone: 'D', perSqFtPerYear: 24 },
  { zone: 'E', perSqFtPerYear: 18 },
];

export const USAGE_FACTORS: ReadonlyArray<{ id: string; label: string; factor: number }> = [
  { id: 'SELF', label: 'Self-occupied residential', factor: 1 },
  { id: 'LET', label: 'Let out residential', factor: 1.5 },
  { id: 'COMMERCIAL', label: 'Commercial', factor: 2.6 },
];

/** Older buildings are assessed lower, which is the real convention. */
export function ageFactor(ageYears: number): number {
  if (ageYears <= 5) return 1;
  if (ageYears <= 15) return 0.9;
  if (ageYears <= 30) return 0.8;
  if (ageYears <= 50) return 0.7;
  return 0.6;
}

/** Tax as a percentage of the rateable value. */
export const PROPERTY_TAX_PERCENT = 12;

/** A cess on the tax, for education and libraries. */
export const PROPERTY_CESS_PERCENT = 8;

/**
 * Pay before this and a rebate applies; pay after the due date and a penalty
 * accrues monthly. Both are real conventions, and both are the reason to look
 * at a property tax bill in April rather than in December.
 */
export const REBATE_PERCENT = 5;
export const REBATE_BEFORE = { month: 5, day: 30 }; // 30 June, zero-indexed month
export const PENALTY_PERCENT_PER_MONTH = 1;

// ------------------------------------------------------------ school fees

export interface FeeHead {
  id: string;
  label: string;
  /** Share of the term fee, as a percentage. */
  share: number;
  /** Charged only where the account has it. */
  optional?: boolean;
}

export const FEE_HEADS: readonly FeeHead[] = [
  { id: 'tuition', label: 'Tuition', share: 62 },
  { id: 'lab', label: 'Laboratory and IT', share: 11 },
  { id: 'library', label: 'Library', share: 5 },
  { id: 'activity', label: 'Activities and sports', share: 9 },
  { id: 'exam', label: 'Examination', share: 6 },
  { id: 'transport', label: 'Transport', share: 18, optional: true },
  { id: 'hostel', label: 'Hostel and mess', share: 55, optional: true },
];

/** Late fee per day after a term's due date, in whole rupees. */
export const FEE_LATE_PER_DAY = 25;

/** And what it is capped at, because an uncapped daily fee is a trap. */
export const FEE_LATE_CAP = 2000;
