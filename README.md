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

### Persistence

Widgets are stored in a `widgets` Postgres table (created automatically on first use) and survive redeploys and cold starts. If you were previously relying on `SEED_WIDGET_*` env vars as a stopgap before this table existed, keep them set for one more deploy — `server/src/app.js` will insert that widget into Postgres the first time an admin route runs, then it lives there permanently and the env vars are no longer read after that. Optional `SEED_WIDGET_MESSAGE_LIMIT` sets its initial limit.

```bash
SEED_WIDGET_ID=ad79af17-756c-411c-a324-63dbfcec6158
SEED_WIDGET_NAME="Swift Agencies Concierge"
SEED_WIDGET_SYSTEM_PROMPT="You are the concierge for Swift Agencies..."
SEED_WIDGET_PRIMARY_COLOR=#D95D39
SEED_WIDGET_TEXT_COLOR=#FFFFFF
SEED_WIDGET_WEBSITE_URL=https://swift-delta-one.vercel.app
SEED_WIDGET_PROVIDER=anthropic
SEED_WIDGET_MESSAGE_LIMIT=2000
```

### Admin panel

The dashboard at your Production domain is a password gate first (enter `ADMIN_PASSWORD`), then the widget-creation form and a list of every widget with:

- messages used vs. its message limit (blank/unlimited if not set)
- an inline field to change that limit at any time
- a copy-embed button (re-copy a customer's script tag without recreating their widget)
- delete (immediately breaks that widget's embed — customer sites calling it will get a 404)

The password is kept in `sessionStorage` only (cleared when the tab closes); there is no per-admin-user login, just the one shared password. Good enough for one operator; add real auth (e.g. per-user accounts) before handing dashboard access to a team.

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
ANTHROPIC_MODEL=claude-3-5-sonnet-latest
```

## Production shape

Done: Postgres persistence, a password-gated admin panel, and per-widget message limits.

Still worth adding before scaling past a handful of customers:

1. Per-admin-user accounts instead of one shared password, if more than one person manages widgets.
2. Rate limiting and request size limits on `/api/chat` (message length and conversation length are already capped) and an origin allowlist keyed to each widget's `websiteUrl`, so a widget only answers requests referred from the site it was made for.
3. Usage-based alerts (e.g. email at 80% of a widget's message limit) rather than only a hard cutoff at 100%.
4. Moderation on model output before it reaches the customer's visitors.

## API

Admin routes require `Authorization: Bearer <ADMIN_PASSWORD>`:

- `POST /api/admin/widgets` creates a widget from `name`, `systemPrompt`, `primaryColor`, `textColor`, optional `websiteUrl`, optional `openingMessage` (shown as the widget's first bubble; blank = none), optional `messageLimit` (omit/blank for unlimited).
- `GET /api/admin/widgets` lists every widget with usage (`messagesUsed`, `messageLimit`) and `embedCode` — powers the dashboard's admin panel.
- `PATCH /api/admin/widgets/:id` updates any of the same fields (commonly `messageLimit`).
- `DELETE /api/admin/widgets/:id` removes a widget; its embed starts 404ing immediately.

Public routes, called by `widget.js` from customer sites:

- `GET /api/widgets/:id` returns the widget's visual configuration (name/colors), never the system prompt or usage data.
- `POST /api/chat` accepts `{ widgetId, messages }`, returns `{ message }`, and returns `402` once a widget's message limit is reached.
- `GET /widget.js` serves the exact vanilla JavaScript IIFE used by the embed snippet.
- `GET /health` reports `{ ok, database }` — `database: false` means `DATABASE_URL` is missing.
