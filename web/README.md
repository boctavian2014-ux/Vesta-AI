# Vesta AI — Smart Real Estate Intelligence

AI-powered property analysis platform for Spanish real estate. Click any building on the map to get cadastral data, financial analysis, risk scoring, and full property reports.

---

## Features

- **Interactive 3D Map** — Satellite, Street-level 3D, and Dark mode via Mapbox GL
- **Building Identification** — Click any building to get the Referencia Catastral
- **Financial Analysis** — AI-generated market value, yield, ROI estimates
- **Full Property Reports** — Legal data, Nota Simplă, urbanism, neighborhood analysis
- **Stripe Payments** — 15€ analysis pack / 50€ expert report + Nota Simple (amounts from Python `PRET_*_EUR` / `VITE_*` must stay aligned)
- **Street View** — Embedded 360° street-level photos (no redirect)
- **Property search (AI agent)** — Chat at `#/property-search` uses OpenAI with **tools**: **Tavily** finds listing URLs on allowed Spanish portals (Idealista, Fotocasa, Habitaclia, Pisos, YaEncontre, Milanuncios). The search tool accepts **`asset_focus`** (residential, commercial, industrial, land, whole_building, renovation_opportunity, mixed) and **`recency`** (`any` / `day` / `week` / `month` / `year`) mapped to Tavily `time_range` for *últimos anuncios*-style queries; results may include approximate **`publishedAt`** from the search API. **Nominatim** geocoding and **listing-page metadata** fetch add optional **`listedBy`** (public advertiser from JSON-LD / meta — not the land-registry owner). Cards show disclaimers: web results are a **sample**, not the full market. **Open on map** / **Area on map (approx.)** use `#/map?lat=&lon=` with optional `area=1`. Requires `OPENAI_API_KEY`; **recommended** `TAVILY_API_KEY`. **Official auction portals** are not in the allowlist until `fetch_listing_page_metadata` is validated on those HTML layouts.

---

## Tech Stack

- **Frontend**: React + TypeScript + Vite + Tailwind CSS + shadcn/ui
- **Backend**: Express + TypeScript + Drizzle ORM + PostgreSQL (`DATABASE_URL`)
- **Map**: Mapbox GL JS v3 (loaded via CDN)
- **Payments**: Stripe (Payment Element on the map — `VITE_STRIPE_PUBLISHABLE_KEY` at build; payment hits Python via `POST /api/payment/create` → `creeaza-plata/`; Stripe webhook on the **Python** service is `/stripe-webhook/`). Users must be **signed in** to create a PaymentIntent.
- **AI Reports**: Custom Railway backend

---

## Setup

### 1. Clone the repo

```bash
git clone https://github.com/YOUR_USERNAME/vesta-ai.git
cd vesta-ai
```

### 2. Install dependencies

```bash
npm install
```

### 3. Configure environment variables

```bash
cp .env.example .env
```

Edit `.env` and fill in your values:

