# amazon — Architecture

A single Next.js 16 application that serves the UI **and** owns all business
logic and database access. There is no separate backend service.

- **Runtime:** Next.js 16.3.1 (App Router) · React 19.2 · TypeScript 5.9
- **Data:** MongoDB Atlas via the native `mongodb` 7.5 driver (no ODM)
- **Validation:** Zod 4.4 · **Styling:** Tailwind CSS 4.3 · **Package manager:** pnpm 10

---

## 1. System architecture

```
Browser
   │  HTTPS
   ▼
src/proxy.ts  ── network boundary (Next 16 renamed middleware → proxy)
   │            · mints per-request CSP nonce
   │            · rejects cross-origin state changes  (CSRF layer 1)
   │            · redirects anonymous users off protected paths (UX only)
   ▼
Next.js server
   ├── Server Components ....... render, read data directly
   ├── Client Components ....... interactivity only, never touch the DB
   ├── Server Actions .......... form mutations
   └── Route Handlers .......... JSON API, webhooks
             │
             ▼
   Guard layer   requireUser() / requireAdmin() / assertOwnership()
             ▼
   Validation    Zod schema.safeParse()  — every external input
             ▼
   Services      business rules, pricing, inventory  (src/services)
             ▼
   Repositories  typed collection access, allow-listed queries (src/lib/db)
             ▼
        MongoDB Atlas (TLS, least-privilege user, majority write concern)
```

**The rule that shapes everything:** the proxy is *not* an authorisation
boundary. The Next.js docs warn that a matcher change can silently drop proxy
coverage for a Server Function, so every page, action and route handler
re-derives the session and re-checks the role from the database. Deleting
`proxy.ts` should cost the app nice redirects, not its security.

---

## 2. Folder structure

```
src/
├── app/
│   ├── (shop)/          home, products, search, cart, checkout, orders
│   ├── auth/            login, register, forgot-password, reset-password
│   ├── account/         profile, addresses, security
│   ├── admin/           dashboard, products, categories, orders, users, audit-logs
│   └── api/             auth, products, cart, orders, reviews, payments, admin, security
├── actions/             Server Actions (one file per domain)
├── components/          brand, layout, product, cart, checkout, admin, ui
├── lib/
│   ├── auth/            session, password, guards, constants
│   ├── db/              client, collections, indexes
│   ├── security/        csp, csrf, origin, redirect, rate-limit, logger, audit
│   ├── validations/     Zod schemas (one file per domain)
│   ├── payments/        provider interface, mock, stripe
│   └── utils/           money, slug, format, cn
├── models/              document types + DTO mappers
├── services/            business logic (pricing, inventory, orders, search)
└── proxy.ts             network boundary
```

---

## 3. Database schema

Ten collections. Money is stored as **integer paise**, never floats — `₹1,299.50`
is `129950`. Floating-point rupees silently lose precision across a subtotal →
discount → tax → total chain, and a payment that disagrees with the provider by
one paisa is a reconciliation failure.

| Collection | Purpose | Key indexes |
|---|---|---|
| `users` | accounts, roles, addresses | `email` unique |
| `products` | catalogue | `slug` unique; `category`; `brand`; `price`; text index on name/brand/description |
| `categories` | taxonomy | `slug` unique |
| `carts` | server-owned carts | `userId` unique; `guestId` unique sparse |
| `orders` | placed orders | `userId + createdAt`; `orderNumber` unique |
| `reviews` | ratings | `productId + userId` unique (one review per purchase) |
| `sessions` | active sessions | `tokenHash` unique; `expiresAt` TTL |
| `passwordResetTokens` | reset flow | `tokenHash` unique; `expiresAt` TTL |
| `emailVerificationTokens` | verification | `tokenHash` unique; `expiresAt` TTL |
| `auditLogs` | security-sensitive actions | `createdAt`; `actorId`; `action` |
| `rateLimits` | distributed counters | `key` unique; `expiresAt` TTL |

