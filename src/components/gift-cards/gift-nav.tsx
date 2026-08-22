import Link from 'next/link';

import { Container } from '@/components/layout/container';
import { cn } from '@/lib/utils/cn';

/**
 * The strip of stores across the top of every gift card page.
 *
 * One table, so a store cannot appear here without a page behind it -- the
 * reference's nav has tabs that go nowhere, and that is the first thing that
 * gives a mock-up away.
 */

export const GIFT_TABS = [
  { href: '/gift-cards', label: 'Gift Cards' },
  { href: '/gift-cards/birthday', label: 'Birthday' },
  { href: '/gift-cards/wedding', label: 'Wedding & Engagement' },
  { href: '/gift-cards/occasions', label: 'By Occasion' },
  { href: '/gift-cards/brands', label: 'By Brand' },
  { href: '/gift-cards/vouchers', label: 'Add to Amazon Pay balance' },
  { href: '/gift-cards/corporate', label: 'Corporate Gifting' },
] as const;

export function GiftNav({ active }: { active: string }) {
  return (
    <nav aria-label="Gift card stores" className="border-hairline bg-surface-sunken border-b">
      <Container size="wide">
        <ul className="flex gap-1 overflow-x-auto py-1.5">
          {GIFT_TABS.map((tab) => (
            <li key={tab.href}>
              <Link
                href={tab.href}
                aria-current={tab.href === active ? 'page' : undefined}
                className={cn(
                  'block rounded-md px-3 py-1.5 text-xs font-semibold whitespace-nowrap transition-colors',
                  tab.href === active
                    ? 'bg-accent-500 text-brand-950'
                    : 'text-ink-muted hover:text-ink hover:bg-white/5',
                )}
              >
                {tab.label}
              </Link>
            </li>
          ))}
        </ul>
      </Container>
    </nav>
  );
}
