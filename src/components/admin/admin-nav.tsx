'use client';

import {
  LayoutDashboard,
  Package,
  ScrollText,
  ShoppingBag,
  Tags,
  Users,
  type LucideIcon,
} from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
}

const ITEMS: NavItem[] = [
  { href: '/admin', label: 'Dashboard', icon: LayoutDashboard },
  { href: '/admin/products', label: 'Products', icon: Package },
  { href: '/admin/orders', label: 'Orders', icon: ShoppingBag },
  { href: '/admin/users', label: 'Users', icon: Users },
  { href: '/admin/categories', label: 'Categories', icon: Tags },
  { href: '/admin/audit', label: 'Audit log', icon: ScrollText },
];

/**
 * Sidebar navigation. Purely presentational: which section is active comes
 * from the URL, and whether the viewer may *be* here was decided by the
 * server-side admin guard before this ever rendered.
 */
export function AdminNav() {
  const pathname = usePathname();

  return (
    <nav aria-label="Admin sections" className="flex gap-1 lg:flex-col">
      {ITEMS.map((item) => {
        const active =
          item.href === '/admin' ? pathname === '/admin' : pathname.startsWith(item.href);
        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={active ? 'page' : undefined}
            className={
              active
                ? 'bg-accent-500 text-brand-950 flex min-h-10 items-center gap-2.5 rounded-lg px-3 text-sm font-semibold whitespace-nowrap'
                : 'flex min-h-10 items-center gap-2.5 rounded-lg px-3 text-sm font-medium whitespace-nowrap text-white/75 hover:bg-white/5 hover:text-white'
            }
          >
            <item.icon className="h-4 w-4 shrink-0" aria-hidden="true" />
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
