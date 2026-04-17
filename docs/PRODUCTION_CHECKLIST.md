# Vesta AI — checklist lansare producție

Folosește acest document înainte de primul deploy live sau după schimbări majore (Stripe, domeniu, DB). Detalii despre variabile: [`web/README.md`](../web/README.md), deploy Python: [`DEPLOY_RAILWAY.md`](../DEPLOY_RAILWAY.md).

---

## Serviciu web (Node / Express în `web/`)

| # | Verificare | Cum verifici |
|---|-------------|--------------|
| 1 | `NODE_ENV=production` pe serviciul care servește SPA + API | Variabile platformă |
| 2 | `DATABASE_URL` PostgreSQL valid (preferabil DB dedicat app-ului web) | Boot: serverul loghează host/db fără parolă; eșec → exit |
| 3 | `SESSION_SECRET` aleator, lung, **nu** valoarea implicită de dev | Boot: lipsă/incorect în prod → **exit** |
| 4 | `VEST_PYTHON_API_URL` = URL public FastAPI (fără `/` final) | După boot: `/api/property/*` fără Python → 503 |
| 5 | `VESTA_WEB_BASE_URL` = URL public al site-ului (redirect checkout etc.) | Test flux checkout |
| 6 | `PORT` lăsat la platformă (ex. Railway injectează) | Nu seta manual dacă platforma cere altfel |
| 7 | `trust proxy` activ în producție (deja în cod) | HTTPS + cookie `secure` |

### Opțional dar recomandat (web)

| # | Variabilă / setare | Rol |
|---|---------------------|-----|
| 8 | `VESTA_STRICT_STARTUP=1` | La boot: **oprește procesul** dacă `VEST_PYTHON_API_URL` lipsește (evită deploy „orb”) |
| 9 | `VESTA_CSP_REPORT_ONLY=1` | CSP report-only pentru a colecta încălcări înainte de enforce |
| 10 | `ADMIN_EMAILS` sau `ADMIN_EMAIL` | Conturi marcate admin (virgulă = listă) |
| 11 | Rate limits `VESTA_RL_*` | Ajustare după trafic real (vezi README) |

---

## Build client (Vite) — setate **la build**, nu la runtime pe server

| # | Verificare |
|---|-------------|
| 12 | `VITE_STRIPE_PUBLISHABLE_KEY` (live `pk_live_…` în producție) |
| 13 | `VITE_GOOGLE_MAPS_JS_API_KEY` sau `VITE_GOOGLE_MAPS_EMBED_KEY` / `VITE_GOOGLE_MAPS_API_KEY` |
| 14 | `VITE_PRET_ANALYSIS_PACK_EUR` / `VITE_PRET_*_EXPERT_*` aliniate cu prețurile din API Python (`PRET_*`) |
| 15 | Restricții API Google Maps pe domeniul de producție |

---

## API Python (FastAPI) — serviciu separat

| # | Verificare |
|---|-------------|
| 16 | `DATABASE_URL` (sau echivalent) pentru Python, migrări/tabele |
| 17 | `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET` — webhook **`payment_intent.succeeded`** pe ruta documentată (ex. `/stripe-webhook/`) |
| 18 | `CORS_ORIGINS` include domeniul web dacă browserul apelează direct Python |
| 19 | Variabile Nota Simple / colaborator (`REGISTRO_*`, `MATIL_*`) dacă folosești fluxul |

---

## Funcționalități condiționate de chei

| Feature | Variabile | Dacă lipsesc |
|---------|-----------|--------------|
| Căutare proprietăți AI | `OPENAI_API_KEY`; recomandat `TAVILY_API_KEY` | Chat 503 / căutare limitată |
| Zone OSM | `VESTA_OVERPASS_URL` opțional; `VESTA_ZONE_OSM_DISABLE=1` pentru fallback | Documentat în README |
| Email | `SMTP_HOST`, `SMTP_PORT`, … | Doar log, fără mail |
| Partner Nota | `MATIL_API_KEY`, `MATIL_DEPLOYMENT_ID`, webhook secret | Flux partner indisponibil |

---

## După deploy

| # | Acțiune |
|---|---------|
| 20 | Smoke: login, hartă, identificare punct, plată test mică (mod test Stripe) |
| 21 | Verifică loguri pentru `[vesta-web]` și `X-Request-Id` la o eroare 5xx |
| 22 | `npm audit` în `web/`; `npm run check` înainte de merge pe `main` |
| 23 | Health: confirmă politica platformei (restart, healthcheck URL) |

---

## Script de verificare la startup

Cu `NODE_ENV=production`, serverul rulează **`runProductionStartupChecks()`** din `web/server/envProductionCheck.ts`:

- **Avertismente (WARN)** în consolă dacă lipsesc: `VEST_PYTHON_API_URL`, `OPENAI_API_KEY`, `TAVILY_API_KEY`, `SMTP_HOST`, pereche incompletă `MATIL_API_KEY` / `MATIL_DEPLOYMENT_ID`, admin fără email configurat.
- **Oprire forțată (FATAL)**: setează `VESTA_STRICT_STARTUP=1` (sau `true` / `yes`) **și** lasă `VEST_PYTHON_API_URL` gol — procesul iese la boot (util pe Railway ca să nu lași serviciul „verde” dar nefuncțional).

`SESSION_SECRET` și `DATABASE_URL` rămân validate ca înainte (exit în `routes.ts` / `db.ts`).
