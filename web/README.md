# Vesta AI — Smart Real Estate Intelligence

AI-powered property analysis platform for Spanish real estate. Click any building on the map to get cadastral data, financial analysis, risk scoring, and full property reports.

---

## Features

- **Interactive 3D Map** — Satellite, Street-level 3D, and Dark mode via Mapbox GL
- **Building Identification** — Click any building to get the Referencia Catastral
- **Financial Analysis** — AI-generated market value, yield, ROI estimates
- **Full Property Reports** — Legal data, Nota Simplă, urbanism, neighborhood analysis
- **Stripe Payments** — 19€ Basic / 49.99€ Full Report with Nota Simplă
- **Street View** — Embedded 360° street-level photos (no redirect)

---

## Tech Stack

- **Frontend**: React + TypeScript + Vite + Tailwind CSS + shadcn/ui
- **Backend**: Express + TypeScript + Drizzle ORM + SQLite
- **Map**: Mapbox GL JS v3 (loaded via CDN)
- **Payments**: Stripe (Payment Element pe hartă — `VITE_STRIPE_PUBLISHABLE_KEY` la build; confirmarea plății declanșează `payment_intent.succeeded` pe API la `/stripe-webhook/`)
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
| `VESTA_OVERPASS_URL` | (Optional) Overpass API endpoint for zone POI counts; default `https://overpass-api.de/api/interpreter`. |
| `VESTA_ZONE_OSM_DISABLE` | Set to `1` to skip Overpass calls (tests / offline); zone counts fall back to estimates. |
| `PORT` | Server port (default: 5000) |

### 4. Run in development

```bash
npm run dev
```

### 5. Build for production

```bash
npm run build
NODE_ENV=production node dist/index.cjs
```

---

## Environment Variables

Never commit `.env` to git. Use `.env.example` as a template.

```env
VITE_MAPBOX_TOKEN=pk.your_mapbox_token_here
VITE_API_URL=https://your-backend.up.railway.app
VEST_PYTHON_API_URL=https://your-fastapi.up.railway.app
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
