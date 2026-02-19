# Deploy backend (fără rulat local)

Ai două variante: **totul pe Railway** sau **Supabase (baza de date) + Railway/Render (API)**.

---

## Varianta 1: Totul pe Railway (cel mai simplu)

**Un singur loc:** baza de date PostgreSQL + API-ul FastAPI.

1. **Railway** → [railway.app](https://railway.app) → Login (GitHub).
2. **New Project** → **Add PostgreSQL** (o să primești automat `DATABASE_URL`).
3. **Add Service** → **GitHub Repo** → alege repo-ul Vesta-AI, root = folderul unde e `main.py` și `requirements.txt`.
4. **Variables** (pentru serviciul API):  
   - `DATABASE_URL` – deja setat de PostgreSQL.  
   - Opțional: `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `CORS_ORIGINS`.
5. **Settings** → **Deploy** → Start Command:  
   `uvicorn main:app --host 0.0.0.0 --port $PORT`  
   (sau folosește **Procfile**: `web: uvicorn main:app --host 0.0.0.0 --port $PORT`.)
6. După deploy, notează **URL-ul** (ex. `https://vesta-api.up.railway.app`).
7. În **openhouse-mobile**: setează `EXPO_PUBLIC_API_URL=https://vesta-api.up.railway.app` (sau în **config.js** / build).

Tabelele se creează la prima pornire (`database.py` → `create_all`).

---

## Varianta 2: Supabase (baza de date) + Railway sau Render (API)

**Supabase** = PostgreSQL găzduit + interfață. **Railway** sau **Render** = unde rulează FastAPI.

### Pas 1: Supabase – baza de date

1. **Supabase** → [supabase.com](https://supabase.com) → New project (regiune aproape de tine).
2. După creare: **Project Settings** (roata) → **Database**.
3. Copiază **Connection string**:
   - **URI** (recomandat pentru API-ul tău): folosește **“Transaction”** (pooler, port **6543**) dacă îl oferă, sau **“Session”**.
   - Exemplu:  
     `postgres://postgres.[PROJECT-REF]:[PAROLA]@aws-0-[region].pooler.supabase.com:6543/postgres`  
   - Sau conexiune directă:  
     `postgresql://postgres:[PAROLA]@db.[PROJECT-REF].supabase.co:5432/postgres`
4. Înlocuiește `[YOUR-PASSWORD]` cu parola din Database settings.  
   Salvează acest string – îl vei pune în **Railway/Render** ca `DATABASE_URL`.

Backend-ul este deja configurat pentru Supabase: folosește SSL și pooler (vezi `database.py`).

### Pas 2: Railway sau Render – API FastAPI

**Pe Railway**

1. **New Project** → **Add Service** → din repo (root = folderul cu `main.py`).
2. **Variables**:
   - `DATABASE_URL` = **connection string-ul de la Supabase** (pasul 1).
   - Opțional: `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `CORS_ORIGINS`.
3. **Start Command:**  
   `uvicorn main:app --host 0.0.0.0 --port $PORT`
4. Deploy → notează URL-ul (ex. `https://vesta-api.up.railway.app`).

**Pe Render** (alternativă)

1. **Dashboard** → **New** → **Web Service** → conectează repo-ul.
2. **Root Directory**: folderul cu `main.py`.
3. **Build:** `pip install -r requirements.txt`
4. **Start:** `uvicorn main:app --host 0.0.0.0 --port $PORT`
5. **Environment** → **Add**:
   - `DATABASE_URL` = connection string Supabase.
   - Opțional: Stripe, `CORS_ORIGINS`.
6. Deploy → notează URL-ul (ex. `https://vesta-api.onrender.com`).

### Pas 3: App mobilă

În **openhouse-mobile** setezi URL-ul API-ului (Railway sau Render):

- Build / env: `EXPO_PUBLIC_API_URL=https://vesta-api.up.railway.app`  
  (sau `https://vesta-api.onrender.com`).

---

## Rezumat

| Variantă | DB | API | Când o alegi |
|----------|----|-----|----------------|
| **1. Railway** | PostgreSQL Railway | FastAPI pe Railway | Un singur provider, setup rapid. |
| **2. Supabase + Railway/Render** | PostgreSQL Supabase | FastAPI pe Railway sau Render | Vrei Supabase (Dashboard, Auth ulterior, etc.) și API separat. |

În ambele variante **nu mai rulezi nimic local**: DB și API sunt în cloud; app-ul mobil doar schimbă `EXPO_PUBLIC_API_URL` la URL-ul tău de producție.
