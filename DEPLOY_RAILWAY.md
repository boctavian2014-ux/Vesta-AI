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

## 5. Tabele în DB

La primul deploy, tabelele se creează automat la pornirea aplicației (`database.py` apelează `Base.metadata.create_all`). Dacă ai adăugat coloane noi local (SQLite), rulează migrările sau adaugă manual coloanele în PostgreSQL.

## 6. App mobilă

În app mobilă **Vesta** (`openhouse-mobile/config.js` sau `.env` cu `EXPO_PUBLIC_API_URL`) setează:
`API_BASE_URL = "https://<domeniul-tau>.up.railway.app"`.

---

## 7. Verificare că ai făcut bine

- [ ] **Root Directory**: Serviciul API pe Railway trebuie să aibă **root = rădăcina repo-ului** (acolo unde sunt `main.py`, `requirements.txt`, `Procfile`). Dacă ai ales un subfolder greșit, în Settings → **Root Directory** lasă gol sau `.`.
- [ ] **Procfile** există în repo și conține: `web: uvicorn main:app --host 0.0.0.0 --port $PORT`. Railway îl citește automat; nu e obligatoriu să pui Start Command manual.
- [ ] **PostgreSQL**: În același proiect Railway ai un serviciu **PostgreSQL**. Serviciul tău (API) trebuie să aibă în **Variables** variabila **DATABASE_URL** (o poți lega din tab-ul Variables → „Add variable” → „Reference” din serviciul PostgreSQL).
- [ ] **PORT**: Nu seta manual `PORT`; Railway îl injectează. Procfile folosește `$PORT`.
- [ ] **Test**: După deploy, deschide în browser **URL-ul serviciului** (ex. `https://nume-serviciu.up.railway.app/`). Ar trebui să vezi: `{"message":"Serverul imobiliar este activ!"}`. Dacă vezi 404 sau pagină de eroare, verifică Root Directory și că build-ul a reușit (Deployments → ultimul deploy → View logs).
- [ ] **Docs API**: `https://<url-ul-tau>/docs` – ar trebui să se deschidă Swagger UI.
