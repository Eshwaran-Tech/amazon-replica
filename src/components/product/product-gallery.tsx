'use client';

import { useState } from 'react';

import { cn } from '@/lib/utils/cn';

import { ProductImage } from './product-image';

interface ProductGalleryProps {
  images: string[];
  productName: string;
}

/**
 * Image gallery with thumbnails.
 *
 * Thumbnails are a `tablist`, which is exactly what they are: a row of controls
 * that each reveal one panel. That gives arrow-key navigation and correct
 * announcements without inventing a bespoke interaction.
 *
 * Selection is driven by click and by keyboard, not by hover. A hover-only
 * gallery is unusable on touch, where there is no hover state at all.
 */
export function ProductGallery({ images, productName }: ProductGalleryProps) {
  const [active, setActive] = useState(0);
  const current = images[active] ?? images[0] ?? '';

  function onKeyDown(event: React.KeyboardEvent<HTMLDivElement>) {
    if (event.key === 'ArrowRight') {
      event.preventDefault();
      setActive((index) => (index + 1) % images.length);
    } else if (event.key === 'ArrowLeft') {
      event.preventDefault();
      setActive((index) => (index === 0 ? images.length - 1 : index - 1));
    }
  }

  return (
    <div className="flex flex-col gap-3 sm:flex-row-reverse sm:gap-4">
      <div className="bg-surface relative aspect-square w-full flex-1 overflow-hidden rounded-lg">
        {current && (
          <ProductImage
            src={current}
            alt={`${productName}, image ${active + 1} of ${images.length}`}
            priority
            sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 40vw"
          />
        )}
      </div>

      {images.length > 1 && (
        <div
          role="tablist"
          aria-label={`${productName} images`}
          onKeyDown={onKeyDown}
          className="no-scrollbar flex shrink-0 gap-2 overflow-x-auto sm:flex-col sm:overflow-visible"
        >
          {images.map((image, index) => (
            <button
              key={image}
              type="button"
              role="tab"
              aria-selected={index === active}
              aria-label={`Show image ${index + 1}`}
              // Roving tabindex: the group is one tab stop, arrows move within.
              tabIndex={index === active ? 0 : -1}
              onClick={() => setActive(index)}
              className={cn(
                'relative h-14 w-14 shrink-0 overflow-hidden rounded border-2 sm:h-16 sm:w-16',
                index === active ? 'border-accent-500' : 'border-hairline hover:border-ink-subtle',
              )}
            >
              <ProductImage src={image} alt="" sizes="64px" />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
