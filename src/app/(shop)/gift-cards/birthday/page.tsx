import type { Metadata } from 'next';
import { notFound } from 'next/navigation';

import { OccasionStore } from '@/components/gift-cards/occasion-store';
import { findOccasion } from '@/data/gift-occasions';

export const metadata: Metadata = {
  title: 'Birthday Gift Cards',
  description: 'Birthday gift cards, paid from your Eshwaran Pay balance.',
};

/**
 * The birthday store.
 *
 * The sections are slices of the one birthday design list, so "New Arrivals"
 * cannot show a card the results grid does not have.
 */
export default function BirthdayGiftCardsPage() {
  const occasion = findOccasion('birthday');
  if (!occasion) notFound();

  return (
    <OccasionStore
      occasion={occasion}
      activeTab="/gift-cards/birthday"
      heading="Birthday Gift Cards Store"
      strapline="Make your loved ones feel special on their birthday. Send a card and let them choose the rest."
      sections={[
        { title: 'Send birthday wishes', from: 0, count: 6 },
        { title: 'For your family', from: 6, count: 3 },
        { title: 'For the milestone years', from: 9, count: 3 },
        { title: 'New arrivals', from: 9 },
      ]}
      brandCategories={['Fashion', 'Gaming', 'Beauty & Health', 'Grocery & Food']}
    />
  );
}
