import { ImageResponse } from 'next/og';

import { BRAND_NAME } from '@/lib/brand';

/**
 * The favicon.
 *
 * There was none at all before this, which is worth more than it sounds: the
 * favicon is what a returning visitor picks their tab out by, and Google shows
 * it beside every mobile search result. A missing one leaves a grey globe in
 * both places.
 *
 * Generated from the brand's first letter for the same reason the wordmark is:
 * renaming the store should not mean opening an image editor. `size-adjust`
 * keeps the glyph optically centred whatever letter it lands on.
 */
export const runtime = 'nodejs';
export const size = { width: 32, height: 32 };
export const contentType = 'image/png';

export default async function Icon() {
  return new ImageResponse(
    <div
      style={{
        width: '100%',
        height: '100%',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: '#152238',
        color: '#febd69',
        fontSize: 22,
        fontWeight: 800,
        fontFamily: 'sans-serif',
        borderRadius: 6,
      }}
    >
      {BRAND_NAME.charAt(0).toUpperCase()}
    </div>,
    size,
  );
}
