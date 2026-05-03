# Countryside Staples

NYC-based heritage clothing brand. Static storefront + lightweight admin backend.

## Stack

- **Storefront**: Static HTML/CSS/JS (no framework)
- **Admin**: Node.js, Express, SQLite, Stripe webhooks
- **Auth**: bcrypt password + Resend (email verification, password reset), cookie sessions

## Setup

```bash
cd admin
npm install
node seed.js admin@example.com yourpassword
npm start
```

Admin dashboard at `http://localhost:3000/admin.html`

## Environment Variables

```
# Stripe
STRIPE_SECRET_KEY=sk_...
STRIPE_WEBHOOK_SECRET=whsec_...
STRIPE_PUBLISHABLE_KEY=pk_...

# Sessions (REQUIRED in production)
SESSION_SECRET=<32+ random bytes>
NODE_ENV=production
BASE_URL=https://countrysidestaples.com

# Email — magic-link sign-in (Resend). Leave unset in dev: links are
# logged to the console and returned in the request-link JSON response.
RESEND_API_KEY=re_...
RESEND_FROM=Countryside Staples <hello@countrysidestaples.com>
```

## Auth

Two flows share one cookie session:

- **Admin** — seeded via `npm run seed`. Password sign-in only (`POST /api/login`).
- **Customer** — password signup with email verification:
  - `POST /api/account/signup` → row created with `email_verified=0`, verify email sent, returns `{ ok, pending_verification, devLink? }`. No session is set.
  - `GET /api/account/verify-email?token=…` → marks verified, sets session, redirects to `/account.html`.
  - `POST /api/account/resend-verification` → re-sends the verify email.
  - `POST /api/account/login` → 403 with `{ needs_verification: true }` if the account exists but isn't verified.
  - `POST /api/account/forgot-password` → sends reset link (1h TTL).
  - `POST /api/account/reset-password { token, password }` → sets new password, marks verified, signs in.

In dev (no `RESEND_API_KEY`), email is skipped: links print to stdout and the
endpoints return `{ devLink }` so you can click straight through. In
production the dev fallback is hard-disabled.
