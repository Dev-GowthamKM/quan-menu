# Quán

**Live demo:** https://quan-menu-indol.vercel.app · example menu: https://quan-menu-indol.vercel.app/m/demo

Photo-to-QR menus for Ho Chi Minh City street-food stalls. A vendor photographs their menu, AI reads the dishes and prices, the vendor checks them, and Quán prints a QR sticker. Customers scan it and see every dish in English, Korean, Chinese or Japanese, with allergens, an approximate price in their own currency, a "say it" button, and an order screen they can show the vendor.

![Vendor editor with live preview](docs/04-dishes.webp)

| Customer menu (Korean) | Order screen |
|---|---|
| <img src="docs/08-menu-ko.webp" width="260"> | <img src="docs/11-order.webp" width="260"> |

**Stack:** Next.js 15 (App Router, TypeScript) · Supabase (Postgres, auth, row-level security) · Claude API (vision) · `qrcode` · deploys to Vercel.

## Run it in 1 minute (demo mode)

```bash
npm install
cp .env.example .env.local
npm run dev
```

Open http://localhost:3000. With no Supabase keys the app runs in **demo mode**: no login, and the vendor's menu is saved in the browser. Everything works except photo reading and AI translation, which need `ANTHROPIC_API_KEY`. Common dishes still translate from the built-in list.

## Full setup

1. **Supabase.** Create a free project at supabase.com. Open **SQL Editor**, paste in `supabase/schema.sql` and run it. It also creates the `dish-media` storage bucket for dish photos and videos. The file is safe to re-run: do that after pulling changes to it. Under **Project Settings → API**, copy the Project URL and the `anon` public key.
2. **Login emails.** Under **Authentication → URL Configuration**, set Site URL to your site's address and add `https://YOUR-SITE/auth/callback` to Redirect URLs. (Add `http://localhost:3000/auth/callback` too for local development.)
   The login tab that's waiting notices when the email link signs the vendor in (in another tab) and opens the editor by itself.
   Optional: to let vendors type a code instead (useful when a phone opens the link in a different browser), set up custom SMTP in Supabase (required to edit email templates), add `Your code: {{ .Token }}` to the **Magic link or OTP** and **Confirm signup** templates, and set `NEXT_PUBLIC_LOGIN_CODE=1` in Vercel.
3. **Claude API (optional).** Create a key at console.anthropic.com. Without one, the app hides photo reading, and vendors type their dishes; the 184 dishes and drinks on the built-in list (`src/lib/dishes.ts`) fill in their translations by themselves.
4. **Fill `.env.local`:**

   ```
   NEXT_PUBLIC_SUPABASE_URL=https://xxxx.supabase.co
   NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJ...
   NEXT_PUBLIC_SITE_URL=http://localhost:3000
   ANTHROPIC_API_KEY=sk-ant-...
   ```

5. `npm run dev`, go to `/login`, enter your email, click the link, and build your menu.

## Deploy to Vercel

Push the repo to GitHub, import it at vercel.com/new, add the four variables above (with `NEXT_PUBLIC_SITE_URL` set to your Vercel address), and deploy. Then update the Supabase redirect URL from step 2 to the Vercel address.

Open `https://YOUR-SITE/api/health` after deploying. It lists any missing setting (yes/no only, never the values) and shows `"ok": true` when the required ones are in place. `ANTHROPIC_API_KEY` is listed under `optional`.

Set `NEXT_PUBLIC_SITE_URL` **before** printing stickers. The QR code contains this address.

## How it's built

