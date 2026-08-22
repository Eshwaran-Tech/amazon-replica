import { AlertTriangle, CarFront, Info, Wallet } from 'lucide-react';
import type { Metadata } from 'next';
import Link from 'next/link';

import { Container } from '@/components/layout/container';
import { CsrfField } from '@/components/security/csrf-field';
import { MIN_TAG_TOP_UP, TAG_TOP_UPS } from '@/data/transit';
import { modelsOf } from '@/data/vehicles';
import { getSession } from '@/lib/auth/guards';
import { cn } from '@/lib/utils/cn';
import { formatPaise } from '@/lib/utils/money';
import {
  TAG_ISSUERS,
  TAG_LIMITS,
  TOLL_CLASSES,
  TOLL_CORRIDORS,
  tagHistory,
  tagsFor,
  tollTable,
} from '@/services/fastag';
import { getWalletSummary } from '@/services/wallet';

import { TagForms } from './tag-forms';

export const metadata: Metadata = {
  title: 'FASTag',
  description:
    'Buy a FASTag, recharge it from your Amazon Pay balance, and see what a route costs.',
};

export const dynamic = 'force-dynamic';

/**
 * FASTag.
 *
 * Two things here are entirely real: the **balance**, which is summed from a
 * ledger the same way the wallet's is, and the **toll estimate**, which applies
 * the published rules — a class multiplier by axle count, one and a half single
 * trips for a return within 24 hours, and a monthly pass at a single plaza.
 *
 * What is not real, and the page says so, is any connection to a toll plaza.
 * Nothing here can see a gantry read. A balance that ticked down on a timer
 * would be an invented transaction wearing a toll's clothes, so a crossing is
 * recorded only when the customer enters one.
 */

interface Props {
  searchParams: Promise<{ class?: string; tag?: string }>;
}

