import {
  ADD_ONS,
  DEPRECIATION,
  findAddOn,
  findInsurer,
  INSURERS,
  NCB_LADDER,
  PLAN_KINDS,
  PREMIUM_TAX_PERCENT,
  type AddOn,
  type Insurer,
  type PlanType,
} from '@/data/insurers';
import { findModel, type VehicleKind, type VehicleModel } from '@/data/vehicles';
import { formatPaise, rupeesToPaise, type Paise } from '@/lib/utils/money';

/**
 * Motor quotes.
 *
 * **This store sells no insurance** -- see the note in `data/insurers.ts`. What
 * this works out is what a premium is *made of*, so the page can show the parts
 * rather than one number nobody can check.
 *
 * A motor premium is four things:
 *
 *     own damage  =  IDV x rate, less the no-claim bonus
 *   + third party =  a flat figure banded by engine size, never discounted
 *   + add-ons     =  a percentage of own damage, each with a floor
 *   + tax         =  a percentage of the lot
 *
 * The one people get wrong is the second: a no-claim bonus applies to the
 * own-damage part alone, which is why a 50% bonus moves the total far less than
 * half. The breakdown is shown for exactly that reason.
 */

/**
 * Whole rupees.
 *
 * A premium is quoted and paid in whole rupees -- nobody has ever been billed
 * Rs 12,872.22 for a motor policy. Every component is rounded here rather than
 * once at the end, so the parts on the breakdown add up to the total the
 * customer is shown.
 */
function wholeRupees(paise: number): Paise {
  return Math.round(paise / 100) * 100;
}

export interface IdvRange {
  /** What the depreciation ladder says the vehicle is worth. */
  suggested: Paise;
  /** The band an insurer will accept, either side of it. */
  min: Paise;
  max: Paise;
  /** The depreciation applied, as a percentage. */
  depreciationPercent: number;
  /** Null past the tabled ladder, where it is negotiated rather than fixed. */
  band: string | null;
}

/**
 * The declared value for a vehicle of this age.
 *
 * Past five years the ladder stops and the value is agreed case by case, so
 * this keeps stepping down at a slower rate and says the band is off the table
 * rather than inventing a published figure.
 */
export function idvFor(model: VehicleModel, ageMonths: number, insurer?: Insurer): IdvRange {
  const clamped = Math.max(0, Math.floor(ageMonths));

  const rung = DEPRECIATION.find((entry) => clamped <= entry.maxAgeMonths);
  const depreciationPercent = rung
    ? rung.percent
    : // Beyond the ladder: 50% at five years, then a further 5 points a year,
      // stopping at 80% so an old vehicle still carries a value.
      Math.min(80, 50 + Math.floor((clamped - 60) / 12) * 5);

  const base = model.exShowroomRupees * (1 - depreciationPercent / 100);
  const adjusted = base * (insurer?.idvFactor ?? 1);

  return {
    suggested: rupeesToPaise(Math.round(adjusted / 10) * 10),
    // Insurers will normally move an IDV about 15% either way.
    min: rupeesToPaise(Math.round((adjusted * 0.85) / 10) * 10),
    max: rupeesToPaise(Math.round((adjusted * 1.15) / 10) * 10),
    depreciationPercent,
    band: rung?.label ?? null,
  };
}

/**
 * The third-party component, banded by engine size.
 *
 * Flat figures rather than a rate on the IDV, which is how third-party cover
 * actually works: it insures other people, so the value of your own vehicle has
 * nothing to do with it. Illustrative, like everything else here.
 */
export function thirdPartyRupees(model: VehicleModel): number {
  if (model.kind === 'BIKE') {
    if (model.cc <= 75) return 540;
    if (model.cc <= 150) return 714;
    if (model.cc <= 350) return 1366;
    return 2804;
  }

  // An electric car is banded by motor output; this is the band it falls in.
  if (model.cc === 0) return 1780;
  if (model.cc <= 1000) return 2094;
  if (model.cc <= 1500) return 3416;
  return 7897;
}

/** Own-damage rate on the IDV, before the insurer's own factor. */
function ownDamageRate(model: VehicleModel, ageMonths: number): number {
  const base = model.kind === 'BIKE' ? 0.0175 : 0.0283;
  // An older vehicle costs more to repair relative to what it is worth.
  const ageLoading = 1 + Math.min(0.4, Math.floor(ageMonths / 12) * 0.04);
  return base * ageLoading;
}

export function ncbPercent(claimFreeYears: number): number {
  const clamped = Math.max(0, Math.min(5, Math.floor(claimFreeYears)));
  return NCB_LADDER.find((rung) => rung.claimFreeYears === clamped)?.percent ?? 0;
}

/** Whether an add-on is offered on this vehicle at this age. */
export function addOnAvailable(addOn: AddOn, kind: VehicleKind, ageMonths: number): boolean {
  if (!addOn.kinds.includes(kind)) return false;
  return ageMonths <= addOn.maxVehicleAge * 12;
}

export function addOnsFor(kind: VehicleKind, ageMonths: number): AddOn[] {
  return ADD_ONS.filter((addOn) => addOnAvailable(addOn, kind, ageMonths));
}

export interface QuoteInput {
  modelId: string;
  /** Whole months since registration. */
  ageMonths: number;
  plan: PlanType;
  /** Chosen declared value, or null to take the suggestion. */
  idv: Paise | null;
  claimFreeYears: number;
  addOnIds: string[];
}

