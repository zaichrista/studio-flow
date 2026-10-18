# Studio Flow

A calm planner for a designer's messy brain. Put everything down in one place; it sorts itself into projects, tasks and subtasks, then time-blocks them onto a calendar.

- **Brain dump** — write anything. It sorts into projects (with their fee), tasks, subtasks, deadlines and spending. Thoughts that aren't tasks (`idea:`, `what if…`, `💡`) go to **Ideas, kept safe** instead of the calendar; turn one into a task whenever you like. Works with no setup using simple built-in rules (see "How to write it" on the Dump page); connect the optional AI sorter for loose, rambling writing.
- **Scheduling** — each task gets 3 working days by default and is split into 60-minute blocks, spread across your work days (all adjustable in Settings). Lunch is kept free.
- **Breaks and outside events** — lunch and dinner (and any other daily break you add) are kept free. Add work shifts, appointments and personal plans, one-off or repeating weekly; your freelance blocks are planned around them, and anything already booked in that time moves to the next free slot.
- **Layout lab** — Settings → Look & layout: soft or liquid glass surfaces, four colour palettes, side menu or bottom bar, three spacing levels, one or two column Today, and week grid / list / single-day calendar and stacked or column board.
- **Timer tied to blocks** — start the timer in a block and it counts towards that block. Stop at 45 of 60 minutes and the block closes as 45 min done; the missing 15 go back on the calendar. Missed blocks roll forward on their own.
- **Put it down from anywhere** — the ＋ button (or "Put it down" in the side menu) takes a thought on any page and places it straight away, no review step. Undo is there if it landed wrong. Closing the sheet keeps what you wrote.
- **The right work at the right hour** — tasks are guessed as focus, ideas or admin from their words (change it on any task). Focus work goes to the half of the day your head is clearest (Settings); ideas and admin go to the other half, so loose thinking gets your looser hours and admin batches together. Admin with no time given gets 30 minutes.
- **Starting is the hard part** — "Just 10 minutes" starts the timer with a gentle check-in at ten. "Not now" moves a block an hour or more on, to the next free slot. Tapping a "Time for…" notification starts the timer; the end-of-day one opens "put the day away"; money ones open Money.
- **Quick to open** — the app opens on Today if you've been away an hour or more. The loading animation plays every time (tap to skip), or only once a day if you choose that in Settings → Look & layout.
- **Breathing room and limits** — a short pause after every block (10 min by default), and an optional weekly hours limit that counts shifts too. Once a week is full, work waits for the next one.
- **Pick up where you left off** — stopping the timer asks "where are you up to?" in one line. That note, or the task's first tiny step, shows on the next block and in its notification.
- **A calm Today** — a quiet line for the day under the greeting; the work day drawn as the sun's arc, with your blocks, breaks and shifts along it and the sun where you are now; soft rings for focus today, this week, small wins and evenings kept (days put away on time).
- **Looking after you** — a one-minute breathing space (in for 4, out for 6), a nudge to pause after a long stretch of focus, and four little acts of care to tick each day: water, move, outside, eat well.
- **Light and dark** — the sun (or moon) in the top corner swaps them in one tap; Settings can also follow the iPad.
- **Today's intention** — one line at the top of Today for how you want the day to go. Tap a suggestion (one drawn from your day, plus gentle ones) or write your own. The evening routine reminds you of it and asks for one good thing about the day, which greets you the next morning.
- **Small wins and worth knowing** — Today lists what you got done (tasks, steps, focus blocks, invoices, ideas), and up to three gentle heads-ups: a late invoice, work missing its deadline, a full week, something ready to invoice, tax day within a month. Each one taps through to where you deal with it.
- **Today, one thing at a time** — the next three blocks are in view and the rest of the day folds away. While timing, the ring empties as the block runs.
- **Put the day away** — at the end of the day: tick off what's done, empty your head into the dump, note one good thing, see how tomorrow starts. Then today stays clear and the notifications go quiet.
- **Honest estimates** — once a few timed tasks are finished, the app says how long things really take compared with your plan (e.g. ×1.4) and offers to book that much time for new ones.
- **Pay** — set a fixed fee per project; the Work page shows time tracked and what the project is really paying per hour. Mark an invoice sent and you'll be nudged the morning it's due and a week later; marking it paid records the income.
- **Money** — income and spending with a monthly summary (all £), what's safe to spend after tax, a tax pot (25% by default, adjustable), the next Self Assessment day, and what's waiting to be paid.
- **Stats** — time today and this week, open tasks, open subtasks.
- **Push notifications** — a heads-up before each block, a nudge when it starts that names the first step, a wrap-up while timing, an end-of-day nudge, invoice due dates and tax days. All work even with the app closed.

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

GitHub Pages only serves static files, so your Anthropic key can't live in the app. A tiny Cloudflare Worker holds it, and also sends the push notifications, checking every 5 minutes. Free tier is plenty.

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
src/lib/scheduler.ts   placing blocks, roll-over, partial blocks, pauses, weekly limit (tested)
src/lib/actions.ts     all state changes as pure functions (tested)
src/lib/push.ts        subscription + reminder list sent to the worker
src/pages/             Today, Dump, Week, Work, Money, Settings
worker/src/index.ts    /sort (Claude), /sync + cron (push), /test
legacy/                the earlier single-file prototype, kept for reference
```

The sorting model is set by `MODEL` in `worker/wrangler.toml`.
