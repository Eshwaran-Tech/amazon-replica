import { findBiller } from '@/data/billers';
import { accountRandom, between, cycleFor, holderName } from '@/lib/bills/derive';
import { instalment } from '@/services/emi';
import { rupeesToPaise, type Paise } from '@/lib/utils/money';

import { billRupees, sumLines, type BillBase, type BillLine } from './types';

/**
 * Credit cards and loans.
 *
 * Both are borrowing, and both hide the same thing behind a single figure: what
 * the money actually costs. Each page here is built around the number the real
 * statement leaves out.
 *
 *  - A **credit card** shows a total due and a minimum due, and lets you tap
 *    the smaller one. What it does not show is that paying the minimum on a
 *    revolving balance takes years and costs more in interest than the original
 *    purchase. That figure is computed here, month by month.
 *  - A **loan** shows an EMI. What it does not show is how little of that EMI
 *    is principal in the early years, or what putting one extra instalment in
 *    would do to the tenure. Both are computed here.
 */

// ------------------------------------------------------------- credit card

/**
 * A month's interest on a revolving balance.
 *
 * 3.5% a month is 42% a year, and that is not an exaggeration -- it is roughly
 * what an Indian card charges once you stop paying in full. The page says the
 * annual figure out loud because "3.5%" reads as small and 42% does not.
 */
export const CARD_MONTHLY_RATE = 3.5;
export const CARD_ANNUAL_RATE = CARD_MONTHLY_RATE * 12;

/** Minimum due: a percentage of the balance, with a floor. */
export const MIN_DUE_PERCENT = 5;
export const MIN_DUE_FLOOR_RUPEES = 200;

/** Late payment fee, banded by what is outstanding. Real shape, own figures. */
export const LATE_FEE_BANDS: ReadonlyArray<{ upToRupees: number; feeRupees: number }> = [
  { upToRupees: 500, feeRupees: 0 },
  { upToRupees: 1000, feeRupees: 250 },
  { upToRupees: 10_000, feeRupees: 500 },
  { upToRupees: 25_000, feeRupees: 750 },
  { upToRupees: 50_000, feeRupees: 1000 },
  { upToRupees: Number.POSITIVE_INFINITY, feeRupees: 1300 },
];

export function lateFeeFor(outstanding: Paise): Paise {
  const rupees = outstanding / 100;
  const band = LATE_FEE_BANDS.find((entry) => rupees <= entry.upToRupees);
  return billRupees(band?.feeRupees ?? 0);
}

export function minimumDue(balance: Paise): Paise {
  if (balance <= 0) return 0;
  // Whole rupees: a statement has never asked anybody for Rs1,763.30.
  const percentage = billRupees((balance * MIN_DUE_PERCENT) / 100 / 100);
  return Math.min(balance, Math.max(percentage, rupeesToPaise(MIN_DUE_FLOOR_RUPEES)));
}

export interface RevolveOutcome {
  /** Months to clear the balance paying only the minimum. */
  months: number;
  /** Interest paid over those months. */
  interest: Paise;
  /** Everything paid, principal included. */
  totalPaid: Paise;
  /** True if the minimum never clears it, which happens when it is too small. */
  neverClears: boolean;
}

/**
 * What paying only the minimum costs.
 *
 * Simulated month by month rather than closed-form, because the minimum due is
 * a percentage *with a floor* -- the floor takes over near the end and no
 * formula covers both halves. 600 months is the cutoff; anything that long is
 * reported as never clearing, which is the honest answer.
 */
export function revolveCost(
  balance: Paise,
  monthlyRatePercent = CARD_MONTHLY_RATE,
): RevolveOutcome {
  let outstanding = balance;
  let interest = 0;
  let paid = 0;
  let months = 0;

  while (outstanding > 0 && months < 600) {
    const charge = Math.round((outstanding * monthlyRatePercent) / 100);
    outstanding += charge;
    interest += charge;

    const payment = Math.min(outstanding, minimumDue(outstanding));
    if (payment <= charge) {
      // The minimum no longer covers even the interest: it will never clear.
      return {
        months: 600,
        interest: billRupees(interest / 100),
        totalPaid: billRupees(paid / 100),
        neverClears: true,
      };
    }

    outstanding -= payment;
    paid += payment;
    months += 1;
  }

  // Rounded only at the end: the simulation runs in exact paise so the month-by-month
  // arithmetic does not drift, but a thirteen-year projection quoted to the
  // paisa reads as a precision nobody has.
  return {
    months,
    interest: billRupees(interest / 100),
    totalPaid: billRupees(paid / 100),
    neverClears: months >= 600,
  };
}

export interface CardBill extends BillBase {
  category: 'CREDIT_CARD';
  /** Last four digits, which is all this store ever holds. */
  lastFour: string;
  creditLimit: Paise;
  /** Statement balance -- what is due. */
  statementBalance: Paise;
  minimumDue: Paise;
  /** Spent since the statement, not yet due. */
  unbilled: Paise;
  availableLimit: Paise;
  /** Interest already charged because last month was not cleared. */
  interestCharged: Paise;
  lateFee: Paise;
  /** Reward points on the card. */
  rewardPoints: number;
  monthlyRate: number;
  annualRate: number;
  /** What paying only the minimum would cost from here. */
  revolve: RevolveOutcome;
}