TTL indexes mean expired sessions and spent tokens are removed by the database
itself, not by a cron job someone forgets to deploy.

---

## 4. Authentication architecture

**Opaque database-backed sessions, not JWTs.** A JWT cannot be revoked before
it expires; this app needs "change your password and every other device is
signed out" to actually work.

```
login → verify bcrypt hash (cost 12, constant-time compare)
      → generate 32 random bytes  → raw token
      → store SHA-256(token) in `sessions`   ← DB never holds the usable token
      → set raw token in HttpOnly cookie
```

The cookie is `__Host-nk_session` in production. The `__Host-` prefix is
browser-*enforced*: the cookie is rejected unless it is `Secure`, `Path=/`, and
carries no `Domain` — which blocks a compromised subdomain from overwriting our
session cookie (cookie tossing / session fixation). It requires `Secure`, so
development falls back to a plain name over http.

Sessions are invalidated on logout, password change, password reset, and
role change. Reset and verification tokens are single-use, hashed at rest, and
short-lived; "forgot password" always returns the same generic response so it
cannot be used to enumerate registered email addresses.

---

## 5. Authorization architecture

Two roles, `USER` and `ADMIN`, read **only** from the session's database record.
A `role` field arriving in a request body is ignored — it is not in any Zod
schema, and `.strict()` rejects the request outright.

Three guards, used at the top of every protected page, action and handler:

- `requireUser()` — authenticated, else 401 / redirect
- `requireAdmin()` — authenticated **and** `role === 'ADMIN'`, else 404
- `assertOwnership(resource)` — `resource.userId === session.userId || isAdmin`

Ownership failures return **404, not 403**. A 403 confirms the record exists,
which is itself a disclosure — it lets an attacker enumerate valid order ids.

---

## 6. Zod validation architecture

TypeScript checks at compile time; nothing enforces it at runtime. Every value
crossing the boundary — request bodies, `FormData`, search params, route params,
webhook payloads — goes through `schema.safeParse()`. There is no `as SomeType`
on untrusted input anywhere in the codebase.

Schemas are `.strict()`, so unexpected fields are a validation *error* rather
than being silently dropped. That is what stops `{ price: 1, role: "ADMIN" }`
from ever reaching business logic.

Query inputs (sort field, sort direction, filters, pagination) are `z.enum()`
allow-lists, never free strings interpolated into a query object. Pagination has
a hard `limit` ceiling.

---

## 7. Security architecture (defence in depth)

| Layer | Control |
|---|---|
| Transport | HTTPS; HSTS `max-age=2y; includeSubDomains; preload` |
| Headers | CSP (nonce + `strict-dynamic`), `X-Frame-Options`, `nosniff`, `Referrer-Policy`, `Permissions-Policy`, COOP/CORP |
| CSRF | Origin/Referer check in proxy **+** signed double-submit token |
| Rate limit | MongoDB-backed fixed window (distributed); per-IP and per-account |
| AuthN | bcrypt cost 12; hashed opaque session tokens |
| AuthZ | server-side RBAC + per-object ownership checks |
| Input | Zod `.strict()` on every boundary |
| Injection | typed queries, no user-supplied operators, `$where`/`$expr` never accepted |
| XSS | no `dangerouslySetInnerHTML` (ESLint-enforced), no HTML accepted from users |
| Money | server recomputes every total from the database |
| Inventory | atomic conditional `$inc` inside a transaction |
| Payments | provider webhooks with signature verification |
| Logging | structured JSON, secrets redacted at the sink |

**CSP trade-off, stated plainly.** The policy is `default-src 'none'` with a
per-request nonce and `'strict-dynamic'`. Because Next.js stamps the nonce
during server rendering, this forces every route to render dynamically — a
build-time prerender ships scripts with no nonce, and `strict-dynamic` then
blocks all of them. Measured on this codebase: a static `/` produced **0 of 11**
script tags with a nonce; with `force-dynamic`, **11 of 11**. Full-page static
optimisation and CDN HTML caching are given up; caching moves to the data layer.

