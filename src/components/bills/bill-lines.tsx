import { cn } from '@/lib/utils/cn';
import { formatPaise, type Paise } from '@/lib/utils/money';

/**
 * The itemised half of a bill.
 *
 * Every page shows its charges broken out rather than as one figure, for the
 * same reason the insurance quotes do: a single total cannot be checked against
 * anything, and the line a customer does not recognise is the one they most
 * need named.
 *
 * A negative amount is a rebate or a discount, and renders as one.
 */

interface Line {
  label: string;
  amount: Paise;
  note?: string | undefined;
}

interface Props {
  lines: readonly Line[];
  total: Paise;
  totalLabel?: string;
  totalNote?: string;
}

export function BillLines({ lines, total, totalLabel = 'Total', totalNote }: Props) {
  return (
    <dl className="space-y-1.5">
      {lines.map((line) => (
        <div key={line.label} className="flex items-baseline justify-between gap-3">
          <dt className="text-ink-muted text-xs">
            {line.label}
            {line.note && <span className="text-ink-subtle block text-[0.7rem]">{line.note}</span>}
          </dt>
          <dd
            className={cn(
              'shrink-0 text-xs font-bold tabular-nums',
              line.amount < 0 && 'text-instock',
            )}
          >
            {line.amount < 0 ? '−' : ''}
            {formatPaise(Math.abs(line.amount))}
          </dd>
        </div>
      ))}

      <div className="border-hairline flex items-baseline justify-between gap-3 border-t pt-2">
        <dt className="text-sm font-bold">
          {totalLabel}
          {totalNote && (
            <span className="text-ink-subtle block text-[0.7rem] font-normal">{totalNote}</span>
          )}
        </dt>
        <dd className="text-base font-bold tabular-nums">{formatPaise(total)}</dd>
      </div>
    </dl>
  );
}

/** The header every fetched bill carries: who, which period, when it is due. */
export function BillHeader({
  holder,
  account,
  period,
  dueOn,
  daysLate,
}: {
  holder: string;
  account: string;
  period: string;
  dueOn?: Date;
  daysLate?: number;
}) {
  const late = (daysLate ?? 0) > 0;

  return (
    <div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1">
      <div>
        <p className="text-sm font-bold">{holder}</p>
        <p className="text-ink-muted font-mono text-xs tracking-wide">{account}</p>
      </div>
      <div className="text-right">
        <p className="text-ink-muted text-xs">{period}</p>
        {dueOn && (
          <p className={cn('text-xs font-bold', late ? 'text-deal' : 'text-ink-muted')}>
            {late ? `${daysLate} days overdue` : 'Due'}{' '}
            {dueOn.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}
          </p>
        )}
      </div>
    </div>
  );
}

/**
 * The notice every one of these pages carries.
 *
 * Said once, at the top, in the first thing anybody reads -- rather than in
 * small print at the bottom where a disclaimer goes to be ignored.
 */
export function NoBillerNotice({ what, noun = 'bill' }: { what: string; noun?: string }) {
  return (
    <div className="border-link/40 bg-link/5 rounded-2xl border p-3 text-xs leading-relaxed">
      <p className="text-ink-muted">
        <span className="text-ink font-bold">No {what} can see this.</span> This store has no
        connection to any biller, so the {noun} below is worked out from the number you typed and is
        the same every time for that number. The{' '}
        <span className="text-ink font-bold">money is real</span> — it leaves your Amazon Pay
        balance — and the <span className="text-ink font-bold">arithmetic is real</span>: the tariff
        structure, the slabs and the charges are how this bill is genuinely put together.
      </p>
    </div>
  );
}
