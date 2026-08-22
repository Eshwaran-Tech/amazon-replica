import { ImageResponse } from 'next/og';

import { BRAND_NAME, BRAND_SUFFIX, BRAND_TAGLINE } from '@/lib/brand';

/**
 * The social preview card.
 *
 * Generated rather than shipped as a PNG so it follows the brand name from the
 * environment -- the same reason nothing else in this codebase hard-codes it.
 *
 * 1200x630 is the size every scraper crops to. Drawn with the accent colours
 * the site already uses, and deliberately typographic: a wordmark and one line
 * of copy stay legible in a Slack unfurl at 300px wide, where a product collage
 * would turn to mud.
 *
 * `alt` matters here. A link shared into a screen reader announces it, and
 * "opengraph-image" is not a description.
 */
export const runtime = 'nodejs';
export const alt = `${BRAND_NAME} - ${BRAND_TAGLINE}`;
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

export default async function OpengraphImage() {
  return new ImageResponse(
    <div
      style={{
        height: '100%',
        width: '100%',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'center',
        padding: '0 96px',
        background: 'linear-gradient(135deg, #0f1b2d 0%, #152238 55%, #1d2f4a 100%)',
        color: '#ffffff',
        fontFamily: 'sans-serif',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
        <span style={{ fontSize: 104, fontWeight: 800, letterSpacing: '-0.03em' }}>
          {BRAND_NAME}
        </span>
        <span style={{ fontSize: 44, fontWeight: 700, color: '#febd69' }}>{BRAND_SUFFIX}</span>
      </div>

      {/* The accent stroke sizes itself to the wordmark, as it does in the header. */}
      <div
        style={{
          display: 'flex',
          width: BRAND_NAME.length * 46,
          height: 8,
          borderRadius: 4,
          background: '#febd69',
          marginTop: 12,
        }}
      />

      <div style={{ fontSize: 40, marginTop: 40, color: '#cbd5e1', lineHeight: 1.3 }}>
        {BRAND_TAGLINE}
      </div>

      <div style={{ fontSize: 28, marginTop: 28, color: '#94a3b8' }}>
        Fast delivery · Secure checkout · Easy returns
      </div>
    </div>,
    size,
  );
}
