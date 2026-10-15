# Taskboard

A monday.com-style task board that installs on your iPhone like an app, hosted free on Cloudflare.

**Boards like monday.com**
- Boards with colored groups (e.g. "This week", "Later")
- Columns for owner, status, priority and due date; tap a colored label to change it
- Your own status labels and colors per board
- A status bar under each group showing how much is done
- Search, "Mine" and "Hide done" filters
- **My work**: everything assigned to you across all boards, sorted into Overdue / Today / Tomorrow / This week / Later

**Extras**
- **Repeating tasks**: daily, weekly (on chosen days), monthly, yearly, every N. When you mark one done, the next one appears with a fresh checklist and subtasks.
- **Reminders**: push notifications on your iPhone at the due time, or 15 min / 1 hour / 1 day / 1 week before.
- **Subtasks**, each with its own owner, status and date.
- **Checklists** inside any task, with a progress bar.
- Notes on every task, dark mode, and a team mode where everyone signs in to the same boards.

## Put it online (one-time, about 15 minutes)

You need a free [Cloudflare account](https://dash.cloudflare.com/sign-up) and this code in a GitHub repository.

1. **Create the database.** In the Cloudflare dashboard go to **Storage & Databases → D1 → Create database**. Name it `taskboard`. Copy its **Database ID**.
2. **Paste the ID** into `wrangler.jsonc`, replacing `00000000-0000-0000-0000-000000000000`. Commit the change.
3. **Connect the repo.** Go to **Workers & Pages → Create → Import a repository**, pick this repo, and set:
   - Build command: `npm run build`
   - Deploy command: `npx wrangler d1 migrations apply DB --remote && npx wrangler deploy`
4. Click **Deploy**. When it finishes, Cloudflare shows your app's address, e.g. `https://taskboard.<you>.workers.dev`.
5. Open that address and **create your account**. The first account is the owner.

From then on, every push to the repo redeploys automatically.

### Letting teammates join

New sign-ups are closed after the first account. To invite people, open the Worker in Cloudflare → **Settings → Variables and Secrets → Add**, type **Secret**, name `INVITE_CODE`, and a value of your choice. Give teammates the address and the code; they choose "Create an account with an invite code" on the sign-in page.

### Notification contact address

Apple requires a contact address for notifications. It's set in `wrangler.jsonc` under `VAPID_SUBJECT`; change it if you want a different one.

## Install it on your iPhone

1. Open your app's address in **Safari**.
2. Tap **Share** (square with an arrow) → **Add to Home Screen** → **Add**.
3. Open Taskboard from the Home Screen, sign in, go to **Settings** and turn on **Push notifications**.

Notifications need iOS 16.4 or later and only work from the Home Screen app, not from a Safari tab.

## How it's built

| Part | What |
| --- | --- |
| `src/` | The app screens (Preact + TypeScript, built with Vite) |
| `worker/` | The server: a Cloudflare Worker with a JSON API |
| `shared/` | Types and date/repeat logic used by both |
| `migrations/` | Database tables (Cloudflare D1, i.e. SQLite) |
| `public/sw.js` | Service worker: offline app shell and notifications |

- Reminders: a Cloudflare cron runs every minute, finds tasks whose reminder time has passed, and sends a Web Push to the owner's devices (or the creator's, if nobody is assigned). Push keys are generated automatically on first use and stored in the database.
- Times: due dates are stored as calendar dates plus a time zone, so a 9:00 AM reminder stays at 9:00 AM across daylight-saving changes. Tasks with a date but no time remind from 9:00 AM.
- Accounts: email + password (PBKDF2), 90-day sessions in an HttpOnly cookie.

## Working on the code

```sh
npm install
npm run dev        # builds, sets up a local database, runs at http://localhost:8787
npm test           # repeat-rule, time-zone and push-encryption tests
npm run typecheck
```

For a local invite code, put `INVITE_CODE=anything` in a `.dev.vars` file.
`node scripts/make-icons.mjs` regenerates the PNG icons from `public/icon.svg` (needs Playwright).
