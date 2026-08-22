import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import manifest from '@/data/hotel-photos.json';
import { PHOTO_POOL_SIZE } from '@/services/hotels';

/**
 * The photo pool and its manifest have to agree.
 *
 * `HotelPhoto` reads the manifest to decide whether a slot has a photograph or
 * falls back to a drawn scene. An entry pointing at a file that is not there
 * renders a broken image on every card that lands on that slot -- and nothing
 * in the type system connects a JSON file to a directory, so only a test
 * catches it.
 *
 * This drifted twice in practice: a fetch that was still running rewrote the
 * manifest after files had been curated out of it, and left entries for three
 * photographs that no longer existed.
 */

const DIR = join(process.cwd(), 'public', 'hotels');

interface Entry {
  slot: number;
  file: string;
  title: string;
  licence: string;
  credit: string | null;
  source: string;
}

const entries = manifest as Entry[];

describe('hotel photo pool', () => {
  it('has a file on disk for every manifest entry', () => {
    const missing = entries.filter((entry) => !existsSync(join(DIR, entry.file)));
    expect(missing.map((entry) => entry.file)).toEqual([]);
  });

  it('lists every photograph on disk in the manifest', () => {
    const known = new Set(entries.map((entry) => entry.file));
    const orphans = readdirSync(DIR)
      .filter((name) => /\.(jpg|png)$/.test(name))
      .filter((name) => !known.has(name));
    expect(orphans).toEqual([]);
  });

  it('gives every entry a distinct slot inside the pool', () => {
    const slots = entries.map((entry) => entry.slot);
    expect(new Set(slots).size).toBe(slots.length);
    for (const slot of slots) {
      expect(slot).toBeGreaterThanOrEqual(0);
      expect(slot).toBeLessThan(PHOTO_POOL_SIZE);
    }
  });

  it('has a drawn scene for every slot, so a gap is never a hole', () => {
    for (let slot = 0; slot < PHOTO_POOL_SIZE; slot += 1) {
      const drawn = join(DIR, `hotel-${String(slot).padStart(2, '0')}.svg`);
      expect(existsSync(drawn), `slot ${slot}`).toBe(true);
    }
  });

  it('credits every photograph whose licence asks for it', () => {
    const attribution = readFileSync(join(DIR, 'ATTRIBUTION.md'), 'utf8');
    for (const entry of entries) {
      if (!entry.credit) continue;
      expect(attribution, entry.file).toContain(entry.file);
    }
  });

  it('accepts no licence that forbids commercial use or modification', () => {
    for (const entry of entries) {
      const licence = entry.licence.toLowerCase();
      expect(licence, entry.file).not.toMatch(/\bnc\b|noncommercial|\bnd\b|noderiv/);
      expect(licence, entry.file).toMatch(/cc0|public domain|cc by/);
    }
  });
});
