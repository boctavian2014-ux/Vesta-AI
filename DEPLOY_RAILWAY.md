# Deploy Backend pe Railway

**Pentru variante (inclusiv Supabase ca bază de date), vezi [DEPLOY.md](DEPLOY.md).**

**Proiecte:** Backend + frontend web = **OpenHouse Spain**; app mobilă = **Vesta** (consumă același API).

## 1. Railway

1. Conectează repo-ul Git (GitHub/GitLab) la Railway sau uploadează proiectul.
2. New Project → **Add PostgreSQL**. Notează variabila `DATABASE_URL` (o primești automat în Variables).
3. Add Service → din același repo, root = folderul cu `main.py` și `requirements.txt`.

## 2. Variabile de mediu (Railway → Service → Variables)

| Variabilă | Exemplu / Notă |
|-----------|-----------------|
| `DATABASE_URL` | Setat automat de PostgreSQL (postgres://...) |
| `STRIPE_SECRET_KEY` | sk_live_... sau sk_test_... |
| `STRIPE_WEBHOOK_SECRET` | whsec_... (după ce adaugi webhook-ul de producție) |
| `GOOGLE_MAPS_API_KEY` | Opțional, pentru analiza satelit |
| `CORS_ORIGINS` | Opțional: `https://site-ul-tau.vercel.app` (separate prin virgulă) |
| `PRET_NOTA_SIMPLE_EUR` | Opțional, implicit **19** — Nota Simple prin colaboratori oficiali (`tip`: `nota_simple` / `standard`). |
| `PRET_RAPORT_EXPERT_EUR` | Opțional, implicit **49** — pachet raport expert + AI (`tip`: `expert` / `premium` / `expert_report`). |
| `PUBLIC_API_BASE_URL` | URL public al acestui API (ex. `https://web-production-....up.railway.app`), fără slash final — folosit în `callback_url` trimis colaboratorilor. |
| `REGISTRO_PARTNER_ORDER_URL` | Opțional — URL complet `POST` unde se trimite comanda de Nota Simple (colaborator oficial). Dacă lipsește, serverul doar loghează (mod MVP). |
| `REGISTRO_PARTNER_API_KEY` | Opțional — `Authorization: Bearer …` la apelul către colaborator. |
| `REGISTRO_PARTNER_PROVIDER` | Opțional — `generic` (implicit) sau `unodata` (mapare webhook/payload în `registro_partner.py`). |
| `REGISTRO_PARTNER_WEBHOOK_SECRET` | Opțional — dacă e setat, `POST /webhook/registru-update` cere header `X-Vesta-Partner-Secret` sau `X-Registro-Partner-Secret` cu aceeași valoare. |
| `VESTA_WEB_INTERNAL_SYNC_URL` | Opțional — URL complet către app web, ex. `https://<vesta-web>.up.railway.app/api/internal/sync-registro-report` (actualizează raportul SQLite după NS / AI). |
| `VESTA_INTERNAL_SYNC_SECRET` | Opțional — același secret pe **Python** și pe **web**; trimis ca header `X-Vesta-Internal-Secret`. |
| `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASSWORD`, `SMTP_FROM`, `SMTP_TLS` | Opțional — notificări email la raport gata (`vesta_email.py`). Fără ele, se loghează doar în consolă. |
| `OPENAI_API_KEY` | Necesar pentru OCR Nota Simple (PDF din webhook colaborator sau `/proceseaza-nota-simple/`). |

## 3. Start Command

În Settings → Deploy → **Start Command**:
```bash
uvicorn main:app --host 0.0.0.0 --port $PORT
```
(Sau lasă Railway să citească **Procfile**: `web: uvicorn main:app --host 0.0.0.0 --port $PORT`.)

## 4. Stripe Webhook (producție)

În Stripe Dashboard → Webhooks → Add endpoint:
- URL: `https://<domeniul-tau>.up.railway.app/webhook/stripe`
- Evenimente: `checkout.session.completed`
- Copiază **Signing secret** și pune-l în Railway ca `STRIPE_WEBHOOK_SECRET`.

**App web (vesta-asset.com):** checkout-ul din hartă folosește **PaymentIntent** (`POST /creeaza-plata/` prin proxy). Este **obligatoriu** un endpoint care lovește **`/stripe-webhook/`** (nu doar `/webhook/stripe`):
- URL: `https://<vesta-api-public>.up.railway.app/stripe-webhook/`
- Eveniment: `payment_intent.succeeded`
- Signing secret → `STRIPE_WEBHOOK_SECRET` pentru acest endpoint (dacă ai și Checkout Session pe `/webhook/stripe`, poți folosi **două endpoint-uri Stripe** cu **două secrete** și două variabile în Railway, sau un singur endpoint care ascultă ambele evenimente, după cum ai configurat în Stripe).

Fără `payment_intent.succeeded` pe `/stripe-webhook/`, plata reușește în browser dar **nu** se creează `DetailedReport` și nu pornește comanda Nota Simple la colaborator.

## 5. Tabele în DB

La primul deploy, tabelele se creează automat la pornirea aplicației (`database.py` apelează `Base.metadata.create_all`). Dacă ai adăugat coloane noi local (SQLite), rulează migrările sau adaugă manual coloanele în PostgreSQL.

**PostgreSQL existent:** dacă tabelele există deja, poți rula (adaptat la dialect):

```sql
ALTER TABLE detailed_reports ADD COLUMN IF NOT EXISTS product_tier VARCHAR;
ALTER TABLE detailed_reports ADD COLUMN IF NOT EXISTS extras_json TEXT;
ALTER TABLE detailed_reports ADD COLUMN IF NOT EXISTS ai_job_id VARCHAR;
ALTER TABLE detailed_reports ADD COLUMN IF NOT EXISTS report_json TEXT;
ALTER TABLE detailed_reports ADD COLUMN IF NOT EXISTS nota_simple_json TEXT;

CREATE TABLE IF NOT EXISTS payment_contexts (
  id VARCHAR(40) PRIMARY KEY,
  payload_json TEXT NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

Tabela `payment_contexts` stochează JSON mare între `/creeaza-plata/` și `payment_intent.succeeded` (metadata Stripe e prea mică pentru `context_json`).

## 6. App mobilă

Nu mai există în acest repository. Orice client mobil nou trebuie să pointeze la același API FastAPI public (URL-ul serviciului **vesta-api** / `https://<...>.up.railway.app`) pentru rute precum `/identifica-imobil/`.

---

## 7. Verificare că ai făcut bine

- [ ] **Root Directory**: Serviciul API pe Railway trebuie să aibă **root = rădăcina repo-ului** (acolo unde sunt `main.py`, `requirements.txt`, `Procfile`). Dacă ai ales un subfolder greșit, în Settings → **Root Directory** lasă gol sau `.`.
- [ ] **Procfile** există în repo și conține: `web: uvicorn main:app --host 0.0.0.0 --port $PORT`. Railway îl citește automat; nu e obligatoriu să pui Start Command manual.
- [ ] **PostgreSQL**: În același proiect Railway ai un serviciu **PostgreSQL**. Serviciul tău (API) trebuie să aibă în **Variables** variabila **DATABASE_URL** (o poți lega din tab-ul Variables → „Add variable” → „Reference” din serviciul PostgreSQL).
- [ ] **PORT**: Nu seta manual `PORT`; Railway îl injectează. Procfile folosește `$PORT`.
- [ ] **Test**: După deploy, deschide în browser **URL-ul serviciului** (ex. `https://nume-serviciu.up.railway.app/`). Ar trebui să vezi: `{"message":"Serverul imobiliar este activ!"}`. Dacă vezi 404 sau pagină de eroare, verifică Root Directory și că build-ul a reușit (Deployments → ultimul deploy → View logs).
- [ ] **Docs API**: `https://<url-ul-tau>/docs` – ar trebui să se deschidă Swagger UI.

---

## 8. Testare la distanță (fără rulare locală)

**Site producție (app web + proxy Express):** [https://vesta-asset.com/](https://vesta-asset.com/)

Pe domeniul public, browserul folosește rutele **`/api/...`** (proxy către FastAPI). Cereri directe gen `POST /identifica-imobil/` pe același host pot întoarce **HTML** (SPA), nu JSON — folosește fie proxy-ul de mai jos, fie URL-ul **direct** al serviciului Python din Railway (cel setat în `VEST_PYTHON_API_URL`).

### În browser (app web)
- **Site**: https://vesta-asset.com/ → încarcă aplicația.
- **Proxy piață**: `GET https://vesta-asset.com/api/market-trend` → JSON.
- **Proxy identificare**: `POST https://vesta-asset.com/api/property/identify` cu body `{"lat":40.42056879131868,"lon":-3.705847207404546}` → JSON cu `referenciaCatastral` (dacă upstream răspunde).

### API Python direct (hostname Railway)

Înlocuiește `<PYTHON_RAILWAY_URL>` cu URL-ul public al serviciului **uvicorn** din Railway (fără slash final), din **Settings → Networking**.

**Health / Swagger (doar pe FastAPI):**
- `GET <PYTHON_RAILWAY_URL>/` → mesaj health JSON.
- `GET <PYTHON_RAILWAY_URL>/docs` → Swagger UI.

**Identificare imobil (Catastro) din terminal**

**PowerShell:**
```powershell
$url = "<PYTHON_RAILWAY_URL>/identifica-imobil/"
$body = '{"lat":36.7,"lon":-4.4}'
Invoke-RestMethod -Uri $url -Method Post -Body $body -ContentType "application/json"
```

**curl (bash / Git Bash / WSL):**
```bash
curl -X POST "<PYTHON_RAILWAY_URL>/identifica-imobil/" \
  -H "Content-Type: application/json" \
  -d '{"lat":36.7,"lon":-4.4}'
```

Dacă totul e OK, răspunsul conține `"status":"succes"` și `"data"` cu referința cadastrală (sau imobilul din cache). Dacă Catastro e indisponibil sau SSL eșuează, vei primi 422 cu detaliu în `detail`.

**Notă:** Coordonatele `36.7, -4.4` depind de disponibilitatea Catastro; pentru un punct de test mai stabil vezi `TESTARE.md` (ex. Madrid `40.42056879131868, -3.705847207404546`).

---

## 9. App web Vesta (`web/` pe Railway)

Serviciul **vesta-web** (React + Express) e separat de API-ul Python de mai sus.

### Variabile de mediu (build + runtime)

| Variabilă | Când | Rol |
|-----------|------|-----|
| `VITE_MAPBOX_TOKEN` | **Build** (`npm run build`) | Token public Mapbox; fără el, harta nu inițializează Mapbox GL în client. Setează în Railway → Variables **înainte** de deploy (Vite îl bake-uiește în bundle). |
| `VITE_STRIPE_PUBLISHABLE_KEY` | **Build** | **Obligatoriu pentru plată pe hartă** — cheia publică Stripe (`pk_live_…` / `pk_test_…`); aliniază-o cu `STRIPE_SECRET_KEY` de pe **vesta-api**. Fără ea, modalul „Order Nota Simple / expert” afișează eroare la pasul de plată. |
| `VITE_GOOGLE_MAPS_JS_API_KEY` | **Build** | Opțional dacă folosești modul străzi Google + Street View (vezi codul). |
| `VITE_PRET_NOTA_SIMPLE_EUR` | **Build** | Opțional — afișare preț Nota Simple în UI (implicit 19). Aliniază cu `PRET_NOTA_SIMPLE_EUR` pe API. |
| `VITE_PRET_RAPORT_EXPERT_EUR` | **Build** | Opțional — afișare preț raport expert (implicit 49). Aliniază cu `PRET_RAPORT_EXPERT_EUR` pe API. |
| `PORT` | Runtime | Railway injectează automat; nu forța alt port dacă platforma cere altul. |
| `DATABASE_URL` | Runtime | **Obligatoriu** — PostgreSQL pentru utilizatori, rapoarte, proprietăți salvate și **sesiuni** (`connect-pg-simple`, tabel `session`). Adaugă serviciu **PostgreSQL** în proiect (recomandat **separat** de baza folosită de `vesta-api`) și leagă `DATABASE_URL` din **Variables → Reference**. La pornire, `vesta-web` rulează migrările din `web/migrations/`. |
| `PG_POOL_MAX` | Runtime | Opțional — limită conexiuni în pool-ul `pg` (implicit **10**). |
| `SHUTDOWN_TIMEOUT_MS` | Runtime | Opțional — cât așteaptă `httpServer.close()` la **SIGTERM** / **SIGINT** înainte de `pool.end()` (implicit **10000** ms; util la redeploy Railway). |
| `SESSION_SECRET` | Runtime | **Obligatoriu** — secret puternic pentru semnarea cookie-ului de sesiune; serverul iese la start dacă lipsește sau e valoarea default de dev. |
| `VEST_PYTHON_API_URL` | Runtime | **Obligatoriu în producție** — URL public al serviciului FastAPI (`uvicorn`), fără slash final (ex. `https://<serviciu-api>.up.railway.app`). Site-ul public poate fi [vesta-asset.com](https://vesta-asset.com/), dar proxy-ul Express trebuie să lovească **hostname-ul Python**, nu domeniul SPA. Fără variabilă, rutele `/api/*` care proxy-uiesc Python răspund **503**. În dev local, serverul web folosește implicit `http://127.0.0.1:8000` dacă variabila lipsește. |
| `VESTA_INTERNAL_SYNC_SECRET` | Runtime | Același secret ca pe serviciul Python; protejează `POST /api/internal/sync-registro-report`. |

### Probleme frecvente (vesta-web)

- **`DATABASE_URL is required` / `FATAL: DATABASE_URL`**: pe serviciul **vesta-web** lipsește variabila. Adaugă un serviciu **PostgreSQL** în același proiect Railway, apoi la **vesta-web** → **Variables** → **+ New Variable** → **Reference** → alege Postgres → **`DATABASE_URL`**. Redeploy după salvare.
- **`ENOTFOUND` / host `base` / migrări Drizzle care pică la `CREATE SCHEMA`**: `DATABASE_URL` e **stricat** (host inexistent, de ex. literal `base`). Șterge variabila și adaug-o din nou cu **Reference** la serviciul **PostgreSQL** (nu alt serviciu), sau lipește URI-ul complet din tab-ul Postgres → **Connect** (private). Nu folosi fragmente de URL sau valori scrise manual incomplet.
- **`npm warn config production Use --omit=dev instead`**: apare când comanda de start e `npm start` (npm citește config-ul vechi). În repo, start-ul este **`NODE_ENV=production node dist/index.cjs`** (`web/railway.json`, `web/nixpacks.toml`). Fă deploy cu ultimul cod; dacă în Railway ai setat manual **Start Command**, înlocuiește-l cu aceeași comandă sau lasă gol ca să se folosească `railway.json`.

### Aliniere URL backend Python

Proxy-urile din `web/server/routes.ts` folosesc `VEST_PYTHON_API_URL` în producție; în dev, implicit `http://127.0.0.1:8000` dacă lipsește. Pe Railway, setează **întotdeauna** `VEST_PYTHON_API_URL`.

`VITE_API_URL` din `web/README.md` nu este folosit astăzi de serverul Express pentru proxy; sursa de adevăr pentru URL-ul backend este `routes.ts`.

### Smoke test după deploy (web)

- Cu domeniu propriu: `GET https://vesta-asset.com/api/market-trend` → 200, JSON.
- Sau: `GET https://<vesta-web>.up.railway.app/api/market-trend` → 200, JSON.
- `POST .../api/property/identify` cu body JSON `{"lat":40.42056879131868,"lon":-3.705847207404546}` → 200 și `referenciaCatastral` (dacă upstream răspunde).
- `POST .../api/property/financial-analysis` cu body-ul din `tests_e2e.py` (`property_data` + `market_data`) → 200 și câmpuri `gross_yield_pct`, etc. Poți trimite și **direct** payload-ul normalizat de la `/api/property/identify`: serverul Express (`buildFinancialAnalysisUpstreamBody` în `web/server/financialPayload.ts`) construiește `property_data` / `market_data` din suprafață, zonă (municipiu/provincie) și ipoteze de piață, sau poți suprascrie cu `listing_price`, `market_assumptions`, sau `property_data` / `market_data` parțiale.