/**
 * A card statement.
 *
 * **The full card number is never asked for and never stored.** A real bill
 * payment page takes it; this one takes the registered mobile and the last four
 * digits, because that identifies the card to the person holding it without
 * this store ever touching a PAN. The same rule `services/saved-cards.ts`
 * follows, for the same reason.
 */
export function cardBill(billerId: string, account: string, now = new Date()): CardBill | null {
  const biller = findBiller(billerId);
  if (!biller || biller.category !== 'CREDIT_CARD') return null;

  const random = accountRandom(billerId, account);
  const holder = holderName(random);
  const cycle = cycleFor(random, now, { months: 1, dueInDays: 20 });

  const lastFour = account.slice(-4);
  const creditLimit = billRupees(between(random, 12, 90) * 5000);
  const utilisation = 0.08 + random() * 0.72;
  const statementBalance = billRupees(Math.round((creditLimit * utilisation) / 100));
  const unbilled = billRupees(between(random, 0, Math.round(statementBalance / 100 / 3)));

  // Interest appears only when last month was revolved, which is what makes it
  // worth showing at all.
  const revolvedLastMonth = random() < 0.45;
  const interestCharged = revolvedLastMonth
    ? billRupees(Math.round(((statementBalance / 100) * CARD_MONTHLY_RATE) / 100))
    : 0;
  const lateFee = cycle.daysLate > 0 ? lateFeeFor(statementBalance) : 0;

  const lines: BillLine[] = [
    {
      label: 'Purchases and cash advances',
      amount: statementBalance - interestCharged,
      note: `Statement for ${cycle.label}`,
    },
  ];
  if (interestCharged > 0) {
    lines.push({
      label: `Interest (${CARD_MONTHLY_RATE}% a month)`,
      amount: interestCharged,
      note: 'Charged because last month was not paid in full',
    });
  }
  if (lateFee > 0) {
    lines.push({
      label: 'Late payment fee',
      amount: lateFee,
      note: `${cycle.daysLate} day${cycle.daysLate === 1 ? '' : 's'} past the due date`,
    });
  }

  const total = sumLines(lines);

  return {
    category: 'CREDIT_CARD',
    billerId,
    billerName: biller.name,
    account,
    holder,
    cycle,
    lastFour,
    creditLimit,
    statementBalance: total,
    minimumDue: minimumDue(total),
    unbilled,
    availableLimit: Math.max(0, creditLimit - total - unbilled),
    interestCharged,
    lateFee,
    rewardPoints: between(random, 120, 24_000),
    monthlyRate: CARD_MONTHLY_RATE,
    annualRate: CARD_ANNUAL_RATE,
    revolve: revolveCost(total),
    lines,
    total,
  };
}

// -------------------------------------------------------------------- loan

/**
 * The loan book.
 *
 * `lakhs` bounds the principal, because a loan's size is not independent of
 * what it is for: nobody writes a ninety-lakh personal loan, and nobody writes
 * a two-lakh home loan. Rates and tenures follow the same logic -- an unsecured
 * personal loan is dearer and shorter than a mortgage, everywhere, always.
 */
export const LOAN_KINDS = [
  { prefix: 'HL', label: 'Home loan', rate: 8.6, years: [10, 15, 20, 25, 30], lakhs: [15, 120] },
  { prefix: 'CL', label: 'Car loan', rate: 9.4, years: [3, 5, 7], lakhs: [3, 30] },
  { prefix: 'PL', label: 'Personal loan', rate: 14.5, years: [1, 2, 3, 5], lakhs: [1, 15] },
  { prefix: 'EL', label: 'Education loan', rate: 10.2, years: [5, 7, 10, 15], lakhs: [2, 45] },
  { prefix: 'BL', label: 'Business loan', rate: 15.8, years: [1, 3, 5], lakhs: [5, 60] },
] as const;

export interface AmortisationRow {
  month: number;
  /** Opening balance for that month. */
  opening: Paise;
  interest: Paise;
  principal: Paise;
  closing: Paise;
}

/** One instalment split into its two halves. */
export function splitInstalment(
  outstanding: Paise,
  annualRate: number,
  emi: Paise,
): { interest: Paise; principal: Paise } {
  const interest = Math.round((outstanding * (annualRate / 100 / 12)) / 1);
  const capped = Math.min(interest, emi);
  return { interest: capped, principal: emi - capped };
}

export interface PrepaymentOutcome {
  /** Instalments still to run without a prepayment. */
  monthsWithout: number;
  /** And with it. */
  monthsWith: number;
  monthsSaved: number;
  interestWithout: Paise;
  interestWith: Paise;
  interestSaved: Paise;
}

/**
 * What one lump sum does to a loan.
 *
 * Run forward month by month, twice. The result is always larger than people
 * expect, because a prepayment comes straight off principal and every future
 * month's interest is charged on what is left -- so the saving compounds for
 * the rest of the tenure.
 */
