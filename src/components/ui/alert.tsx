import { AlertCircle, CheckCircle2, Info } from 'lucide-react';
import type { ReactNode } from 'react';

import { cn } from '@/lib/utils/cn';

type AlertTone = 'error' | 'success' | 'info';

interface AlertProps {
  tone: AlertTone;
  children: ReactNode;
  className?: string;
}

/**
 * Tinted for a dark surface. A translucent wash over the card colour keeps the
 * tone readable without the near-white panels a light theme would produce --
 * and the text colours are picked to stay above 4.5:1 on that wash.
 */
const tones = {
  error: {
    box: 'bg-red-500/12 border-red-500/40 text-red-200',
    Icon: AlertCircle,
    label: 'Error',
  },
  success: {
    box: 'bg-emerald-500/12 border-emerald-500/40 text-emerald-200',
    Icon: CheckCircle2,
    label: 'Success',
  },
  info: {
    box: 'bg-sky-500/12 border-sky-500/40 text-sky-200',
    Icon: Info,
    label: 'Information',
  },
} as const;

/**
 * Inline status message.
 *
 * `role="alert"` so it is announced when it appears after a form submission --
 * a visual-only message is invisible to a screen reader user who just pressed
 * submit.
 *
 * State is carried by an icon and a text label as well as colour, so it is not
 * conveyed by colour alone (WCAG 1.4.1). Red-green colour blindness is common
 * enough that a red box and a green box can look identical.
 */
export function Alert({ tone, children, className }: AlertProps) {
  const { box, Icon, label } = tones[tone];

  return (
    <div
      role="alert"
      className={cn('flex items-start gap-2.5 rounded-md border p-3 text-sm', box, className)}
    >
      <Icon className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
      <div className="min-w-0">
        <span className="sr-only">{label}: </span>
        {children}
      </div>
    </div>
  );
}
