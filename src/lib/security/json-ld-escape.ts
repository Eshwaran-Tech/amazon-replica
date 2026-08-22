/**
 * Escaping for JSON embedded in an HTML `<script>` element.
 *
 * `JSON.stringify` produces valid JSON, but valid JSON is not automatically
 * safe inside a script element. A product name containing a closing script tag
 * would end the element early, and everything after it would be parsed as
 * markup -- a stored XSS delivered through structured data.
 *
 * Escaping `<`, `>` and `&` to their `\uXXXX` forms keeps the JSON valid (any
 * JSON parser decodes the escapes back to the original characters) while making
 * it impossible for the payload to contain a literal tag delimiter.
 *
 * U+2028 and U+2029 are legal inside a JSON string but terminate a line in
 * JavaScript, so they are escaped too.
 *
 * Pure and dependency-free so it can be unit-tested directly -- a security
 * control that only runs inside a React component is a security control nobody
 * tests.
 */

const LINE_SEPARATOR = String.fromCharCode(0x2028);
const PARAGRAPH_SEPARATOR = String.fromCharCode(0x2029);
const LINE_TERMINATORS = new RegExp(`[${LINE_SEPARATOR}${PARAGRAPH_SEPARATOR}]`, 'g');

const ESCAPES: Record<string, string> = {
  '<': String.fromCharCode(92) + 'u003c',
  '>': String.fromCharCode(92) + 'u003e',
  '&': String.fromCharCode(92) + 'u0026',
};

export function escapeJsonForScript(value: unknown): string {
  const json = JSON.stringify(value) ?? 'null';

  return json
    .replace(/[<>&]/g, (character) => ESCAPES[character] ?? character)
    .replace(LINE_TERMINATORS, (character) =>
      character === LINE_SEPARATOR
        ? String.fromCharCode(92) + 'u2028'
        : String.fromCharCode(92) + 'u2029',
    );
}
