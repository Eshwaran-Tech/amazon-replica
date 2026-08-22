import { Search } from 'lucide-react';

import { ACCOUNT_FORMATS, billersIn, type BillCategory } from '@/data/billers';
import type { SavedBillerView } from '@/models/bill-payment';
import Link from 'next/link';
import { cn } from '@/lib/utils/cn';

/**
 * "Which biller, and what is your number."
 *
 * A plain GET form, so a fetched bill lives at its own URL: it can be sent to
 * whoever actually pays it, the back button undoes exactly one change, and none
 * of it needs JavaScript. Every page under Bill Payments starts here and then
 * diverges completely.
 *
 * The field's label, hint, placeholder and validation all come from the
 * category's format, because an LPG id and a property id are not the same kind
 * of thing and a page that called both "Consumer number" would be lying to
 * whoever is squinting at a bill trying to find it.
 */

interface Props {
  category: BillCategory;
  action: string;
  billerId?: string | undefined;
  account?: string | undefined;
  saved?: SavedBillerView[];
  /** Extra hidden fields to carry through, for pages with more state. */
  carry?: Record<string, string>;
}

export function AccountForm({ category, action, billerId, account, saved = [], carry }: Props) {
  const billers = billersIn(category);
  const format = ACCOUNT_FORMATS[category];

  return (
    <section className="border-hairline bg-surface overflow-hidden rounded-2xl border">
      <h2 className="border-hairline flex items-center gap-2 border-b px-4 py-3 text-sm font-bold">
        <Search className="text-accent-400 h-4 w-4" aria-hidden="true" />
        Fetch your bill
      </h2>

      {saved.length > 0 && (
        <div className="border-hairline border-b px-4 py-3">
          <p className="text-ink-subtle mb-2 text-xs font-bold">Saved</p>
          <div className="flex flex-wrap gap-1.5">
            {saved.map((entry) => (
              <Link
                key={entry.id}
                href={`${action}?biller=${entry.billerId}&account=${entry.account}`}
                className={cn(
                  'rounded-lg border px-2.5 py-1 text-xs font-bold transition-colors',
                  entry.account === account
                    ? 'border-accent-500 bg-accent-500/15 text-accent-400'
                    : 'border-hairline text-ink-muted hover:border-accent-500/60',
                )}
              >
                {entry.nickname}
              </Link>
            ))}
          </div>
        </div>
      )}

      <form
        method="get"
        action={action}
        className="grid gap-3 px-4 py-4 sm:grid-cols-[1fr_1fr_auto]"
      >
        {carry &&
          Object.entries(carry).map(([name, value]) => (
            <input key={name} type="hidden" name={name} value={value} />
          ))}

        <div>
          <label htmlFor="biller" className="mb-1 block text-xs font-bold">
            Biller
          </label>
          <select
            id="biller"
            name="biller"
            defaultValue={billerId ?? billers[0]?.id}
            className="border-hairline bg-surface-sunken focus:border-accent-500 w-full rounded-lg border px-3 py-2 text-sm outline-none"
          >
            {billers.map((biller) => (
              <option key={biller.id} value={biller.id}>
                {biller.name} — {biller.region}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label htmlFor="account" className="mb-1 block text-xs font-bold">
            {format.label}
          </label>
          <input
            id="account"
            name="account"
            required
            inputMode={format.pattern.source.includes('A-Z') ? 'text' : 'numeric'}
            autoComplete="off"
            spellCheck={false}
            defaultValue={account ?? ''}
            placeholder={format.placeholder}
            className="border-hairline bg-surface-sunken focus:border-accent-500 w-full rounded-lg border px-3 py-2 text-sm tracking-wide uppercase outline-none"
          />
        </div>

        <div className="flex items-end">
          <button
            type="submit"
            className="bg-accent-500 hover:bg-accent-400 text-brand-950 w-full rounded-lg px-4 py-2 text-sm font-bold transition-colors sm:w-auto"
          >
            Fetch bill
          </button>
        </div>

        <p className="text-ink-subtle text-xs sm:col-span-3">{format.hint}</p>
      </form>
    </section>
  );
}
