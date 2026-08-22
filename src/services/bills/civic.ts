import {
  ageFactor,
  FEE_HEADS,
  FEE_LATE_CAP,
  FEE_LATE_PER_DAY,
  PENALTY_PERCENT_PER_MONTH,
  PROPERTY_CESS_PERCENT,
  PROPERTY_TAX_PERCENT,
  PROPERTY_ZONE_RATES,
  REBATE_BEFORE,
  REBATE_PERCENT,
  USAGE_FACTORS,
} from '@/data/bill-tariffs';
import { findBiller } from '@/data/billers';
import { accountRandom, between, holderName, pick } from '@/lib/bills/derive';
import type { Paise } from '@/lib/utils/money';

import { billRupees, sumLines, type BillBase, type BillLine } from './types';

/**
 * Property tax and school fees.
 *
 * Two bills with nothing in common except that both are paid in **instalments
 * against dates**, and both punish you for missing one. That is what these
 * pages are built around, and it is the opposite of a meter reading:
 *
 *  - Property tax carries a **rebate for paying early** and a **penalty that
 *    accrues monthly** once the due date passes. The gap between the two is
 *    real money, and no municipal bill puts them side by side.
 *  - School fees are **termly**, and the late fee accrues **per day** -- with a
 *    cap, because an uncapped daily fee is a trap rather than a deterrent.
 */

// ---------------------------------------------------------- property tax

/** India's financial year runs April to March. */
export function financialYear(now: Date): { startYear: number; label: string } {
  const startYear = now.getMonth() >= 3 ? now.getFullYear() : now.getFullYear() - 1;
  return { startYear, label: `${startYear}-${String((startYear + 1) % 100).padStart(2, '0')}` };
}

export interface TaxInstalment {
  id: string;
  label: string;
  dueOn: Date;
  amount: Paise;
  daysLate: number;
  penalty: Paise;
  payable: Paise;
}

export interface PropertyTaxBill extends BillBase {
  category: 'MUNICIPAL_TAX';
  /** Read out of the property id. */
  zone: string;
  ward: string;
  builtUpSqFt: number;
  usage: { id: string; label: string; factor: number };
  ageYears: number;
  zoneRate: number;
  /** Area x zone rate x usage x age. What the tax is a percentage of. */
  rateableValue: Paise;
  taxPercent: number;
  baseTax: Paise;
  cess: Paise;
  annualDemand: Paise;
  financialYear: string;
  instalments: TaxInstalment[];
  /** Paying the whole year before the cutoff earns this. */
  rebate: { available: boolean; percent: number; amount: Paise; before: Date };
  /** Full year, after rebate or with penalties, whichever applies today. */
  fullYearPayable: Paise;
}

