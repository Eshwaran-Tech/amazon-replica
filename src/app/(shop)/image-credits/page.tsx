import type { Metadata } from 'next';

import { Container } from '@/components/layout/container';
import { requiredAttributions } from '@/data/product-images';

export const metadata: Metadata = {
  title: 'Image credits',
  description: 'Attribution for the Creative Commons product photography used in this store.',
};

/**
 * Product photography comes from Openverse under Creative Commons licences.
 * CC BY and CC BY-SA require the creator to be credited wherever the image is
 * published -- so this page is part of complying with the licence, not a
 * courtesy. It is generated from the same manifest the catalogue reads, which
 * means it cannot drift out of date when the images are re-fetched.
 */
export default function ImageCreditsPage() {
  const attributions = requiredAttributions();

  return (
    <Container size="narrow" className="py-6 sm:py-8">
      <h1 className="text-xl font-bold sm:text-2xl">Image credits</h1>
      <p className="text-ink-muted mt-2 text-sm leading-relaxed">
        Product photography in this store comes from two places. Studio catalogue shots are supplied
        by{' '}
        <a
          className="underline"
          href="https://dummyjson.com"
          target="_blank"
          rel="noopener noreferrer"
        >
          DummyJSON
        </a>
        , a public demo-data service for development. The remainder comes from{' '}
        <a
          className="underline"
          href="https://openverse.org"
          target="_blank"
          rel="noopener noreferrer"
        >
          Openverse
        </a>
        , which indexes openly licensed images. Photographs released under CC0 or marked as public
        domain need no credit and are not listed here. The images below are used under licences that
        require attribution, and their creators are credited in full.
      </p>

      {attributions.length === 0 ? (
        <p className="text-ink-muted mt-6 text-sm">
          Every image currently in use is CC0 or public domain, so no attribution is required.
        </p>
      ) : (
        <ul className="mt-6 space-y-3">
          {attributions.map(({ subcategory, credit }) => (
            <li key={credit.path} className="border-hairline border-b pb-3 text-sm last:border-b-0">
              <a
                className="font-medium underline"
                href={credit.sourceUrl}
                target="_blank"
                rel="noopener noreferrer"
              >
                {credit.title}
              </a>
              <p className="text-ink-muted mt-0.5">
                by{' '}
                {credit.creatorUrl ? (
                  <a
                    className="underline"
                    href={credit.creatorUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    {credit.creator}
                  </a>
                ) : (
                  credit.creator
                )}{' '}
                · {credit.license} · used for {subcategory.split('/').join(' → ')}
              </p>
            </li>
          ))}
        </ul>
      )}
    </Container>
  );
}
