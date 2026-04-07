# Vesta – App mobilă (Expo)

App nativă pentru identificare imobile și comandă raport Nota Simple. Consumă API-ul **OpenHouse Spain** (backend pe Railway).

## Setup

1. Instalare dependențe:
   ```bash
   cd openhouse-mobile
   npm install
   ```

2. URL API (FastAPI direct, același host ca `VEST_PYTHON_API_URL` pe web): setează variabila pentru build-uri de producție; în dev, dacă lipsește, se folosește `http://127.0.0.1:8000`.
   ```bash
   set EXPO_PUBLIC_API_URL=https://<serviciu-python>.up.railway.app
   ```
   Nu folosi domeniul SPA (ex. vesta-asset.com) dacă `/identifica-imobil/` nu e proxied către Python pe același host.

3. Asseturi: dacă lipsește `assets/icon.png` sau `assets/splash-icon.png`, copiază din orice template Expo sau rulează:
   ```bash
   npx create-expo-app@latest _temp --template blank
   copy _temp\assets\* assets\
   ```
   Apoi șterge `_temp`.

4. Pornire:
   ```bash
   npx expo start
   ```
   Scanează QR cu Expo Go (Android/iOS) sau rulează pe emulator.

## Flux

- **Hartă**: tap pe hartă → `POST /identifica-imobil/` → marker + buton „Detalii & Raport”.
- **Detalii**: ecran cu ref. cadastrală, scor, email, buton „Cumpără raport 19€” → deschide Stripe Checkout în browser.
- **Success**: după plată, deep link `vesta://success` (scheme în app.json) → ecran Success + link „Verifică status raport”.
- **Status**: introduci request_id → `GET /status-raport/{request_id}` → afișare status + link PDF.

## Deep link (Success după Stripe)

În Stripe Checkout, la crearea sesiunii, folosește `success_url` generat cu `Linking.createURL("success")` (Expo). Pentru production, configurează în Stripe un URL de tip `vesta://success` sau un universal link către app.
