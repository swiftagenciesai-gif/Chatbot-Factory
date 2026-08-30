# AI Chatbot Widget Factory

A small full-stack factory for creating embeddable AI chat widgets for other companies to embed on their own sites.

## Architecture

```text
React dashboard (password-gated) -> Express API (/api/admin/*, /api/widgets/:id, /api/chat)
                                            |                    |
                                            |                    +-> OpenAI/Anthropic API
                                            +-> Postgres (widgets table) + hosted /widget.js

Customer site <- generated <script data-widget-id="..." src=".../widget.js">
```

- `server/src/app.js` builds the Express app and owns the LLM API key. `server/src/db.js` is the Postgres layer (via `@neondatabase/serverless`). `server/src/index.js` runs the app as a long-lived process for local dev; `api/index.js` re-exports the same app as a Vercel serverless function, so a single `vercel.json` deploy ships both the dashboard and the API together.
- `dashboard/` is the React + Tailwind factory UI: a password gate, a widget-creation form, and an admin panel listing every widget with usage and a per-widget message limit.
- `server/public/widget.js` is a dependency-free IIFE served to customer sites. It uses a Shadow DOM when available and inline styles as a fallback.

## Deploying to Vercel

`vercel.json` builds the dashboard as a static site and rewrites `/widget.js`, `/health`, and `/api/*` to the `api/index.js` serverless function, so one Vercel project serves everything. After connecting this repo to Vercel, set these in the project's Environment Variables, then redeploy (Vercel does not apply env var changes to an already-built deployment):

1. `DATABASE_URL` — a Postgres connection string. Easiest path: Vercel project -> **Storage** tab -> create a Postgres database (Neon-backed) -> it injects a compatible env var (`DATABASE_URL` or `POSTGRES_URL`, both are read) automatically.
2. `ADMIN_PASSWORD` — a password of your choosing. Required to use the dashboard's admin panel (create/list/edit/delete widgets) at all; without it, every `/api/admin/*` route returns 500.
3. `PUBLIC_BASE_URL` — the project's stable Production domain (Project -> Domains -> the entry with no random hash, e.g. `https://your-project.vercel.app`, or a custom domain). Without it, generated embed snippets fall back to `http://localhost:3001`, which does not work from a real website.
4. `OPENAI_API_KEY` or (`LLM_PROVIDER=anthropic` and `ANTHROPIC_API_KEY`) so `/api/chat` can actually reach a model. This key is shared by every widget created through the dashboard — use each widget's message limit (below) to bound what a single customer can cost you.
5. `ALERT_WEBHOOK_URL` (optional) — a Slack or Discord incoming webhook URL. When set, you get pinged the moment any widget crosses 75%, 90%, or 95% of its message limit. Leave unset for no notifications.

### Persistence

Widgets are stored in a `widgets` Postgres table (created automatically on first use) and survive redeploys and cold starts. The `SEED_WIDGET_*` env-var migration path used before this table existed has been removed — every widget now only exists because it was created (or is still present) in the database, so deleting one in the admin panel is permanent. If you still have `SEED_WIDGET_*` variables set in Vercel, they're simply unread now and can be removed whenever convenient.

### Admin panel

The dashboard at your Production domain is a password gate first (enter `ADMIN_PASSWORD`), then the widget-creation form and a list of every widget with:

