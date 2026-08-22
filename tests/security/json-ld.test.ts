import { describe, expect, it } from 'vitest';

import { escapeJsonForScript } from '@/lib/security/json-ld-escape';

/**
 * The JSON-LD escaper is the only thing standing between a product name and a
 * `dangerouslySetInnerHTML` call, so it gets tested against the payloads that
 * would actually be used.
 */
describe('JSON-LD script escaping', () => {
  it('neutralises a closing script tag in a product name', () => {
    const payload = { name: 'Widget </script><script>alert(1)</script>' };
    const escaped = escapeJsonForScript(payload);

    // Nothing that a browser could read as a tag delimiter survives.
    expect(escaped).not.toContain('</script>');
    expect(escaped).not.toContain('<');
    expect(escaped).not.toContain('>');
    expect(escaped).toContain('\\u003c');
  });

  it('escapes ampersands, which can start an HTML entity', () => {
    expect(escapeJsonForScript({ brand: 'Smith & Sons' })).toContain('\\u0026');
    expect(escapeJsonForScript({ brand: 'Smith & Sons' })).not.toContain('&');
  });

  it('escapes U+2028 and U+2029, which terminate a JavaScript line', () => {
    const value = { note: `line one${String.fromCharCode(0x2028)}line two` };
    const escaped = escapeJsonForScript(value);

    expect(escaped).toContain('\\u2028');
    expect(escaped).not.toContain(String.fromCharCode(0x2028));
  });

  it('stays valid JSON that decodes back to the original value', () => {
    // The whole approach depends on this: escapes must be lossless, or the
    // structured data we publish would not match the page.
    const original = {
      name: 'Widget </script> & "quoted"   end',
      price: '1299.50',
      nested: { list: ['<a>', '&amp;'] },
    };

    const parsed: unknown = JSON.parse(escapeJsonForScript(original));
    expect(parsed).toEqual(original);
  });

  it('handles values JSON.stringify cannot represent', () => {
    expect(escapeJsonForScript(undefined)).toBe('null');
    expect(() => JSON.parse(escapeJsonForScript(undefined))).not.toThrow();
  });
});
