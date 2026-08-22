import { AlertTriangle, ArrowDown, ArrowUp, ShieldCheck, TimerReset } from 'lucide-react';
import type { Metadata } from 'next';
import Link from 'next/link';

import { PayForm } from '@/components/bills/pay-form';
import { Container } from '@/components/layout/container';
import { getSession } from '@/lib/auth/guards';
import { cn } from '@/lib/utils/cn';
import { formatPaise } from '@/lib/utils/money';
import { MOTOR_GRACE_DAYS, renewalOffers } from '@/services/bills/insurance-renewal';
import { getWalletSummary } from '@/services/wallet';

export const metadata: Metadata = {
  title: 'Insurance premium',
  robots: { index: false, follow: false },
};

export const dynamic = 'force-dynamic';

/**
 * Insurance premium.
 *
 * **The only tile under Bill Payments that is not derived from anything.** Every
 * other page here works a bill out from a number somebody typed, because this
 * store has no connection to a discom or a bank. This one reads the policies
 * this store actually issued — so if you hold none, there is nothing here, and
 * the page says so rather than conjuring a premium.
 *
 * What it adds over a renewal notice is the *reason the figure moved*. A motor
 * renewal is usually cheaper, because a claim-free year moves you up the
 * no-claim-bonus ladder — and it is catastrophically dearer if you let it lapse
 * past the grace period, because then the whole bonus is gone. Neither is
 * legible on a real renewal notice.
 */