- messages used vs. its message limit (blank/unlimited if not set)
- an inline field to change that limit at any time
- estimated **cost** (`~$X.XXXX`, from actual token usage × the per-model rate table in `server/src/pricing.js`) and estimated **hours saved** (`messagesUsed × MINUTES_SAVED_PER_MESSAGE ÷ 60`, default 4 minutes/message, override via the `MINUTES_SAVED_PER_MESSAGE` env var) — both are estimates for budgeting/marketing, not billing-accurate figures
- **Edit** — change name, system prompt, opening message, website URL, or colors in place
- a copy-embed button (re-copy a customer's script tag without recreating their widget)
- delete (immediately and permanently breaks that widget's embed — customer sites calling it will get a 404; nothing recreates it afterward)

The password is kept in `sessionStorage` only (cleared when the tab closes); there is no per-admin-user login, just the one shared password. Good enough for one operator; add real auth (e.g. per-user accounts) before handing dashboard access to a team.

### Usage alerts

Set `ALERT_WEBHOOK_URL` to a Slack or Discord incoming webhook URL (both accept the same JSON shape this sends: `{"text": "...", "content": "..."}`, so either works with no extra config) to get notified when a widget's usage crosses 75%, 90%, or 95% of its message limit. Each threshold fires once per widget — raising or lowering the message limit (via Edit or the inline limit field) resets which thresholds have already fired, since the percentage basis changed. Widgets with no message limit set never trigger an alert, since there's no ceiling to measure against. A missing/unreachable webhook URL fails silently — it never blocks or slows down a chat reply.

### Origin lock and rate limiting on `/api/chat`

If a widget has a `websiteUrl` set, `/api/chat` (and the config fetch in `/api/widgets/:id`) check the browser's `Origin` header against it and reject a mismatch with `403` — this stops someone from copy-pasting another company's embed script onto their own site and running up that widget's message limit and your API cost. It's best-effort, not a hard security boundary: a request with no `Origin` header (non-browser tools) is let through, since there's nothing to check.

`/api/chat` also rate-limits to `CHAT_RATE_LIMIT_PER_MINUTE` (default 20) requests per minute per widget+IP, returning `429` past that. This is an in-memory limiter, so on Vercel's autoscaling it's per-instance, not perfectly global — good enough to stop one script or browser tab from hammering a widget, not a substitute for a shared store like Redis if you need an exact global limit later.

## Run locally

Requirements: Node.js 20+, a Postgres database (e.g. a free Neon project) for full functionality — the API will start without `DATABASE_URL` but every widget/chat route will 500.

```bash
npm install
cp server/.env.example server/.env
npm run dev
```

Open `http://localhost:5173`. The dashboard proxies API requests to `http://localhost:3001`. It will ask for `ADMIN_PASSWORD` before showing the widget form.

Set credentials in `server/.env`. The LLM key never appears in a generated snippet or in browser code.

```bash
DATABASE_URL=postgres://...
ADMIN_PASSWORD=choose-a-password
```

For OpenAI:

```bash
OPENAI_API_KEY=your_key
OPENAI_BASE_URL=https://api.openai.com/v1
OPENAI_MODEL=gpt-4o-mini
```

For Claude via Anthropic:

```bash
LLM_PROVIDER=anthropic
ANTHROPIC_API_KEY=your_key
ANTHROPIC_BASE_URL=https://api.anthropic.com
ANTHROPIC_MODEL=claude-sonnet-5
```

## Production shape

Done: Postgres persistence, a password-gated admin panel, per-widget message limits, per-widget cost/hours-saved tracking, usage-threshold alerts, a best-effort origin lock, and per-widget+IP rate limiting on `/api/chat`.

Still worth adding before scaling past a handful of customers:

1. Per-admin-user accounts instead of one shared password, if more than one person manages widgets.
2. A shared store (e.g. Redis) for the chat rate limiter, if you need an exact global limit rather than the current per-instance one.
3. Moderation on model output before it reaches the customer's visitors.

## API

Admin routes require `Authorization: Bearer <ADMIN_PASSWORD>`:

- `POST /api/admin/widgets` creates a widget from `name`, `systemPrompt`, `primaryColor`, `textColor`, optional `websiteUrl`, optional `openingMessage` (shown as the widget's first bubble; blank = none), optional `messageLimit` (omit/blank for unlimited).
- `GET /api/admin/widgets` lists every widget with usage (`messagesUsed`, `messageLimit`), estimated `costUsd` and `hoursSaved`, and `embedCode` — powers the dashboard's admin panel.
- `PATCH /api/admin/widgets/:id` updates any of the same fields (commonly `messageLimit`).
- `DELETE /api/admin/widgets/:id` removes a widget; its embed starts 404ing immediately.

Public routes, called by `widget.js` from customer sites:

- `GET /api/widgets/:id` returns the widget's visual configuration (name/colors), never the system prompt or usage data. Returns `403` if the widget has a `websiteUrl` set and the request's `Origin` doesn't match it.
- `POST /api/chat` accepts `{ widgetId, messages }`, returns `{ message }`. Returns `403` on an origin mismatch (see above), `402` once a widget's message limit is reached, and `429` past `CHAT_RATE_LIMIT_PER_MINUTE` requests/minute for that widget+IP.
- `GET /widget.js` serves the exact vanilla JavaScript IIFE used by the embed snippet.
- `GET /health` reports `{ ok, database }` — `database: false` means `DATABASE_URL` is missing.
