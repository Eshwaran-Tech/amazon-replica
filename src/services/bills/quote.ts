import { normaliseAccount, type BillCategory } from '@/data/billers';
import { findCylinder, findSlot } from '@/data/lpg';
import type { Paise } from '@/lib/utils/money';

import { cardBill, loanBill } from './credit';
import { educationBill, propertyTaxBill } from './civic';
import { checkBooking, fromDayKey, lpgConnection, quoteRefill } from './lpg';
import { broadbandBill, landlineBill, postpaidBill } from './telecom';
import { cableBill, dthAccount, quoteSelection, resolveSelection } from './television';
import { billRupees, type BillLine } from './types';
import { electricityBill, gasBill, waterBill } from './utility';

/**
 * The single pricing authority for everything under Bill Payments.
 *
 * **Every page quotes through here, and so does the payment action.** That is
 * the whole reason it exists: the amount a customer is charged must come from
 * the same function that produced the amount they were shown, recomputed on the
 * server from identifiers alone. The form carries a biller, an account and a
 * choice -- never a figure. The same rule checkout, Prime, the recharge book
 * and the insurance quotes all follow.
 *
 * A category with two ways to pay -- the minimum or the whole card bill, one
 * instalment or the full year's tax -- expresses that as a `PayOption`, so the
 * choice travels as a name rather than as a number.
 */

export type PayOption =
  /** Whatever the bill says is due now. */
  | { kind: 'FULL' }
  /** Credit card: the minimum due, with the consequence spelled out. */
  | { kind: 'MINIMUM' }
  /** Credit card or loan: a part payment the customer typed. */
  | { kind: 'CUSTOM'; rupees: number }
  /** Property tax or a school term: one named instalment. */
  | { kind: 'INSTALMENT'; id: string }
  /** Property tax: the whole year, which is what earns the rebate. */
  | { kind: 'FULL_YEAR' }
  /** Loan: close it early, with the lender's charge. */
  | { kind: 'FORECLOSE' }
  /** Loan: an instalment plus a lump sum off the principal. */
  | { kind: 'PREPAY'; rupees: number }
  /** DTH: a chosen pack and a term. */
  | { kind: 'DTH'; bouquets: string[]; channels: string[]; months: number }
  /** LPG: a cylinder, a day and a slot. */
  | { kind: 'REFILL'; cylinderId: string; date: string; slotId: string };

export interface Quote {
  billerName: string;
  holder: string;
  /** The cycle, the term or the year this settles. */
  period: string;
  components: BillLine[];
  amount: Paise;
  /** What the payment is, in one line, for the confirmation. */
  summary: string;
  /** Only an LPG refill carries one. */
  booking: {
    cylinderId: string;
    cylinderLabel: string;
    deliverOn: Date;
    slotId: string;
    slotLabel: string;
    subsidyTransfer: Paise;
  } | null;
}

export type QuoteResult =
  | { ok: true; quote: Quote }
  | { ok: false; code: 'BAD_ACCOUNT' | 'NO_BILL' | 'BAD_OPTION' | 'BAD_AMOUNT'; message: string };

const bad = (code: 'BAD_ACCOUNT' | 'NO_BILL' | 'BAD_OPTION' | 'BAD_AMOUNT', message: string) =>
  ({ ok: false, code, message }) as const;

/** A part payment has to be a sensible fraction of what is owed. */
function checkCustom(rupees: number, minimum: Paise, maximum: Paise): QuoteResult | null {
  if (!Number.isFinite(rupees) || !Number.isInteger(rupees) || rupees <= 0) {
    return bad('BAD_AMOUNT', 'Enter a whole number of rupees.');
  }
  const amount = billRupees(rupees);
  if (amount < minimum) {
    return bad('BAD_AMOUNT', `The least you may pay on this is ₹${minimum / 100}.`);
  }
  if (amount > maximum) {
    return bad('BAD_AMOUNT', `That is more than the ₹${maximum / 100} outstanding.`);
  }
  return null;
}

