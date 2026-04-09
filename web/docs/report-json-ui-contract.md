# `reportJson` — UI contract (`report-detail.tsx`)

The saved `reports.reportJson` string is parsed as a single JSON object (`fullReport`). The React page [`web/client/src/pages/report-detail.tsx`](../client/src/pages/report-detail.tsx) reads the following top-level keys. Missing sections are simply omitted from the layout.

## Sections consumed by the UI

| Key | Type | UI section |
|-----|------|------------|
| `executive_summary` | string | Executive summary paragraph |
| `risk` | object | Investment risk: `score`, `level`, `drivers[]` |
| `legal` | object | Legal: `summary`, `active_mortgages[]`, `encumbrances[]`, `red_flags[]` |
| `financials` | object | Market value range, rent, yield, ROI, price/m² fields, `valuation_confidence_score` |
| `urbanism` | object | `comment`, `registered_built_m2`, `estimated_built_m2`, `discrepancy_percent`, `suspected_illegal_works` |
| `neighborhood` | object | `pros[]`, `cons[]` |
| `zone_analysis` **or** `zoneAnalysis` | object | Zone analysis block (same shape; UI tries both) |

## `zone_analysis` / `zoneAnalysis` shape

Aligned with [`web/server/zoneAnalysisBuild.ts`](../server/zoneAnalysisBuild.ts) (and live `POST /api/zone/analysis`):

- `snapshot`: `city`, `district`, `market_price_per_m2`, `price_band` (`low` \| `mid` \| `high`), `tier`, optional `essentials_source` (`openstreetmap_overpass` \| `estimated_fallback`)
- `nearby_essentials`: `schools_nearby`, `hospitals_nearby`, `police_nearby`, `transit_stops_nearby`, `attractions_nearby` (numbers)
- `safety_liquidity`: `safety_score`, `liquidity_score`, `risk_level`, `summary`
- `poi_attractiveness`: `highlights[]`, `cautions[]` (strings)
- `final_opportunity`: `score`, `breakdown` (`pricing`, `services`, `safety`, `attractiveness`)

POI counts are **real** when `essentials_source === "openstreetmap_overpass"` (Overpass query). Otherwise they are **estimated fallback** (network disabled, timeout, or `VESTA_ZONE_OSM_DISABLE=1`).

## Python expert schema overlap

[`expert_report.py`](../../expert_report.py) defines `JSON_SCHEMA` for the expert AI payload: `meta`, `property`, `risk`, `legal`, `urbanism`, `financials`, `neighborhood`, `executive_summary`. That schema does **not** list `zone_analysis`; production pipelines should **merge** a zone object (same shape as above) into the final `reportJson` if the paid report should show zone data without a separate client call.

## End-to-end data flow (real chain)

1. **Cadastral / address** — `POST /api/property/identify` → Python `POST /identifica-imobil/`
2. **Financial** — `POST /api/property/financial-analysis` → Python `POST /financial-analysis`
3. **Async report body** — `POST /api/report/generate` → Python `POST /report/generate-async`; poll `GET /api/report/status/:jobId` until `reportJson` is stored
4. **Health** — `GET /api/health` includes `python.configured`, `python.reachable` (probe to `GET {VEST_PYTHON_API_URL}/version`)

Requires `VEST_PYTHON_API_URL` on the Node service (no trailing slash). See [`web/README.md`](../README.md).