| Path | What it does |
|---|---|
| `src/app/page.tsx` | Landing page |
| `src/app/login`, `src/app/auth/callback` | Email magic-link sign-in |
| `src/app/dashboard` | Vendor editor: photo → AI → edit dishes and allergens → publish → QR sticker. One account can run several stalls (`?s=<address>` picks one, **+ Add a stall** starts another), for a helper setting up menus for many vendors. `actions.ts` saves through the `save_menu` database function, which refuses to overwrite a menu changed elsewhere since the editor opened it. |
| `src/app/k/[token]` | The owner's page: a secret link (and QR) the helper hands to the stall owner, who can then mark dishes sold out and change prices on their phone with no account. Checked by the `quick_*` database functions; the helper can replace or turn off the link. |
| `src/app/to-roi` | Printable Vietnamese flyer for walking up to stalls, with QR codes to the sample menus and the helper's name and Zalo number. |
| `src/app/m/[slug]` | Public customer menu (what the QR code opens). Cached and served to every scanner, rebuilt at most once a minute, and refreshed immediately when the vendor saves. |
| `src/app/api/extract` | Photo → dishes, using Claude vision. Signed-in vendors only. |
| `src/app/api/translate` | Names of new dishes → translations, allergens, pronunciation (the editor sends 15 at a time) |
| `src/app/api/health` | Deployment check: which settings are missing |
| `src/components/DishMedia.tsx` | Per-dish photos and videos in the editor: photos are shrunk to 1280 px in the browser, videos must be MP4/MOV/WebM under 25 MB, up to 6 per dish. Files go straight to Supabase Storage. |
| `src/components/MenuView.tsx` | Customer menu, also used as the live phone preview. Shows “must-try” and “sold out today” badges, a VietQR bank-transfer code for the exact order total (with a short order code as the transfer note), and a Google Maps review button. |
| `src/lib/vietqr.ts` | Builds VietQR (NAPAS/EMVCo) codes in the app, with no outside service, and the list of banks. |
| `src/lib/dishes.ts` | Built-in translations for 184 common Saigon dishes and drinks, including café and milk-tea drinks. Used before any AI call, so known dishes cost nothing; matching ignores tone marks, portion notes and prices. |
| `src/lib/drinks.ts` | Coffee and milk-tea shops: shop type, sizes with their own prices, sugar (0–100%), ice, and a shop-wide topping list. Customers choose in their language; the vendor's order screen shows e.g. “Trà sữa trân châu (L) · 50% đường · ít đá · + Trân châu đen”. Example shop at `/m/demo-cafe`. |
| `src/lib/strings.ts` | Every vendor-facing text in Vietnamese (default) and English, switched with the VI/EN button and kept in the `quan_ui` cookie. Server messages use the same choice. |
| `src/lib/ai.ts` | Claude API calls: prompts, JSON-schema structured output, time budget, error messages |
| `supabase/schema.sql` | Tables, row-level security, the atomic `save_menu` function, sold-out lists that clear themselves the next day, owner links, and the daily AI allowance. `schema_version()` lets the app and `/api/health` tell you when the file needs running again. |

**Security model:** anyone can read a stall marked live. Only its owner can read a draft or change anything; this is enforced by Postgres row-level security, not just the app. The AI routes refuse anyone who isn't signed in, and each vendor gets 40 AI calls per day (the `take_ai_call` function in `supabase/schema.sql`; change the number there). In demo mode the AI routes only work during local development, so a deploy missing its Supabase settings can't be used to spend your API credit.

**Menu photos** (for AI reading) are shrunk in the browser to 1600 px and sent straight to Claude. They are not stored. **Dish photos and videos** are stored in the public `dish-media` bucket, inside a folder named after the vendor's user id; storage policies only let vendors add or delete files in their own folder, and the app only displays URLs from this bucket. Files a vendor removes are deleted when they next save; files uploaded but never saved stay in storage until cleaned up by hand. Reading a second photo adds its dishes to the list, so a long menu can be read in parts.

**Time limit:** each AI call must finish within 60 seconds (the route's `maxDuration`). Calls use `low` effort to stay fast; set `ANTHROPIC_EFFORT=medium` if menus are misread.

## Free services it uses

Everything below works with no API key and no bill:

- **Menu photo reading without Claude:** Tesseract (open source) runs in the vendor's browser. `scripts/copy-ocr.mjs` copies the engine and Vietnamese data from npm into `public/ocr` before each build, so nothing loads from outside sites and photos never leave the phone. `src/lib/menu-parse.ts` turns the text into dishes and prices and re-splits words the reader runs together.
- **Translating dishes that aren't on the built-in list:** MyMemory's free API (`src/lib/free-translate.ts`), about 5,000 characters a day per server. Set `MYMEMORY_EMAIL` in Vercel to raise that to 50,000. Uses the same login and daily allowance as the AI routes.
- **Exchange rates:** ExchangeRate-API's open endpoint (`src/lib/rates.ts`), refreshed twice a day, credited under each menu. Falls back to the fixed rates in `src/lib/i18n.ts`.
- **Menu view counter:** a `menu_views` table and `count_view()` function in Supabase (free plan). Each visit to a published menu counts once; the editor shows today and the last 7 days.
- **Install as an app:** `src/app/manifest.ts` and icons, so vendors can add Quán to their home screen.

With a Claude key, photo reading and translation switch to Claude automatically, and the built-in list is still used first.

## Known limits / next steps

- **Pronunciation** uses the phone's built-in voice. Some phones have no Vietnamese voice, and then customers fall back to reading the spelling guide. A cloud text-to-speech service (for example Google TTS) would fix this.
- **Customers pay vendors** by VietQR bank transfer, but Quán doesn't see or confirm payments: the vendor checks their banking app (the order code is in the transfer note). MoMo and ZaloPay wallets aren't supported yet.
- **A vendor plan** (charging stalls monthly) isn't built yet. VietQR to your own account, or PayOS, would be the simplest start.
- An owner link can be passed on by the owner. If it leaks, make a new one from the editor; the old one stops working at once.
- **Analytics** are a daily view count. Which dishes customers look at most would be the next step.
