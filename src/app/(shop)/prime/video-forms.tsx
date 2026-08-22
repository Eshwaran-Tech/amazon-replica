'use client';

import { Check, Play } from 'lucide-react';
import { useActionState } from 'react';
import type { ReactNode } from 'react';

import { rentTitleAction, subscribeChannelAction } from '@/actions/prime';
import { Alert } from '@/components/ui/alert';
import { emptyFormState } from '@/lib/forms/state';
import { formatPaise } from '@/lib/utils/money';
import { cn } from '@/lib/utils/cn';

/**
 * Rent and subscribe controls.
 *
 * One form per band rather than per tile, so a whole row shares a single
 * action state and a result message appears once instead of nine times. The
 * tile itself is the submit button, carrying the id.
 */

interface Tile {
  id: string;
  name: string;
  gradient: string;
  meta: string;
  price: number;
  held: boolean;
}

export function RentRow({ titles, csrfField }: { titles: Tile[]; csrfField: ReactNode }) {
  const [state, formAction] = useActionState(rentTitleAction, emptyFormState);

  return (
    <form action={formAction}>
      {csrfField}

      {state.message && (
        <div className="mb-3">
          <Alert tone={state.ok ? 'success' : 'error'}>{state.message}</Alert>
        </div>
      )}

      <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        {titles.map((title) => (
          <li key={title.id}>
            <button
              type="submit"
              name="titleId"
              value={title.id}
              disabled={title.held}
              className="group block w-full text-left disabled:cursor-default"
            >
              <span
                className={cn(
                  'relative flex aspect-[2/3] flex-col justify-end rounded-lg bg-gradient-to-br p-2.5 transition-transform',
                  title.gradient,
                  !title.held && 'group-hover:-translate-y-0.5',
                )}
              >
                <span className="text-sm leading-tight font-bold text-white drop-shadow">
                  {title.name}
                </span>
                <span className="text-[10px] text-white/80">{title.meta}</span>

                <span
                  className={cn(
                    'mt-1.5 inline-flex w-fit items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold',
                    title.held ? 'bg-white/90 text-slate-900' : 'bg-slate-900/80 text-white',
                  )}
                >
                  {title.held ? (
                    <>
                      <Check className="h-3 w-3" aria-hidden="true" />
                      In your library
                    </>
                  ) : (
                    <>Rent {formatPaise(title.price)}</>
                  )}
                </span>
              </span>
            </button>
          </li>
        ))}
      </ul>
    </form>
  );
}

export function ChannelGrid({ channels, csrfField }: { channels: Tile[]; csrfField: ReactNode }) {
  const [state, formAction] = useActionState(subscribeChannelAction, emptyFormState);

  return (
    <form action={formAction}>
      {csrfField}

      {state.message && (
        <div className="mb-3">
          <Alert tone={state.ok ? 'success' : 'error'}>{state.message}</Alert>
        </div>
      )}

      <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        {channels.map((channel) => (
          <li key={channel.id}>
            <button
              type="submit"
              name="channelId"
              value={channel.id}
              disabled={channel.held}
              className="group block w-full text-left disabled:cursor-default"
            >
              <span
                className={cn(
                  'flex aspect-[16/9] flex-col items-center justify-center gap-1 rounded-lg bg-gradient-to-br p-3 text-center transition-transform',
                  channel.gradient,
                  !channel.held && 'group-hover:-translate-y-0.5',
                )}
              >
                <span className="text-base font-bold text-white drop-shadow">{channel.name}</span>
                <span className="text-[10px] text-white/80">{channel.meta}</span>
                <span
                  className={cn(
                    'mt-1 rounded-full px-2 py-0.5 text-[10px] font-bold',
                    channel.held ? 'bg-white/90 text-slate-900' : 'bg-slate-900/80 text-white',
                  )}
                >
                  {channel.held ? 'Subscribed' : `${formatPaise(channel.price)}/month`}
                </span>
              </span>
            </button>
          </li>
        ))}
      </ul>
    </form>
  );
}

/** The free tier needs no action -- the tiles simply link nowhere to pay. */
export function FreeRow({ titles }: { titles: Array<Omit<Tile, 'price' | 'held'>> }) {
  return (
    <ul className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-8">
      {titles.map((title) => (
        <li key={title.id}>
          <span
            className={cn(
              'flex aspect-[2/3] flex-col justify-end rounded-lg bg-gradient-to-br p-2.5',
              title.gradient,
            )}
          >
            <span className="text-xs leading-tight font-bold text-white drop-shadow">
              {title.name}
            </span>
            <span className="text-[10px] text-white/80">{title.meta}</span>
            <span className="mt-1.5 inline-flex w-fit items-center gap-1 rounded-full bg-white/90 px-2 py-0.5 text-[10px] font-bold text-slate-900">
              <Play className="h-2.5 w-2.5" aria-hidden="true" />
              Free
            </span>
          </span>
        </li>
      ))}
    </ul>
  );
}
