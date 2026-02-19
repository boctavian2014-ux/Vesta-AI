# Testare completă – Vesta / OpenHouse

## 1. Teste automate (backend + logică)

Rulează în rădăcina proiectului:

```powershell
cd c:\Users\octav\Vesta-AI
python tests_e2e.py
```

Testează **împotriva backend-ului local** (presupune că ai pornit `uvicorn main:app --port 8000`).

### Testare împotriva Railway

```powershell
$env:API_URL = "https://web-production-34c2a5.up.railway.app"
python tests_e2e.py
```

Verificări:
- Importuri (main, coordonate_la_referinta, catastro_ssl)
- `CATASTRO_URL` fără cratimă greșită (ovc.catastro, nu ovc.-catastro)
- Parsare XML cu `ET.fromstring` (nu `.json()`)
- Răspuns JSON cu `referinta` și `data`
- Handler global de excepții (returnează JSON)
- `api.js` citește text înainte de parse (evită „JSON Parse error”)
- **GET /** (health)
- **POST /identifica-imobil/** returnează JSON (nu XML)

---

## 2. Test rapid Catastro (local)

```powershell
python test_catastro_local.py
```

Verifică SSL + `coordonate_la_referinta` pentru coordonate din Málaga.

---

## 3. Testare manuală API (browser / PowerShell)

### Health
- Browser: https://web-production-34c2a5.up.railway.app/
- Așteptat: `{"message":"Serverul imobiliar este activ!"}`

### Identificare imobil (JSON)
- **PowerShell:**
  ```powershell
  Invoke-RestMethod -Uri "https://web-production-34c2a5.up.railway.app/identifica-imobil/" -Method Post -Body '{"lat":36.7212,"lon":-4.4212}' -ContentType "application/json"
  ```
- Așteptat: obiect cu `status`, `referinta`, `data` (ref_catastral, lat, lon, …). **Nu** răspuns care începe cu `<` (XML).

### Swagger
- https://web-production-34c2a5.up.railway.app/docs  
- Testează **POST /identifica-imobil/** cu `{"lat": 36.72, "lon": -4.42}`.

---

## 4. Testare app mobilă (Expo Go)

1. **Pornire**
   ```powershell
   cd openhouse-mobile
   npx expo start
   ```
2. Deschide pe telefon cu **Expo Go** (scan QR); același Wi‑Fi sau `--tunnel`.
3. **Config**: `config.js` → `API_BASE_URL` = URL Railway (implicit deja setat).

### Checklist în app
- [ ] Harta se încarcă (satelit, regiune Spania).
- [ ] Tap pe un punct **pe uscat în Spania** (ex. Málaga, Madrid).
- [ ] Apare „Se identifică imobilul…” apoi **marker** pe hartă (fără fereastră „Eroare”).
- [ ] Titlul markerului = referință cadastrală (ex. 2906701VG3807N0001AB).
- [ ] Buton „Detalii & Raport 19€” duce la ecranul de proprietate.
- [ ] **Nu** apare „JSON Parse error” sau „Unexpected character: I / <”.
- [ ] La punct în mare sau în afara Spaniei: mesaj de eroare clar (Catastro / 422), nu crash.

---

## 5. Rezumat ce a fost verificat (în acest repo)

| Componentă              | Verificat |
|-------------------------|-----------|
| `CATASTRO_URL`          | Fără ovc.-catastro |
| Răspuns Catastro        | XML parsat cu `ET.fromstring`, nu `.json()` |
| Răspuns către mobil     | Mereu JSON cu `referinta` + `data` |
| Erori server            | Handler global → JSON (nu HTML/text) |
| `api.js` la erori       | `r.text()` apoi `JSON.parse`; fallback text dacă nu e JSON |
| GET / (Railway)         | Returnează JSON health |

După orice modificare relevantă: rulează `python tests_e2e.py` (local sau cu `API_URL` Railway) și parcurge checklist-ul din secțiunea 4 în Expo Go.