export function propertyTaxBill(
  billerId: string,
  account: string,
  now = new Date(),
): PropertyTaxBill | null {
  const biller = findBiller(billerId);
  if (!biller || biller.category !== 'MUNICIPAL_TAX') return null;

  const random = accountRandom(billerId, account);
  const holder = holderName(random);

  // Zone, ward and serial are genuinely what a property id encodes.
  const zoneIndex = Number.parseInt(account.slice(0, 2), 10) % PROPERTY_ZONE_RATES.length;
  const zoneEntry = PROPERTY_ZONE_RATES[zoneIndex] ?? PROPERTY_ZONE_RATES[0];
  const ward = account.slice(2, 5);

  const builtUpSqFt = between(random, 450, 3200);
  const usage = pick(USAGE_FACTORS, random);
  const ageYears = between(random, 1, 55);

  const zoneRate = zoneEntry?.perSqFtPerYear ?? 24;
  const rateableRupees = builtUpSqFt * zoneRate * usage.factor * ageFactor(ageYears);
  const rateableValue = billRupees(rateableRupees);

  const baseTax = billRupees((rateableRupees * PROPERTY_TAX_PERCENT) / 100);
  const cess = billRupees(((baseTax / 100) * PROPERTY_CESS_PERCENT) / 100);
  const annualDemand = baseTax + cess;

  const year = financialYear(now);
  const half = Math.round(annualDemand / 2 / 100) * 100;

  const midnight = new Date(now);
  midnight.setHours(0, 0, 0, 0);

  const makeInstalment = (id: string, label: string, dueOn: Date, amount: Paise): TaxInstalment => {
    const daysLate = Math.max(
      0,
      Math.floor((midnight.getTime() - dueOn.getTime()) / (24 * 60 * 60 * 1000)),
    );
    // The penalty is charged per completed month, not pro rata per day --
    // which means one day late and thirty days late cost the same, and that is
    // worth a customer knowing before they leave it another fortnight.
    const monthsLate = Math.floor(daysLate / 30);
    const penalty = billRupees(((amount / 100) * PENALTY_PERCENT_PER_MONTH * monthsLate) / 100);
    return { id, label, dueOn, amount, daysLate, penalty, payable: amount + penalty };
  };

  const instalments = [
    makeInstalment('first', 'First half', new Date(year.startYear, 8, 30), half),
    makeInstalment(
      'second',
      'Second half',
      new Date(year.startYear + 1, 2, 31),
      annualDemand - half,
    ),
  ];

  const rebateBefore = new Date(year.startYear, REBATE_BEFORE.month, REBATE_BEFORE.day);
  const rebateAvailable = midnight.getTime() <= rebateBefore.getTime();
  const rebateAmount = billRupees(((annualDemand / 100) * REBATE_PERCENT) / 100);

  const penaltyTotal = instalments.reduce((sum, entry) => sum + entry.penalty, 0);
  const fullYearPayable = rebateAvailable
    ? annualDemand - rebateAmount
    : annualDemand + penaltyTotal;

  const lines: BillLine[] = [
    {
      label: `Property tax (${PROPERTY_TAX_PERCENT}% of rateable value)`,
      amount: baseTax,
      note: `${builtUpSqFt} sq ft · zone ${zoneEntry?.zone ?? '-'} at ₹${zoneRate} a sq ft · ${usage.label.toLowerCase()}`,
    },
    {
      label: `Education and library cess (${PROPERTY_CESS_PERCENT}%)`,
      amount: cess,
      note: 'On the tax, not on the rateable value',
    },
  ];
  if (rebateAvailable) {
    lines.push({
      label: `Early payment rebate (${REBATE_PERCENT}%)`,
      amount: -rebateAmount,
      note: `Applies to the whole year if paid before ${rebateBefore.toLocaleDateString('en-IN', { day: 'numeric', month: 'long' })}`,
    });
  } else if (penaltyTotal > 0) {
    lines.push({
      label: `Penalty (${PENALTY_PERCENT_PER_MONTH}% a month)`,
      amount: penaltyTotal,
      note: 'Charged per completed month past each due date',
    });
  }

  return {
    category: 'MUNICIPAL_TAX',
    billerId,
    billerName: biller.name,
    account,
    holder,
    // A property tax demand is annual, so the "cycle" is the financial year.
    cycle: {
      from: new Date(year.startYear, 3, 1),
      to: new Date(year.startYear + 1, 2, 31),
      dueOn: instalments[0]?.dueOn ?? new Date(year.startYear, 8, 30),
      daysLate: instalments[0]?.daysLate ?? 0,
      label: `Financial year ${year.label}`,
    },
    zone: zoneEntry?.zone ?? '-',
    ward,
    builtUpSqFt,
    usage,
    ageYears,
    zoneRate,
    rateableValue,
    taxPercent: PROPERTY_TAX_PERCENT,
    baseTax,
    cess,
    annualDemand,
    financialYear: year.label,
    instalments,
    rebate: {
      available: rebateAvailable,
      percent: REBATE_PERCENT,
      amount: rebateAmount,
      before: rebateBefore,
    },
    fullYearPayable,
    lines,
    total: sumLines(lines),
  };
}

// ------------------------------------------------------------ school fees

export interface FeeTerm {
  id: string;
  label: string;
  dueOn: Date;
  heads: Array<{ label: string; amount: Paise }>;
  amount: Paise;
  paid: boolean;
  daysLate: number;
  lateFee: Paise;
  payable: Paise;
}

export interface EducationBill extends BillBase {
  category: 'EDUCATION';
  studentName: string;
  /** Read out of the enrolment number. */
  admissionYear: number;
  className: string;
  terms: FeeTerm[];
  /** Terms still to pay. */
  outstandingTerms: number;
  annualFee: Paise;
  lateFeePerDay: number;
  lateFeeCap: number;
}

