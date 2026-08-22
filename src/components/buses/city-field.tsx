'use client';

import { ArrowUpRight, MapPin } from 'lucide-react';
import { useEffect, useId, useMemo, useRef, useState } from 'react';

import { findCity, searchCities, POPULAR_CITIES } from '@/data/bus-cities';
import { cn } from '@/lib/utils/cn';

/**
 * Source / destination field with the reference's "Popular Cities" dropdown.
 *
 * A combobox rather than a `<select>`: the list is fifty cities and growing,
 * and the reference lets you type. `role="combobox"` with
 * `aria-activedescendant` is what makes the arrow keys announce properly --
 * a div full of click handlers reads as nothing at all to a screen reader.
 */

interface Props {
  name: string;
  label: string;
  value: string;
  placeholder: string;
  onChange: (cityId: string) => void;
}

export function CityField({ name, label, value, placeholder, onChange }: Props) {
  const [open, setOpen] = useState(false);
  const [term, setTerm] = useState('');
  const [active, setActive] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);
  const listId = useId();

  const selected = findCity(value);
  const matches = useMemo(() => (term ? searchCities(term) : POPULAR_CITIES), [term]);

  useEffect(() => {
    if (!open) return;

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
  }, [open]);

  function choose(cityId: string): void {
    onChange(cityId);
    setTerm('');
    setOpen(false);
  }

  function openPanel(): void {
    setOpen(true);
    setActive(0);
  }

  return (
    <div ref={containerRef} className="relative min-w-0 flex-1">
      <input type="hidden" name={name} value={value} />

      <label htmlFor={`${listId}-input`} className="sr-only">
        {label}
      </label>
      <input
        id={`${listId}-input`}
        role="combobox"
        aria-expanded={open}
        aria-controls={listId}
        aria-autocomplete="list"
        aria-activedescendant={
          open && matches[active] ? `${listId}-${matches[active].id}` : undefined
        }
        value={open ? term : (selected?.name ?? '')}
        placeholder={placeholder}
        onFocus={openPanel}
        onChange={(event) => {
          setTerm(event.target.value);
          setOpen(true);
          setActive(0);
        }}
        onKeyDown={(event) => {
          if (event.key === 'ArrowDown') {
            event.preventDefault();
            setOpen(true);
            setActive((current) => Math.min(current + 1, matches.length - 1));
          } else if (event.key === 'ArrowUp') {
            event.preventDefault();
            setActive((current) => Math.max(current - 1, 0));
          } else if (event.key === 'Enter' && open) {
            event.preventDefault();
            const city = matches[active];
            if (city) choose(city.id);
          }
        }}
        className="w-full bg-transparent px-4 py-3.5 text-sm text-neutral-900 placeholder:text-neutral-500 focus:outline-none"
      />

      {open && (
        <div className="border-hairline absolute top-full left-0 z-40 mt-1 max-h-72 w-full min-w-[16rem] overflow-y-auto rounded-xl border bg-white shadow-xl">
          <p className="border-hairline sticky top-0 border-b bg-neutral-100 px-4 py-2 text-xs font-bold text-neutral-700">
            {term ? 'Matching cities' : 'Popular Cities'}
          </p>
          <ul id={listId} role="listbox" aria-label={label}>
            {matches.length === 0 && (
              <li className="px-4 py-3 text-sm text-neutral-500">No city matches “{term}”.</li>
            )}
            {matches.map((city, index) => (
              <li
                key={city.id}
                id={`${listId}-${city.id}`}
                role="option"
                aria-selected={index === active}
              >
                <button
                  type="button"
                  onMouseEnter={() => setActive(index)}
                  onClick={() => choose(city.id)}
                  className={cn(
                    'border-hairline flex w-full items-center gap-3 border-b px-4 py-2.5 text-left',
                    index === active ? 'bg-neutral-100' : 'bg-white',
                  )}
                >
                  <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-neutral-300 text-neutral-500">
                    {term ? (
                      <MapPin className="h-3 w-3" aria-hidden="true" />
                    ) : (
                      <ArrowUpRight className="h-3 w-3" aria-hidden="true" />
                    )}
                  </span>
                  <span className="min-w-0">
                    <span className="block text-sm font-semibold text-neutral-900">
                      {city.name}
                    </span>
                    <span className="block text-xs text-neutral-500">{city.state}</span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
