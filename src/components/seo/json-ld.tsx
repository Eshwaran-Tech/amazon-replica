import { headers } from 'next/headers';

import { NONCE_HEADER_NAME } from '@/lib/auth/constants';
import { escapeJsonForScript } from '@/lib/security/json-ld-escape';

/**
 * Structured data (schema.org JSON-LD).
 *
 * This is the codebase's **only** use of `dangerouslySetInnerHTML`, and it is
 * an audited exception rather than an oversight:
 *
 *  - the content is `JSON.stringify` of an object built from typed, validated
 *    data, never a raw string from a request;
 *  - it is escaped for a script context by `escapeJsonForScript`, which is
 *    unit-tested against tag-breaking payloads.
 *
 * The nonce is required because the CSP is nonce-based with `strict-dynamic`;
 * browsers apply `script-src` to `application/ld+json` blocks too, so without
 * it the block is silently dropped.
 */
export async function JsonLd({ data }: { data: Record<string, unknown> }) {
  const nonce = (await headers()).get(NONCE_HEADER_NAME) ?? undefined;

  return (
    <script
      type="application/ld+json"
      nonce={nonce}
      // eslint-disable-next-line react/no-danger
      dangerouslySetInnerHTML={{ __html: escapeJsonForScript(data) }}
    />
  );
}
