import { ObjectId } from 'mongodb';

import { walletEntriesCollection } from '@/lib/db/collections';
import type { Paise } from '@/lib/utils/money';
import { WALLET_ENTRY_TYPES, type WalletEntryType } from '@/models/wallet';

import '@/lib/server-guard';

/**
 * The account statement.
 *
 * The balance page listed the last ten entries and nothing else, which is a
 * receipt rather than a statement. What makes one useful is the things people
 * actually open a statement for: a period, a filter, a running balance, and
 * something they can export.
 *
 * The **running balance** is the part worth getting right. It is computed
 * forwards from the opening balance of the period, so each row shows what the
 * balance was *after* that entry -- the same way a bank statement reads, and
 * the only way a reader can point at the row where a figure went wrong.
 */

export interface StatementRow {
  id: string;
  type: WalletEntryType;
  direction: 'CREDIT' | 'DEBIT';
  amount: Paise;
  status: 'PENDING' | 'COMPLETED' | 'FAILED';
  reference: string;
  createdAt: Date;
  /** The balance after this entry. Pending entries do not move it. */
  balanceAfter: Paise;
}

export interface StatementPeriod {
  /** Inclusive. */
  from: Date;
  /** Exclusive, so a month is [1st, 1st of next). */
  to: Date;
}

export interface Statement {
  period: StatementPeriod;
  /** Balance at the instant the period opened. */
  opening: Paise;
  closing: Paise;
  creditedInPeriod: Paise;
  debitedInPeriod: Paise;
  rows: StatementRow[];
  /** Totals per entry type, for the summary. */
  byType: Array<{ type: WalletEntryType; credited: Paise; debited: Paise; count: number }>;
  /** Entries the filter hid, so the page can say so. */
  hiddenByFilter: number;
}

export interface StatementQuery {
  /** Entry types to keep; empty means all of them. */
  types?: WalletEntryType[];
  direction?: 'CREDIT' | 'DEBIT';
  /** Rows to return. The summary always covers the whole period. */
  limit?: number;
}

/** The calendar month a date falls in, as a period. */
export function monthPeriod(year: number, month: number): StatementPeriod {
  return { from: new Date(year, month, 1), to: new Date(year, month + 1, 1) };
}

/** The last `count` whole months, newest first, for the period picker. */
export function recentMonths(now: Date, count = 12): Array<{ year: number; month: number }> {
  return Array.from({ length: count }, (_, index) => {
    const date = new Date(now.getFullYear(), now.getMonth() - index, 1);
    return { year: date.getFullYear(), month: date.getMonth() };
  });
}

/**
 * Only COMPLETED entries move the balance.
 *
 * A PENDING top-up is money that has not arrived and a FAILED one is money that
 * never will. Counting either into a running balance would make the statement
 * disagree with `getWalletSummary`, and the customer would be right to believe
 * whichever one was larger.
 */
function settledDelta(row: {
  direction: 'CREDIT' | 'DEBIT';
  amount: Paise;
  status: string;
}): Paise {
  if (row.status !== 'COMPLETED') return 0;
  return row.direction === 'CREDIT' ? row.amount : -row.amount;
}

