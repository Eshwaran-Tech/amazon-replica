import { findBiller } from '@/data/billers';
import {
  alaCarteValue,
  BOUQUETS,
  channelsToNextStep,
  CHANNELS,
  DTH_TERMS,
  findBouquet,
  findChannel,
  findDthOperator,
  FREE_TO_AIR,
  networkCapacityFee,
  TV_GST_PERCENT,
  type Bouquet,
  type Channel,
} from '@/data/television';
import { accountRandom, between, cycleFor, holderName } from '@/lib/bills/derive';
import type { Paise } from '@/lib/utils/money';

import { billRupees, sumLines, type BillBase, type BillLine } from './types';

/**
 * Cable and DTH, priced the way the regulator says they are priced.
 *
 * One engine serves both because they genuinely are the same tariff -- a
 * capacity fee for the *count* of pay channels, plus the published price of
 * whatever you take, plus GST. What differs is the surface: a cable bill is
 * raised monthly against a subscriber id, and a DTH account is *recharged* in
 * advance for a term, which is why the DTH page has a term picker and a
 * discount and the cable page does not.
 *
 * The part worth building carefully is the **selection**, because that is where
 * the money actually is. Almost everybody carries two hundred channels to watch
 * nine, and nothing on a real bill makes the connection between the two.
 */

export interface Selection {
  bouquets: Bouquet[];
  /** Channels taken singly, excluding any already inside a chosen bouquet. */
  channels: Channel[];
}

/**
 * Resolves a selection, dropping à la carte channels a bouquet already carries.
 *
 * Without this, picking "MovieSphere Max" and then MovieSphere on its own bills
 * the channel twice -- which no operator does and which would quietly inflate
 * every total on the page.
 */
export function resolveSelection(bouquetIds: string[], channelIds: string[]): Selection {
  const bouquets = bouquetIds
    .map((id) => findBouquet(id))
    .filter((bouquet): bouquet is Bouquet => bouquet !== undefined);

  const inBouquets = new Set(bouquets.flatMap((bouquet) => bouquet.channelIds));

  const seen = new Set<string>();
  const channels = channelIds
    .map((id) => findChannel(id))
    .filter((channel): channel is Channel => channel !== undefined)
    .filter((channel) => !channel.freeToAir)
    .filter((channel) => !inBouquets.has(channel.id))
    .filter((channel) => {
      if (seen.has(channel.id)) return false;
      seen.add(channel.id);
      return true;
    });

  return { bouquets, channels };
}

export interface SelectionQuote {
  /** Pay channels carried, which is what the capacity fee counts. */
  payChannelCount: number;
  /** Free-to-air channels carried. They cost nothing and count for nothing. */
  freeToAirCount: number;
  ncf: Paise;
  /** How many more channels before the fee steps up. Null once capped. */
  toNextStep: number | null;
  bouquetTotal: Paise;
  alaCarteTotal: Paise;
  /** What the same channels would cost with no bouquet at all. */
  ifBoughtSingly: Paise;
  /** What the bouquets save against that. Never negative. */
  bouquetSaving: Paise;
  contentTotal: Paise;
  gst: Paise;
  monthlyTotal: Paise;
  lines: BillLine[];
}

export function quoteSelection(selection: Selection): SelectionQuote {
  const bouquetChannels = new Set(selection.bouquets.flatMap((bouquet) => bouquet.channelIds));
  for (const channel of selection.channels) bouquetChannels.add(channel.id);

  // Free-to-air channels are carried by everybody and counted by nobody.
  const payChannelCount = [...bouquetChannels].filter(
    (id) => findChannel(id)?.freeToAir !== true,
  ).length;

  const ncfRupees = networkCapacityFee(payChannelCount);
  const bouquetRupees = selection.bouquets.reduce((sum, bouquet) => sum + bouquet.priceRupees, 0);
  const alaCarteRupees = selection.channels.reduce((sum, channel) => sum + channel.mrpRupees, 0);

  // The comparison that makes a bouquet worth taking, or not.
  const singlyRupees =
    selection.bouquets.reduce((sum, bouquet) => sum + alaCarteValue(bouquet), 0) + alaCarteRupees;

  const contentRupees = bouquetRupees + alaCarteRupees;
  const gstRupees = ((ncfRupees + contentRupees) * TV_GST_PERCENT) / 100;

  const lines: BillLine[] = [
    {
      label: 'Network capacity fee',
      amount: billRupees(ncfRupees),
      note:
        payChannelCount === 0
          ? 'No pay channels carried'
          : `${payChannelCount} pay channel${payChannelCount === 1 ? '' : 's'} carried; free-to-air are not counted`,
    },
  ];
  for (const bouquet of selection.bouquets) {
    lines.push({
      label: bouquet.name,
      amount: billRupees(bouquet.priceRupees),
      note: `${bouquet.channelIds.length} channels, worth ₹${alaCarteValue(bouquet)} bought singly`,
    });
  }
  if (selection.channels.length > 0) {
    lines.push({
      label: 'Channels taken singly',
      amount: billRupees(alaCarteRupees),
      note: selection.channels.map((channel) => channel.name).join(', '),
    });
  }
  lines.push({ label: `GST (${TV_GST_PERCENT}%)`, amount: billRupees(gstRupees) });

  return {
    payChannelCount,
    freeToAirCount: FREE_TO_AIR.length,
    ncf: billRupees(ncfRupees),
    toNextStep: channelsToNextStep(payChannelCount),
    bouquetTotal: billRupees(bouquetRupees),
    alaCarteTotal: billRupees(alaCarteRupees),
    ifBoughtSingly: billRupees(singlyRupees),
    bouquetSaving: billRupees(Math.max(0, singlyRupees - contentRupees)),
    contentTotal: billRupees(contentRupees),
    gst: billRupees(gstRupees),
    monthlyTotal: billRupees(ncfRupees + contentRupees + gstRupees),
    lines,
  };
}

