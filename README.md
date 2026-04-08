# Countryside Staples

NYC-based heritage clothing brand. Static storefront + lightweight admin backend.

## Stack

- **Storefront**: Static HTML/CSS/JS (no framework)
- **Admin**: Node.js, Express, SQLite, Stripe webhooks
- **Auth**: bcrypt + cookie sessions

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
STRIPE_SECRET_KEY=sk_...
STRIPE_WEBHOOK_SECRET=whsec_...
```