export function quoteBill(
  category: BillCategory,
  billerId: string,
  rawAccount: string,
  option: PayOption,
  now = new Date(),
): QuoteResult {
  const account = normaliseAccount(category, rawAccount);
  if (!account) {
    return bad('BAD_ACCOUNT', 'That does not look like a valid number for this kind of bill.');
  }

  switch (category) {
    case 'ELECTRICITY': {
      const bill = electricityBill(billerId, account, now);
      if (!bill) return bad('NO_BILL', 'No bill found for that consumer number.');
      return ok(
        bill.billerName,
        bill.holder,
        bill.cycle.label,
        bill.lines,
        bill.total,
        `${bill.units} units for ${bill.cycle.label}`,
      );
    }

    case 'WATER': {
      const bill = waterBill(billerId, account, now);
      if (!bill) return bad('NO_BILL', 'No bill found for that connection.');
      return ok(
        bill.billerName,
        bill.holder,
        bill.cycle.label,
        bill.lines,
        bill.total,
        `${bill.kilolitres} kl for ${bill.cycle.label}`,
      );
    }

    case 'PIPED_GAS': {
      const bill = gasBill(billerId, account, now);
      if (!bill) return bad('NO_BILL', 'No bill found for that BP number.');
      return ok(
        bill.billerName,
        bill.holder,
        bill.cycle.label,
        bill.lines,
        bill.total,
        `${bill.scm} SCM for ${bill.cycle.label}`,
      );
    }

    case 'POSTPAID': {
      const bill = postpaidBill(billerId, account, now);
      if (!bill) return bad('NO_BILL', 'No bill found for that number.');
      return ok(
        bill.billerName,
        bill.holder,
        bill.cycle.label,
        bill.lines,
        bill.total,
        `${bill.plan.name} for ${bill.cycle.label}`,
      );
    }

    case 'LANDLINE': {
      const bill = landlineBill(billerId, account, now);
      if (!bill) return bad('NO_BILL', 'No bill found for that number.');
      return ok(
        bill.billerName,
        bill.holder,
        bill.cycle.label,
        bill.lines,
        bill.total,
        `${bill.planName} for ${bill.cycle.label}`,
      );
    }

    case 'BROADBAND': {
      const bill = broadbandBill(billerId, account, now);
      if (!bill) return bad('NO_BILL', 'No bill found for that account.');
      return ok(
        bill.billerName,
        bill.holder,
        bill.cycle.label,
        bill.lines,
        bill.total,
        `${bill.plan.name} for ${bill.cycle.label}`,
      );
    }

    case 'CABLE': {
      const bill = cableBill(billerId, account, now);
      if (!bill) return bad('NO_BILL', 'No bill found for that subscriber id.');
      return ok(
        bill.billerName,
        bill.holder,
        bill.cycle.label,
        bill.lines,
        bill.total,
        `${bill.quote.payChannelCount} pay channels for ${bill.cycle.label}`,
      );
    }

    case 'CREDIT_CARD': {
      const bill = cardBill(billerId, account, now);
      if (!bill) return bad('NO_BILL', 'No statement found for that card.');

      if (option.kind === 'MINIMUM') {
        return ok(
          bill.billerName,
          bill.holder,
          bill.cycle.label,
          [
            {
              label: 'Minimum due',
              amount: bill.minimumDue,
              note: `${bill.monthlyRate}% a month runs on the rest`,
            },
          ],
          bill.minimumDue,
          `Minimum due on the card ending ${bill.lastFour}`,
        );
      }
      if (option.kind === 'CUSTOM') {
        const problem = checkCustom(option.rupees, billRupees(100), bill.statementBalance);
        if (problem) return problem;
        const amount = billRupees(option.rupees);
        const left = bill.statementBalance - amount;
        return ok(
          bill.billerName,
          bill.holder,
          bill.cycle.label,
          [
            { label: 'Part payment', amount },
            ...(left > 0
              ? [
                  {
                    label: 'Left to revolve',
                    amount: 0,
                    note: `₹${left / 100} carries interest at ${bill.monthlyRate}% a month`,
                  },
                ]
              : []),
          ],
          amount,
          `Part payment on the card ending ${bill.lastFour}`,
        );
      }
      return ok(
        bill.billerName,
        bill.holder,
        bill.cycle.label,
        bill.lines,
        bill.statementBalance,
        `Full statement on the card ending ${bill.lastFour}`,
      );
    }

    case 'LOAN': {
      const bill = loanBill(billerId, account, now);
      if (!bill) return bad('NO_BILL', 'No loan found for that account number.');

      if (option.kind === 'FORECLOSE') {
        return ok(
          bill.billerName,
          bill.holder,
          bill.cycle.label,
          [
            { label: 'Outstanding principal', amount: bill.foreclosure.amount },
            ...(bill.foreclosure.charge > 0
              ? [
                  {
                    label: `Foreclosure charge (${bill.foreclosure.chargePercent}%)`,
                    amount: bill.foreclosure.charge,
                    note: 'A bank may not charge this on a floating-rate loan; a non-bank lender may',
                  },
                ]
              : []),
          ],
          bill.foreclosure.total,
          `Closing the ${bill.kind.toLowerCase()} in full`,
        );
      }
      if (option.kind === 'PREPAY') {
        const problem = checkCustom(option.rupees, billRupees(1000), bill.outstanding - bill.emi);
        if (problem) return problem;
        const lump = billRupees(option.rupees);
        return ok(
          bill.billerName,
          bill.holder,
          bill.cycle.label,
          [
            { label: 'Instalment due', amount: bill.emi },
            {
              label: 'Prepayment against principal',
              amount: lump,
              note: 'Comes straight off the principal',
            },
          ],
          bill.emi + lump,
          `Instalment plus a prepayment on the ${bill.kind.toLowerCase()}`,
        );
      }
      return ok(
        bill.billerName,
        bill.holder,
        bill.cycle.label,
        bill.lines,
        bill.total,
        `Instalment ${bill.paidMonths + 1} of ${bill.tenureMonths}`,
      );
    }

    case 'MUNICIPAL_TAX': {
      const bill = propertyTaxBill(billerId, account, now);
      if (!bill) return bad('NO_BILL', 'No demand found for that property id.');

      if (option.kind === 'INSTALMENT') {
        const instalment = bill.instalments.find((entry) => entry.id === option.id);
        if (!instalment) return bad('BAD_OPTION', 'Choose an instalment.');
        return ok(
          bill.billerName,
          bill.holder,
          bill.financialYear,
          [
            { label: instalment.label, amount: instalment.amount },
            ...(instalment.penalty > 0
              ? [
                  {
                    label: 'Penalty',
                    amount: instalment.penalty,
                    note: `${instalment.daysLate} days past the due date`,
                  },
                ]
              : []),
          ],
          instalment.payable,
          `${instalment.label} of ${bill.financialYear}`,
        );
      }
      // The whole year, which is the only way the rebate applies.
      return ok(
        bill.billerName,
        bill.holder,
        bill.financialYear,
        bill.lines,
        bill.fullYearPayable,
        `Full year ${bill.financialYear}`,
      );
    }

    case 'EDUCATION': {
      const bill = educationBill(billerId, account, now);
      if (!bill) return bad('NO_BILL', 'No fee record found for that enrolment number.');

      const term =
        option.kind === 'INSTALMENT'
          ? bill.terms.find((entry) => entry.id === option.id)
          : bill.terms.find((entry) => !entry.paid);

      if (!term) return bad('BAD_OPTION', 'Nothing is outstanding on this enrolment.');
      if (term.paid) return bad('BAD_OPTION', `${term.label} is already settled.`);

      return ok(
        bill.billerName,
        bill.studentName,
        bill.cycle.label,
        [
          ...term.heads,
          ...(term.lateFee > 0
            ? [
                {
                  label: 'Late fee',
                  amount: term.lateFee,
                  note: `${term.daysLate} days past the due date`,
                },
              ]
            : []),
        ],
        term.payable,
        `${term.label}, ${bill.className}`,
      );
    }

    case 'LPG': {
      if (option.kind !== 'REFILL')
        return bad('BAD_OPTION', 'Choose a cylinder and a delivery slot.');

      const connection = lpgConnection(billerId, account, now);
      if (!connection) return bad('NO_BILL', 'No connection found for that LPG id.');

      const permitted = checkBooking(
        connection,
        option.cylinderId,
        option.date,
        option.slotId,
        now,
      );
      if (!permitted.ok) return bad('BAD_OPTION', permitted.message);

      const refill = quoteRefill(option.cylinderId, connection);
      const cylinder = findCylinder(option.cylinderId);
      const slot = findSlot(option.slotId);
      if (!refill || !cylinder || !slot) return bad('BAD_OPTION', 'Choose a cylinder and a slot.');

      const deliverOn = fromDayKey(option.date);
      if (!deliverOn) return bad('BAD_OPTION', 'Choose a delivery day.');

      return {
        ok: true,
        quote: {
          billerName: connection.distributorName,
          holder: connection.holder,
          period: deliverOn.toLocaleDateString('en-IN', {
            day: 'numeric',
            month: 'long',
            year: 'numeric',
          }),
          components: [{ label: cylinder.label, amount: refill.payable }],
          amount: refill.payable,
          summary: `${cylinder.label}, ${slot.label.toLowerCase()}`,
          booking: {
            cylinderId: cylinder.id,
            cylinderLabel: cylinder.label,
            deliverOn,
            slotId: slot.id,
            slotLabel: slot.label,
            subsidyTransfer: refill.subsidyTransfer,
          },
        },
      };
    }

    case 'DTH':
      // Priced from a selection and a term, not from a bill, so it goes through
      // `quoteDth` rather than through here.
      return bad('BAD_OPTION', 'A DTH recharge is priced from the pack you choose.');

    case 'INSURANCE_PREMIUM':
      // Handled by `services/insurance-renewal.ts`, because the premium comes
      // from a policy this store actually issued rather than from a derivation.
      return bad('BAD_OPTION', 'Insurance premiums are renewed from the policy itself.');

    default:
      return bad('BAD_OPTION', 'That kind of bill cannot be paid here.');
  }
}