/** The selection an account is derived to be carrying today. */
function derivedSelection(random: () => number): Selection {
  const bouquets: Bouquet[] = [];
  for (const bouquet of BOUQUETS) {
    if (random() < 0.42) bouquets.push(bouquet);
  }
  if (bouquets.length === 0 && BOUQUETS[0]) bouquets.push(BOUQUETS[0]);

  const channels: Channel[] = [];
  for (const channel of CHANNELS) {
    if (!channel.freeToAir && random() < 0.12) channels.push(channel);
  }

  return resolveSelection(
    bouquets.map((bouquet) => bouquet.id),
    channels.map((channel) => channel.id),
  );
}

// ------------------------------------------------------------------- cable

export interface CableBill extends BillBase {
  category: 'CABLE';
  selection: Selection;
  quote: SelectionQuote;
  /** Carried forward from last month, where anything was left unpaid. */
  arrears: Paise;
}

export function cableBill(billerId: string, account: string, now = new Date()): CableBill | null {
  const biller = findBiller(billerId);
  if (!biller || biller.category !== 'CABLE') return null;

  const random = accountRandom(billerId, account);
  const holder = holderName(random);
  const cycle = cycleFor(random, now, { months: 1, dueInDays: 10 });

  const selection = derivedSelection(random);
  const quote = quoteSelection(selection);
  const arrears = random() < 0.18 ? billRupees(between(random, 50, 600)) : 0;

  const lines: BillLine[] = [...quote.lines];
  if (arrears > 0) {
    lines.push({
      label: 'Brought forward',
      amount: arrears,
      note: 'Unpaid from the previous month',
    });
  }

  return {
    category: 'CABLE',
    billerId,
    billerName: biller.name,
    account,
    holder,
    cycle,
    selection,
    quote,
    arrears,
    lines,
    total: sumLines(lines),
  };
}

// --------------------------------------------------------------------- DTH

export interface DthAccount {
  operatorId: string;
  operatorName: string;
  /** The set-top box number typed in. */
  subscriberId: string;
  holder: string;
  /** What is on the account now. */
  balance: Paise;
  selection: Selection;
  quote: SelectionQuote;
  boxRental: Paise;
  /** Monthly outgo, including any box rental. */
  monthlyOutgo: Paise;
  /** Days the current balance lasts at that rate. */
  daysRemaining: number;
  /** Recharge options, cheapest per month last. */
  terms: Array<{
    months: number;
    label: string;
    discountPercent: number;
    amount: Paise;
    perMonth: Paise;
    saves: Paise;
  }>;
}

/**
 * A DTH account.
 *
 * Prepaid rather than billed: there is a balance, it drains at the monthly
 * outgo, and the page's job is to say how long it lasts and what a longer
 * recharge is worth. That is a genuinely different question from "what do I
 * owe", which is why this is not a bill.
 */
export function dthAccount(
  operatorId: string,
  subscriberId: string,
  override?: Selection,
): DthAccount | null {
  const operator = findDthOperator(operatorId);
  if (!operator) return null;

  const random = accountRandom(operatorId, subscriberId);
  const holder = holderName(random);

  const selection = override ?? derivedSelection(random);
  const quote = quoteSelection(selection);
  const boxRental = billRupees(operator.boxRentalRupees);
  const monthlyOutgo = quote.monthlyTotal + boxRental;

  const balance = billRupees(between(random, 0, 900));
  const daysRemaining =
    monthlyOutgo > 0 ? Math.floor((balance / monthlyOutgo) * 30) : Number.POSITIVE_INFINITY;

  const single = monthlyOutgo;
  const terms = DTH_TERMS.map((term) => {
    const gross = single * term.months;
    const amount = Math.round((gross * (1 - term.discountPercent / 100)) / 100) * 100;
    return {
      months: term.months,
      label: term.label,
      discountPercent: term.discountPercent,
      amount,
      perMonth: Math.round(amount / term.months / 100) * 100,
      saves: gross - amount,
    };
  });

  return {
    operatorId: operator.id,
    operatorName: operator.name,
    subscriberId,
    holder,
    balance,
    selection,
    quote,
    boxRental,
    monthlyOutgo,
    daysRemaining: Number.isFinite(daysRemaining) ? daysRemaining : 0,
    terms,
  };
}
