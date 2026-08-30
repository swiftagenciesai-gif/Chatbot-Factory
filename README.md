# AI Chatbot Widget Factory

A small full-stack factory for creating embeddable AI chat widgets.

## Architecture

```text
React dashboard -> Express API (/api/widgets, /api/chat)
						 |              |
						 |              +-> OpenAI-compatible LLM API
						 +-> hosted /widget.js

Customer site <- generated <script data-widget-id="..." src=".../widget.js">
```

- `server/src/app.js` builds the Express app (widget configs in memory, serves the widget bundle, owns the LLM API key). `server/src/index.js` runs it as a long-lived process for local dev; `api/index.js` re-exports the same app as a Vercel serverless function, so a single `vercel.json` deploy ships both the dashboard and the API together.
- `dashboard/` is the React + Tailwind factory UI, including a lightweight admin panel that lists widgets currently held in server memory.
- `server/public/widget.js` is a dependency-free IIFE. It uses a Shadow DOM when available and inline styles as a fallback.

## Deploying to Vercel

`vercel.json` builds the dashboard as a static site and rewrites `/widget.js`, `/health`, and `/api/*` to the `api/index.js` serverless function, so one Vercel project serves everything. After connecting this repo to Vercel:

1. Set `PUBLIC_BASE_URL` in the project's Environment Variables to the project's stable Production domain (Project -> Domains -> the entry with no random hash, e.g. `https://your-project.vercel.app`, or a custom domain). Without it, generated embed snippets fall back to `http://localhost:3001`, which does not work from a real website.
2. Set `OPENAI_API_KEY` or (`LLM_PROVIDER=anthropic` and `ANTHROPIC_API_KEY`) so `/api/chat` can actually reach a model.
3. Optionally set `SEED_WIDGET_*` (see below) to pin one widget to a fixed id that survives redeploys.
4. Redeploy after changing environment variables — Vercel does not apply them to already-built deployments.

### Widgets disappearing after a redeploy

Widget configs live only in the in-memory `Map` in `server/src/app.js`. Every Vercel redeploy (and every serverless cold start) starts that Map empty again, so a widget id created through the dashboard can stop resolving (`GET /api/widgets/:id` returns 404) at any time. There is no database yet — see "Production shape" below for the real fix.

As a stopgap, `server/src/app.js` seeds one fixed widget from environment variables at startup, so at least one embed keeps working across restarts without a database:

```bash
SEED_WIDGET_ID=ad79af17-756c-411c-a324-63dbfcec6158
SEED_WIDGET_NAME="Swift Agencies Concierge"
SEED_WIDGET_SYSTEM_PROMPT="You are the concierge for Swift Agencies..."
SEED_WIDGET_PRIMARY_COLOR=#D95D39
SEED_WIDGET_TEXT_COLOR=#FFFFFF
SEED_WIDGET_WEBSITE_URL=https://swift-delta-one.vercel.app
SEED_WIDGET_PROVIDER=anthropic
```

Set these in the Vercel project's Environment Variables (not just `.env` locally) so the seed applies in production too.

## Run locally

Requirements: Node.js 20+.

```bash
npm install
cp server/.env.example server/.env
npm run dev
```

Open `http://localhost:5173`. The dashboard proxies API requests to `http://localhost:3001`.

Set the LLM credentials in `server/.env`. The key never appears in a generated snippet or in browser code.

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

1. Replace the in-memory `Map` in `server/src/app.js` with Postgres, Redis, or another durable store — this removes the need for the `SEED_WIDGET_*` stopgap above and lets the admin panel list widgets reliably across restarts.
2. Put the API and `/widget.js` behind HTTPS and a CDN; set `PUBLIC_BASE_URL` to that public origin.
3. Add authentication and authorization around widget creation and configuration reads (the admin panel currently has none).
4. Add rate limiting, request size limits, usage metering, moderation, and an origin allowlist before exposing `/api/chat` publicly.
5. Keep `OPENAI_API_KEY` server-side. The browser only receives the widget's visual configuration and talks to your `/api/chat` route.

## API

- `POST /api/widgets` creates a widget from `name`, `systemPrompt`, `primaryColor`, `textColor`, and optional `websiteUrl`.
- `GET /api/widgets` lists widgets currently in memory (id, name, websiteUrl, createdAt, embedCode) — powers the dashboard's admin panel.
- `GET /api/widgets/:id` returns the public configuration.
- `POST /api/chat` accepts `{ widgetId, messages }` and returns `{ message }`.
- `GET /widget.js` serves the exact vanilla JavaScript IIFE used by the embed snippet.