export default async function FastagPage({ searchParams }: Props) {
  const params = await searchParams;
  const session = await getSession();

  const tags = session ? await tagsFor(session.user.id) : [];
  const wallet = session ? await getWalletSummary(session.user.id) : null;

  const selected = params.tag ?? tags[0]?.number;
  const history = session && selected ? await tagHistory(session.user.id, selected) : null;

  const tollClass =
    TOLL_CLASSES.find((entry) => entry.id === params.class)?.id ??
    history?.account.tollClass ??
    'CAR';
  const table = tollTable(tollClass);

  const models = modelsOf('CAR')
    .concat(modelsOf('BIKE'))
    .map((model) => ({
      id: model.id,
      label: `${model.make} ${model.model} ${model.variant}`,
    }));

  return (
    <Container size="default" className="space-y-4 py-5">
      <nav aria-label="Breadcrumb" className="text-ink-muted text-sm">
        <Link href="/pay" className="hover:text-link hover:underline">
          Amazon Pay
        </Link>
        <span className="mx-1.5" aria-hidden="true">
          ›
        </span>
        <span className="text-ink">FASTag</span>
      </nav>

      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-lg font-bold sm:text-xl">
            <CarFront className="text-accent-400 h-5 w-5" aria-hidden="true" />
            FASTag
          </h1>
          <p className="text-ink-muted mt-1 text-sm">
            One tag per vehicle, topped up from your Amazon Pay balance.
          </p>
        </div>
        {wallet && (
          <p className="text-ink-muted text-sm">
            Amazon Pay balance{' '}
            <span className="text-ink font-bold">{formatPaise(wallet.balance)}</span>
          </p>
        )}
      </header>

      <div className="border-link/40 bg-link/5 flex items-start gap-2 rounded-2xl border p-3 text-xs leading-relaxed">
        <Info className="text-link mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
        <p className="text-ink-muted">
          <span className="text-ink font-bold">No plaza can see this tag.</span> The issuers are
          invented and nothing here is registered with any tolling authority. The balance is real —
          it moves your actual Amazon Pay money — and the toll figures apply the real rules. A
          crossing appears on the tag only when you record one.
        </p>
      </div>

      {!session ? (
        <div className="border-hairline bg-surface rounded-2xl border p-8 text-center">
          <p className="text-sm font-bold">Sign in to buy or recharge a tag.</p>
          <Link
            href="/auth/login?next=/pay/fastag"
            className="bg-accent-500 hover:bg-accent-400 text-brand-950 mt-3 inline-block rounded-lg px-4 py-2 text-sm font-bold"
          >
            Sign in
          </Link>
        </div>
      ) : (
        <div className="grid gap-4 lg:grid-cols-[1fr_minmax(0,24rem)] lg:items-start">
          <div className="min-w-0 space-y-4">
            {/* ------------------------------------------------ the tags */}
            {tags.length > 0 && (
              <section className="grid gap-3 sm:grid-cols-2">
                {tags.map((tag) => (
                  <article
                    key={tag.id}
                    className={cn(
                      'border-hairline bg-surface rounded-2xl border p-4',
                      tag.lowBalance && 'border-deal/60',
                    )}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <p className="text-base font-bold tracking-wider">{tag.number}</p>
                        <p className="text-ink-muted text-xs">{tag.providerName}</p>
                      </div>
                      <span className="bg-surface-sunken text-ink-muted rounded-full px-2 py-0.5 text-[0.65rem] font-bold">
                        {TOLL_CLASSES.find((entry) => entry.id === tag.tollClass)?.label ?? 'Car'}
                      </span>
                    </div>
                    <p className="mt-3 text-xl font-bold">{formatPaise(tag.balance)}</p>
                    {tag.lowBalance ? (
                      <p className="text-deal mt-1 flex items-center gap-1.5 text-xs font-bold">
                        <AlertTriangle className="h-3.5 w-3.5" aria-hidden="true" />
                        Below {formatPaise(tag.minBalance)} — a barrier would refuse it
                      </p>
                    ) : (
                      <p className="text-ink-subtle mt-1 text-xs">
                        Refused below {formatPaise(tag.minBalance)}
                      </p>
                    )}
                    {tag.vehicleLabel && (
                      <p className="text-ink-subtle mt-1 text-xs">{tag.vehicleLabel}</p>
                    )}
                    <p className="text-ink-subtle mt-2 text-xs">
                      {formatPaise(tag.securityDeposit)} deposit held, refundable when the tag is
                      closed
                    </p>
                  </article>
                ))}
              </section>
            )}

            <TagForms
              tags={tags}
              issuers={TAG_ISSUERS.map((issuer) => ({
                id: issuer.id,
                name: issuer.name,
                securityDepositRupees: issuer.securityDepositRupees,
                issuanceRupees: issuer.issuanceRupees,
                minBalanceRupees: issuer.minBalanceRupees,
              }))}
              tollClasses={TOLL_CLASSES.map((entry) => ({ id: entry.id, label: entry.label }))}
              models={models}
              corridors={TOLL_CORRIDORS.map((corridor) => ({
                id: corridor.id,
                name: corridor.name,
                highway: corridor.highway,
              }))}
              topUps={TAG_TOP_UPS}
              limits={TAG_LIMITS}
              csrfField={<CsrfField />}
            />

            {/* -------------------------------------------- the history */}
            {history && history.entries.length > 0 && (
              <section className="border-hairline bg-surface overflow-hidden rounded-2xl border">
                <h2 className="border-hairline border-b px-4 py-3 text-sm font-bold">
                  {history.account.number}
                  <span className="text-ink-subtle ml-2 font-normal">recent activity</span>
                </h2>
                <ul className="divide-hairline divide-y">
                  {history.entries.map((entry) => (
                    <li key={entry.id} className="flex items-baseline gap-3 px-4 py-2.5">
                      <span className="min-w-0 flex-1">
                        <span className="block text-sm">{entry.note}</span>
                        <span className="text-ink-subtle text-xs">
                          {entry.createdAt.toLocaleDateString('en-IN', {
                            day: 'numeric',
                            month: 'short',
                          })}{' '}
                          · {entry.reference}
                        </span>
                      </span>
                      <span
                        className={cn(
                          'shrink-0 text-sm font-bold tabular-nums',
                          entry.direction === 'CREDIT' ? 'text-instock' : 'text-ink',
                        )}
                      >
                        {entry.direction === 'CREDIT' ? '+' : '−'}
                        {formatPaise(entry.amount)}
                      </span>
                    </li>
                  ))}
                </ul>
              </section>
            )}
          </div>

          {/* ------------------------------------------ the toll estimate */}
          <aside className="min-w-0 space-y-3">
            <section className="border-hairline bg-surface overflow-hidden rounded-2xl border">
              <h2 className="border-hairline border-b px-4 py-3 text-sm font-bold">
                What a route costs
              </h2>
              <div className="border-hairline flex flex-wrap gap-1.5 border-b px-4 py-3">
                {TOLL_CLASSES.map((entry) => (
                  <Link
                    key={entry.id}
                    href={`/pay/fastag?class=${entry.id}`}
                    className={cn(
                      'rounded-lg border px-2.5 py-1 text-xs font-bold transition-colors',
                      entry.id === tollClass
                        ? 'border-accent-500 bg-accent-500/15 text-accent-400'
                        : 'border-hairline text-ink-muted hover:border-accent-500/60',
                    )}
                  >
                    {entry.label.split(',')[0]}
                  </Link>
                ))}
              </div>

              <div className="overflow-x-auto">
                <table className="w-full min-w-[22rem] text-xs">
                  <thead className="text-ink-subtle border-hairline border-b text-left">
                    <tr>
                      <th className="px-4 py-2 font-bold">Route</th>
                      <th className="px-2 py-2 text-right font-bold">One way</th>
                      <th className="px-2 py-2 text-right font-bold">Return</th>
                      <th className="px-4 py-2 text-right font-bold">Pass</th>
                    </tr>
                  </thead>
                  <tbody className="divide-hairline divide-y">
                    {table.map((row) => (
                      <tr key={row.id}>
                        <td className="px-4 py-2">
                          <span className="block font-bold">{row.name}</span>
                          <span className="text-ink-subtle">
                            {row.highway} · {row.km} km · {row.plazas} plazas
                          </span>
                        </td>
                        <td className="px-2 py-2 text-right tabular-nums">
                          {formatPaise(row.single, { withSymbol: false }).replace(/\.00$/, '')}
                        </td>
                        <td className="px-2 py-2 text-right tabular-nums">
                          {formatPaise(row.returnTrip, { withSymbol: false }).replace(/\.00$/, '')}
                        </td>
                        <td className="px-4 py-2 text-right tabular-nums">
                          {formatPaise(row.monthlyPass, { withSymbol: false }).replace(/\.00$/, '')}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <p className="text-ink-subtle border-hairline border-t px-4 py-3 text-xs leading-relaxed">
                A return within 24 hours is one and a half single trips — the concession most people
                do not know they have. A monthly pass is bought at one plaza, not for a whole
                corridor, which is why it is far less than a month of single crossings.
              </p>
            </section>

            <section className="border-hairline bg-surface overflow-hidden rounded-2xl border">
              <h2 className="border-hairline flex items-center gap-2 border-b px-4 py-3 text-sm font-bold">
                <Wallet className="text-accent-400 h-4 w-4" aria-hidden="true" />
                Elsewhere
              </h2>
              <ul className="divide-hairline divide-y text-sm">
                {[
                  { label: 'Metro card recharge', href: '/pay/metro' },
                  { label: 'Add money to Amazon Pay', href: '/pay/balance' },
                  { label: 'Vehicle insurance', href: '/insurance' },
                  { label: 'Ledger statement', href: '/pay/statement' },
                ].map((row) => (
                  <li key={row.href}>
                    <Link
                      href={row.href}
                      className="text-link hover:bg-surface-sunken block px-4 py-2.5 transition-colors"
                    >
                      {row.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          </aside>
        </div>
      )}

      <p className="text-ink-subtle text-xs leading-relaxed">
        A recharge is at least ₹{MIN_TAG_TOP_UP}. The amount is validated on the server against the
        issuer&rsquo;s book, and the tag&rsquo;s balance is summed from its ledger rather than kept
        in a column — the same rule the Amazon Pay balance follows.
      </p>
    </Container>
  );
}