export default async function InsurancePremiumPage() {
  const session = await getSession();
  const [offers, wallet] = session
    ? await Promise.all([renewalOffers(session.user.id), getWalletSummary(session.user.id)])
    : [[], null];

  const soon = offers.filter((offer) => offer.daysToExpiry <= 60);

  return (
    <Container size="default" className="space-y-4 py-5">
      <nav aria-label="Breadcrumb" className="text-ink-muted text-sm">
        <Link href="/pay/bills" className="hover:text-link hover:underline">
          Bill payments
        </Link>
        <span className="mx-1.5" aria-hidden="true">
          ›
        </span>
        <span className="text-ink">Insurance premium</span>
      </nav>

      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-lg font-bold sm:text-xl">
            <ShieldCheck className="text-accent-400 h-5 w-5" aria-hidden="true" />
            Insurance premium
          </h1>
          <p className="text-ink-muted mt-1 max-w-prose text-sm">
            Renewals for the policies you hold here — with the reason the premium moved.
          </p>
        </div>
        {wallet && (
          <p className="text-ink-muted text-sm">
            Amazon Pay balance{' '}
            <span className="text-ink font-bold">{formatPaise(wallet.balance)}</span>
          </p>
        )}
      </header>

      <div className="border-instock/40 bg-instock/5 flex items-start gap-2 rounded-2xl border p-3 text-xs leading-relaxed">
        <ShieldCheck className="text-instock mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
        <p className="text-ink-muted">
          <span className="text-ink font-bold">Nothing is guessed on this page.</span> Every other
          bill here is worked out from a number you type, because this store has no connection to
          any biller. This one reads the policies it actually issued you. If you hold none, there is
          nothing to renew — and no premium is invented to fill the space.
        </p>
      </div>

      {!session ? (
        <div className="border-hairline bg-surface rounded-2xl border p-8 text-center">
          <p className="text-sm font-bold">Sign in to see your policies.</p>
          <Link
            href="/auth/login?next=/pay/bills/insurance"
            className="bg-accent-500 hover:bg-accent-400 text-brand-950 mt-3 inline-block rounded-lg px-4 py-2 text-sm font-bold"
          >
            Sign in
          </Link>
        </div>
      ) : offers.length === 0 ? (
        <div className="border-hairline bg-surface rounded-2xl border p-8 text-center">
          <TimerReset className="text-ink-muted mx-auto h-8 w-8" aria-hidden="true" />
          <p className="mt-3 text-sm font-bold">You hold no policy here yet.</p>
          <p className="text-ink-muted mx-auto mt-1 max-w-prose text-sm">
            A renewal has to have something to renew. Take out motor or health cover first and it
            will appear here when it is due.
          </p>
          <div className="mt-4 flex flex-wrap justify-center gap-3">
            <Link
              href="/insurance"
              className="bg-accent-500 hover:bg-accent-400 text-brand-950 rounded-lg px-4 py-2 text-sm font-bold"
            >
              Motor cover
            </Link>
            <Link
              href="/insurance/health"
              className="border-hairline hover:border-accent-500/60 rounded-lg border px-4 py-2 text-sm font-bold"
            >
              Health cover
            </Link>
          </div>
        </div>
      ) : (
        <>
          {soon.length > 0 && (
            <div className="border-deal/40 bg-deal/5 flex items-start gap-2 rounded-2xl border p-3 text-xs leading-relaxed">
              <AlertTriangle className="text-deal mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
              <p className="text-ink-muted">
                {soon.length} {soon.length === 1 ? 'policy needs' : 'policies need'} attention
                within the next sixty days. A motor policy that lapses more than {MOTOR_GRACE_DAYS}{' '}
                days loses its no-claim bonus entirely — however many claim-free years came before
                it.
              </p>
            </div>
          )}

          <div className="space-y-3">
            {offers.map((offer) => {
              const cheaper = offer.change < 0;
              return (
                <article
                  key={offer.policyId}
                  className={cn(
                    'border-hairline bg-surface overflow-hidden rounded-2xl border',
                    offer.lapsed && 'border-deal/50',
                  )}
                >
                  <div className="border-hairline flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1 border-b px-4 py-3">
                    <div>
                      <p className="text-sm font-bold">{offer.subject}</p>
                      <p className="text-ink-muted text-xs">
                        {offer.insurerName} · {offer.policyNumber} ·{' '}
                        {offer.kind === 'MOTOR' ? 'Motor' : 'Health'}
                      </p>
                    </div>
                    <p
                      className={cn(
                        'text-xs font-bold',
                        offer.lapsed
                          ? 'text-deal'
                          : offer.daysToExpiry <= 30
                            ? 'text-deal'
                            : 'text-ink-muted',
                      )}
                    >
                      {offer.lapsed
                        ? `Lapsed ${Math.abs(offer.daysToExpiry)} days ago`
                        : `Expires in ${offer.daysToExpiry} days`}
                      {' · '}
                      {offer.expiresAt.toLocaleDateString('en-IN', {
                        day: 'numeric',
                        month: 'short',
                        year: 'numeric',
                      })}
                    </p>
                  </div>

                  <div className="grid gap-4 px-4 py-4 lg:grid-cols-[1fr_minmax(0,18rem)]">
                    <div>
                      {/* ------------------------- last year against this */}
                      <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
                        <span className="text-ink-muted text-xs">
                          Last year {formatPaise(offer.lastPremium)}
                        </span>
                        <span
                          className={cn(
                            'flex items-center gap-1 text-xs font-bold',
                            cheaper ? 'text-instock' : 'text-deal',
                          )}
                        >
                          {cheaper ? (
                            <ArrowDown className="h-3.5 w-3.5" aria-hidden="true" />
                          ) : (
                            <ArrowUp className="h-3.5 w-3.5" aria-hidden="true" />
                          )}
                          {formatPaise(Math.abs(offer.change))} {cheaper ? 'cheaper' : 'dearer'}
                        </span>
                      </div>

                      {offer.ncb && (
                        <div className="border-hairline bg-surface-sunken mt-3 rounded-xl border p-3">
                          <p className="text-xs font-bold">
                            No-claim bonus{' '}
                            {offer.ncb.to > offer.ncb.from ? (
                              <span className="text-instock">
                                {offer.ncb.from} → {offer.ncb.to} claim-free years
                              </span>
                            ) : offer.ncb.to === 0 && offer.ncb.from > 0 ? (
                              <span className="text-deal">lost — back to 0</span>
                            ) : (
                              <span className="text-ink-muted">unchanged</span>
                            )}
                          </p>
                          <p className="text-ink-muted mt-1 text-xs leading-relaxed">
                            It comes off the own-damage part alone, never off third party — which is
                            why it moves the total by less than the headline percentage suggests.
                          </p>
                        </div>
                      )}

                      <ul className="mt-3 space-y-1.5">
                        {offer.reasons.map((reason) => (
                          <li
                            key={reason}
                            className="text-ink-muted flex items-start gap-2 text-xs"
                          >
                            <span className="text-accent-400 mt-0.5" aria-hidden="true">
                              ·
                            </span>
                            {reason}
                          </li>
                        ))}
                      </ul>
                    </div>

                    <div className="border-hairline bg-surface-sunken rounded-xl border p-3">
                      <p className="text-ink-subtle text-xs">Renewal premium</p>
                      <p className="text-xl font-bold">{formatPaise(offer.premium)}</p>
                      <div className="mt-3">
                        <PayForm
                          which="RENEW"
                          fields={{ policyNumber: offer.policyNumber }}
                          label={`Renew for ${formatPaise(offer.premium)}`}
                          saveAs={null}
                        />
                      </div>
                      <p className="text-ink-subtle mt-2 text-xs leading-relaxed">
                        Renewing writes a new policy rather than extending this one, so the record
                        of what was covered in which year survives.
                      </p>
                    </div>
                  </div>
                </article>
              );
            })}
          </div>

          <p className="text-ink-subtle text-xs leading-relaxed">
            This store sells no insurance — the insurers are invented and the rates illustrative.
            What is real is that the premium is recomputed from the same rate book that priced the
            original policy, so the renewal figure and the charge cannot differ.
          </p>
        </>
      )}
    </Container>
  );
}