export function prepaymentEffect(
  outstanding: Paise,
  annualRate: number,
  emi: Paise,
  lumpSum: Paise,
): PrepaymentOutcome {
  const run = (start: Paise): { months: number; interest: Paise } => {
    let balance = start;
    let interest = 0;
    let months = 0;

    while (balance > 0 && months < 600) {
      const charge = Math.round(balance * (annualRate / 100 / 12));
      if (emi <= charge) return { months: 600, interest };
      interest += charge;
      balance = balance + charge - emi;
      months += 1;
      if (balance < 0) balance = 0;
    }
    return { months, interest };
  };

  const without = run(outstanding);
  const with_ = run(Math.max(0, outstanding - lumpSum));

  return {
    monthsWithout: without.months,
    monthsWith: with_.months,
    monthsSaved: Math.max(0, without.months - with_.months),
    interestWithout: without.interest,
    interestWith: with_.interest,
    interestSaved: Math.max(0, without.interest - with_.interest),
  };
}

export interface LoanBill extends BillBase {
  category: 'LOAN';
  kind: string;
  principal: Paise;
  annualRate: number;
  tenureMonths: number;
  paidMonths: number;
  remainingMonths: number;
  emi: Paise;
  outstanding: Paise;
  /** This month's instalment, split. */
  thisMonth: { interest: Paise; principal: Paise };
  /** Interest still to pay if nothing changes. */
  interestRemaining: Paise;
  /** The next twelve instalments. */
  schedule: AmortisationRow[];
  /** Foreclosure, and what the lender charges for it. */
  foreclosure: { amount: Paise; chargePercent: number; charge: Paise; total: Paise };
}

export function loanBill(billerId: string, account: string, now = new Date()): LoanBill | null {
  const biller = findBiller(billerId);
  if (!biller || biller.category !== 'LOAN') return null;

  const random = accountRandom(billerId, account);
  const holder = holderName(random);
  const cycle = cycleFor(random, now, { months: 1, dueInDays: 7 });

  // The account number's prefix names the loan, which is how a real one works.
  const prefix = account.slice(0, 2);
  const kind = LOAN_KINDS.find((entry) => entry.prefix === prefix) ?? LOAN_KINDS[2];

  const years = kind.years[Math.floor(random() * kind.years.length) % kind.years.length] ?? 5;
  const tenureMonths = years * 12;
  const principal = billRupees(between(random, kind.lakhs[0], kind.lakhs[1]) * 100_000);
  const annualRate = Math.round((kind.rate + (random() - 0.5) * 1.6) * 100) / 100;

  const emi = instalment(principal, annualRate, tenureMonths);
  const paidMonths = between(random, 1, Math.max(1, Math.floor(tenureMonths * 0.7)));

  // Walk the loan forward to where it is, rather than approximating -- an
  // approximated outstanding is the one figure a borrower checks.
  let outstanding = principal;
  for (let month = 0; month < paidMonths && outstanding > 0; month += 1) {
    const charge = Math.round(outstanding * (annualRate / 100 / 12));
    outstanding = Math.max(0, outstanding + charge - emi);
  }

  const thisMonth = splitInstalment(outstanding, annualRate, emi);

  const schedule: AmortisationRow[] = [];
  let running = outstanding;
  for (let month = 1; month <= 12 && running > 0; month += 1) {
    const split = splitInstalment(running, annualRate, emi);
    const closing = Math.max(0, running - split.principal);
    schedule.push({
      month: paidMonths + month,
      opening: running,
      interest: split.interest,
      principal: split.principal,
      closing,
    });
    running = closing;
  }

  const projection = prepaymentEffect(outstanding, annualRate, emi, 0);
  // A bank does not charge to foreclose a floating-rate loan; an NBFC does.
  const chargePercent = biller.id === 'beacon-finance' ? 4 : 0;
  const charge = Math.round((outstanding * chargePercent) / 100 / 100) * 100;

  const lines: BillLine[] = [
    {
      label: 'Instalment due',
      amount: emi,
      note: `${kind.label} · instalment ${paidMonths + 1} of ${tenureMonths}`,
    },
  ];
  if (cycle.daysLate > 0) {
    lines.push({
      label: 'Late payment charge',
      amount: billRupees(Math.round((emi / 100) * 0.02)),
      note: `${cycle.daysLate} day${cycle.daysLate === 1 ? '' : 's'} past the due date, at 2% of the instalment`,
    });
  }

  return {
    category: 'LOAN',
    billerId,
    billerName: biller.name,
    account,
    holder,
    cycle,
    kind: kind.label,
    principal,
    annualRate,
    tenureMonths,
    paidMonths,
    remainingMonths: projection.monthsWithout,
    emi,
    outstanding,
    thisMonth,
    interestRemaining: projection.interestWithout,
    schedule,
    foreclosure: {
      amount: outstanding,
      chargePercent,
      charge,
      total: outstanding + charge,
    },
    lines,
    total: sumLines(lines),
  };
}
