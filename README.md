# Mailkeep

Google OAuth sign-in, live Gmail scanning, and an agent-driven classifier
that sorts your inbox into spam / promotions / bills / important / misc.
Free tier: 100 emails per scan, 3 scans/day per account, no database.

## Requirements

- **Node.js 20.9 or later** — Next.js 16 requires it and won't run on
  older versions. Check with `node -v`.
- A free **Upstash Redis** database (https://console.upstash.com) — used
  for the free-tier scan quota, subscription status, and the scan-result
  cache. No local Redis/Docker needed; the app talks to it over Upstash's
  REST API, in local dev too.
- Built on Next.js 16.2.x, React 19, and Auth.js v5
  (`next-auth@5.0.0-beta.32` or later — earlier v4 and v5-beta releases
  carry a disclosed broken-access-control vulnerability, CVE-2026-73421,
  so don't downgrade below beta.32).

## 1. Google Cloud Console setup

1. Create a project (or use an existing one) at
   https://console.cloud.google.com/.
2. Enable the **Gmail API**: APIs & Services > Library > search "Gmail API"
   > Enable.
3. Configure the OAuth consent screen: APIs & Services > OAuth consent
   screen.
   - User type: External (unless you're on a Workspace org and want
     Internal).
   - Add your own Google account as a test user while the app is
     unverified.
   - Under Scopes, add:
     - `https://www.googleapis.com/auth/gmail.readonly`
     - `https://www.googleapis.com/auth/gmail.modify`
     - `https://www.googleapis.com/auth/gmail.labels`
4. Create credentials: APIs & Services > Credentials > Create Credentials >
   OAuth client ID.
   - Application type: Web application.
   - Authorized redirect URI: `http://localhost:3000/api/auth/callback/google`
   - Copy the generated Client ID and Client Secret.

## 2. Configure the app

```bash
cp .env.example .env.local
```

Create a free database at https://console.upstash.com (Redis > Create
Database — any region close to you is fine for dev). On the database's
page, open the **REST API** section (not the `redis://` / TLS connection
string shown elsewhere on that page) and copy the two values it shows.

Fill in `.env.local`:

```
AUTH_GOOGLE_ID=<your client id>
AUTH_GOOGLE_SECRET=<your client secret>
AUTH_SECRET=<run: npx auth secret>
UPSTASH_REDIS_REST_URL=<from the Upstash console>
UPSTASH_REDIS_REST_TOKEN=<from the Upstash console>
```

(`AUTH_URL` is left commented out — Auth.js v5 auto-detects it in local
dev.)

You'll also need a Gemini API key from https://aistudio.google.com/app/apikey
— the scan uses it to classify emails. Sign in with any Google account,
click "Create API key". A few things worth knowing before you rely on this
for real users, not just your own test inbox:

- **Free tier ≠ private.** On Google's free tier, "your content may be used
  to improve their products" (their wording). That's a real consideration
  once you're processing other people's email subject lines and snippets,
  not just your own during development. The paid tier turns this off and is
  still cheap for this model (`gemini-3.5-flash-lite`: $0.30/$2.50 per
  million input/output tokens) — worth switching to before shipping to
  actual users.
- **Free-tier rate limits aren't published as fixed numbers** — they scale
  with your account's usage tier. Check your actual limits at
  https://aistudio.google.com/rate-limit rather than assuming a number.
- **Google's model lineup changes fast, and version numbers aren't
  reliable indicators of recency.** This uses `gemini-3.5-flash-lite`, the
  current lightweight model as of Sept 2026 — a genuinely different model
  from the older `gemini-3.1-flash-lite`, not a rename, despite the lower
  number. Re-check https://ai.google.dev/gemini-api/docs/pricing
  periodically for what's current.

## 3. Run the app

```bash
npm install
npm run dev
```

Visit `http://localhost:3000`, click "Continue with Google", and grant
access. You'll land on `/dashboard`, which is route-protected — visiting it
signed out redirects you back to the landing page.

## What's working now

- Google sign-in with Gmail scopes, automatic access-token refresh.
- "Scan inbox" on the dashboard, capped at 100 emails and at 3 scans/day
  per Google account (enforced in Redis, keyed on the stable `googleSub`
  so it survives cookie clears — see `lib/quota.ts`).
- Classification is agent-driven, not a single stuffed prompt: Gemini is
  given `list_emails`, `get_email_metadata`, and `record_classifications`
  as tools (function calling) and decides its own batching as it works
  through the inbox (see `lib/classify.ts`). Same trade-off as before:
  more round-trips than one batched prompt, but structured, robust output
  instead of parsed free-text JSON.
- **Scan-result cache** (`lib/cache.ts`): each scanned email's category
  and any agent suggestions are cached in Redis for 6 hours, keyed per
  account per message id. A re-scan skips both the Gmail metadata fetch
  and the Gemini call for anything already cached — cheaper and faster on
  repeat scans, and `cacheHits` is returned in `/api/scan`'s response so
  you can see it working. Deleting an email invalidates its cache entry.
  Still no database for email *content* — only classification results are
  cached, and only for 6 hours.
- **Agent-driven calendar suggestions** (paid tier): the classification
  agent's `record_classifications` tool accepts an optional
  `suggestedEvent` per email — only when it finds an actual date/deadline
  in a bills/important email — which pre-fills the "Add to calendar" form
  in `EmailRow` instead of defaulting to a guessed tomorrow-9am slot. The
  event is still only created when the user reviews and clicks "Save to
  calendar"; the agent never calls the Calendar API itself.
- **Agent-driven delete suggestions** (paid tier): the same tool call can
  set `recommendedDelete` on emails the agent is confident are spam,
  surfaced as a badge in the UI. Deleting still requires the existing
  manual confirm step in `EmailRow` — this only pre-checks the
  suggestion, it never trashes anything on its own.
- Delete (`app/api/mail/delete`) and calendar-event creation
  (`app/api/calendar/create`) are both gated server-side on
  `isSubscribed`, not just hidden in the UI.
- `package.json` currently pins `@google/genai` and `@upstash/redis` to
  `"latest"` rather than exact versions, since I couldn't verify the
  current release numbers without installing them. After your first
  `npm install`, run `npm list @google/genai @upstash/redis` and pin the
  resolved versions in `package.json` for reproducible builds going
  forward — `package-lock.json` isn't included in this zip for the same
  reason (it would've been generated against unverified versions), so the
  first `npm install` you run also regenerates that from scratch.

## Deploying to Vercel

No Docker, no server to manage — Vercel builds straight from the repo,
and Upstash is already the Redis backend from local dev, so there's no
separate "production Redis" to stand up.

### 1. Push to GitHub

```bash
git init   # if this wasn't already a git repo
git add .
git commit -m "Initial commit"
git remote add origin <your-repo-url>
git push -u origin main
```

`.gitignore` already excludes `.env`, `.env.local`, and `.env.production`
— your real secrets never get committed.

### 2. Import into Vercel

- https://vercel.com/new → import the GitHub repo. Framework preset
  (Next.js) is auto-detected — no build settings to change.
- Before the first deploy (or right after, then redeploy), go to
  **Settings → Environment Variables** and add every key from
  `.env.example` with real values, for the **Production** environment at
  minimum:
  - `AUTH_GOOGLE_ID`, `AUTH_GOOGLE_SECRET`, `AUTH_SECRET`
  - `GEMINI_API_KEY`
  - `UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN` — same Upstash
    database as local dev is fine to start (Upstash's free tier is meant
    to be shared across dev/prod for a small project like this), or spin
    up a second database and keep them separate once you have real users.
  - `STRIPE_SECRET_KEY`, `STRIPE_PRICE_ID`, `STRIPE_WEBHOOK_SECRET` (see
    step 4 below for the webhook secret specifically)
  - Leave `AUTH_URL` unset unless you're using a custom domain (see
    `.env.example`) — Auth.js auto-detects the host on Vercel's own
    `*.vercel.app` domain.
- Deploy. You'll get a URL like `https://mail-assistant-yourname.vercel.app`.

### 3. Add the Vercel URL to Google Cloud Console

Credentials → your OAuth client → Authorized redirect URIs → add:
```
https://<your-project>.vercel.app/api/auth/callback/google
```
Google OAuth apps in testing mode also cap the *test user* list — make
sure the Google account you're signing in with is still listed under
OAuth consent screen → Test users.

### 4. Add the Vercel URL to Stripe

Stripe Dashboard → Developers → Webhooks → Add endpoint:
```
https://<your-project>.vercel.app/api/billing/webhook
```
Copy the signing secret it generates into Vercel's environment variables
as `STRIPE_WEBHOOK_SECRET` — this is a *different* secret from the one
the Stripe CLI gives you in local dev, and the webhook won't verify
correctly with the wrong one. Redeploy (or just wait for the env change
to apply on the next deploy) after setting it.

### Redeploying after a code change

```bash
git push
```

Vercel redeploys automatically on every push to the connected branch —
nothing else to run. Preview deployments (on other branches/PRs) get
their own throwaway URL; they'll hit the same Upstash database and Stripe
account as production unless you set branch-specific environment
variables, which is worth doing before you invite anyone else to open PRs
against this.

### Startup env check

`instrumentation.ts` runs `lib/env-check.ts` on cold start in production
(this includes preview deployments — Vercel runs those in production mode
too) and throws immediately if a required var is missing, instead of the
function deploying "successfully" and failing confusingly on the first
real request.

## Next milestones

1. Postgres for persistence and an audit log of delete/calendar actions
   actually taken (Redis currently holds subscription status, quota
   counters, and the scan cache — none of it is a record of what a user
   did, just of what's allowed/cached right now).
2. Separate Upstash databases for production vs. preview deployments,
   once this has real users — right now they'd share one, which means a
   preview deployment's test scans count against real accounts' daily
   quota.
