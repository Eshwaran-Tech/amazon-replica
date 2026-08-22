import { describe, expect, it } from 'vitest';

import { registerSchema, loginSchema, resetPasswordSchema } from '@/lib/validations/auth';
import { addToCartSchema, updateCartItemSchema } from '@/lib/validations/cart';
import { checkoutSchema } from '@/lib/validations/checkout';
import { createReviewSchema } from '@/lib/validations/review';
import { createPaymentIntentSchema } from '@/lib/validations/payment';
import { updateUserRoleSchema } from '@/lib/validations/admin';
import { updateProfileSchema } from '@/lib/validations/user';
import { productCreateSchema } from '@/lib/validations/product';
import {
  normaliseSearchParams,
  productSearchSchema,
  searchSuggestSchema,
} from '@/lib/validations/search';
import {
  emailSchema,
  newPasswordSchema,
  objectIdString,
  paginationSchema,
  redirectPathSchema,
  rupeeAmountSchema,
  singleLineText,
} from '@/lib/validations/common';
import { buildProductQuery, escapeRegex } from '@/lib/db/product-query';
import { safeRedirectPath, isSafeRedirectPath } from '@/lib/security/redirect';

/**
 * Phase 3 verification.
 *
 * These are attack simulations, not shape checks. Each one submits the payload
 * an attacker would actually send and asserts the validation layer refuses it.
 */

const VALID_ID = '507f1f77bcf86cd799439011';

describe('privilege escalation via extra fields', () => {
  it('rejects a registration that tries to set its own role', () => {
    const result = registerSchema.safeParse({
      name: 'Mallory',
      email: 'mallory@example.com',
      password: 'CorrectHorse9',
      confirmPassword: 'CorrectHorse9',
      role: 'ADMIN',
    });

    // Strict objects make this a hard failure, not a silently dropped field.
    expect(result.success).toBe(false);
  });

  it('rejects a profile update that tries to verify its own email or escalate', () => {
    for (const payload of [
      { name: 'Mallory', role: 'ADMIN' },
      { name: 'Mallory', emailVerified: true },
      { name: 'Mallory', isDisabled: false },
      { name: 'Mallory', passwordHash: '$2b$12$whatever' },
      { name: 'Mallory', _id: VALID_ID },
    ]) {
      expect(updateProfileSchema.safeParse(payload).success, JSON.stringify(payload)).toBe(false);
    }
  });

  it('rejects a review that claims to be a verified purchase', () => {
    const result = createReviewSchema.safeParse({
      productId: VALID_ID,
      rating: 5,
      title: 'Great product',
      comment: 'This is a genuinely long enough review comment.',
      isVerifiedPurchase: true,
      userId: VALID_ID,
    });
    expect(result.success).toBe(false);
  });

  it('accepts a well-formed role change (the schema validates shape, not authority)', () => {
    const result = updateUserRoleSchema.safeParse({ userId: VALID_ID, role: 'ADMIN' });
    expect(result.success).toBe(true);
  });
});

