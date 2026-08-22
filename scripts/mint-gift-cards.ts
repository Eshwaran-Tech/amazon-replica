/**
 * Mints gift cards and prints their codes.
 *
 * The codes are printed here because this is the only moment they exist in
 * plain text -- `services/gift-cards.ts` stores an HMAC and nothing else, so
 * a code that is not copied out of this output is gone. That is the point: a
 * dumped database should not be a pile of spendable money.
 *
 * Run: pnpm giftcards:mint                 (3 cards of Rs 500)
 *      pnpm giftcards:mint --amount 1000 --count 5
 */

import { closeMongoClient } from '@/lib/db/client';
import { ensureIndexes } from '@/lib/db/indexes';
import { formatPaise, rupeesToPaise } from '@/lib/utils/money';
import { mintGiftCards } from '@/services/gift-cards';

function readFlag(name: string, fallback: number): number {
  const index = process.argv.indexOf(`--${name}`);
  if (index === -1) return fallback;

  const value = Number(process.argv[index + 1]);
  if (!Number.isInteger(value) || value <= 0) {
    throw new Error(`--${name} must be a positive whole number`);
  }
  return value;
}

async function main(): Promise<void> {
  const rupees = readFlag('amount', 500);
  const count = readFlag('count', 3);

  // A card is worthless if the unique index on its hash is missing.
  await ensureIndexes();

  const minted = await mintGiftCards(rupeesToPaise(rupees), count);

  console.log(`\nMinted ${minted.length} gift card(s) worth ${formatPaise(rupeesToPaise(rupees))} each.`);
  console.log('Copy these now -- only a keyed hash is stored, so they cannot be shown again.\n');
  for (const card of minted) {
    console.log(`  ${card.code}   ${formatPaise(card.amount)}   expires ${card.expiresAt.toDateString()}`);
  }
  console.log('\nRedeem at /pay/gift-cards while signed in.\n');
}

main()
  .catch((error: unknown) => {
    console.error('Minting failed:', error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(() => closeMongoClient());
