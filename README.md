# Taana — fashion e-commerce on Next.js and Supabase

A complete online clothing store for India: a customer storefront at `/` and a separate admin
dashboard at `/admin`, sharing one Supabase backend (Postgres, Auth, Storage). Payments go through
Razorpay (UPI, cards, netbanking, wallets) with optional Stripe for international cards, plus cash
on delivery. Everything the store sells, every order and every stock count lives in the database,
and every price, tax and discount is worked out on the server.

"Taana" (the warp threads on a loom) is a placeholder name with its own simple mark. The store
name, logo, colours, fonts, homepage, policies and emails are all set in **Admin › Settings**,
where [Appearance](#appearance) restyles the whole store with one-click themes.

One deployment can run **many stores**: each has its own catalog, customers, orders, look, staff,
payment account and web address, and the platform's administrators create them from
**Admin › All stores**. Taana is the first (home) store. See [Stores](#stores).

## Contents

- [What's included](#whats-included)
- [Architecture](#architecture)
- [Security model](#security-model)
- [Database](#database)
- [Run it locally](#run-it-locally)
- [Set up the first owner](#set-up-the-first-owner)
- [Stores](#stores)
- [Environment variables](#environment-variables)
- [Deploy](#deploy)
- [Payment providers](#payment-providers)
- [Courier (Shiprocket)](#courier-shiprocket)
- [WhatsApp updates](#whatsapp-updates)
- [Reminders](#reminders)
- [Mobile sign-in](#mobile-sign-in)
- [Appearance](#appearance)
- [Email](#email)
- [Testing](#testing)
- [Running the store](#running-the-store)
- [Known limitations](#known-limitations)
- [Project layout](#project-layout)

## What's included

**Storefront** (`/`)

- Homepage from the database: hero campaign, departments, new arrivals, best sellers, featured
  brands, seasonal and featured collections, promotional banners, recently viewed, newsletter.
- Shop, category, brand and collection pages with filters (brand, size, colour, price, in stock,
  on sale), sorting, pagination, canonical URLs and empty states. Search across title, brand,
  category, tags and SKU.
- Product pages: gallery with zoom and full-screen view, colour and size pickers with sold-out
  states, size guide, quantity, add to bag, buy now, PIN code delivery check with dates (and the
  courier's own estimate when Shiprocket is connected), "notify me" for sold-out sizes, details,
  fabric and care, shipping and returns, reviews (verified purchase badges), related products,
  structured data.
- Bag with server-side pricing, discount codes, free-delivery progress. Guest bags are merged into
  the account on sign-in.
- Checkout: contact → address (Indian states, PIN validation) → delivery options → payment
  (Razorpay: UPI, cards, netbanking, wallets; cash on delivery where allowed; Stripe optional) →
  review → confirmation. Orders can't be placed twice by double-clicking or refreshing. Shoppers
  can opt in to order updates on WhatsApp.
- Accounts: sign up with email verification, or with a mobile number and a one-time code (SMS
  through MSG91, or WhatsApp), sign in, password reset, optional Google, profile,
  address book, order history and tracking (courier status, expected date and scan history),
  wishlist (with optional price-drop emails), cancellation and return requests. Guests
  get a private link to their order, and can look it up by number and email.
- Policy pages, FAQ, contact form, maintenance page, sitemap and robots.
- Until a store has something on sale, its homepage says it is opening soon and takes email
  sign-ups for launch day.
- Eight designs, each built differently: its header and menu, home page layout, product cards,
  section titles, buttons, product photos and footer (Atelier, Nordic, Bazaar, Boutique,
  Heritage, Noir, Cinema, Neon), in 38 palettes, light and dark, and 26 fonts. New stores start
  with a look no other store has (see [Appearance](#appearance)).
- Movement, as the design chooses: sections that ease in as the shopper scrolls, pictures that
  drift slower than the page, a Spotlight whose picture stays pinned while each collection's
  words pass by and the background changes colour, and giant words sliding sideways. The
  opening banner can play a short silent film, and a product can be shown as a 360° view the
  shopper turns by dragging. Nothing moves for shoppers whose device asks for less motion, and
  films give way to the photo on slow or data-saving connections.
- An announcement bar whose messages take turns (or scroll past), an add-to-bag bar that stays in
  reach on phones, free-delivery progress in the bag, an optional WhatsApp "Chat with us" button,
  and each store's own icon in browser tabs.

**Admin** (`/admin`)

- Dashboard: revenue actually received (net of refunds), orders by state, customers, low stock,
  best sellers and a 30-day revenue chart, all from live data.
- Products: list with search, filters, status tabs, bulk actions (publish, draft, archive,
  feature, category, brand, prices, end sale, tags, collections, delete) and quick edit. Full editor
  with drafts, publishing and scheduled launches, image upload (drag and drop, resized in the
  browser, reorder, main image, alt text, per-colour images), pricing and sale prices, tax
  override, sizes × colours variant generator with unique SKUs and per-variant prices and stock,
  fabric/fit/care, weight and dimensions, returns, SEO with a search preview, preview on the store.
- CSV import and export: downloadable template, drag and drop the CSV with its images, a full
  check (dry run) with a row-by-row report before anything is saved, duplicate SKU detection,
  images matched by file name from the media library, batched saves with progress, and statuses
  applied only if every product imported — a partial import never publishes anything.
- Inventory with inline edits (set a count, or +/− units), low and out-of-stock views, units held
  by unpaid orders, and a full history of every stock movement.
- Brands, categories (tree), collections (hand-picked with drag ordering, or automated by rules
  with a live preview; seasonal and scheduled), size guides, media library with bulk uploads.
- Orders: views for awaiting payment / to fulfil / shipped / needs attention, search and filters,
  fulfilment steps with courier and tracking (customers are emailed), courier booking through
  Shiprocket (AWB, label, pickup; tracking moves the order to shipped, delivered or returned),
  parcels returned undelivered (stock goes back, unpaid COD orders close), cash-on-delivery
  safeguards (customer confirmation, limits per customer, block list), cancellations that return
  stock and refund, partial refunds through the payment provider, cash-on-delivery collection,
  internal notes, printable GST invoice and packing slip, CSV export, full timeline.
- Returns and cancellation requests, payments with reconciliation and the webhook log, discount
  codes, customers with lifetime spend and notes (CSV export), review moderation, contact inbox.
- Shipping zones and rates (by state or PIN prefix), blocked PIN codes, couriers with tracking
  links. Settings for store details, appearance, homepage, tax (GST slabs, GSTIN), payment methods
  and COD limits, returns, reviews, policies, FAQ, SEO, email templates, WhatsApp templates,
  customer sign-in with mobile numbers, maintenance mode and sample data removal. Staff and
  roles. Audit log.
- Stores (for the platform's administrators): create a store with its name, web address, owner
  and starting look, empty or with the sample catalog to try it out; add or remove web addresses;
  suspend and reopen it. A store switcher for anyone who works at more than one, and each store's
  own Razorpay account under **Settings › Payment accounts**.
- Appearance: a gallery of the designs (each drawn in its colours), palettes and fonts, parts
  mixed in from other designs (motion too), and **Preview on the store**, which shows an unsaved
  look on the real store to the admin alone. The home page's sections can be reordered or
  hidden, and its opening banner can play a video (uploaded, up to 50 MB, or a link).
- Setup: what's left before a store is ready (contact details, policies, its own products,
  sample data, payments, web address) and, for the platform's administrators, the server's setup
  and any database update the deployment is waiting for, ready to copy into Supabase's SQL editor
  from a computer or a phone.

## Architecture

```
 Browser ──► Next.js 15 (App Router) on Vercel
              ├─ Storefront pages   ─ cached reads with a cookie-free client (RLS: published only)
              ├─ Admin pages        ─ the staff member's own session (RLS + role checks)
              ├─ Server Actions     ─ validate with zod, check the role, call SQL functions
              ├─ /api/webhooks/*    ─ signature-checked, each event processed once
              └─ /api/cron/…        ─ bearer secret; holds, reconciliation, email queue
                     │
                     ▼
              Supabase
              ├─ Postgres  ─ tables, row-level security, 114 SQL functions (pricing, checkout,
              │              stock, payments, refunds, imports, reports), triggers, audit log
              ├─ Auth      ─ email + password with verification, optional Google
              ├─ Storage   ─ public "catalog" bucket; only staff can write
              └─ pg_cron   ─ releases stock held by expired unpaid orders every 5 minutes
                     │
   Razorpay / Stripe ◄┘ (server-to-server: create order, fetch, capture, refund)
   Resend           ◄── transactional emails from a database outbox
```

- **Rendering.** Catalog pages are rendered on the server and cached (tags `catalog`,
  `settings`, `reviews`), then refreshed the moment an admin saves. Account, cart, checkout and
  admin pages are dynamic.
- **Business logic lives in Postgres functions** so it is atomic and can't be bypassed:
  `quote_cart` (prices, coupons, shipping, GST), `place_order` (idempotent, reserves stock),
  `confirm_order_payment` (idempotent; handles duplicate, late and mismatched payments),
  `admin_save_product`, `admin_import_products`, `admin_set_stock`, `admin_set_fulfillment`,
  `begin_refund_internal`/`complete_refund`, `admin_dashboard`, and more.
- **Payments.** Checkout creates a Razorpay order for the amount the server calculated. After
  payment, the server checks Razorpay's signature, fetches the payment from Razorpay's API,
  captures it if needed and only then marks the order paid. Webhooks (signed, de-duplicated by
  event id) and a reconciliation job catch anything the browser didn't report. A payment that
  arrives for an expired, already paid or mismatched order is refunded automatically.
- **Stock.** Each variant has `stock_quantity` and `reserved_quantity`. An online order reserves
  stock with a conditional update (it can never go below zero, checked by constraints), payment
  turns the reservation into a sale, and expiry or cancellation releases it. Every change is
  written to `inventory_movements` by a trigger.
- **Emails** are queued in `email_outbox` inside the same transaction as the event, then sent by
  the server (`processOutbox`) through Resend, so a slow email service never breaks checkout.
- **Stores.** The storefront's store comes from the web address (`store_domains`; any other
  address is the home store), the admin panel's from its store switcher (`src/lib/store.ts`).
  Every database call carries the store's id in an `x-store-id` header, which `current_store_id()`
  reads in SQL. Cached catalog and settings reads are keyed by store.

## Security model

- **Roles live in `user_roles`, which no client can write.** Customers can only edit `full_name`,
  `phone` and `marketing_opt_in` on their profile (column-level grants); there is no role field to
  tamper with. Owners grant roles through `grant_role`, which checks the caller and protects the
  last owner. The first owner is created with `bootstrap_owner`, callable only by the service role
  and only while no owner exists.
- **Row-level security on every table.** Visitors see only active, published products; customers
  see only their own orders, addresses and wishlist; staff manage the catalog and orders; payments,
  refunds, settings, staff and the audit log are admin-only. Sensitive columns (reserved stock,
  derived prices, idempotency keys) are excluded by column grants.
- **Checks on the server, then again in the database.** Admin pages and actions call
  `requireRole`, and every SQL function starts with `require_staff()` or `require_admin()`.
  The middleware redirect is only a convenience.
- **Prices are never taken from the browser.** The cart stores variant ids and quantities; totals,
  discounts, shipping and tax are computed by `quote_cart` at every step and again inside
  `place_order`. Past orders keep snapshots of what was paid.
- **Payments:** signature verification, provider API confirmation, idempotent processing,
  duplicate-payment refunds, webhook replay protection, reconciliation. Secrets are only read in
  `src/lib/server-env.ts`, which can't be imported into browser code.
- **Guest access** to an order uses an HMAC-signed link; guest carts use a random token stored
  hashed in the database.
- **Stores can't reach each other's data.** The store header only chooses which store a call is
  for. Every row carries `store_id`; every row-level security policy is limited to the current
  store; roles are per store (a header naming another store gets its caller nothing there); a
  trigger refuses writes to any other store during a request, including from the service role
  and security-definer functions; composite foreign keys keep references inside a store (a bag
  only holds its own store's items); images live in a folder per store that only its staff can
  write. Each store's Razorpay keys are encrypted (AES-256-GCM) before they're saved, never sent
  back to the browser, and its webhook is verified with its own secret.
- **Mobile sign-in:** Supabase Auth makes and checks the codes, and only the store's Send SMS
  hook, which verifies Supabase's signature, can get one delivered. The hook sends only to Indian
  mobile numbers, at most 5 an hour and 10 a day per number, never to staff accounts, and not at
  all while Supabase lets numbers be registered unconfirmed. Profiles exist only for verified
  accounts.
- **Other:** rate limits on checkout, coupons, PIN checks, reviews and forms (stored in Postgres,
  shared across instances); storage policies that let only staff upload or delete; a CSP that
  forbids framing, HSTS and other security headers; `noindex` and `no-store` on the admin;
  CSV exports guarded against formula injection; links typed into settings limited to site paths
  and http(s) addresses (checked when saved and again when shown); exports and imports written to the audit log;
  audit triggers on products, variants, prices, orders, payments, refunds, coupons, settings,
  shipping and roles.

## Database

All schema changes are SQL migrations in `supabase/migrations/` (run in order):

| Migration | Contents |
|---|---|
| `…0100_foundation` | Types (`money_minor` = paise), enums, profiles, `user_roles` and role checks, `store_settings`, audit log and triggers, role management, rate limits |
| `…0200_catalog` | Size guides, brands, categories (tree), products, images, variants (unique SKUs), inventory movements, derived product fields, collections, policies |
| `…0300_commerce` | Addresses, carts, wishlists, coupons, shipping zones/rates/PIN rules/couriers, orders and items (snapshots), events, payments and webhook events, shipments, reviews, returns, refunds, customer notes, newsletter, contact messages, email outbox |
| `…0400_storefront_functions` | Search, facets, product page, related products, collection rules, PIN check, wishlist, reviews |
| `…0500_checkout` | Cart pricing (`quote_cart`), cart actions and merge, `place_order`, payment confirmation and failure, order expiry, cancellations, returns, order detail |
| `…0600_admin` | Product save/duplicate/delete, bulk edits, stock adjustments, fulfilment, cancellations, refunds, returns, dashboard, customers, staff, sample data removal |
| `…0700_storage_audit_cron` | Storage bucket and policies, audit triggers, the pg_cron schedule |
| `…0800_defaults` | Default "All India" shipping zone and Indian couriers |
| `…0900_notifications` | Email outbox claiming |
| `20261019000100_admin_catalog` | Admin product and inventory lists, media library, SKU checks, CSV import, collection previews |
| `20261020…` – `20261022…` | Shiprocket, WhatsApp, cash-on-delivery safeguards, reminders, mobile sign-in |
| `20261023000100_theme` | Brand colour and italic headings for Appearance |
| `20261024000100_multi_store` | Stores, web addresses, platform administrators, `store_id` on every table, per-store rules, roles, uniqueness, order numbers and functions |
| `20261024000200_store_lookup_and_secrets` | The store for a web address, each store's encrypted keys, platform administrator lists |
| `20261025000100_store_starter` | Starter policies, FAQ and email templates for new stores, the one-click sample catalog, `app_schema_version()` |
| `20261026000100_designs` | Each store's design and the parts it mixes in from others; font names checked by format, so adding a font needs no migration |
| `20261027000100_motion` | Banner films: the catalog bucket also takes MP4 and WebM, up to 50 MB; `products.spin` for the 360° view, returned with the product page |

Every migration from `20261025000100` on ends by replacing `app_schema_version()` with its own
version, so **Admin › Setup** can tell which updates a database is missing (older databases are
recognised by a column or function each update added). Keep that line when adding a migration.

Money is stored as integer paise everywhere (`bigint` with a non-negative check). Generated
TypeScript types are in `src/lib/database.types.ts` (`npm run db:types`).

`supabase/seed.sql` adds **sample data**: 45 fictional products from six made-up labels with
240 variants, categories, size guides, collections, discount codes (`WELCOME10`, `FLAT500`,
`FREESHIP`, `CRAFT15`), a metro shipping zone and homepage banners. Product photos are loaded from
Unsplash. Every sample row is flagged `is_sample` and labelled "Sample" in the admin; remove it
all from **Settings › Maintenance and data** before launch (sample products that appear in orders
are archived instead of deleted). `scripts/generate-seed.mjs` regenerates the file.

## Run it locally

Requires Node 20+ and Docker (for the local Supabase stack).

```bash
git clone https://github.com/gouthamgaro-commits/taana-store.git
cd taana-store
npm install
cp .env.example .env.local
npm run db:start          # starts Postgres, Auth, Storage locally (Docker)
npx supabase status       # copy API URL, anon key and service_role key into .env.local
npm run db:reset          # applies every migration and loads the sample data
npm run dev               # http://localhost:3000 and http://localhost:3000/admin
```

Fill in `.env.local` with the values from `supabase status`, plus `NEXT_PUBLIC_SITE_URL=http://localhost:3000`
and any long random `ORDER_LINK_SECRET` and `CRON_SECRET`. Sign-up confirmation emails appear in
the local inbox at http://localhost:54324.

To try payments without a Razorpay account, run the bundled mock and point the app at it:

```bash
node tests/e2e/support/mock-razorpay.mjs     # listens on :4010
# .env.local
NEXT_PUBLIC_RAZORPAY_KEY_ID=rzp_test_mock
RAZORPAY_KEY_SECRET=mock_secret
RAZORPAY_WEBHOOK_SECRET=mock_webhook_secret
RAZORPAY_API_BASE=http://localhost:4010
```

(The real Razorpay Checkout window can't pay a mock order; the end-to-end tests replace it with a
stub. For hands-on testing use your Razorpay test keys, see below.)

## Set up the first owner

There is no default admin account. Make the first owner from the command line:

1. Sign up on the store with the owner's email address and confirm the email.
2. With `NEXT_PUBLIC_SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` for that project in
   `.env.local` (or the environment), run:

   ```bash
   npm run make-owner -- owner@yourstore.in
   ```

   (Locally you can create and promote in one go:
   `npm run make-owner -- owner@example.com --create --password 'a long password'`.)

   Alternatively run `select public.bootstrap_owner('owner@yourstore.in');` in the Supabase SQL
   editor.
3. Sign in at `/admin/login`.

This works only while the store has no owner. After that, owners add people in **Admin › Staff
and roles** (they must have an account first). Roles: **owner** (everything, including staff),
**admin** (everything except staff: settings, payments and refunds, discounts, exports, audit
log), **staff** (catalog, stock, orders and fulfilment, returns without refunds, customers,
reviews, messages).

## Stores

One deployment runs any number of stores. Each has its own products, categories, collections,
discount codes, delivery zones, customers list, orders and order numbers (`TA100001`,
`KS100001`…), settings and look, staff and roles, Razorpay account and web addresses. Customer
accounts belong to the platform, so one login works at every store, but a store only sees the
people who signed up, signed in or ordered there.

**Platform administrators** create and run stores in **Admin › All stores**, and count as an
owner in every store. The store's existing owners became platform administrators when the
multi-store update ran; add others on the same page.

**A new store:**

1. **Admin › All stores › New store:** its name, the address customers will visit (a free
   `name.vercel.app`, or your own domain), the owner's email (they need an account; leave it
   empty to own it yourself) and a starting look: one no other store has (a design, palette and
   fonts), with **Shuffle** for another or a design of your choice. It starts with a delivery
   zone for all of India, Standard and Express rates, the usual couriers, sample policies, FAQ
   and email templates to edit, and, if you tick **Start with the sample catalog**, a copy of the
   sample products, brands, collections and discount codes (also on the store's page later, while
   it has no products). Until something is on sale, its homepage says it is opening soon.
2. **Vercel › your project › Settings › Domains:** add the same address. With `VERCEL_API_TOKEN`
   and `VERCEL_PROJECT_ID` set, the app adds it for you. A `.vercel.app` name works straight away;
   your own domain also needs its DNS pointed at Vercel.
3. **Supabase › Authentication › URL Configuration › Redirect URLs:** add `https://ADDRESS/**`,
   so sign-up, password-reset and Google sign-in come back to that store. (Without it, those
   links finish on the home store's address.)
4. The owner adds products from the store's admin (the store switcher at the top of the admin
   sidebar, or **Open its admin** on the store's page) and, to take online payments, saves the
   store's Razorpay keys in **Settings › Payment accounts** and adds the webhook shown there.
   Cash on delivery works straight away.

**Admin › Setup** (in each store's admin) lists what's still to do before that store is ready
for customers, with a link to each step.

**What the home store keeps for now.** Stripe, Shiprocket, WhatsApp messages and mobile-number
sign-in use the platform's own accounts (environment variables), so only the home store offers
them; their settings are hidden in other stores. Emails to every store's customers go out from
the address in `EMAIL_FROM`, with the store's name as the sender and its contact email as the
reply-to.

**Suspending** a store (on its page in All stores) closes its storefront and stops new orders;
nothing is deleted and its staff can still sign in.

Locally, stores can use addresses like `brand.localhost:3000` (browsers send any
`*.localhost` name to your own computer).

## Environment variables

See `.env.example` for comments. Check a deployment at `https://YOUR-SITE/api/health`: it reports
which settings are present (yes/no only) and whether the database answers.

| Variable | Required | Where it's used |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Yes | Browser and server; RLS limits the anon key |
| `SUPABASE_SERVICE_ROLE_KEY` | Yes | Server only: checkout, payments, webhooks, cron |
| `NEXT_PUBLIC_SITE_URL` | Yes | Canonical URLs, sitemap, emails, auth redirects |
| `ORDER_LINK_SECRET` | Yes | Signs guest order links and guest cart cookies |
| `NEXT_PUBLIC_RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET` | For online payments | Razorpay Checkout and API |
| `RAZORPAY_WEBHOOK_SECRET` | For online payments | Verifies `/api/webhooks/razorpay` |
| `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET` | Optional | Stripe Checkout and `/api/webhooks/stripe` |
| `RESEND_API_KEY`, `EMAIL_FROM` | Optional | Order emails (otherwise queued, not sent) |
| `SHIPROCKET_EMAIL`, `SHIPROCKET_PASSWORD` | Optional | Courier bookings through Shiprocket's API |
| `SHIPROCKET_WEBHOOK_TOKEN` | With Shiprocket | Verifies `/api/webhooks/courier` |
| `WHATSAPP_TOKEN`, `WHATSAPP_PHONE_NUMBER_ID` | Optional | WhatsApp order updates (Cloud API); `WHATSAPP_API_VERSION` defaults to `v23.0` |
| `SUPABASE_SMS_HOOK_SECRET` | For mobile sign-in | Verifies Supabase's calls to `/api/auth/sms` (the Send SMS hook) |
| `MSG91_AUTH_KEY`, `MSG91_TEMPLATE_ID` | For codes by SMS | Sends sign-in codes through MSG91 with your DLT-approved template |
| `CRON_SECRET` | Recommended | Authorises `/api/cron/housekeeping` |
| `STORE_SECRETS_KEY` | For stores' own Razorpay keys | 32 random bytes, base64 (`openssl rand -base64 32`); encrypts the keys stores save in Settings › Payment accounts. Changing it makes saved keys unreadable (stores save them again) |
| `VERCEL_API_TOKEN`, `VERCEL_PROJECT_ID`, `VERCEL_TEAM_ID` | Optional | Adds stores' web addresses to the Vercel project automatically (a token from Vercel › Account Settings › Tokens) |
| `NEXT_PUBLIC_GOOGLE_SIGN_IN` | Optional | Shows "Continue with Google" (`1`) |
| `RAZORPAY_API_BASE`, `STRIPE_API_BASE`, `RESEND_API_BASE`, `SHIPROCKET_API_BASE`, `WHATSAPP_API_BASE`, `MSG91_API_BASE` | Tests only | Point at local mocks (ignored with live payment keys; Shiprocket, WhatsApp and MSG91 only accept localhost) |

## Deploy

**1. Supabase project.** Create a project at supabase.com (region: Mumbai, `ap-south-1`) and
keep its database password. Then load the database, either in the browser or with the CLI:

- **In the browser (nothing to install):** `npm run db:bundle` writes two files to
  `supabase/setup/`. In Supabase open **SQL Editor › New query**, paste all of `1-database.sql`
  and click **Run** (every migration, as one transaction, recorded so the CLI knows they're
  applied); then do the same with `2-sample-data.sql` for the sample catalog. Later updates:
  `npm run db:bundle -- --since <last version you applied>` writes just the new migrations.
- **With the Supabase CLI:**

  ```bash
  npx supabase login
  npx supabase link --project-ref YOUR_PROJECT_REF
  npx supabase db push                     # applies supabase/migrations
  # optional, to start with the sample catalog:
  psql "postgresql://postgres:YOUR_DB_PASSWORD@db.YOUR_PROJECT_REF.supabase.co:5432/postgres" -f supabase/seed.sql
  ```

- **Database › Extensions:** enable `pg_cron` before pushing (the migration schedules the stock
  release job when it's available; otherwise rely on the Vercel cron below).
- **Authentication › URL configuration:** Site URL = your store URL; redirect URLs =
  `https://YOUR-SITE/**`, plus `https://ADDRESS/**` for each other store's address.
- **Authentication › Email templates:** copy the four templates from `supabase/templates/` (they
  link to `/auth/confirm` on the address the shopper used, so verification and password reset
  work across devices and come back to the right store).
- **Authentication › SMTP:** set up your own SMTP sender (Supabase's built-in sender is rate
  limited and meant for testing). Resend works here too.
- **Google sign-in (optional):** add the provider with your Google OAuth client, then set
  `NEXT_PUBLIC_GOOGLE_SIGN_IN=1`.

**2. Vercel.** In Vercel choose **Add New › Project** and import this repository (framework
preset Next.js; the build settings need no changes). In **Settings › Functions**, set the region
next to your Supabase project (Mumbai `bom1` for `ap-south-1`, Singapore `sin1` for
`ap-southeast-1`): every page talks to the database several times. Add the environment variables above for
Production and Preview, then deploy. Every push to `main` updates the live store and every other
branch gets its own preview URL. `vercel.json` schedules `/api/cron/housekeeping` daily (Hobby plan
limit); stock holds are also released every 5 minutes by pg_cron, and emails are sent as events
happen.

**3. After the first deploy:** open `/api/health`, create the owner (above; or in Supabase,
**Authentication › Users › Add user** with "Auto Confirm User", then run
`select public.bootstrap_owner('you@example.com');` in the SQL editor), add the Razorpay
webhook, and work through **Admin › Setup** and **Admin › Settings** (store details, tax and
GSTIN, shipping, policies, emails). Delete the sample data before launch.

**URLs:** storefront `https://YOUR-SITE/`, admin `https://YOUR-SITE/admin` (sign in at
`/admin/login`).

**Updating a live store.** Deploy the code, then open **Admin › Setup** signed in as a platform
administrator (before the multi-store update: the store's owner). When the database is behind, it
lists the updates waiting: **Copy the update** (or download it), open Supabase's SQL editor from
the link next to it, paste into a new query and click **Run** (a phone can do it, though a
computer is easier for a long update). The new code keeps the store running on the old database
until then, and the old code runs on the updated one, so either order is safe. From a computer,
`npm run db:bundle -- --since <the last migration you applied>` writes the same file
(`supabase/setup/update-after-….sql`). For the multi-store version, also set `STORE_SECRETS_KEY`
and replace the four email templates.

## Payment providers

**Razorpay (India).**

1. Create an account at razorpay.com and complete KYC for live payments. Test keys work at once.
2. **Account & Settings › API keys:** generate keys → `NEXT_PUBLIC_RAZORPAY_KEY_ID` and
   `RAZORPAY_KEY_SECRET` (`rzp_test_…` for testing, `rzp_live_…` for real money).
3. **Webhooks:** add `https://YOUR-SITE/api/webhooks/razorpay` with a strong secret
   (`RAZORPAY_WEBHOOK_SECRET`) and the events `payment.authorized`, `payment.captured`,
   `payment.failed`, `order.paid`, `refund.processed`, `refund.failed`.
4. **Payment methods:** UPI, cards, netbanking and wallets are offered by Razorpay Checkout;
   enable or disable them in the Razorpay dashboard. Payments are captured by the server after
   verification, so automatic capture can be on or off.
5. Test with Razorpay's test cards or UPI id `success@razorpay` / `failure@razorpay`, then check
   the order in **Admin › Orders** and **Admin › Payments**.

Refunds started in the admin are sent through Razorpay's refund API and confirmed by webhook.

**Each store's own Razorpay account.** In any store, an owner can save its keys in
**Settings › Payment accounts** (encrypted with `STORE_SECRETS_KEY`; only their last four
characters are shown again) and add the webhook URL shown there
(`https://YOUR-SITE/api/webhooks/razorpay?store=<the store's id>`) with the same events. Payments,
refunds and webhooks for that store then go to its own account. The home store uses the
environment keys above until it saves its own.

**Cash on delivery** needs no setup: turn it on or off and set the fee and order limits in
**Settings › Checkout and tax**; zones, rates and PIN codes can exclude it. Record the cash from
the order page when the courier remits it.

Cash orders that are never paid for (fake orders, parcels refused at the door) cost delivery
both ways, so the same settings add safeguards. A customer is recognised by their account, email
or phone number (any format of the same number):

- **Confirmation (off by default).** The order page, the confirmation email and (with a
  `cod_confirm` template) WhatsApp ask the customer to confirm. Nothing can be packed, shipped or
  booked with a courier until they do, or until staff press **Confirmed with customer** after a
  call. Orders not confirmed within the hours you set are cancelled and their stock goes back.
  **Orders › COD to confirm** lists the ones waiting.
- **Open orders limit (3 by default).** A customer with that many cash orders still waiting to
  ship is asked to pay online for the next one.
- **Returned parcels (2 by default).** After that many cash parcels came back undelivered, the
  customer can only pay online.
- **Block list.** On any order, **Block cash on delivery** blocks that customer's email and phone
  (they can still pay online); the customer card shows their open and returned cash orders.

Checkout shows the reason in place of the cash option, and never charges the COD fee then.

**Stripe (optional, international cards).** Set `STRIPE_SECRET_KEY`, add a webhook at
`https://YOUR-SITE/api/webhooks/stripe` (events `checkout.session.completed`,
`checkout.session.async_payment_succeeded`, `checkout.session.async_payment_failed`,
`refund.updated`, `charge.refund.updated`) with `STRIPE_WEBHOOK_SECRET`, then enable Stripe in
Settings.

## Courier (Shiprocket)

Optional. Without it, staff ship with any courier and type in the tracking number. With it,
staff book the courier from the order page and tracking updates arrive on their own.

1. In Shiprocket, add your warehouse under **Settings › Pickup addresses** and note its name
   (for example `Primary`) and PIN code. Keep some balance in the Shiprocket wallet; bookings are
   charged to it.
2. **Settings › API › Configure › Create an API user** (an email address different from your
   login). Set `SHIPROCKET_EMAIL` and `SHIPROCKET_PASSWORD` to that user's details.
3. **Settings › API › Webhooks:** URL `https://YOUR-SITE/api/webhooks/courier`, and a long random
   token that you also set as `SHIPROCKET_WEBHOOK_TOKEN`. (Shiprocket rejects webhook URLs that
   contain "shiprocket", "sr" or "kr", hence the neutral path.)
4. In **Admin › Shipping › Courier connection**, turn Shiprocket on, enter the pickup address name
   and PIN code, choose the default courier (Shiprocket's pick, cheapest or fastest) and the
   default parcel size, then **Test connection**.

On an order, **Book courier…** lists the couriers that serve the PIN code with Shiprocket's price
and delivery time, then creates the shipment, assigns the AWB and schedules the pickup (each step
is saved as it succeeds, so a retry never books twice). **Shipping label** opens the label PDF.
Cash-on-delivery orders are booked as COD for the order total. Tracking updates move the order
to shipped (the customer is emailed the tracking link), delivered, or returned to origin, and
flag failed delivery attempts under **Needs attention**; **Refresh tracking** pulls the latest
status if a webhook was missed. Customers see the courier status, expected date and scans on
their order page. Customers still pay the delivery rates you set in the shipping zones.

A parcel that comes back undelivered (from tracking, or **Mark returned to origin** on any shipped
order) puts its stock back; an unpaid cash-on-delivery order is cancelled and a paid one is
flagged for a refund.

## WhatsApp updates

Optional. Customers who tick "Send my order updates on WhatsApp" at checkout (or turn it on from
their order page) get the same updates as their emails: confirmed, shipped with tracking,
delivered, cancelled, refunded and return updates. They can turn them off on the order page.

1. Set up the **WhatsApp Business Platform** in Meta Business Suite (a Business portfolio, a
   WhatsApp Business account and a phone number that isn't on the WhatsApp app). Meta charges per
   delivered template message; see their pricing for India.
2. Create a **system user** with a permanent access token that has `whatsapp_business_messaging`
   permission, and note the sending number's **phone number ID**. Set `WHATSAPP_TOKEN` and
   `WHATSAPP_PHONE_NUMBER_ID`.
3. Messages a business starts must use templates WhatsApp approved. In **WhatsApp Manager ›
   Message templates**, create one per update you want (category *Utility*). **Admin › Settings ›
   WhatsApp** lists, for each update, the values it sends in order (`{{1}}` first name,
   `{{2}}` order number, and so on) with suggested text to copy.
4. Enter the approved template names (and language, usually `en`) in **Settings › WhatsApp**,
   turn it on, and use **Send WhatsApp test** (Meta's ready-made `hello_world` template) to check
   the connection.

Messages are queued with the emails and sent by the same job (after each action, from webhooks
and from the scheduled job), with retries; each order's page in the admin lists what was sent.
Replies from customers go to your WhatsApp inbox (for example the WhatsApp Business app or
Meta Business Suite); the store doesn't read them.

## Reminders

Three kinds, set in **Admin › Settings › Emails › Reminders** (their text is editable below them):

- **Back in stock (on by default).** Product pages offer "Notify me" for sold-out sizes. When the
  size comes back (a restock, a cancellation, a return, or an unpaid order releasing it), everyone
  waiting gets one email. The Reminders card shows how many requests are waiting.
- **Bag left behind (off by default).** One email to signed-in customers, or to guests who
  reached checkout and entered their email, when the bag has sat untouched for the hours you
  choose (and at most a week). Its "Return to your bag" link adds the items to the bag on any
  device, as far as stock allows. Checkout tells guests that a reminder may follow.
- **Wishlist price drops (on by default, customers opt in).** Customers switch them on on their
  wishlist page; they get at most one email every three days listing saved products that are now
  at least 5% cheaper.

Bag and price emails carry an unsubscribe link and the one-click `List-Unsubscribe` header; an
address that unsubscribes gets no more reminders (order emails and back-in-stock requests it made
still arrive). The database queues reminders every five minutes (pg_cron); they are sent whenever
the outbox runs: after any order action, from webhooks, and from `/api/cron/housekeeping`. On
Vercel's Hobby plan that cron runs daily, so for timely bag reminders call it every 15 to 30
minutes from any scheduler (or use a paid Vercel plan).

## Mobile sign-in

Optional. Shoppers can sign in, or create an account, with their mobile number and a 6-digit
code instead of a password ("Continue with mobile number" on the sign-in and sign-up pages); a new
account is asked for a name once, and a bag they filled as a guest comes with them. Customers with
an email account can add their number under **My account › Signing in** and then use either;
mobile-only accounts can add an email there (confirmed by a link) to get order emails at it and to
set a password. Staff always sign in with email and password.

Supabase Auth creates and checks the codes and hands each one to the store's **Send SMS hook**
(`/api/auth/sms`), which sends it by SMS through **MSG91**, or on **WhatsApp**. India's SMS rules
(DLT) require a registered sender ID and message template before any SMS is delivered, so allow
a few days for step 2.

1. **Send SMS hook.** In Supabase, **Authentication › Hooks › Add hook › Send SMS hook**: type
   **HTTPS**, URL `https://YOUR-SITE/api/auth/sms`, then **Generate secret**. Put the secret (it
   starts `v1,whsec_`) in `SUPABASE_SMS_HOOK_SECRET` on Vercel and redeploy. The URL must be
   reachable without Vercel's deployment protection, as your production domain is.
2. **MSG91 (SMS).** Create an MSG91 account and complete DLT registration (MSG91's dashboard
   guides you): your business as the principal entity, a 6-letter sender ID, MSG91 declared as
   your telemarketer, and a content template in the *Service Implicit* category, for example
   `Your Taana sign-in code is {#var#}. It is valid for 5 minutes. Do not share it with anyone.`
   Add the approved template in MSG91 with the code written `##otp##` (the variable must be named
   `otp`) and its DLT template ID, then set `MSG91_TEMPLATE_ID` to MSG91's template ID and
   `MSG91_AUTH_KEY` to an auth key from MSG91's API settings (leave the key's IP whitelist off:
   Vercel's addresses change). Optional: a last line `@your-domain.com #<the code>` lets Android
   Chrome fill the code in by itself.
   **Or WhatsApp:** with WhatsApp connected (see [WhatsApp updates](#whatsapp-updates)), create a
   template in the *Authentication* category with a **Copy code** button and a 5-minute expiry
   note. Codes then go on WhatsApp only, so customers need WhatsApp on that number.
3. **Phone provider.** In Supabase, **Authentication › Sign In / Providers › Phone**: turn the
   provider on and keep **Confirm phone** (phone confirmations) on; set the code length to 6 and
   the SMS OTP expiry to 300 seconds. The hook sends every code, so no SMS provider credentials
   are used. Under **Authentication › Rate Limits**, raise *SMS sent per hour* from 30 to what
   your busiest hour needs.
4. **Turn it on.** **Admin › Settings › Customer sign-in** shows each step as done or not, chooses
   SMS or WhatsApp, sends a test code, and turns "Continue with mobile number" on.

Safeguards: codes go only to Indian mobile numbers; at most 5 an hour and 10 a day per number
(Supabase also spaces codes to one number a minute apart, and limits requests per IP address);
never to staff accounts, without saying why; and none while the store's switch is off or while
Supabase's **Confirm phone** is off (without it, anyone could register someone else's number with
a password, and its owner would later be signed in to that account). Accounts appear under
**Customers** once their email or number is verified, so mistyped numbers and abandoned codes
leave no trace.

Locally, `supabase/config.toml` turns phone sign-in on and points the hook at
`http://host.docker.internal:3000/api/auth/sms` with a development secret (the app refuses that
secret when it talks to a hosted Supabase). With the MSG91 mock (`node
tests/e2e/support/mock-msg91.mjs`, port 4014) and the settings under [Testing](#testing), codes
can be read at `http://localhost:4014/__test/messages`.

## Appearance

**Admin › Settings › Appearance** sets how the whole storefront looks and is laid out:

- **Design:** how the store is built. Each of the eight has its own header and menu, home page
  (banner, departments and the order of sections), product cards, section titles, buttons,
  product photos, shop filters and footer, and suits its own colours and fonts:

  | Design | Manner |
  |---|---|
  | Atelier | Editorial and calm: a centred name, a large menu with pictures, big photographs and serif headlines (Taana's look) |
  | Nordic | Minimal: a slim header that tucks away on scroll, full-width photographs, numbered departments, filters behind a button |
  | Bazaar | Bold: a scrolling announcement, a search bar and category chips, chunky capitals, outlined cards with stickers |
  | Boutique | Soft: rounded shapes, round category bubbles, pastel colours, a rounded banner with a card |
  | Heritage | Traditional: arched frames, ornaments, jewel tones and classical capitals, the store's story on the home page |
  | Noir | Dark: a see-through header over a full-screen photograph, a full-screen menu, cards with words on the photo |
  | Cinema | Cinematic and calm: a floating header over a full-screen film or photograph, big serif lines, a pinned Spotlight, departments as full-width scenes, tall gallery cards |
  | Neon | Electric: a glass header with its own shop button, a glowing product in front of giant words, colours that change as you scroll, glowing cards on dark backgrounds |

- **Colours:** 38 palettes, four to six made for each design (any works with any), or your own
  four colours: text; buttons and bands; accent; background (light or dark). Everything else
  the store paints with (panels, borders, secondary text, the words on buttons, sale and error
  colours, form fields) is derived from those four in `src/lib/theme.ts`, keeping every pairing
  readable to WCAG AA on light and dark backgrounds; the form warns about combinations that
  would be hard to read.
- **Typography:** 16 heading fonts (serif and sans serif) and 10 for body text, and italic
  headings where the font has a true italic.
- **Mix and match:** take the header, main banner, product cards, corners, buttons or motion
  from another design.
- **Motion:** still; sections easing in as the shopper scrolls; or cinematic, which adds
  pictures drifting slower than the page and giant words sliding sideways
  (`src/components/store/Motion.tsx`). Atelier is still; Noir, Cinema and Neon are cinematic;
  the others ease in. Nothing moves for shoppers whose device asks for less motion, and the page
  is complete without it.
- **Surprise me** picks a design, palette and fonts no other store on the platform has.
- **Preview on the store** opens the store in the unsaved look, in a new tab, for two hours. The
  link is signed by the server and works only for that store; customers keep seeing the saved
  look, and **End preview** goes back to it. Previews work before the database update too.

**Settings › Homepage › Sections** reorders or hides the home page's sections (the design's
order until you change it), including the **Spotlight** (featured collections, or else
departments, one at a time with a pinned picture) and the **Statement** (the second banner's
heading in giant letters behind its picture). The first banner can play a **video**: upload an
MP4 or WebM (up to 50 MB; 10 to 20 seconds at 1080p is plenty) or paste a link. It plays muted
on a loop, with a pause button; the banner's picture shows until it can play, and instead of it
for shoppers who ask for less motion or are on a slow or data-saving connection. Several
announcement messages, separated by `|`, take turns.
**Settings › Store details** turns on the WhatsApp "Chat with us" button. Each store's icon (its
initials in its colours) is drawn by `/store-icon.svg`.

New stores get a fresh look when they're created: the design fewest stores use that still has
a palette no store uses, then such a palette and an unused heading font (`freshLook` in
`src/lib/designs.ts`), so the first 38 stores all look different.

**360° view:** upload eight or more photos taken all the way round a piece, in order, and tick
**Show as a 360° view** under the product's images. Its page then opens on a picture the shopper
turns by dragging (or with the arrow keys), turning once by itself to show it can; **Photos**
switches to the usual gallery. With fewer photos it shows the gallery.

Saving a design needs `20261026000100_designs.sql`, and uploading videos and the 360° view need
`20261027000100_motion.sql` (Admin › Setup offers them with the other updates). Until then the
store keeps its current look, a video link works but uploads don't, and the admin says what's
needed where it matters.

## Email

Orders, shipping, delivery, cancellations, refunds and return updates send emails from editable
templates (**Settings › Emails**). Create a Resend account, verify your sending domain, then set
`RESEND_API_KEY` and `EMAIL_FROM`. Until then, emails are recorded in the database as skipped.
Account emails (verification, password reset) are sent by Supabase Auth with the templates in
`supabase/templates/`.

## Testing

```bash
npm run typecheck          # TypeScript
npm test                   # unit tests (src/**/*.test.ts)
npm run test:integration   # database tests against the local Supabase
npm run test:e2e           # Playwright tests (local Supabase + Razorpay, Shiprocket, WhatsApp, Resend and MSG91 mocks)
```

The integration and end-to-end tests need the local stack (`npm run db:start`) and `.env.local`
pointing at it with the mock payment settings shown above, plus the courier mock:
`SHIPROCKET_EMAIL=api@shiprocket.test`, `SHIPROCKET_PASSWORD=mock-password`,
`SHIPROCKET_WEBHOOK_TOKEN=` any value and `SHIPROCKET_API_BASE=http://localhost:4011`, and the
WhatsApp mock: `WHATSAPP_TOKEN=mock_whatsapp_token`, `WHATSAPP_PHONE_NUMBER_ID=1234567890`,
`WHATSAPP_API_BASE=http://localhost:4012`, and the email mock: `RESEND_API_KEY=re_mock_key`,
`EMAIL_FROM="Taana <orders@taana.test>"`, `RESEND_API_BASE=http://localhost:4013`, and for mobile
sign-in: `SUPABASE_SMS_HOOK_SECRET` set to the development secret in `supabase/config.toml`,
`MSG91_AUTH_KEY=mock_msg91_key`, `MSG91_TEMPLATE_ID=mock_login_template`,
`MSG91_API_BASE=http://localhost:4014`. Playwright starts the mocks itself. The end-to-end setup creates test accounts with an owner role, so it
refuses to run against any non-local database.

**Integration tests (33)** cover access control for anonymous users, customers, staff, admins and
owners; 20 simultaneous checkouts for 5 units of stock (exactly 5 succeed); concurrent cash on
delivery orders; idempotent order placement; coupon usage limits under concurrency; failed,
expired, late, duplicate and mismatched payments; returns and restocking; refund limits.

**Courier tests (9 database, 2 Playwright)** cover who may record bookings and post tracking,
tracking that moves orders to shipped and delivered with one email each (duplicates and late,
out-of-order scans change nothing), failed deliveries flagged for staff, parcels returned
undelivered (COD orders cancelled and restocked, paid ones flagged for a refund), and the full
admin flow against the Shiprocket mock: turning it on, booking, label, webhook token checks,
the customer's tracking view and "Refresh tracking".

**Cash-on-delivery tests (9 database, 1 Playwright)** cover the open-orders limit (also across a
second email with the same phone, written differently), the quote without the COD fee, returned
parcels, blocking and unblocking (staff only), confirmation holding packing until the customer or
staff confirm, cancellation and restocking when time runs out, the WhatsApp confirmation request,
and the browser flow: a shopper confirms from their order page, then staff block the customer and
the next checkout only offers online payment.

**Reminder tests (8 database, 3 Playwright)** cover back-in-stock requests (sold-out sizes only,
once per email, one email when the size returns, even after unsubscribing from reminders), one bag
reminder only after the bag sat long enough and never to unsubscribed addresses, restoring a bag
elsewhere within the stock left, price drops of at least 5% for customers who opted in (once per
drop), unsubscribing, and server-only access; in the browser, "notify me" through to the email,
the bag reminder's restore and unsubscribe links (a forged one is refused, one-click works), and
the wishlist switch.

**WhatsApp tests (4 unit, 5 database, 1 Playwright)** cover number formatting and template values,
queueing only for customers who opted in and only for events with a template, customers turning
updates off (waiting messages are dropped), one sender per message, server-only access, and the
full flow: an admin maps templates and sends a test, a shopper opts in at checkout and receives
the confirmation and shipping messages, then turns them off.

**Mobile sign-in tests (8 unit, 8 database, 6 Playwright)** cover number formats and the hook's
signatures (rotated secrets, tampering, replays outside five minutes); Supabase's phone settings
(confirmations required); profiles only for verified accounts, with the verified number as the
contact number; customer search by number however it's typed; who may change the settings; and,
through Supabase and the hook to the mocks: the owner's checklist, test code and switch, a new
shopper signing up (name asked once, guest bag kept), a returning customer (a wrong code refused),
an email customer adding a number and signing in with it, codes on WhatsApp with the copy-code
template, and refusals (other countries, staff accounts, unsigned hook calls, the switch off).

**Multi-store tests (17 database, 6 Playwright)** cover only platform administrators creating
stores (with owner, settings, delivery, couriers and starter texts), web addresses mapping to
their store, catalogs that only show their own products (even with the same address), staff who
can't read, change or add to another store by naming it, rows that can't be moved between stores,
customers listed only where they joined, the server's own access held to the named store, bags
limited to their store's items, per-store order numbers and delivery rates, orders visible only
in their store, suspended stores refusing orders, keys no browser can read, images only in the
staff's own store folder, copying the sample catalog into a new store only (and removing it there
without touching the home store's), and the database reporting its version; in the browser,
creating a store from the admin, its opening-soon homepage, then opening it at its own address
with its own look and catalog, a store started with the sample catalog ready to shop, the Setup
checklist and the dashboard's pointer to it, a shopper's order showing only in that store's
admin, a payment going to the store's own Razorpay account with its own webhook secret, and
suspending and reopening the store.

**Theme and design tests (63 unit, 4 database, 6 Playwright)** cover the colour arithmetic; that
every one of the 38 palettes keeps text, labels, secondary text, sale and error colours, fields
and the words on buttons readable on every surface, and the Spotlight's changing backgrounds
too; fonts' weights; that the eight designs differ in every part and suggest real palettes,
fonts and sections; mixed-in parts, motion and defaults; that new stores get different looks
until the designs and palettes run out, and Shuffle always shows something new; the home page's
own section order; store icons' initials; the database saving a new store's design and
rejecting malformed names, taking banner films only from staff and nothing but pictures and
videos, and the 360° switch (staff only) reaching the product page; and, in the browser, every
design built its own way and accessible on its home, product and shop pages through **Preview on
the store**, a forged preview link doing nothing and customers seeing the saved look meanwhile,
an owner changing palette, fonts and design (and back), reordering the home page, the chat
button and icon, a banner film uploaded, playing and pausing (and the photo instead for shoppers
who ask for less motion), and a 360° view switched on in the editor and turned with the keys and
by dragging.

**Acceptance tests (7, Playwright)** follow the brief:

1. An admin creates a product with an uploaded image and size/colour variants and publishes it;
   it appears on the product page and in search, while a draft copy returns 404.
2. Editing the price changes the store while the earlier order keeps the price paid.
3. A customer applies a discount code and pays with a test payment; the order is confirmed,
   totals are correct, stock drops by the quantity bought and the order shows in the admin.
4. A failed payment keeps the order unpaid and holds stock; when the hold expires the stock comes
   back. The same signed webhook sent twice is processed once; a forged one is rejected.
5. Shipping an order with a tracking number in the admin shows on the customer's order page and
   queues the shipping email.
6. A customer is turned away from the admin and, using the database API directly, can't grant
   themselves a role, call admin functions, change prices or stock, read drafts, payments or other
   people's orders, or upload files.
7. Carts, products and orders are stored on the server and survive a fresh browser.

**Accessibility checks (2, Playwright + axe-core)** scan 13 storefront pages (including the
checkout) and 20 admin pages for WCAG 2.1 A/AA problems and fail on anything serious or critical;
the mobile sign-in tests run the same check on the number and code forms and the settings tab,
and the design tests on the home, product and shop pages of all eight designs, a home page with
a film and a product page with a 360° view. Automated checks
don't replace testing with a keyboard and a screen reader.

Latest local run, on a database rebuilt from the migrations: typecheck clean, unit 86/86,
integration 93/93, Playwright 34/34 against the production build (`next build`), and the home,
shop, product, bag, sign-in and collections pages of all eight designs checked at 360, 390, 768,
1024 and 1280 px wide without horizontal scrolling. The update from the live database's version
(`20261022000100`) through `20261027000100`, as Admin › Setup hands it out, applies in one
transaction.

## Running the store

- **Adding products:** Admin › Products › Add product, or import a CSV (Products › Import; the
  template and every column are described on that page). Products start as drafts; publish now or
  schedule a launch.
- **Daily orders:** Admin › Orders › "To fulfil": start preparing → packed → shipped (courier and
  tracking; the customer is emailed) → delivered. Print the packing slip and invoice from the order.
  With Shiprocket connected: **Book courier…**, print the label, hand the parcel over at pickup;
  shipped and delivered then update by themselves.
- **Problems:** "Needs attention" lists orders with payment issues (for example a payment that
  arrived after the order expired, which is refunded automatically). Admin › Payments shows
  refunds that failed and lets you check for payments a webhook missed.
- **Returns:** approve the request, mark items received (optionally back into stock), then issue
  the refund from the request.

## Known limitations

- **A deployment needs its own Supabase project.** Until the Supabase environment variables are
  set and the migrations pushed (see Deploy), the site builds and runs but shows "The store
  database is not connected yet" and `/api/health` reports the database as unreachable.
- GST invoices show tax per line at the product's rate; HSN codes, CGST/SGST/IGST splits and
  invoice numbering separate from order numbers are not implemented. Confirm tax settings with
  your accountant.
- Customers pay the store's own delivery rates; live courier prices are shown to staff when
  booking through Shiprocket, not at checkout. Return (reverse) pickups are arranged outside the
  app. The Shiprocket connection was built against Shiprocket's documented API and tested with the
  bundled mock: make one real test booking before relying on it.
- Stripe support is basic (Checkout, refunds); prices are charged in INR.
- Product search uses Postgres trigram matching, which suits catalogs of thousands of products; a
  dedicated search service would be needed for very large catalogs or typo-tolerant ranking.
- Emails need Resend; there is no in-app email log beyond the outbox table.
- Images uploaded in the editor are resized in the browser; HEIC photos must be exported as JPEG
  first.
- Mobile sign-in is for Indian numbers only. Supabase limits how often codes can be checked per IP
  address, not per code, so keep the code expiry short (5 minutes). Numbers in India are reassigned
  after long disuse; customers who change numbers should update it (or add an email) under
  **My account**. The MSG91 connection was built against MSG91's documented Flow API and tested
  with the bundled mock: send a real test code before turning it on.
- Stores share one Supabase project: customer accounts are platform-wide, and Supabase's own
  emails (sign-up, password reset) come from the project's sender, worded to suit any store (they
  name no store, since anything a browser sends at sign-up could be made up). Stripe, Shiprocket, WhatsApp and mobile sign-in are the home store's only (see
  [Stores](#stores)). A store's web address must be added in Vercel (automatic with a token) and
  in Supabase's redirect URLs by hand.
- The Vercel cron runs daily on the Hobby plan; pg_cron handles the 5-minute stock release. If
  pg_cron isn't available, use a paid Vercel plan or another scheduler calling
  `/api/cron/housekeeping` every few minutes with the `CRON_SECRET` bearer token.

## Project layout

```
src/app/(store)/        storefront pages (home, shop, category, brands, collections, products,
                        cart, checkout, orders, account, auth, content pages)
src/app/admin/          admin login, dashboard and every admin section; print views
src/app/api/            webhooks, cron, health, session info
src/components/store/   storefront components
src/components/admin/   admin components (editors, tables, uploads, charts)
src/server/             Server Actions (store and admin)
src/lib/                Supabase clients, the request's store, auth, settings, catalog queries,
                        payments, email, CSV
supabase/migrations/    schema, policies and SQL functions
supabase/seed.sql       sample data (flagged is_sample)
tests/integration/      database tests (vitest)
tests/e2e/              Playwright acceptance tests and the Razorpay mock
scripts/                seed generator, make-owner
```