One documented exception: `style-src-attr 'unsafe-inline'`. A nonce cannot apply
to an inline `style=""` *attribute*, and React and `next/image` both emit them.
Style attributes cannot execute script, so the residual risk is CSS-based UI
redressing, which `frame-ancestors 'none'` already addresses. `<style>`
*elements* remain nonce-gated.

---

## 8. Request lifecycle (checkout, the strictest path)

```
POST /checkout
 1. proxy: Origin header matches app origin?            no → 403
 2. handler: CSRF double-submit token valid?            no → 403
 3. rate limit: under the per-user checkout quota?       no → 429
 4. requireUser(): valid, unexpired session?            no → 401
 5. Zod: body parses against CheckoutSchema (.strict)?  no → 400
 6. load the user's cart *from the database* by session userId
 7. re-read every product: current price, current stock
 8. server computes subtotal → discount → shipping → tax → total
 9. payment intent created for the *server's* amount
10. payment confirmed by webhook signature, never by the browser
11. transaction: atomic stock decrement + order insert + cart clear
12. audit log written; safe DTO returned
```

Client-submitted prices and totals are not read at any step. They are not in the
schema, so they never arrive.

---

## 9. Payment architecture

A `PaymentProvider` interface with two implementations:

- **`mock`** (default) — a complete server-side gateway, no external account
  needed. Deterministic test cards exercise success, decline and error paths.
- **`stripe`** — Stripe REST + HMAC webhook signature verification.

Both obey the same rules: the browser never states an amount, the secret key
never leaves the server, and an order becomes `PAID` only when a
signature-verified webhook says so. `paymentSuccessful: true` from a browser is
not an input the server accepts.

---

## 10. Responsive design strategy

Mobile-first Tailwind. Base styles target 320px; `sm/md/lg/xl/2xl` progressively
enhance, plus two custom breakpoints — `xs` (400px) where a 2-up product grid
starts to strain, and `3xl` (1920px) to stop the layout stretching on large
monitors.

Layouts are designed per breakpoint, not scaled down:

| | Mobile | Tablet | Laptop | Desktop |
|---|---|---|---|---|
| Header | logo · search · cart · menu | + account, orders | full nav + location | full nav, wide search |
| Filters | bottom-sheet drawer | drawer | sidebar | sidebar |
| Product grid | 2 col | 3 col | 4 col | 5 col |

Touch targets are ≥44px. Zoom is never disabled (WCAG 1.4.4). Verified at 320,
375, 390, 414, 480, 768, 820, 1024, 1280, 1440, 1920 and 2560px.

---

## 11. Accessibility

Semantic landmarks, a skip link as the first tabbable element, visible
`:focus-visible` rings that are never removed, labelled form controls with
errors tied via `aria-describedby`, focus-trapped modals that restore focus on
close, and state never communicated by colour alone.

---

## 12. Development phases

| Phase | Scope | Status |
|---|---|---|
| 1 | Foundation: config, env, DB pool, security headers, CSP | ✅ built & verified |
| 2 | Models, indexes, seed data | |
| 3 | Zod validation layer | |
| 4 | Security foundation: password, session, CSRF, rate limit, RBAC, audit | |
| 5 | Authentication flows | |
| 6 | Catalogue: categories, products, search, filters | |
| 7 | Cart | |
| 8 | Checkout, payment, atomic inventory | |
| 9 | Orders & account | |
| 10 | Reviews | |
| 11 | Admin | |
| 12–13 | Responsive polish, OWASP hardening pass | |
| 14–15 | Tests, docs, production build | |

---

## Security posture

This application implements the controls listed above. That is not the same as
being secure — security is a property of the whole deployment and has to be
maintained. Nothing here is claimed to be unbreakable. Remaining production
responsibilities (TLS termination, Atlas network controls, secret rotation,
dependency patching, log monitoring, backups) are enumerated in `SECURITY.md`.
