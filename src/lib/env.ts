import { z } from 'zod';

import '@/lib/server-guard';

/**
 * Environment validation.
 *
 * Every process-level input is parsed through Zod exactly once, at first use.
 * A typo in `.env.local` becomes a loud startup error naming the variable,
 * instead of `undefined` quietly flowing into a security check.
 *
 * Validation is lazy (not top-level) so that `next build` can compile modules
 * that transitively import this file without a populated environment.
 */

const nonEmpty = z.string().trim().min(1);

const serverEnvSchema = z
  .object({
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),

    // --- Database ---
    MONGODB_URI: nonEmpty
      .refine(
        (value) => value.startsWith('mongodb://') || value.startsWith('mongodb+srv://'),
        'MONGODB_URI must be a mongodb:// or mongodb+srv:// connection string',
      )
      .refine(
        (value) => !value.includes('NEXT_PUBLIC'),
        'MONGODB_URI must never be exposed with a NEXT_PUBLIC_ prefix',
      ),
    MONGODB_DB: nonEmpty.max(64).regex(/^[A-Za-z0-9_-]+$/, 'MONGODB_DB must be alphanumeric'),

    // --- Auth ---
    // 32 chars is the floor for an HMAC key we are willing to ship.
    AUTH_SECRET: z.string().min(32, 'AUTH_SECRET must be at least 32 characters'),
    SESSION_MAX_AGE_SECONDS: z.coerce
      .number()
      .int()
      .min(300)
      .max(60 * 60 * 24 * 30)
      .default(60 * 60 * 24 * 7),

    // --- App ---
    NEXT_PUBLIC_APP_URL: z
      .url()
      .default('http://localhost:3000')
      .transform((value) => value.replace(/\/+$/, '')),

    // --- Payments ---
    PAYMENT_PROVIDER: z.enum(['mock', 'stripe']).default('mock'),
    PAYMENT_SECRET_KEY: z.string().default(''),
    NEXT_PUBLIC_PAYMENT_PUBLISHABLE_KEY: z.string().default(''),
    PAYMENT_WEBHOOK_SECRET: z.string().default(''),

    // --- Email ---
    EMAIL_TRANSPORT: z.enum(['console', 'smtp']).default('console'),
    EMAIL_FROM: z.email().default('no-reply@example.com'),
    SMTP_URL: z.string().default(''),

    // --- SMS (one-time passwords to mobile numbers) ---
    // `console` prints the message to the server log; a real gateway is wired
    // in `src/lib/sms/index.ts` when one is chosen for deployment.
    SMS_TRANSPORT: z.enum(['console']).default('console'),

    // --- Demo ---
    // Shows the one-time password on the verification page instead of relying
    // on it being delivered.
    //
    // Understand what this trades away before enabling it: anyone can type
    // somebody else's address, request a code, read it off the screen and sign
    // in as them. That is account takeover, and no amount of styling changes
    // it. It exists so a storefront with no mail provider can still be walked
    // end to end, and it must stay off anywhere real accounts live.
    //
    // Off unless set to exactly "true", so a typo fails closed.
    DEMO_SHOW_OTP: z.enum(['true', 'false']).default('false'),
  })
  .superRefine((env, ctx) => {
    if (env.PAYMENT_PROVIDER === 'stripe') {
      if (!env.PAYMENT_SECRET_KEY) {
        ctx.addIssue({
          code: 'custom',
          path: ['PAYMENT_SECRET_KEY'],
          message: 'PAYMENT_SECRET_KEY is required when PAYMENT_PROVIDER=stripe',
        });
      }
      if (!env.PAYMENT_WEBHOOK_SECRET) {
        ctx.addIssue({
          code: 'custom',
          path: ['PAYMENT_WEBHOOK_SECRET'],
          message: 'PAYMENT_WEBHOOK_SECRET is required when PAYMENT_PROVIDER=stripe',
        });
      }
    }

    if (env.EMAIL_TRANSPORT === 'smtp' && !env.SMTP_URL) {
      ctx.addIssue({
        code: 'custom',
        path: ['SMTP_URL'],
        message: 'SMTP_URL is required when EMAIL_TRANSPORT=smtp',
      });
    }

    // A real production deployment must be served over TLS: cookies are
    // `Secure`, the session cookie carries the `__Host-` prefix, and neither
    // works over plaintext.
    //
    // Loopback is exempt. `next start` sets NODE_ENV=production, so running a
    // production build locally to smoke-test it would otherwise be blocked --
    // and `http://localhost` cannot be a deployment, so nothing is weakened.
    // `http://shop.example.com` is still rejected.
    if (env.NODE_ENV === 'production') {
      const host = new URL(env.NEXT_PUBLIC_APP_URL).hostname;
      const isLoopback = host === 'localhost' || host === '127.0.0.1' || host === '::1';

      if (!env.NEXT_PUBLIC_APP_URL.startsWith('https://') && !isLoopback) {
        ctx.addIssue({
          code: 'custom',
          path: ['NEXT_PUBLIC_APP_URL'],
          message: 'NEXT_PUBLIC_APP_URL must use https:// in production',
        });
      }
    }
  });

export type ServerEnv = z.infer<typeof serverEnvSchema>;

let cached: ServerEnv | undefined;

export function env(): ServerEnv {
  if (cached) return cached;

  const parsed = serverEnvSchema.safeParse(process.env);

  if (!parsed.success) {
    // Print the variable names and the reason, never the values -- this error
    // can surface in logs and one of these values is a database password.
    const details = parsed.error.issues
      .map((issue) => `  - ${issue.path.join('.') || '(root)'}: ${issue.message}`)
      .join('\n');

    throw new Error(`Invalid environment configuration:\n${details}`);
  }

  cached = parsed.data;
  return cached;
}

export const isProduction = () => env().NODE_ENV === 'production';
export const isDevelopment = () => env().NODE_ENV === 'development';
export const isTest = () => env().NODE_ENV === 'test';
