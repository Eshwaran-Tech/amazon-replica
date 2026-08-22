'use client';

import { ChevronDown } from 'lucide-react';
import { useRouter } from 'next/navigation';

const RANGES = [7, 30, 90] as const;

/** "Last N days" pill. Changing it reloads the dashboard for that window. */
export function RangeSelect({ days }: { days: number }) {
  const router = useRouter();

  return (
    <label className="border-hairline bg-surface hover:bg-surface-muted relative inline-flex min-h-9 cursor-pointer items-center rounded-lg border pr-8 pl-3 text-sm font-medium">
      <span className="sr-only">Time range</span>
      <select
        value={days}
        onChange={(event) => router.push(`/admin?days=${event.target.value}`)}
        className="appearance-none bg-transparent pr-1 outline-none"
      >
        {RANGES.map((range) => (
          <option key={range} value={range}>
            Last {range} days
          </option>
        ))}
      </select>
      <ChevronDown
        className="text-ink-muted pointer-events-none absolute right-2.5 h-4 w-4"
        aria-hidden="true"
      />
    </label>
  );
}
