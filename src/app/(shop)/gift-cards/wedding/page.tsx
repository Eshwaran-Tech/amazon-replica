import type { Metadata } from 'next';
import { notFound } from 'next/navigation';

import { OccasionStore } from '@/components/gift-cards/occasion-store';
import { findOccasion } from '@/data/gift-occasions';

export const metadata: Metadata = {
  title: 'Wedding & Engagement Gift Cards',
  description: 'Wedding and engagement gift cards, paid from your Amazon Pay balance.',
};

/**
 * The wedding store.
 *
 * Same shell as the birthday one, different words and different brand
 * categories -- which is exactly what the two pages are in the reference.
 */
export default function WeddingGiftCardsPage() {
  const occasion = findOccasion('wedding');
  if (!occasion) notFound();

  return (
    <OccasionStore
      occasion={occasion}
      activeTab="/gift-cards/wedding"
      heading="Wedding eGift Cards"
      strapline="Simple and convenient gifting for the couple who have everything but a registry."
      sections={[
        { title: 'Wedding special', from: 0, count: 6 },
        { title: 'Engagement', from: 6, count: 3 },
        { title: 'More designs', from: 9 },
      ]}
      brandCategories={['Jewellery', 'Fashion', 'Travel & Hospitality', 'Furniture & Electronics']}
    />
  );
}