const SCHOOL_CLASSES = [
  'Class VI',
  'Class VII',
  'Class VIII',
  'Class IX',
  'Class X',
  'Class XI',
  'Class XII',
];

const COLLEGE_YEARS = ['First year', 'Second year', 'Third year', 'Fourth year'];

export function educationBill(
  billerId: string,
  account: string,
  now = new Date(),
): EducationBill | null {
  const biller = findBiller(billerId);
  if (!biller || biller.category !== 'EDUCATION') return null;

  const random = accountRandom(billerId, account);
  const studentName = holderName(random);
  const admissionYear = Number.parseInt(account.slice(0, 4), 10);
  // A college runs two semesters and has years; a school runs three terms and
  // has classes. Sharing one list put Class VII students in a college.
  const isCollege = biller.id === 'stonebridge-college';
  const className = pick(isCollege ? COLLEGE_YEARS : SCHOOL_CLASSES, random);
  const termCount = isCollege ? 2 : 3;
  const annualFee = billRupees(between(random, 24, 210) * 1000);
  const termFee = Math.round(annualFee / termCount / 100) * 100;

  // Which heads this student actually carries. Transport and hostel are not
  // charged to everybody, so they are not shown to everybody.
  const hasTransport = random() < 0.55;
  const hasHostel = isCollege && random() < 0.4;

  const heads = FEE_HEADS.filter((head) => {
    if (head.id === 'transport') return hasTransport;
    if (head.id === 'hostel') return hasHostel;
    return true;
  });
  const shareTotal = heads.reduce((sum, head) => sum + head.share, 0);

  const year = financialYear(now);
  const midnight = new Date(now);
  midnight.setHours(0, 0, 0, 0);

  // Terms fall in April, August and December of the academic year.
  const dueMonths = termCount === 2 ? [3, 9] : [3, 7, 11];
  const termLabels =
    termCount === 2 ? ['First semester', 'Second semester'] : ['Term I', 'Term II', 'Term III'];

  const terms: FeeTerm[] = dueMonths.map((month, index) => {
    const dueOn = new Date(year.startYear + (month < 3 ? 1 : 0), month, 10);
    const daysLate = Math.max(
      0,
      Math.floor((midnight.getTime() - dueOn.getTime()) / (24 * 60 * 60 * 1000)),
    );
    // A term more than a full term overdue is taken as already settled -- a
    // school does not let a year run with the first term unpaid.
    const paid = daysLate > 120;
    const lateFee =
      paid || daysLate === 0 ? 0 : billRupees(Math.min(FEE_LATE_CAP, daysLate * FEE_LATE_PER_DAY));

    const termHeads = heads.map((head) => ({
      label: head.label,
      amount: Math.round((termFee * head.share) / shareTotal / 100) * 100,
    }));
    const amount = termHeads.reduce((sum, head) => sum + head.amount, 0);

    return {
      id: `term-${index + 1}`,
      label: termLabels[index] ?? `Term ${index + 1}`,
      dueOn,
      heads: termHeads,
      amount,
      paid,
      daysLate: paid ? 0 : daysLate,
      lateFee,
      payable: paid ? 0 : amount + lateFee,
    };
  });

  const due = terms.filter((term) => !term.paid);
  const next = due[0];

  const lines: BillLine[] = next
    ? [
        ...next.heads.map((head) => ({ label: head.label, amount: head.amount })),
        ...(next.lateFee > 0
          ? [
              {
                label: 'Late fee',
                amount: next.lateFee,
                note: `${next.daysLate} days at ₹${FEE_LATE_PER_DAY} a day, capped at ₹${FEE_LATE_CAP}`,
              },
            ]
          : []),
      ]
    : [];

  return {
    category: 'EDUCATION',
    billerId,
    billerName: biller.name,
    account,
    holder: studentName,
    cycle: {
      from: new Date(year.startYear, 3, 1),
      to: new Date(year.startYear + 1, 2, 31),
      dueOn: next?.dueOn ?? new Date(year.startYear + 1, 2, 31),
      daysLate: next?.daysLate ?? 0,
      label: `Academic year ${year.label}`,
    },
    studentName,
    admissionYear,
    className,
    terms,
    outstandingTerms: due.length,
    annualFee,
    lateFeePerDay: FEE_LATE_PER_DAY,
    lateFeeCap: FEE_LATE_CAP,
    lines,
    total: sumLines(lines),
  };
}
