# OpenHouse Spain – Frontend

Next.js + Mapbox: hartă satelit + sidebar cu detalii și plată Stripe.

## Setup

1. Copiază variabilele de mediu:
   ```bash
   cp .env.local.example .env.local
   ```
2. Adaugă în `.env.local`:
   - `NEXT_PUBLIC_MAPBOX_TOKEN` – de la [Mapbox Access Tokens](https://account.mapbox.com/access-tokens/)
   - `NEXT_PUBLIC_API_URL` – de ex. `http://localhost:8000`

3. Instalare și rulare:
   ```bash
   npm install
   npm run dev
   ```
4. Deschide [http://localhost:3000](http://localhost:3000).

## Backend

Rulează API-ul FastAPI în același timp (din rădăcina proiectului):
```bash
uvicorn main:app --reload
```

## Flux

- Click pe hartă → `POST /identifica-imobil/` → afișare ref. cadastrală și detalii în sidebar.
- Email + „Cumpără raport” → `POST /ensure-guest` → `POST /create-checkout-session` → redirect la Stripe Checkout.
