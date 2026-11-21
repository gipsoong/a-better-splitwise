# Splitly

A small, fast expense splitter for friends. No accounts, no ads, no paywall. Mobile-first web app you can add to your home screen.

## What's in it

- **Groups** shared by link. The link contains a long random secret; anyone with it can view and add.
- **Expenses** split equally, by amounts, by %, or by shares. Editing reopens in the same split mode.
- **Repeat expenses are quick:**
  - The sheet remembers the last payer and split for each group.
  - **Save & add another** keeps the payer and split and clears only the amount.
  - **Several at once:** type one per line (`Grab 12.50`, `Dinner 48`, `Hotel 1,200`) and they're all added under one split.
- **Balances** with suggested payments and one-tap **Settle**. Payments can be deleted with Undo.
- "Added by" / "edited by" on each expense. Members with a balance can't be removed.
- Instant UI. Changes show immediately, sync in the background, and are cached so the app opens offline. Changes made offline upload when you're back online.
- Light and dark mode, reduced-motion support, Export/Import JSON backups.

## Run it locally

```bash
npm install
npm run dev     # http://localhost:5173
npm test        # money logic tests
```

Without Supabase keys the app runs **local-only**: everything works, but data stays on that one device (the home screen shows a "Local only" badge).

## Turn on sharing (Supabase, free tier is fine)

1. Create a project at [supabase.com](https://supabase.com). Any region; Singapore is closest.
2. Open **SQL Editor → New query**, paste all of [`supabase/migrations/001_init.sql`](supabase/migrations/001_init.sql), and click **Run**.
3. Open **Project Settings → API** (or **Connect**) and copy:
   - **Project URL** → `VITE_SUPABASE_URL`
   - **anon / publishable key** → `VITE_SUPABASE_ANON_KEY`

   Never use the `service_role` / secret key here. The anon key is meant to be public.
4. For local dev, copy `.env.example` to `.env` and paste the two values.

### Why the anon key being public is fine

Both tables have Row Level Security on with **no policies**, so the key can't read or write them directly. Everything goes through a few `security definer` functions that need the exact group id. Group ids are 128-bit random strings that only exist in share links, so nobody can list or guess groups.

Live updates use Supabase Realtime broadcast on a channel named after the group id: when someone saves, everyone with the group open refetches it.

## Deploy (Vercel)

1. Push this repo to GitHub, then **Add New → Project** on [vercel.com](https://vercel.com) and import it. Vercel detects Vite; keep the defaults.
2. Under **Environment Variables**, add `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`.
3. Deploy. Share the URL; open a group and use **⋯ → Share link** to invite friends.

On iPhone: open the site in Safari → Share → **Add to Home Screen**. On Android: Chrome menu → **Install app**.

## Code map

| File | What |
| --- | --- |
| `src/lib/money.js` | All money maths (integer cents), amount parsing, quick-entry parsing. Tested in `money.test.js`. |
| `src/lib/store.js` | The only data module: local cache, op queue, sync, live updates. |
| `src/lib/remote.js` | Supabase calls. Swappable. |
| `src/components/` | UI. |
| `supabase/migrations/001_init.sql` | Tables and functions. |

Notes: amounts are stored as integer cents. `"1,000"` parses as one thousand; a lone decimal comma like `"12,50"` parses as 12.50. Suggested payments use a greedy match, which is usually but not always the fewest transfers.
