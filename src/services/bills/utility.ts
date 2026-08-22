import {
  ELECTRICITY_DUTY_PERCENT,
  ELECTRICITY_FIXED_PER_KW,
  ELECTRICITY_SLABS,
  ELECTRICITY_SURCHARGES,
  GAS_FIXED_PER_CYCLE,
  GAS_SLABS,
  GAS_VAT_PERCENT,
  LPCD_STANDARD,
  SCM_PER_CYLINDER,
  SEWERAGE_CESS_PERCENT,
  WATER_EXTRAS,
  WATER_METER_RENT,
  WATER_SLABS,
} from '@/data/bill-tariffs';
import { findBiller } from '@/data/billers';
import {
  accountRandom,
  applySlabs,
  between,
  cycleFor,
  holderName,
  slabTotal,
  type SlabLine,
} from '@/lib/bills/derive';
import type { Paise } from '@/lib/utils/money';

import { billRupees, sumLines, type BillBase, type BillLine } from './types';

/**
 * The metered bills: electricity, water and piped gas.
 *
 * They share one primitive -- a telescopic slab charge -- because in reality
 * all three are billed that way. Everything else about them differs, and the
 * differences are the point:
 *
 *  - Electricity is **monthly**, carries a **fixed charge per sanctioned kW**
 *    whether or not a unit was drawn, and a **duty** on the energy charge.
 *  - Water is **bi-monthly** and carries a **sewerage cess set as a share of
 *    the water charge**, so it rises with consumption, plus a flat meter rent.
 *  - Piped gas is **bi-monthly** and sits **outside GST**, so it carries VAT.
 *
 * A page that billed water monthly, or put 18% GST on piped gas, would be
 * wrong about the thing the customer is actually being charged.
 */

// ------------------------------------------------------------- electricity

export interface ElectricityBill extends BillBase {
  category: 'ELECTRICITY';
  /** Units drawn this cycle, in kWh. */
  units: number;
  /** Meter readings either end of the cycle. */
  previousReading: number;
  currentReading: number;
  /** Sanctioned load, in kW. The fixed charge is per kW of it. */
  sanctionedLoad: number;
  slabs: SlabLine[];
  /** The last six months, oldest first, for the consumption bars. */
  history: Array<{ label: string; units: number }>;
  /** What one more unit would cost at the margin. */
  marginalRate: number;
  /** Units left before the next slab starts, or null at the top slab. */
  unitsToNextSlab: number | null;
  nextSlabRate: number | null;
}

const MONTH_LABELS = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec',
];

export function electricityBill(
  billerId: string,
  account: string,
  now = new Date(),
): ElectricityBill | null {
  const biller = findBiller(billerId);
  if (!biller || biller.category !== 'ELECTRICITY') return null;

  const random = accountRandom(billerId, account);
  const holder = holderName(random);
  const cycle = cycleFor(random, now, { months: 1, dueInDays: 18 });

  const sanctionedLoad = between(random, 2, 8);
  // A household's draw tracks its sanctioned load, loosely.
  const baseUnits = Math.round(sanctionedLoad * between(random, 22, 58));
  const units = Math.max(30, baseUnits);

  const previousReading = between(random, 10_000, 74_000);
  const currentReading = previousReading + units;

  const slabs = applySlabs(units, ELECTRICITY_SLABS);
  const energy = slabTotal(slabs);
  const fixed = sanctionedLoad * ELECTRICITY_FIXED_PER_KW;
  const duty = (energy * ELECTRICITY_DUTY_PERCENT) / 100;
  const surcharge = ELECTRICITY_SURCHARGES[billerId];
  const surchargeAmount = surcharge ? units * surcharge.perUnit : 0;

  const lines: BillLine[] = [
    {
      label: 'Energy charge',
      amount: billRupees(energy),
      note: `${units} units across ${slabs.length} slab${slabs.length === 1 ? '' : 's'}`,
    },
    {
      label: 'Fixed charge',
      amount: billRupees(fixed),
      note: `${sanctionedLoad} kW sanctioned, charged whether or not a unit is drawn`,
    },
  ];
  if (surcharge && surchargeAmount > 0) {
    lines.push({
      label: surcharge.label,
      amount: billRupees(surchargeAmount),
      note: `₹${surcharge.perUnit.toFixed(2)} a unit`,
    });
  }
  lines.push({
    label: `Electricity duty (${ELECTRICITY_DUTY_PERCENT}%)`,
    amount: billRupees(duty),
    note: 'On the energy charge only',
  });

  // Six months back, with the seasonal swing a real meter shows.
  const history: Array<{ label: string; units: number }> = [];
  for (let back = 5; back >= 0; back -= 1) {
    const month = new Date(cycle.to);
    month.setMonth(month.getMonth() - back);
    const swing = back === 0 ? 1 : 0.72 + random() * 0.55;
    history.push({
      label: MONTH_LABELS[month.getMonth()] ?? '',
      units: back === 0 ? units : Math.round(units * swing),
    });
  }

  // Where the next unit lands, which is the question a slab tariff raises and
  // almost no bill answers.
  let floor = 0;
  let marginalRate = ELECTRICITY_SLABS[ELECTRICITY_SLABS.length - 1]?.rate ?? 0;
  let unitsToNextSlab: number | null = null;
  let nextSlabRate: number | null = null;
  for (let index = 0; index < ELECTRICITY_SLABS.length; index += 1) {
    const slab = ELECTRICITY_SLABS[index];
    if (!slab) continue;
    if (units <= slab.upTo) {
      marginalRate = slab.rate;
      const next = ELECTRICITY_SLABS[index + 1];
      if (next && slab.upTo !== Number.POSITIVE_INFINITY) {
        unitsToNextSlab = slab.upTo - units;
        nextSlabRate = next.rate;
      }
      break;
    }
    floor = slab.upTo;
  }
  void floor;

  return {
    category: 'ELECTRICITY',
    billerId,
    billerName: biller.name,
    account,
    holder,
    cycle,
    units,
    previousReading,
    currentReading,
    sanctionedLoad,
    slabs,
    history,
    marginalRate,
    unitsToNextSlab,
    nextSlabRate,
    lines,
    total: sumLines(lines),
  };
}