describe('price and total manipulation', () => {
  it('gives a cart mutation nowhere to put a price', () => {
    for (const payload of [
      { productId: VALID_ID, quantity: 1, price: 1 },
      { productId: VALID_ID, quantity: 1, unitPrice: 1 },
      { productId: VALID_ID, quantity: 1, lineTotal: 1 },
      { productId: VALID_ID, quantity: 1, discountPrice: 0 },
    ]) {
      expect(addToCartSchema.safeParse(payload).success, JSON.stringify(payload)).toBe(false);
    }
  });

  it('accepts only a product id and quantity on a cart mutation', () => {
    const result = addToCartSchema.safeParse({ productId: VALID_ID, quantity: 2 });
    expect(result.success).toBe(true);
    expect(result.success && Object.keys(result.data).sort()).toEqual(['productId', 'quantity']);
  });

  it('rejects a checkout that supplies any monetary field', () => {
    const base = {
      addressId: VALID_ID,
      paymentMethod: 'CARD',
      idempotencyKey: 'abcdefghijklmnop',
    };

    for (const extra of [
      { total: 1 },
      { subtotal: 1 },
      { discount: 100000 },
      { tax: 0 },
      { shipping: 0 },
      { items: [{ productId: VALID_ID, price: 1 }] },
      { userId: VALID_ID },
      { paymentStatus: 'PAID' },
    ]) {
      const result = checkoutSchema.safeParse({ ...base, ...extra });
      expect(result.success, JSON.stringify(extra)).toBe(false);
    }
  });

  it('gives a payment intent request nowhere to state an amount', () => {
    expect(
      createPaymentIntentSchema.safeParse({ orderId: VALID_ID, amount: 1 }).success,
    ).toBe(false);
    expect(
      createPaymentIntentSchema.safeParse({ orderId: VALID_ID, paymentSuccessful: true }).success,
    ).toBe(false);
    expect(createPaymentIntentSchema.safeParse({ orderId: VALID_ID }).success).toBe(true);
  });

  it('converts rupees to integer paise with no floating point residue', () => {
    // 19.99 * 100 is 1998.9999999999998 in IEEE 754; naive truncation gives 1998.
    expect(rupeeAmountSchema.parse(19.99)).toBe(1999);
    expect(rupeeAmountSchema.parse(0.1)).toBe(10);
    expect(rupeeAmountSchema.parse(1299.5)).toBe(129950);
    expect(rupeeAmountSchema.parse('499')).toBe(49900);

    expect(rupeeAmountSchema.safeParse(-1).success).toBe(false);
    expect(rupeeAmountSchema.safeParse(1.005).success).toBe(false); // 3 decimals
    expect(rupeeAmountSchema.safeParse(Number.POSITIVE_INFINITY).success).toBe(false);
  });

  it('refuses a product whose discount is not below list price', () => {
    const base = {
      name: 'Test Product',
      description: 'A description long enough to satisfy the minimum length rule.',
      brand: 'Testco',
      category: 'electronics',
      price: 100,
      stock: 5,
      images: ['/products/a-1.svg'],
      thumbnail: '/products/a-1.svg',
    };

    expect(productCreateSchema.safeParse({ ...base, discountPrice: 120 }).success).toBe(false);
    expect(productCreateSchema.safeParse({ ...base, discountPrice: 100 }).success).toBe(false);
    expect(productCreateSchema.safeParse({ ...base, discountPrice: 80 }).success).toBe(true);
  });
});

describe('MongoDB operator injection', () => {
  it('rejects operator objects wherever an id is expected', () => {
    for (const payload of [
      { $ne: null },
      { $gt: '' },
      { $regex: '.*' },
      { $where: 'sleep(5000)' },
      ['507f1f77bcf86cd799439011'],
    ]) {
      expect(objectIdString.safeParse(payload).success, JSON.stringify(payload)).toBe(false);
    }
  });

  it('rejects operator objects in a cart mutation', () => {
    expect(
      updateCartItemSchema.safeParse({ productId: { $ne: null }, quantity: 1 }).success,
    ).toBe(false);
  });

  it('rejects an operator object where an email is expected', () => {
    expect(emailSchema.safeParse({ $ne: null }).success).toBe(false);
    expect(loginSchema.safeParse({ email: { $ne: null }, password: 'x' }).success).toBe(false);
  });

  it('never lets a user-supplied key reach the product filter', () => {
    const parsed = productSearchSchema.parse({
      q: 'laptop',
      category: 'computers',
      $where: 'this.price < 1',
      'payment.status': 'PAID',
      __proto__: { isAdmin: true },
    });

    const { filter } = buildProductQuery(parsed);
    const keys = JSON.stringify(filter);

    expect(keys).not.toContain('$where');
    expect(keys).not.toContain('payment.status');
    expect(keys).not.toContain('isAdmin');
    // And the non-negotiable public constraint is always present.
    expect(filter.isActive).toBe(true);
  });

  it('always constrains public queries to active products', () => {
    const parsed = productSearchSchema.parse({ isActive: 'false' });
    expect(buildProductQuery(parsed).filter.isActive).toBe(true);
  });
});

describe('prototype pollution', () => {
  it('drops __proto__ and constructor from query parameters', () => {
    const params = new URLSearchParams();
    params.set('__proto__', '{"polluted":true}');
    params.set('constructor', 'x');
    params.set('q', 'laptop');

    const normalised = normaliseSearchParams(params);

    expect(Object.keys(normalised)).toEqual(['q']);
    expect(({} as Record<string, unknown>).polluted).toBeUndefined();
  });

  it('builds a null-prototype object so there is no prototype to pollute', () => {
    const normalised = normaliseSearchParams(new URLSearchParams('q=x'));
    expect(Object.getPrototypeOf(normalised)).toBeNull();
  });
});

