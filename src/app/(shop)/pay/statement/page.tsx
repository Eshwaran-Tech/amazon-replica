import { ArrowDownToLine, Info, Wallet } from 'lucide-react';
import type { Metadata } from 'next';
import Link from 'next/link';

import { Container } from '@/components/layout/container';
import { getSession } from '@/lib/auth/guards';
import { cn } from '@/lib/utils/cn';
import { formatPaise } from '@/lib/utils/money';
import { WALLET_ENTRY_TYPES, type WalletEntryType } from '@/models/wallet';
import { buildStatement, monthPeriod, recentMonths } from '@/services/statement';

export const metadata: Metadata = {
  title: 'Amazon Pay statement',
  robots: { index: false, follow: false },
};

export const dynamic = 'force-dynamic';

interface PageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

function one(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

/** What each ledger entry is called on screen, typed against the union. */
const ENTRY_LABELS: Record<WalletEntryType, string> = {
  TOP_UP: 'Wallet top-up',
  GIFT_CARD: 'Gift card redeemed',
  PRIME: 'Prime membership',
  VIDEO: 'Prime Video',
  ORDER: 'Order payment',
  REFUND: 'Order refund',
  CASHBACK: 'Cashback',
  RECHARGE: 'Mobile recharge',
  BUS: 'Bus ticket',
  TRAIN: 'Train ticket',
  HOTEL: 'Hotel booking',
  GIFT_PURCHASE: 'Gift card bought',
  INSURANCE: 'Insurance premium',
  FASTAG: 'FASTag',
  METRO: 'Metro card',
  BILL: 'Bill payment',
  CONTENT_CREDIT: 'Store credit',
};

function monthName(year: number, month: number): string {
  return new Date(year, month, 1).toLocaleDateString('en-IN', {
    month: 'long',
    year: 'numeric',
  });
}

/**
 * The account statement.
 *
 * What the balance page's ten-row list was missing: a period, a filter, a
 * running balance and an export. The running balance is computed forwards from
 * the opening balance, so a reader can point at the row where a figure went
 * wrong -- which is the only thing a statement is really for.
 *
 * The period and the filter are links, so a view is a URL you can bookmark or
 * send to somebody.
 */
export default async function StatementPage({ searchParams }: PageProps) {
  const params = await searchParams;
  const now = new Date();

  const session = await getSession();

  const year = Number(one(params.year)) || now.getFullYear();
  const rawMonth = Number(one(params.month));
  const month =
    Number.isInteger(rawMonth) && rawMonth >= 0 && rawMonth <= 11 ? rawMonth : now.getMonth();

  const types = (one(params.type) ?? '')
    .split(',')
    .map((entry) => entry.trim())
    .filter((entry): entry is WalletEntryType =>
      (WALLET_ENTRY_TYPES as readonly string[]).includes(entry),
    );

  const statement = session
    ? await buildStatement(session.user.id, monthPeriod(year, month), { types })
    : null;

  const base = (changes: Record<string, string | undefined>): string => {
    const next = new URLSearchParams({ year: String(year), month: String(month) });
    if (types.length) next.set('type', types.join(','));
    for (const [key, value] of Object.entries(changes)) {
      if (value === undefined || value === '') next.delete(key);
      else next.set(key, value);
    }
    return `/pay/statement?${next.toString()}`;
  };

  const toggled = (entry: string): string | undefined => {
    const next = types.includes(entry as WalletEntryType)
      ? types.filter((item) => item !== entry)
      : [...types, entry];
    return next.length > 0 ? next.join(',') : undefined;
  };

  return (
    <Container size="wide" className="space-y-4 py-5">
      <nav aria-label="Breadcrumb" className="text-ink-muted text-sm">
        <Link href="/pay" className="hover:text-link hover:underline">
          Amazon Pay
        </Link>
        <span className="mx-1.5" aria-hidden="true">
          ›
        </span>
        <Link href="/pay/balance" className="hover:text-link hover:underline">
          Balance
        </Link>
        <span className="mx-1.5" aria-hidden="true">
          ›
        </span>
        <span className="text-ink">Statement</span>
      </nav>

      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-lg font-bold sm:text-xl">
            <Wallet className="text-accent-400 h-5 w-5" aria-hidden="true" />
            Statement
          </h1>
          <p className="text-ink-muted mt-1 text-sm">{monthName(year, month)}</p>
        </div>

        {session && (
          <a
            href={`/api/pay/statement?year=${year}&month=${month}${types.length ? `&type=${types.join(',')}` : ''}`}
            className="border-accent-500 text-accent-400 hover:bg-accent-500 hover:text-brand-950 inline-flex items-center gap-1.5 rounded-lg border px-3 py-2 text-xs font-bold transition-colors"
          >
            <ArrowDownToLine className="h-3.5 w-3.5" aria-hidden="true" />
            Download CSV
          </a>
        )}
      </div>

      {!session ? (
        <div className="border-hairline bg-surface rounded-2xl border p-8 text-center">
          <p className="text-sm font-bold">Sign in to see your statement.</p>
          <Link
            href="/auth/login?next=/pay/statement"
            className="bg-accent-500 hover:bg-accent-400 text-brand-950 mt-3 inline-block rounded-lg px-4 py-2 text-sm font-bold"
          >
            Sign in
          </Link>
        </div>
      ) : (
        statement && (
          <>
            {/* ------------------------------------------------ the summary */}
            <section className="grid gap-3 sm:grid-cols-4">
              {[
                { label: 'Opening balance', value: statement.opening },
                { label: 'Credited', value: statement.creditedInPeriod, tone: 'good' as const },
                { label: 'Debited', value: statement.debitedInPeriod, tone: 'bad' as const },
                { label: 'Closing balance', value: statement.closing, strong: true },
              ].map((card) => (
                <div
                  key={card.label}
                  className="border-hairline bg-surface rounded-2xl border p-3.5"
                >
                  <p className="text-ink-muted text-[11px]">{card.label}</p>
                  <p
                    className={cn(
                      'mt-1 text-lg font-bold',
                      card.tone === 'good' && 'text-instock',
                      card.tone === 'bad' && 'text-deal',
                      card.strong && 'text-accent-400',
                    )}
                  >
                    {formatPaise(card.value)}
                  </p>
                </div>
              ))}
            </section>

            <div className="gap-5 lg:grid lg:grid-cols-[14rem_minmax(0,1fr)] lg:items-start">
              {/* ---------------------------------------------- the filters */}
              <aside className="border-hairline bg-surface mb-4 rounded-2xl border p-4 lg:mb-0">
                <div className="flex items-center justify-between">
                  <h2 className="text-sm font-bold">Period</h2>
                  {types.length > 0 && (
                    <Link
                      href={base({ type: undefined })}
                      className="text-link text-xs font-semibold hover:underline"
                    >
                      Clear
                    </Link>
                  )}
                </div>

                <ul className="mt-2 max-h-52 space-y-1 overflow-y-auto">
                  {recentMonths(now, 12).map((entry) => {
                    const on = entry.year === year && entry.month === month;
                    return (
                      <li key={`${entry.year}-${entry.month}`}>
                        <Link
                          href={`/pay/statement?year=${entry.year}&month=${entry.month}${types.length ? `&type=${types.join(',')}` : ''}`}
                          aria-current={on ? 'true' : undefined}
                          className={cn(
                            'block rounded-md px-2 py-1.5 text-xs transition-colors',
                            on
                              ? 'bg-accent-500/15 text-ink font-semibold'
                              : 'text-ink-muted hover:bg-white/5',
                          )}
                        >
                          {monthName(entry.year, entry.month)}
                        </Link>
                      </li>
                    );
                  })}
                </ul>

                <h2 className="border-hairline mt-4 border-t pt-4 text-sm font-bold">Type</h2>
                <ul className="mt-2 space-y-1.5">
                  {statement.byType.map((bucket) => (
                    <li key={bucket.type}>
                      <Link
                        href={base({ type: toggled(bucket.type) })}
                        aria-pressed={types.includes(bucket.type)}
                        className="flex items-center gap-2 text-xs"
                      >
                        <span
                          aria-hidden="true"
                          className={cn(
                            'flex h-4 w-4 shrink-0 items-center justify-center rounded border-2 text-[10px] font-black',
                            types.includes(bucket.type)
                              ? 'border-accent-500 bg-accent-500 text-brand-950'
                              : 'border-hairline',
                          )}
                        >
                          {types.includes(bucket.type) ? '✓' : ''}
                        </span>
                        <span
                          className={
                            types.includes(bucket.type)
                              ? 'text-ink flex-1 font-semibold'
                              : 'text-ink-muted flex-1'
                          }
                        >
                          {ENTRY_LABELS[bucket.type]}
                        </span>
                        <span className="text-ink-subtle">{bucket.count}</span>
                      </Link>
                    </li>
                  ))}
                  {statement.byType.length === 0 && (
                    <li className="text-ink-subtle text-xs">Nothing this month.</li>
                  )}
                </ul>
              </aside>

              {/* ------------------------------------------------- the rows */}
              <div className="min-w-0">
                <section className="border-hairline bg-surface overflow-hidden rounded-2xl border">
                  <div className="border-hairline flex items-baseline justify-between gap-2 border-b px-4 py-3">
                    <h2 className="text-sm font-bold">Entries</h2>
                    <p className="text-ink-subtle text-xs">
                      {statement.rows.length} shown
                      {statement.hiddenByFilter > 0 && (
                        <span> · {statement.hiddenByFilter} hidden by the filter</span>
                      )}
                    </p>
                  </div>

                  {statement.rows.length === 0 ? (
                    <p className="text-ink-muted px-4 py-10 text-center text-sm">
                      No entries in {monthName(year, month)}.
                    </p>
                  ) : (
                    <div className="overflow-x-auto">
                      <table className="w-full min-w-[36rem] text-sm">
                        <thead>
                          <tr className="text-ink-subtle border-hairline border-b text-left text-xs">
                            <th scope="col" className="px-4 py-2 font-semibold">
                              Date
                            </th>
                            <th scope="col" className="px-4 py-2 font-semibold">
                              Entry
                            </th>
                            <th scope="col" className="px-4 py-2 text-right font-semibold">
                              Amount
                            </th>
                            <th scope="col" className="px-4 py-2 text-right font-semibold">
                              Balance
                            </th>
                          </tr>
                        </thead>
                        <tbody className="divide-hairline divide-y">
                          {statement.rows.map((row) => (
                            <tr key={row.id}>
                              <td className="text-ink-muted px-4 py-2.5 text-xs whitespace-nowrap">
                                {row.createdAt.toLocaleDateString('en-IN', {
                                  day: '2-digit',
                                  month: 'short',
                                })}
                              </td>
                              <td className="px-4 py-2.5">
                                <span className="block text-xs font-semibold">
                                  {ENTRY_LABELS[row.type]}
                                </span>
                                <span className="text-ink-subtle block font-mono text-[10px]">
                                  {row.reference}
                                  {row.status !== 'COMPLETED' && (
                                    <span className="text-deal ml-1.5 font-sans font-semibold">
                                      {row.status.toLowerCase()}
                                    </span>
                                  )}
                                </span>
                              </td>
                              <td
                                className={cn(
                                  'px-4 py-2.5 text-right text-xs font-semibold whitespace-nowrap',
                                  row.status !== 'COMPLETED'
                                    ? 'text-ink-subtle'
                                    : row.direction === 'CREDIT'
                                      ? 'text-instock'
                                      : 'text-deal',
                                )}
                              >
                                {row.direction === 'CREDIT' ? '+' : '−'} {formatPaise(row.amount)}
                              </td>
                              <td className="px-4 py-2.5 text-right text-xs whitespace-nowrap">
                                {row.status === 'COMPLETED' ? (
                                  formatPaise(row.balanceAfter)
                                ) : (
                                  <span className="text-ink-subtle">—</span>
                                )}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </section>

                <p className="text-ink-subtle mt-3 flex items-start gap-2 text-[11px] leading-relaxed">
                  <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                  <span>
                    The balance column is carried forward from the opening figure, so it shows what
                    the balance was after each entry. Pending and failed entries are listed but move
                    nothing — a top-up that has not arrived is not money, and counting it would put
                    this page and your balance at odds.
                  </span>
                </p>
              </div>
            </div>
          </>
        )
      )}
    </Container>
  );
}