export async function buildStatement(
  userId: string,
  period: StatementPeriod,
  query: StatementQuery = {},
): Promise<Statement> {
  const empty: Statement = {
    period,
    opening: 0,
    closing: 0,
    creditedInPeriod: 0,
    debitedInPeriod: 0,
    rows: [],
    byType: [],
    hiddenByFilter: 0,
  };

  if (!ObjectId.isValid(userId)) return empty;

  const entries = await walletEntriesCollection();
  const owner = new ObjectId(userId);

  // Everything before the period, summed, is the opening balance. Clamped at
  // zero for the same reason `getWalletSummary` clamps: a negative balance is
  // not a thing this store can be in.
  const before = await entries
    .aggregate<{ _id: 'CREDIT' | 'DEBIT'; total: number }>([
      {
        $match: { userId: owner, status: 'COMPLETED', createdAt: { $lt: period.from } },
      },
      { $group: { _id: '$direction', total: { $sum: '$amount' } } },
    ])
    .toArray();

  const creditedBefore = before.find((row) => row._id === 'CREDIT')?.total ?? 0;
  const debitedBefore = before.find((row) => row._id === 'DEBIT')?.total ?? 0;
  const opening = Math.max(0, creditedBefore - debitedBefore);

  // The whole period, oldest first, so the running balance can be carried
  // forward. The filter is applied after, so the summary and the running
  // balance both describe the account rather than the view.
  const all = await entries
    .find({ userId: owner, createdAt: { $gte: period.from, $lt: period.to } })
    .sort({ createdAt: 1 })
    .toArray();

  let running = opening;
  let creditedInPeriod = 0;
  let debitedInPeriod = 0;

  const totals = new Map<WalletEntryType, { credited: Paise; debited: Paise; count: number }>();

  const rows: StatementRow[] = all.map((doc) => {
    running = Math.max(0, running + settledDelta(doc));

    if (doc.status === 'COMPLETED') {
      if (doc.direction === 'CREDIT') creditedInPeriod += doc.amount;
      else debitedInPeriod += doc.amount;

      const bucket = totals.get(doc.type) ?? { credited: 0, debited: 0, count: 0 };
      if (doc.direction === 'CREDIT') bucket.credited += doc.amount;
      else bucket.debited += doc.amount;
      bucket.count += 1;
      totals.set(doc.type, bucket);
    }

    return {
      id: doc._id.toHexString(),
      type: doc.type,
      direction: doc.direction,
      amount: doc.amount,
      status: doc.status,
      reference: doc.reference,
      createdAt: doc.createdAt,
      balanceAfter: running,
    };
  });

  const wanted = query.types?.length ? new Set(query.types) : null;
  const filtered = rows.filter((row) => {
    if (wanted && !wanted.has(row.type)) return false;
    if (query.direction && row.direction !== query.direction) return false;
    return true;
  });

  // Newest first for reading; the running balance was computed oldest first.
  const shown = filtered.reverse().slice(0, query.limit ?? 200);

  return {
    period,
    opening,
    closing: running,
    creditedInPeriod,
    debitedInPeriod,
    rows: shown,
    byType: WALLET_ENTRY_TYPES.filter((type) => totals.has(type)).map((type) => {
      const bucket = totals.get(type);
      return {
        type,
        credited: bucket?.credited ?? 0,
        debited: bucket?.debited ?? 0,
        count: bucket?.count ?? 0,
      };
    }),
    hiddenByFilter: rows.length - filtered.length,
  };
}

/**
 * The statement as CSV.
 *
 * Every field is quoted and inner quotes are doubled, so a reference or a type
 * containing a comma cannot shift the columns. A statement that silently
 * misaligns in a spreadsheet is worse than no export at all.
 */
export function statementCsv(statement: Statement): string {
  const escape = (value: string | number): string => `"${String(value).replace(/"/g, '""')}"`;

  const lines = [
    ['Date', 'Type', 'Direction', 'Status', 'Reference', 'Amount (INR)', 'Balance (INR)']
      .map(escape)
      .join(','),
  ];

  // Oldest first in the export: a statement is read downwards.
  for (const row of [...statement.rows].reverse()) {
    lines.push(
      [
        row.createdAt.toISOString(),
        row.type,
        row.direction,
        row.status,
        row.reference,
        (row.amount / 100).toFixed(2),
        (row.balanceAfter / 100).toFixed(2),
      ]
        .map(escape)
        .join(','),
    );
  }

  lines.push('');
  lines.push([escape('Opening balance'), escape((statement.opening / 100).toFixed(2))].join(','));
  lines.push([escape('Closing balance'), escape((statement.closing / 100).toFixed(2))].join(','));

  return `${lines.join('\n')}\n`;
}