describe('resource exhaustion via pagination', () => {
  it('caps an absurd limit rather than honouring it', () => {
    expect(paginationSchema.parse({ page: 1, limit: 999_999_999 }).limit).toBe(60);
    expect(paginationSchema.parse({ page: 1, limit: '999999999' }).limit).toBe(60);
    expect(productSearchSchema.parse({ limit: '999999999' }).limit).toBe(60);
  });

  it('caps deep pagination, which makes MongoDB walk every skipped document', () => {
    expect(paginationSchema.parse({ page: 10_000_000, limit: 24 }).page).toBe(500);
  });

  it('falls back to defaults for unparseable junk rather than throwing a 500', () => {
    expect(productSearchSchema.parse({ page: 'abc', limit: 'xyz' })).toMatchObject({
      page: 1,
      limit: 24,
    });
    expect(paginationSchema.parse({ page: null, limit: {} })).toMatchObject({
      page: 1,
      limit: 24,
    });
  });

  it('clamps out-of-range numbers into bounds instead of erroring', () => {
    // Parseable but out of range: the user gets the nearest permitted value,
    // never an error page and never an unbounded query.
    expect(paginationSchema.parse({ page: -5, limit: 0 })).toMatchObject({ page: 1, limit: 1 });
    expect(paginationSchema.parse({ page: 1.9, limit: 24.7 })).toMatchObject({
      page: 1,
      limit: 24,
    });
  });

  it('bounds the brand $in list', () => {
    const brands = Array.from({ length: 50 }, (_, i) => `Brand${i}`);
    expect(productSearchSchema.parse({ brand: brands }).brand.length).toBeLessThanOrEqual(10);
  });

  it('caps the search query length', () => {
    expect(productSearchSchema.parse({ q: 'a'.repeat(5000) }).q).toBeUndefined();
    expect(searchSuggestSchema.safeParse({ q: 'a'.repeat(500) }).success).toBe(false);
  });
});

describe('sort allow-list', () => {
  it('falls back to the default for an unknown or hostile sort value', () => {
    for (const sort of ['price; DROP', '{"$where":"1"}', 'passwordHash', '../../etc/passwd']) {
      expect(productSearchSchema.parse({ sort }).sort).toBe('relevance');
    }
  });

  it('produces a fixed sort specification the user cannot name fields in', () => {
    const parsed = productSearchSchema.parse({ sort: 'price-asc' });
    const { sort } = buildProductQuery(parsed);
    expect(sort).toEqual({ price: 1, _id: 1 });
  });

  it('includes a stable tiebreaker on every sort, so pagination cannot repeat items', () => {
    for (const sort of ['relevance', 'newest', 'price-asc', 'price-desc', 'rating', 'discount']) {
      const parsed = productSearchSchema.parse({ sort });
      const spec = buildProductQuery(parsed).sort as Record<string, unknown>;
      expect(Object.keys(spec), sort).toContain('_id');
    }
  });
});

describe('regex denial of service', () => {
  it('escapes metacharacters in suggestion queries', () => {
    expect(escapeRegex('(a+)+$')).toBe('\\(a\\+\\)\\+\\$');
    expect(escapeRegex('.*')).toBe('\\.\\*');
    expect(escapeRegex('normal text')).toBe('normal text');
  });

  it('renders a catastrophic-backtracking pattern inert', () => {
    const evil = '(a+)+$';
    const pattern = new RegExp(`^${escapeRegex(evil)}`);

    const started = Date.now();
    // Against an unescaped pattern this input backtracks exponentially.
    pattern.test('a'.repeat(40));
    expect(Date.now() - started).toBeLessThan(100);
  });
});

describe('open redirect', () => {
  it('rejects absolute and protocol-relative targets', () => {
    for (const target of [
      'https://evil.example/login',
      '//evil.example',
      'http://evil.example',
      // The attack payload under test; asserting it is rejected is the point.
      // eslint-disable-next-line no-script-url
      'javascript:alert(1)',
      'data:text/html,<script>alert(1)</script>',
      '\\\\evil.example',
      '/\\evil.example',
      '/\t/evil.example',
      'evil.example',
    ]) {
      expect(safeRedirectPath(target), target).toBe('/');
      expect(isSafeRedirectPath(target), target).toBe(false);
    }
  });

  it('allows genuine in-app paths', () => {
    for (const target of ['/account', '/orders/507f1f77bcf86cd799439011', '/products?page=2']) {
      expect(safeRedirectPath(target), target).toBe(target);
    }
  });

  it('rejects CR/LF, which would be response splitting', () => {
    expect(safeRedirectPath('/account\r\nSet-Cookie: admin=1')).toBe('/');
    expect(redirectPathSchema.safeParse('/account\r\nX: 1').success).toBe(false);
  });
});