// ------------------------------------------------------------------- water

export interface WaterBill extends BillBase {
  category: 'WATER';
  /** Kilolitres drawn over the two-month cycle. */
  kilolitres: number;
  previousReading: number;
  currentReading: number;
  /** People on the connection, which is what makes a reading readable. */
  household: number;
  slabs: SlabLine[];
  /** Litres per person per day. */
  lpcd: number;
  /** What the national standard plans for. */
  lpcdStandard: number;
  /** The cess, as a share of the water charge -- shown because it moves. */
  cessPercent: number;
}

export function waterBill(billerId: string, account: string, now = new Date()): WaterBill | null {
  const biller = findBiller(billerId);
  if (!biller || biller.category !== 'WATER') return null;

  const random = accountRandom(billerId, account);
  const holder = holderName(random);
  // Read every two months, which is what the slab table is priced against.
  const cycle = cycleFor(random, now, { months: 2, dueInDays: 21 });

  const household = between(random, 1, 6);
  // Around the design standard, with real spread either side.
  const perPersonPerDay = between(random, 70, 260);
  const days = 60;
  const kilolitres = Math.max(2, Math.round((household * perPersonPerDay * days) / 1000));

  const previousReading = between(random, 400, 9000);
  const currentReading = previousReading + kilolitres;

  const slabs = applySlabs(kilolitres, WATER_SLABS);
  const water = slabTotal(slabs);
  const cess = (water * SEWERAGE_CESS_PERCENT) / 100;
  const extra = WATER_EXTRAS[billerId];

  const lines: BillLine[] = [
    {
      label: 'Water charge',
      amount: billRupees(water),
      note: `${kilolitres} kl over two months`,
    },
    {
      label: `Sewerage cess (${SEWERAGE_CESS_PERCENT}%)`,
      amount: billRupees(cess),
      note: 'A share of the water charge, so it rises when consumption does',
    },
    {
      label: 'Meter rent',
      amount: billRupees(WATER_METER_RENT),
      note: 'Flat, per connection, per cycle',
    },
  ];
  if (extra) {
    lines.push({ label: extra.label, amount: billRupees(extra.rupees) });
  }

  return {
    category: 'WATER',
    billerId,
    billerName: biller.name,
    account,
    holder,
    cycle,
    kilolitres,
    previousReading,
    currentReading,
    household,
    slabs,
    lpcd: Math.round((kilolitres * 1000) / (household * days)),
    lpcdStandard: LPCD_STANDARD,
    cessPercent: SEWERAGE_CESS_PERCENT,
    lines,
    total: sumLines(lines),
  };
}

// --------------------------------------------------------------- piped gas

export interface GasBill extends BillBase {
  category: 'PIPED_GAS';
  /** Standard cubic metres over the two-month cycle. */
  scm: number;
  previousReading: number;
  currentReading: number;
  slabs: SlabLine[];
  /** How many 14.2 kg cylinders this much gas is worth. */
  cylinderEquivalent: number;
  vatPercent: number;
}

export function gasBill(billerId: string, account: string, now = new Date()): GasBill | null {
  const biller = findBiller(billerId);
  if (!biller || biller.category !== 'PIPED_GAS') return null;

  const random = accountRandom(billerId, account);
  const holder = holderName(random);
  const cycle = cycleFor(random, now, { months: 2, dueInDays: 15 });

  const scm = between(random, 12, 130);
  const previousReading = between(random, 200, 4200);
  const currentReading = previousReading + scm;

  const slabs = applySlabs(scm, GAS_SLABS);
  const gas = slabTotal(slabs);
  // Piped gas is outside GST, so this is VAT and the line says so.
  const vat = ((gas + GAS_FIXED_PER_CYCLE) * GAS_VAT_PERCENT) / 100;

  const lines: BillLine[] = [
    {
      label: 'Gas charge',
      amount: billRupees(gas),
      note: `${scm} SCM over two months`,
    },
    {
      label: 'Fixed charge',
      amount: billRupees(GAS_FIXED_PER_CYCLE),
      note: 'Per bi-monthly cycle',
    },
    {
      label: `VAT (${GAS_VAT_PERCENT}%)`,
      amount: billRupees(vat),
      note: 'Piped natural gas is outside GST, so it carries state VAT',
    },
  ];

  return {
    category: 'PIPED_GAS',
    billerId,
    billerName: biller.name,
    account,
    holder,
    cycle,
    scm,
    previousReading,
    currentReading,
    slabs,
    cylinderEquivalent: Math.round((scm / SCM_PER_CYLINDER) * 10) / 10,
    vatPercent: GAS_VAT_PERCENT,
    lines,
    total: sumLines(lines),
  };
}

/**
 * What the next unit would cost.
 *
 * Not rounded to whole rupees: this is a rate being illustrated, not an amount
 * being billed, and rounding Rs5.60 up to Rs6 would misstate the very thing the
 * line exists to show.
 */
export function marginalCost(units: number, extra: number): Paise {
  const before = slabTotal(applySlabs(units, ELECTRICITY_SLABS));
  const after = slabTotal(applySlabs(units + extra, ELECTRICITY_SLABS));
  return Math.round((after - before) * 100);
}
