import { describe, expect, it } from 'vitest';

import { parseSmtpUrl } from '@/lib/email';

/**
 * SMTP_URL is the one secret standing between a deployment and its outbound
 * mail, and every failure mode here looks the same from the outside: the user
 * never receives a code. So the parse is pinned rather than trusted.
 */
describe('parseSmtpUrl', () => {
  it('defaults to 465 for implicit TLS', () => {
    expect(parseSmtpUrl('smtps://user:pass@smtp.example.com')).toEqual({
      host: 'smtp.example.com',
      port: 465,
      secure: true,
      auth: { user: 'user', pass: 'pass' },
    });
  });

  it('defaults to 587 for STARTTLS', () => {
    expect(parseSmtpUrl('smtp://user:pass@smtp.example.com')).toEqual({
      host: 'smtp.example.com',
      port: 587,
      secure: false,
      auth: { user: 'user', pass: 'pass' },
    });
  });

  it('honours an explicit port', () => {
    expect(parseSmtpUrl('smtp://u:p@smtp.example.com:2525').port).toBe(2525);
  });

  it('percent-decodes credentials', () => {
    // A password of `p@ss/w:rd` must survive the round trip -- splitting on the
    // raw characters would take the host as `ss` and lose the rest.
    const parsed = parseSmtpUrl('smtps://a%40b.com:p%40ss%2Fw%3Ard@smtp.example.com');
    expect(parsed.auth).toEqual({ user: 'a@b.com', pass: 'p@ss/w:rd' });
    expect(parsed.host).toBe('smtp.example.com');
  });

  it('omits auth entirely when the URL carries no credentials', () => {
    const parsed = parseSmtpUrl('smtp://localhost:1025');
    expect(parsed.auth).toBeUndefined();
    expect(parsed).toEqual({ host: 'localhost', port: 1025, secure: false });
  });

  it('rejects a non-SMTP scheme rather than silently trying it', () => {
    expect(() => parseSmtpUrl('https://smtp.example.com')).toThrow(/smtp:\/\/ or smtps:\/\//);
  });

  it('rejects a bare host, the commonest way to get this wrong', () => {
    // `new URL` accepts this, reading "smtp.example.com:" as the scheme, so the
    // scheme check rather than the parse is what catches it.
    expect(() => parseSmtpUrl('smtp.example.com:587')).toThrow(/smtp:\/\/ or smtps:\/\//);
  });

  it('rejects a value that is not a URL at all', () => {
    expect(() => parseSmtpUrl('smtp.example.com')).toThrow(/not a valid URL/);
  });
});