describe('text safety', () => {
  it('rejects control characters that enable log and header injection', () => {
    const schema = singleLineText(1, 100);
    expect(schema.safeParse('Normal Name').success).toBe(true);
    expect(schema.safeParse('Name\r\nInjected: true').success).toBe(false);
    expect(schema.safeParse('Name null').success).toBe(false);
  });

  it('rejects bidirectional overrides and zero-width characters used for spoofing', () => {
    const schema = singleLineText(1, 100);
    expect(schema.safeParse('Refund‮txt.exe').success).toBe(false);
    expect(schema.safeParse('Ad​min').success).toBe(false);
  });

  it('enforces length bounds so a field cannot be used to bloat a document', () => {
    const schema = singleLineText(2, 10);
    expect(schema.safeParse('a').success).toBe(false);
    expect(schema.safeParse('a'.repeat(11)).success).toBe(false);
    expect(schema.safeParse('  valid  ').success).toBe(true);
  });
});

describe('credentials', () => {
  it('normalises email so one address cannot become two accounts', () => {
    expect(emailSchema.parse('  Ramesh@Example.COM ')).toBe('ramesh@example.com');
  });

  it('rejects malformed addresses', () => {
    for (const email of ['notanemail', 'a@', '@b.com', 'a b@c.com', `${'a'.repeat(250)}@b.com`]) {
      expect(emailSchema.safeParse(email).success, email).toBe(false);
    }
  });

  it('enforces the password policy where a password is set', () => {
    expect(newPasswordSchema.safeParse('short1A').success).toBe(false); // too short
    expect(newPasswordSchema.safeParse('alllowercase1').success).toBe(false); // no uppercase
    expect(newPasswordSchema.safeParse('ALLUPPERCASE1').success).toBe(false); // no lowercase
    expect(newPasswordSchema.safeParse('NoDigitsHere').success).toBe(false); // no digit
    expect(newPasswordSchema.safeParse('ValidPass123').success).toBe(true);
  });

  it('does not apply the policy at login, so a legacy password is not leaked as invalid', () => {
    const result = loginSchema.safeParse({ email: 'a@b.com', password: 'old' });
    expect(result.success).toBe(true);
  });

  it('rejects a password containing the email local part', () => {
    const result = registerSchema.safeParse({
      name: 'Ramesh',
      email: 'rameshkumar@example.com',
      password: 'Rameshkumar1',
      confirmPassword: 'Rameshkumar1',
    });
    expect(result.success).toBe(false);
  });

  it('requires the confirmation to match', () => {
    expect(
      resetPasswordSchema.safeParse({
        token: 'a'.repeat(43),
        password: 'ValidPass123',
        confirmPassword: 'ValidPass124',
      }).success,
    ).toBe(false);
  });

  it('rejects a malformed reset token without touching the database', () => {
    for (const token of ['', 'short', '../../etc/passwd', '<script>', 'a'.repeat(500)]) {
      expect(
        resetPasswordSchema.safeParse({
          token,
          password: 'ValidPass123',
          confirmPassword: 'ValidPass123',
        }).success,
        token,
      ).toBe(false);
    }
  });
});

describe('image sources', () => {
  it('rejects remote image URLs, which would make the optimiser an SSRF proxy', () => {
    const base = {
      name: 'Test Product',
      description: 'A description long enough to satisfy the minimum length rule.',
      brand: 'Testco',
      category: 'electronics',
      price: 100,
      stock: 5,
    };

    for (const image of [
      'https://attacker.example/x.png',
      'http://169.254.169.254/latest/meta-data/',
      '//attacker.example/x.png',
      '/products/../../etc/passwd',
      'file:///etc/passwd',
      '/uploads/evil.svg',
    ]) {
      const result = productCreateSchema.safeParse({
        ...base,
        images: [image],
        thumbnail: image,
      });
      expect(result.success, image).toBe(false);
    }
  });

  it('accepts local product images', () => {
    const result = productCreateSchema.safeParse({
      name: 'Test Product',
      description: 'A description long enough to satisfy the minimum length rule.',
      brand: 'Testco',
      category: 'electronics',
      price: 100,
      stock: 5,
      images: ['/products/test-product-1.svg'],
      thumbnail: '/products/test-product-1.svg',
    });
    expect(result.success).toBe(true);
  });
});
