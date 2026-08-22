'use client';

import { ChevronDown } from 'lucide-react';
import Link from 'next/link';
import { useEffect, useId, useRef, useState, type ReactNode } from 'react';

import { setLanguageAction } from '@/actions/preferences';
import { useT } from '@/lib/i18n/client';
import { LANGUAGES, type LanguageCode } from '@/lib/i18n/languages';

interface LanguageMenuProps {
  current: LanguageCode;
  csrfField: ReactNode;
  flag: ReactNode;
}

/**
 * "IN EN ▾" with the language flyout.
 *
 * The radios are a real form posting a Server Action; picking one submits it,
 * so the choice is remembered without JavaScript beyond hydration. The panel
 * opens on hover, focus and click -- never hover alone.
 */
export function LanguageMenu({ current, csrfField, flag }: LanguageMenuProps) {
  const t = useT();
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const formRef = useRef<HTMLFormElement>(null);
  const menuId = useId();
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const selected = LANGUAGES.find((language) => language.code === current) ?? LANGUAGES[0];

  useEffect(() => {
    function onPointerDown(event: PointerEvent) {
      if (!containerRef.current?.contains(event.target as Node)) setOpen(false);
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') setOpen(false);
    }
    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, []);

  function scheduleClose() {
    closeTimer.current = setTimeout(() => setOpen(false), 150);
  }
  function cancelClose() {
    if (closeTimer.current) clearTimeout(closeTimer.current);
  }

  return (
    <div
      ref={containerRef}
      className="relative hidden lg:block"
      onMouseEnter={() => {
        cancelClose();
        setOpen(true);
      }}
      onMouseLeave={scheduleClose}
      onFocus={() => setOpen(true)}
      onBlur={(event) => {
        if (!containerRef.current?.contains(event.relatedTarget as Node)) setOpen(false);
      }}
    >
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        aria-controls={menuId}
        aria-label={t('lang.ariaChange', { language: selected.label })}
        className={`flex min-h-11 shrink-0 items-center gap-1 rounded border px-2 ${
          open ? 'border-white/60' : 'hover:outline-hairline/60 border-transparent hover:outline'
        }`}
      >
        {flag}
        <span className="text-[13px] font-bold">IN</span>
        <span className="text-[13px] font-bold">{selected.short}</span>
        <ChevronDown className="h-3.5 w-3.5 opacity-80" aria-hidden="true" />
      </button>

      {open && (
        <div
          id={menuId}
          className="bg-brand-800 absolute top-full left-0 z-50 mt-1 w-[300px] rounded-sm border border-white/10 px-5 pt-4 pb-4 text-white shadow-[0_0_14px_rgba(0,0,0,.6)]"
        >
          <span
            aria-hidden="true"
            className="border-b-brand-800 absolute -top-2 left-8 h-0 w-0 border-x-8 border-b-8 border-x-transparent"
          />

          <form ref={formRef} action={setLanguageAction}>
            {csrfField}
            <fieldset>
              <legend className="mb-2 text-[15px] font-bold">{t('lang.change')}</legend>
              <ul className="space-y-1">
                {LANGUAGES.map((language, index) => (
                  <li
                    key={language.code}
                    className={index === 1 ? 'mt-2 border-t border-white/15 pt-2' : ''}
                  >
                    <label className="flex min-h-8 cursor-pointer items-center gap-3 text-[14px] text-white/90 hover:text-white">
                      <input
                        type="radio"
                        name="language"
                        value={language.code}
                        defaultChecked={language.code === current}
                        onChange={() => formRef.current?.requestSubmit()}
                        className="h-4 w-4 accent-[#e77600]"
                      />
                      <span>
                        {language.label} - {language.short}
                      </span>
                    </label>
                  </li>
                ))}
              </ul>
            </fieldset>
            {/* Works without JavaScript too. */}
            <noscript>
              <button type="submit" className="mt-2 text-[13px] underline">
                Save
              </button>
            </noscript>
          </form>

          <p className="mt-2 text-[12px] text-white/60">{t('lang.catalogueNote')}</p>

          <div className="mt-3 flex items-center gap-2 border-t border-white/15 pt-3 text-[14px]">
            {flag}
            <span className="text-white/90">{t('lang.shoppingOn')}</span>
          </div>
          <Link
            href="/help"
            className="mt-2 inline-block text-[14px] text-[#6cb6ff] hover:text-[#ffb52b] hover:underline"
          >
            {t('lang.changeCountry')}
          </Link>
        </div>
      )}
    </div>
  );
}
