# Testare completă – Vesta / OpenHouse

## 0. Environment-uri Railway / server (producție)

Pe Railway sau pe serverul de producție setează:

| Variabilă | Valoare | Descriere |
|-----------|---------|-----------|
| `ENV` | `prod` | Obligatoriu în prod; fără el fallback-ul SSL (verify=False) este permis. |
| `CATASTRO_CA_BUNDLE` | `/app/certs/fnmt_root.pem` | Calea către certificatul rădăcină FNMT (sau unde ai copiat `fnmt_root.pem`). |

**Fișierul PEM în Railway:**

- **Verifică dacă `fnmt_root.pem` este în `.gitignore`.** Dacă **este** în .gitignore, trebuie să îl adaugi **manual în imaginea de Docker** (ex. `COPY fnmt_root.pem /app/certs/` din un folder local unde îl păstrezi) sau să îl incluzi în repository **doar dacă politica de securitate a proiectului o permite** (certificatul rădăcină FNMT este public). Fără el, backend-ul va returna în producție: `CRITICAL: fnmt_root.pem lipsește în PROD...`.
- Dacă **nu** este în .gitignore, poți comita fișierul (sau îl copiezi în image la build).
- În Docker: exemplu Dockerfile:
  ```dockerfile
  RUN mkdir -p /app/certs
  COPY fnmt_root.pem /app/certs/fnmt_root.pem
  ```
- Pe Railway (Nixpacks): pune `fnmt_root.pem` în rădăcina proiectului (sau asigură-te că este copiat în image) și setează `CATASTRO_CA_BUNDLE` la calea corespunzătoare (ex. `/app/fnmt_root.pem` sau `./fnmt_root.pem`).

Fără `fnmt_root.pem` valid în **prod**, la primul request Catastro aplicația aruncă:  
`RuntimeError: CRITICAL: fnmt_root.pem lipsește în PROD. Verifică CATASTRO_CA_BUNDLE sau prezența fișierului în /app.`

### Checklist pentru Deploy (Railway)

- [ ] **Fișier PEM:** `fnmt_root.pem` este în rădăcina proiectului (lângă `main.py`) sau în folderul specificat de `CATASTRO_CA_BUNDLE`.
- [ ] **Variabile de mediu** (panoul Railway):
  - `ENV` = `prod`
  - `CATASTRO_CA_BUNDLE` = `/app/fnmt_root.pem` (sau calea unde Docker/image pune fișierul).
- [ ] **Testare automată înainte de push-ul final** (rulează local):
  - `python test_catastro_local.py` — validează **catastro_ssl.py** și conexiunea la Catastro; așteptat: **OK Request SSL 200** (și OK Referință cadastrală dacă ai cert).
  - `python tests_e2e.py` — validează **întreg fluxul identifica-imobil** (importuri, CATASTRO_URL, parsare XML, GET /, POST /identifica-imobil/, handler erori). Pornește întâi `uvicorn main:app --port 8000` sau setează `API_URL` pentru Railway.

**Timeout-uri:** Sunt setate 15s pentru Consulta_RCCOOR (coordonate) și 10s pentru Consulta_DNPRC (date detaliate). Acestea sunt valori potrivite pentru API-urile guvernamentale spaniole, care pot răspunde lent în orele de vârf.

**De ce dispare „Hostname mismatch”:** `get_catastro_session()` (din `catastro_ssl.py`) injectează contextul SSL corect (sistem + fnmt_root.pem), astfel că certificatul emis de FNMT pentru domeniul Catastro este recunoscut. În producție nu se folosește `verify=False`; toate cererile trec prin sesiunea securizată.

---

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

### Rulează testele în mediul de producție (sau image identică)

**Test local cu politici prod (necesită `fnmt_root.pem`):**

```powershell
$env:ENV = "prod"
python test_catastro_local.py
```

Așteptat: `[OK] Request SSL: 200` și `[OK] Referință cadastrală: ...`. Dacă `fnmt_root.pem` lipsește, așteptat: `RuntimeError: Catastro SSL misconfigured...`.

**Test e2e împotriva API-ului de producție:**

```powershell
$env:ENV = "prod"
$env:API_URL = "https://<railway-url>"
python tests_e2e.py
```

Toate testele (inclusiv pentru `/identifica-imobil`) ar trebui să fie verzi.

---

## 3. Testare manuală API (browser / PowerShell)

### Deploy pe Railway și verificare manuală

1. **Health**
   - Browser: `https://<railway-url>/`
   - Așteptat: `{"message":"Serverul imobiliar este activ!"}` (sau mesajul de health configurat).

2. **Identificare imobil (JSON) – fără erori SSL în logs**
   - **PowerShell (Málaga):**
     ```powershell
     Invoke-RestMethod -Uri "https://<railway-url>/identifica-imobil/" -Method Post -Body '{"lat":36.7212,"lon":-4.4212}' -ContentType "application/json"
     ```
   - **PowerShell (Madrid):**
     ```powershell
     Invoke-RestMethod -Uri "https://<railway-url>/identifica-imobil/" -Method Post -Body '{"lat":40.4167,"lon":-3.7037}' -ContentType "application/json"
     ```
   - Așteptat: răspuns **JSON** cu `status`, `referinta` / `ref_catastral`, `data` (ref_catastral, address, year_built, lat, lon, …). **Nu** răspuns care începe cu `<` (XML).
   - În logs Railway: **nu** apar erori SSL (SSLCertVerificationError, hostname mismatch); dacă `ENV=prod` și `fnmt_root.pem` e setat corect, request-urile Catastro folosesc CA-ul valid.

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
