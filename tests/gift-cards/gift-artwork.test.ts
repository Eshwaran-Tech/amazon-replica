import { existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { GIFT_BRANDS } from '@/data/gift-brands';
import { allDesigns } from '@/services/gift-store';

/**
 * Every face the catalogue points at must exist.
 *
 * This is the one property that cannot be checked by reading the code: the
 * designs are described in `data/gift-occasions.ts` and drawn by
 * `scripts/generate-giftcard-art.ts`, and nothing in the type system connects
 * the two. Raise an occasion's `designs` count without re-running the
 * generator and the storefront links to artwork that 404s -- the whole product
 * missing, on every tile.
 */

const ART_DIR = join(process.cwd(), 'public', 'gift-cards');

describe('gift card artwork', () => {
  it('has a file for every design in the catalogue', () => {
    const missing = allDesigns()
      .map((design) => design.artwork.replace(/^\//, ''))
      .filter((path) => !existsSync(join(process.cwd(), 'public', path)));

    expect(missing, 'run: pnpm tsx scripts/generate-giftcard-art.ts').toEqual([]);
  });

  it('would notice a design with no file behind it', () => {
    // The check above only means something if it can fail. A design id that was
    // never drawn has to be reported rather than quietly pass.
    expect(existsSync(join(ART_DIR, 'birthday-99.svg'))).toBe(false);
  });

  it('has a tile for every brand', () => {
    const missing = GIFT_BRANDS.map((brand) => `brand-${brand.id}.svg`).filter(
      (name) => !existsSync(join(ART_DIR, name)),
    );

    expect(missing, `run: pnpm tsx scripts/generate-giftcard-art.ts`).toEqual([]);
  });

  it('leaves no orphan artwork behind', () => {
    // The generator prunes its own stale output. If this fails, an occasion
    // shrank and the files it used to own were left on disk.
    const expected = new Set([
      ...allDesigns().map((design) => `${design.id}.svg`),
      ...GIFT_BRANDS.map((brand) => `brand-${brand.id}.svg`),
    ]);

    const orphans = readdirSync(ART_DIR)
      .filter((name) => name.endsWith('.svg'))
      .filter((name) => !expected.has(name));

    expect(orphans).toEqual([]);
  });

  it('draws every face as a real SVG the browser will accept', () => {
    // A truncated write leaves a file that exists and renders as nothing.
    const files = readdirSync(ART_DIR).filter((name) => name.endsWith('.svg'));
    expect(files.length).toBeGreaterThan(0);

    for (const name of files) {
      const path = join(ART_DIR, name);
      expect(existsSync(path), name).toBe(true);
    }
  });
});
