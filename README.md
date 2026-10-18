# Studio Flow

A calm planner for a designer's messy brain. Put everything down in one place; it sorts itself into projects, tasks and subtasks, then time-blocks them onto a calendar.

- **Brain dump** — write anything. It sorts into projects (with their fee), tasks, subtasks, deadlines and spending. Works with no setup using simple built-in rules (see "How to write it" on the Dump page); connect the optional AI sorter for loose, rambling writing.
- **Scheduling** — each task gets 3 working days by default and is split into 60-minute blocks, spread across your work days (all adjustable in Settings). Lunch is kept free.
- **Breaks and outside events** — lunch and dinner (and any other daily break you add) are kept free. Add work shifts, appointments and personal plans, one-off or repeating weekly; your freelance blocks are planned around them, and anything already booked in that time moves to the next free slot.
- **Layout lab** — Settings → Look & layout: four colour palettes, side menu or bottom bar, three spacing levels, one or two column Today, and week grid / list / single-day calendar and stacked or column board.
- **Timer tied to blocks** — start the timer in a block and it counts towards that block. Stop at 45 of 60 minutes and the block closes as 45 min done; the missing 15 go back on the calendar. Missed blocks roll forward on their own.
- **Pay** — set a fixed fee per project; the Work page shows time tracked and what the project is really paying per hour.
- **Money** — income and spending with a monthly summary (all £).
- **Stats** — time today and this week, open tasks, open subtasks.
- **Push notifications** — a nudge before each block, and when a timed hour is up, even with the app closed.

Everything is stored in the browser on your iPad. There's no sync. Use **Settings → Save a backup** now and then.

## Run locally

```bash
npm install
npm run dev      # http://localhost:5173
npm test         # scheduler tests
npm run build    # type-check + production build into dist/
```

## Deploy the app (GitHub Pages)

1. Create a GitHub repo and push this folder to its `main` branch.
2. Repo **Settings → Pages → Source: GitHub Actions**.
3. The included workflow builds and publishes on every push. Your site is `https://<you>.github.io/<repo>/`.

## Deploy the worker (AI + push)

GitHub Pages only serves static files, so your Anthropic key can't live in the app. A tiny Cloudflare Worker holds it, and also sends the push notifications, checking every 15 minutes. Free tier is plenty.

```bash
cd worker
npm install
npx wrangler login
npx wrangler kv namespace create REMINDERS     # copy the id it prints into wrangler.toml
```

Edit `worker/wrangler.toml`: set `ALLOWED_ORIGIN` to `https://<you>.github.io` (no path), and paste the KV id.

Then the secrets:

```bash
npm run keys                                    # prints a VAPID key pair
npx wrangler secret put VAPID_PUBLIC_KEY
npx wrangler secret put VAPID_PRIVATE_KEY
npx wrangler secret put ANTHROPIC_API_KEY
npx wrangler secret put APP_TOKEN               # make up a passphrase; you'll type it into the app once
npx wrangler deploy                             # prints your worker address
```

The passphrase stops anyone else using your credits; the worker also only accepts requests from your Pages address.

## On the iPad

1. Open the site in **Safari**, tap **Share → Add to Home Screen**, then open Studio Flow from the Home Screen. (iPadOS only allows push for installed web apps, iPadOS 16.4+.)
2. **Settings →** paste the worker address and passphrase.
3. Tap **Turn on notifications**, allow, then **Send a test**.

## Layout

```
src/lib/scheduler.ts   placing blocks, roll-over, partial blocks (tested)
src/lib/actions.ts     all state changes as pure functions
src/lib/push.ts        subscription + reminder list sent to the worker
src/pages/             Today, Dump, Week, Work, Money, Settings
worker/src/index.ts    /sort (Claude), /sync + cron (push), /test
legacy/                the earlier single-file prototype, kept for reference
```

The sorting model is set by `MODEL` in `worker/wrangler.toml`.
