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

- `server/` stores widget configurations in memory, serves the widget bundle, and owns the LLM API key.
- `dashboard/` is the React + Tailwind factory UI.
- `server/public/widget.js` is a dependency-free IIFE. It uses a Shadow DOM when available and inline styles as a fallback.

## Run locally

Requirements: Node.js 20+.

```bash
npm install
cp server/.env.example server/.env
npm run dev
```

Open `http://localhost:5173`. The dashboard proxies API requests to `http://localhost:3001`.

Set `OPENAI_API_KEY` in `server/.env`. The key never appears in a generated snippet or in browser code. `OPENAI_BASE_URL` may point at any OpenAI-compatible endpoint.

## Production shape

1. Replace the in-memory `Map` in `server/src/index.js` with Postgres, Redis, or another durable store.
2. Put the API and `/widget.js` behind HTTPS and a CDN; set `PUBLIC_BASE_URL` to that public origin.
3. Add authentication and authorization around widget creation and configuration reads.
4. Add rate limiting, request size limits, usage metering, moderation, and an origin allowlist before exposing `/api/chat` publicly.
5. Keep `OPENAI_API_KEY` server-side. The browser only receives the widget's visual configuration and talks to your `/api/chat` route.

## API

- `POST /api/widgets` creates a widget from `name`, `systemPrompt`, `primaryColor`, and `textColor`.
- `GET /api/widgets/:id` returns the public configuration.
- `POST /api/chat` accepts `{ widgetId, messages }` and returns `{ message }`.
- `GET /widget.js` serves the exact vanilla JavaScript IIFE used by the embed snippet.