| Variable | Description |
|---|---|
| `VITE_MAPBOX_TOKEN` | Your Mapbox public token — get it at [account.mapbox.com](https://account.mapbox.com) |
| `VITE_API_URL` | (Opțional) Nu e folosit de proxy-ul Express; URL-ul API Python e în `server/routes.ts`. Poți folosi variabila doar dacă adaugi tu logică client-side către alt host. |
| `VEST_PYTHON_API_URL` | **Required in production** — FastAPI base URL (no trailing slash). Powers `/api/property/identify`, `/api/property/financial-analysis`, payments proxy, async report generation, and admin Nota Simple OCR. Without it, those routes return **503**. |
| `MATIL_API_KEY` | Matil API key used by partner Nota Simple async processing (`/api/nota-partner/*`). |
| `MATIL_DEPLOYMENT_ID` | Matil deployment UUID used for `POST /v3/deployments/{deployment_id}/async`. |
| `MATIL_WEBHOOK_SECRET` | Shared secret used to validate `X-Matil-Signature` webhook callbacks. |
| `VESTA_OVERPASS_URL` | (Optional) Overpass API endpoint for zone POI counts; default `https://overpass-api.de/api/interpreter`. |
| `VESTA_ZONE_OSM_DISABLE` | Set to `1` to skip Overpass calls (tests / offline); zone counts fall back to estimates. |
| `OPENAI_API_KEY` | **Required for property search chat** (`#/property-search`) — OpenAI API key; without it, `POST /api/spain-property-search/chat` returns **503**. The handler runs a short **agent loop** (tool calls) and returns JSON `{ reply, listings? }`. |
| `OPENAI_MODEL` | Optional — defaults to `gpt-4o-mini` (e.g. `gpt-4o` if you prefer). |
| `TAVILY_API_KEY` | **Recommended** — [Tavily](https://tavily.com) API key for `search_spain_property_links` (portal URLs by city/barrio, optional `asset_focus` + `recency` / `time_range`). Without it, pasted URLs and geocoding still work; the UI shows a configuration notice. |
| `GET /api/spain-property-search/status` | (Auth) Returns `{ openaiConfigured, searchConfigured }` — booleans only; never exposes secrets. |
| `DATABASE_URL` | **Required** — PostgreSQL connection string (e.g. Railway **Reference** from the Postgres service, or local `postgresql://user:pass@127.0.0.1:5432/vesta_web`). On startup the app runs SQL migrations from `web/migrations/`. Use a **separate** database from the Python API unless you know what you are doing. |
| `PG_POOL_MAX` | (Optional) Max connections in the web `pg` pool (default **10**). |
| `SHUTDOWN_TIMEOUT_MS` | (Optional) Max wait for in-flight HTTP requests to finish on **SIGTERM** / **SIGINT** before closing the DB pool (default **10000**). Relevant on Railway redeploys. |
| `SESSION_SECRET` | **Required in production** — strong random secret for Express session signing. The server **exits on startup** if `NODE_ENV=production` and this is missing or still set to the dev default. In development you may omit it (a built-in default is used). Sessions are stored in PostgreSQL via **connect-pg-simple** (table `session`), so logins survive deploys and work across multiple web replicas. |
| `PORT` | Server port (default: 5000) |

### 4. PostgreSQL (local)

Create a database and set `DATABASE_URL` before starting the server (migrations run automatically on boot).

Example with Docker:

```bash
docker run -d --name vesta-pg -e POSTGRES_PASSWORD=postgres -e POSTGRES_DB=vesta_web -p 5432:5432 postgres:16
```

Then set `DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:5432/vesta_web` in your environment or `.env`.

### 4b. Import legacy SQLite → PostgreSQL (optional)

If you still have an old `data.db` from the SQLite era (import uses **sql.js** / WASM — no native `better-sqlite3` build):

1. Apply Postgres schema first (run the app once against the empty DB, or `npm run db:push` with `DATABASE_URL` set).
2. From **`web/`**:

```bash
DATABASE_URL=postgresql://... npm run import:sqlite-to-pg -- --dry-run
DATABASE_URL=postgresql://... npm run import:sqlite-to-pg -- --sqlite=./data.db
```

Use **`--force`** only if the target DB already has rows and you accept possible unique-key conflicts (`on conflict (id) do nothing` does not update existing rows). For a clean overwrite, truncate tables manually (respect FK order) before import.

### 5. Run in development

```bash
npm run dev
```

### 6. Build for production

```bash
npm run build
NODE_ENV=production node dist/index.cjs
```

Run the process from the `web/` directory so `process.cwd()/migrations` resolves correctly.

---

## Environment Variables

Never commit `.env` to git. Use `.env.example` as a template.

```env
VITE_MAPBOX_TOKEN=pk.your_mapbox_token_here
VITE_API_URL=https://your-backend.up.railway.app
VEST_PYTHON_API_URL=https://your-fastapi.up.railway.app
DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:5432/vesta_web
SESSION_SECRET=change_me_in_production_use_long_random_string
MATIL_API_KEY=replace_with_matil_api_key
MATIL_DEPLOYMENT_ID=replace_with_matil_deployment_id
MATIL_WEBHOOK_SECRET=replace_with_matil_webhook_secret
OPENAI_API_KEY=your_openai_api_key_here
OPENAI_MODEL=gpt-4o-mini
PORT=5000
NODE_ENV=development
```

### Health check

`GET /api/health` returns `{ ok, service, python }` where `python` includes `configured`, `reachable` (probe to `{VEST_PYTHON_API_URL}/version`), and `error` / `version` when available. Use this after deploy to confirm the Python service is wired.

### Report & Nota Simple docs

- [reportJson UI contract](docs/report-json-ui-contract.md) — keys expected by the report page and zone analysis shape.
- [Nota Simple pipeline](docs/nota-simple-pipeline.md) — PDF upload, OCR, and `notaSimpleJson`.

---

## Backend API (Railway)

| Endpoint | Method | Description |
|---|---|---|
| `/identifica-imobil/` | POST | Identify building by coordinates → Referencia Catastral |
| `/creeaza-plata/` | POST | Create Stripe PaymentIntent |
| `/report/generate-async` | POST | Generate AI report (async) |
| `/report/async-status/:id` | GET | Poll report generation status |
| `/financial-analysis` | POST | Financial analysis for a property |

---

## License

Private — All rights reserved.