export interface PremiumLine {
  label: string;
  amount: Paise;
  /** A note under the line, where one is worth having. */
  note?: string;
}

export interface Quote {
  insurer: Insurer;
  model: VehicleModel;
  plan: PlanType;
  idv: Paise;
  idvRange: IdvRange;
  ownDamage: Paise;
  ncbPercent: number;
  ncbDiscount: Paise;
  thirdParty: Paise;
  addOns: Array<{ addOn: AddOn; amount: Paise }>;
  addOnTotal: Paise;
  /** Before tax. */
  netPremium: Paise;
  taxPercent: number;
  tax: Paise;
  total: Paise;
  lines: PremiumLine[];
}

export type QuoteResult =
  | { ok: true; quotes: Quote[] }
  | { ok: false; code: 'UNKNOWN_MODEL' | 'BAD_IDV' | 'BAD_AGE'; message: string };

/** One insurer's quote. Exported so a single card can be rebuilt on its own. */
export function quoteFrom(insurer: Insurer, input: QuoteInput): Quote | null {
  const model = findModel(input.modelId);
  if (!model) return null;

  const range = idvFor(model, input.ageMonths, insurer);
  const idv = input.idv ?? range.suggested;

  // Third-party only insures other people, so the declared value plays no part
  // in it -- and own-damage cover is what the IDV is for.
  const wantsOd = input.plan !== 'THIRD_PARTY';
  const wantsTp = input.plan !== 'OWN_DAMAGE';

  const grossOd = wantsOd
    ? wholeRupees(idv * ownDamageRate(model, input.ageMonths) * insurer.odFactor)
    : 0;

  const bonus = wantsOd ? ncbPercent(input.claimFreeYears) : 0;
  const ncbDiscount = wholeRupees((grossOd * bonus) / 100);
  const ownDamage = grossOd - ncbDiscount;

  const thirdParty = wantsTp ? rupeesToPaise(thirdPartyRupees(model)) : 0;

  // Add-ons extend own-damage cover, so a third-party-only policy has none.
  const addOns = wantsOd
    ? input.addOnIds
        .map((id) => findAddOn(id))
        .filter((addOn): addOn is AddOn => addOn !== undefined)
        .filter((addOn) => addOnAvailable(addOn, model.kind, input.ageMonths))
        .map((addOn) => ({
          addOn,
          amount: Math.max(
            rupeesToPaise(addOn.minRupees),
            wholeRupees((grossOd * addOn.percentOfOd) / 100),
          ),
        }))
    : [];

  const addOnTotal = addOns.reduce((sum, entry) => sum + entry.amount, 0);
  const netPremium = ownDamage + thirdParty + addOnTotal;
  const tax = wholeRupees((netPremium * PREMIUM_TAX_PERCENT) / 100);

  const lines: PremiumLine[] = [];
  if (wantsOd) {
    lines.push({
      label: 'Own damage',
      amount: grossOd,
      note: 'On a declared value of ' + formatPaise(idv),
    });
    if (ncbDiscount > 0) {
      lines.push({
        label: `No-claim bonus (${bonus}%)`,
        amount: -ncbDiscount,
        note: 'Applies to own damage only, never to third party',
      });
    }
  }
  if (wantsTp) {
    lines.push({
      label: 'Third party',
      amount: thirdParty,
      note: 'Set by engine size and never discounted',
    });
  }
  for (const entry of addOns) {
    lines.push({ label: entry.addOn.name, amount: entry.amount });
  }
  lines.push({ label: `Tax (${PREMIUM_TAX_PERCENT}%)`, amount: tax });

  return {
    insurer,
    model,
    plan: input.plan,
    idv,
    idvRange: range,
    ownDamage,
    ncbPercent: bonus,
    ncbDiscount,
    thirdParty,
    addOns,
    addOnTotal,
    netPremium,
    taxPercent: PREMIUM_TAX_PERCENT,
    tax,
    total: netPremium + tax,
    lines,
  };
}

/** Every insurer's quote, cheapest first. */
export function quotesFor(input: QuoteInput): QuoteResult {
  const model = findModel(input.modelId);
  if (!model) {
    return { ok: false, code: 'UNKNOWN_MODEL', message: 'Choose a vehicle from the list.' };
  }

  if (!Number.isInteger(input.ageMonths) || input.ageMonths < 0 || input.ageMonths > 360) {
    return { ok: false, code: 'BAD_AGE', message: 'Enter how old the vehicle is, in months.' };
  }

  if (input.idv !== null) {
    const range = idvFor(model, input.ageMonths);
    // Checked against the widest band any insurer would accept, since the
    // customer picks one value and every insurer is quoted on it.
    const widest = { min: Math.round(range.min * 0.85), max: Math.round(range.max * 1.15) };
    if (input.idv < widest.min || input.idv > widest.max) {
      return {
        ok: false,
        code: 'BAD_IDV',
        message: 'That declared value is outside what any insurer here would accept.',
      };
    }
  }

  const quotes = INSURERS.map((insurer) => quoteFrom(insurer, input)).filter(
    (quote): quote is Quote => quote !== null,
  );

  return { ok: true, quotes: quotes.sort((a, b) => a.total - b.total) };
}

export { findInsurer, findModel, PLAN_KINDS };
