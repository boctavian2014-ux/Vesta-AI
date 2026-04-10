# Nota Simple — operational pipeline (expert package)

Official **Nota Simple** fields in the UI are **not** demo text: they must come from a real PDF processed through OCR/extraction on the Python API.

## Production paid flow (Python) vs Matil (Node)

- **Stripe → expert package (50€ tier)** — After `payment_intent.succeeded`, the **Python** API creates a `DetailedReport` and requests the official document via **`REGISTRO_PARTNER_ORDER_URL`**; the partner calls back **`POST /webhook/registru-update`** with the PDF, then Python runs OCR and the expert AI job. This path does **not** call Matil unless your Registro partner is implemented that way.
- **Matil** — Implemented on the **`web/`** Express app (`/api/nota-partner/*`, admin-triggered). It updates **`Report`** rows in the Node SQLite DB. It is **not** wired automatically to the same Stripe webhook as the Python `DetailedReport` flow unless you add an explicit integration.

## Admin upload → storage

1. Admin opens **Orders** and selects a Nota Simple order (`web/client` admin UI).
2. `POST /api/admin/reports/:id/upload-nota-simple` (multipart field `file`) — see [`web/server/routes.ts`](../server/routes.ts).
3. Server requires `VEST_PYTHON_API_URL` and forwards the PDF to Python:

   `POST {VEST_PYTHON_API_URL}/proceseaza-nota-simple/`

4. On **success**:
   - Response JSON is read; structured payload is taken from `extracted` if present, else the whole body.
   - `notaSimpleJson` on the report row is set to `JSON.stringify(extracted)`.
   - Status moves to `completed` and a client email may be sent (if SMTP is configured).

5. On **failure** (non-OK from Python or exception):
   - Status set to `failed_refundable` and status events record the failure reason.

## Internal sync (optional)

Python or other backends can push results without browser upload via `POST /api/internal/sync-registro-report` with header `X-Vesta-Internal-Secret` matching `VESTA_INTERNAL_SYNC_SECRET`. Body may include `nota_simple_json` and/or `report_json` / `report_json_string` to update the same SQLite fields.

## Partner API mode (Matil)

The server includes a Matil-specific adapter at `web/server/notaProvider.ts` plus endpoints:

- `POST /api/nota-partner/request` (creates Matil async entry)
- `POST /api/nota-partner/webhook` (handles Matil callback)
- `POST /api/nota-partner/:id/retry` (polls `GET /entries/{entry_id}`)

### Required configuration

- `MATIL_API_KEY`
- `MATIL_DEPLOYMENT_ID`
- `MATIL_WEBHOOK_SECRET`

### Optional configuration

- `MATIL_API_BASE` (default `https://api.matil.ai/v3`)
- `MATIL_TIMEOUT_MS` (default `20000`)
- `MATIL_PROVIDER_MOCK=true` (local testing only)

### Request mapping

`POST /api/nota-partner/request` expects report context and at least one source document:

- `documentUrl` (preferred), or
- `documentBase64` (+ optional `documentMimeType`)

The adapter calls Matil:

- `POST /deployments/{deployment_id}/async` with:
  - `documents`
  - `webhook.url`
  - `webhook.secret` (from `MATIL_WEBHOOK_SECRET`)
  - `metadata` (`report_id`, `referencia_catastral`, `address`)

### Webhook signature verification

Matil sends `X-Matil-Signature: t=...,v1=...`.

The server verifies:

- HMAC SHA256 over `"{timestamp}.{rawBody}"` using `MATIL_WEBHOOK_SECRET`
- 5-minute timestamp window

## UI consumption

[`web/client/src/pages/report-detail.tsx`](../client/src/pages/report-detail.tsx) parses `notaSimpleJson` and reads nested paths such as:

- `structured.owner.*`, `structured.property.*`, `structured.debts.*`, `structured.risk.*`
- Legacy flat fields: `titular`, `direccion`, `cargas`, `caducidad_cargas`, `embargo_caducado`, `manual_check`, etc.

The Python extractor should return objects compatible with these paths so the expert legal section fills without manual edits.