function ok(
  billerName: string,
  holder: string,
  period: string,
  components: BillLine[],
  amount: Paise,
  summary: string,
): QuoteResult {
  return {
    ok: true,
    quote: { billerName, holder, period, components, amount, summary, booking: null },
  };
}

/** What a DTH recharge costs, quoted from the selection rather than the form. */
export function quoteDth(
  operatorId: string,
  subscriberId: string,
  option: Extract<PayOption, { kind: 'DTH' }>,
): QuoteResult {
  const selection = resolveSelection(option.bouquets, option.channels);
  if (selection.bouquets.length === 0 && selection.channels.length === 0) {
    return bad('BAD_OPTION', 'Choose at least one pack or channel.');
  }

  const account = dthAccount(operatorId, subscriberId, selection);
  if (!account) return bad('NO_BILL', 'No account found for that subscriber id.');

  const term = account.terms.find((entry) => entry.months === option.months);
  if (!term) return bad('BAD_OPTION', 'Choose how long to recharge for.');

  const monthly = quoteSelection(selection);

  return {
    ok: true,
    quote: {
      billerName: account.operatorName,
      holder: account.holder,
      period: term.label,
      components: [
        ...monthly.lines.map((line) => ({ ...line, amount: line.amount * option.months })),
        ...(account.boxRental > 0
          ? [{ label: 'Set-top box rental', amount: account.boxRental * option.months }]
          : []),
        ...(term.saves > 0
          ? [{ label: `${term.label} discount (${term.discountPercent}%)`, amount: -term.saves }]
          : []),
      ],
      amount: term.amount,
      summary: `${term.label} on ${monthly.payChannelCount} pay channels`,
      booking: null,
    },
  };
}
