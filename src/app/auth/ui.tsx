'use client';

import Link from 'next/link';
import type { InputHTMLAttributes, ReactNode } from 'react';
import { useFormStatus } from 'react-dom';

import { cn } from '@/lib/utils/cn';

/**
 * Form primitives for the auth pages: a dark-navy card on a black page, with
 * the yellow primary button and light-blue links. Kept separate from the
 * storefront's shared inputs so this section's look is set in one place.
 */

/** Light-blue link on navy; amber on hover. */
export const authLinkClass = 'text-[13px] text-[#6cb6ff] hover:text-[#ffb52b] hover:underline';

export function AuthCard({ children }: { children: ReactNode }) {
  return (
    <div className="bg-brand-800 rounded-lg border border-white/10 px-[26px] pt-5 pb-6 text-white shadow-[0_2px_12px_rgba(0,0,0,.6)]">
      {children}
    </div>
  );
}

export function AuthHeading({ children }: { children: ReactNode }) {
  return <h1 className="mb-3 text-[28px] leading-tight font-normal text-white">{children}</h1>;
}

interface AuthInputProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'id'> {
  id: string;
  label: string;
  /** Right-aligned companion to the label, e.g. "Forgot your password?". */
  labelAside?: ReactNode;
  error?: string;
}

/** The input look, exported so bespoke inputs (the +91 field) can match. */
export const authInputClass = (hasError: boolean) =>
  cn(
    'bg-brand-900 h-[31px] w-full rounded-[3px] border px-2 text-[13px] text-white outline-none placeholder:text-white/40',
    hasError
      ? 'border-[#ff7a7a] focus:ring-2 focus:ring-[#ff7a7a]/30'
      : 'border-white/25 focus:border-[#e77600] focus:ring-[3px] focus:ring-[#e77600]/35',
  );

export function AuthInput({ id, label, labelAside, error, className, ...props }: AuthInputProps) {
  return (
    <div className="space-y-1">
      <div className="flex items-baseline justify-between gap-3">
        <label htmlFor={id} className="block text-[13px] font-bold text-white">
          {label}
        </label>
        {labelAside}
      </div>
      <input
        id={id}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? `${id}-error` : undefined}
        className={cn(authInputClass(Boolean(error)), className)}
        {...props}
      />
      {error && (
        <p id={`${id}-error`} role="alert" className="text-[12px] text-[#ff7a7a]">
          <span className="sr-only">Error: </span>
          {error}
        </p>
      )}
    </div>
  );
}

/** The yellow primary button, wired to the enclosing form's pending state. */
export function AuthButton({
  children,
  pendingLabel = 'Please wait...',
  variant = 'primary',
}: {
  children: ReactNode;
  pendingLabel?: string;
  variant?: 'primary' | 'secondary';
}) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      aria-busy={pending}
      className={cn(
        'h-[31px] w-full rounded-full border text-[13px] shadow-[0_2px_5px_rgba(0,0,0,.4)] disabled:opacity-60',
        variant === 'primary'
          ? 'border-[#FCD200] bg-[#FFD814] text-neutral-900 hover:bg-[#F7CA00]'
          : 'bg-brand-900 border-white/25 text-white hover:bg-white/10',
      )}
    >
      {pending ? pendingLabel : children}
    </button>
  );
}

export function AuthLink({ href, children, className }: { href: string; children: ReactNode; className?: string }) {
  return (
    <Link href={href} className={cn(authLinkClass, className)}>
      {children}
    </Link>
  );
}

export function AuthAlert({ tone, children }: { tone: 'error' | 'info' | 'success'; children: ReactNode }) {
  const styles =
    tone === 'error'
      ? 'border-[#ff7a7a]/70 bg-[#ff7a7a]/10'
      : tone === 'success'
        ? 'border-[#4ade80]/60 bg-[#4ade80]/10'
        : 'border-[#6cb6ff]/50 bg-[#6cb6ff]/10';
  return (
    <div role="alert" className={cn('mb-3 rounded-[4px] border px-3 py-2.5 text-[13px] text-white', styles)}>
      {tone === 'error' && <span className="font-bold text-[#ff7a7a]">There was a problem: </span>}
      {children}
    </div>
  );
}

export function AuthDivider({ label }: { label?: string }) {
  return (
    <div className="my-4 flex items-center gap-2 text-[12px] text-white/50">
      <span className="h-px flex-1 bg-white/15" />
      {label && <span>{label}</span>}
      <span className="h-px flex-1 bg-white/15" />
    </div>
  );
}

export function LegalNote({ children }: { children: ReactNode }) {
  return <p className="mt-3 text-[12px] leading-snug text-white/80">{children}</p>;
}
