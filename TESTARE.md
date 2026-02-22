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
  - `python tests_e2e.py` — validează **întreg fluxul identifica-imobil** (importuri, CATASTRO_URL, parsare XML, GET /, POST /identifica-imobil/, handler erori). Pornește întâi backend-ul: `python -m uvicorn main:app --port 8000` (sau pe Windows `py -m uvicorn ...` dacă `python` nu e în PATH), sau setează `API_URL` pentru Railway.

**Timeout-uri:** Sunt setate 15s pentru ConsultaCPMRC (coordonate → referință) și 10s pentru Consulta_DNPRC (date detaliate). Dacă primești 404 pe coordonate, poți reveni la `Consulta_RCCOOR` în CATASTRO_URL (main.py). Acestea sunt valori potrivite pentru API-urile guvernamentale spaniole, care pot răspunde lent în orele de vârf.

**Parametri case-sensitive (ConsultaCPMRC):** Serverul răspunde „No se puede procesar su petición” dacă cheile nu sunt exacte. Folosește `SRS`, `CoordenadaX`, `CoordenadaY` (fără underscore). Consulta_RCCOOR folosește `Coordenada_X` și `Coordenada_Y`.

| Parametru | Valoare (fix) | Impact |
|-----------|----------------|--------|
| Metodă | ConsultaCPMRC | Endpoint stabil, interogări WGS84. |
| Longitudine | CoordenadaX | Recunoscut de server (evită 404/400). |
| Latitudine | CoordenadaY | Recunoscut de server (evită 404/400). |
| SRS | EPSG:4258 (ETRS89) | Standard oficial Spania; multe endpoint-uri returnează 404 cu EPSG:4326. Dacă 4258 nu merge, poți încerca fără SRS. |

**Antete obligatorii:** Serverul returnează 404 dacă lipsește User-Agent. Folosim `User-Agent: Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36` și `Accept: application/xml, text/xml, */*`.

**Note pentru WSDL (cauta_imobil_spania.py):** URL complet cu `?WSDL`: `.../OVCCallejero.asmx?WSDL`. Eroarea la WSDL apare și din cauza lipsei headere; session-ul folosește `get_catastro_http_client()`. Clientul folosește `CATASTRO_HOST` și același session.

**De ce dispare „Hostname mismatch”:** Toate apelurile Catastro trec prin `get_catastro_http_client()` (main.py), care folosește sesiunea din `catastro_ssl.py` (context SSL: sistem + fnmt_root.pem). Noul host `www1.sedecatastro.gob.es` are certificatele SSL la zi. În producție nu se folosește `verify=False`.

**De ce 422 Unprocessable Entity:** Când Catastro răspunde cu 404 (pagină HTML, nu XML), `ET.fromstring(response.content)` aruncă excepție; FastAPI vede că procesarea a eșuat și returnează 422 către mobil. **Fix:** SRS=EPSG:4258 (ETRS89), CoordenadaX/CoordenadaY, User-Agent și Accept corecte, URL ConsultaCPMRC, fnmt_root.pem în Railway. După fix, verifică în log **📡 Catastro – Status: 200**; apoi intră în funcțiune buffer-ul de 8 m.

**Verificare post-deploy:** (1) **Log-uri la pornire:** Caută **Succes SSL Catastro**. Dacă apare fără 404, testul automat cu coordonatele Madrid a reușit. (2) **Test identificare:** Rulează comanda `Invoke-RestMethod` din acest document (secțiunea cu coordonate Madrid). Dacă primești JSON cu `referinta`, lanțul complet este funcțional: SSL → host nou → parametri corecți → buffer 8 m.

### Validare finală a arhitecturii

| Componentă | Stare | Impact |
|------------|--------|--------|
| Domeniu (Host) | `www1.sedecatastro.gob.es` | Certificatul SSL se potrivește cu URL-ul apelat. |
| SSL Trust Store | fnmt_root.pem injectat (catastro_ssl.py) | Rezolvă „unable to get local issuer certificate” (FNMT root). |
| Health Check | Aliniat la noul host + get_catastro_http_client() | Monitorizarea nu mai raportează alerte false SSL. |
| Namespace XML | Conservate (catastro.minhap.es / meh.es) | Corect: identificatori de structură în răspuns, nu URL-uri de rețea. |

### Validare finală a modificărilor (ConsultaCPMRC)

Trecerea la **ConsultaCPMRC** și la parametrii **CoordenadaX** / **CoordenadaY** (fără underscore) elimină mesajul „No se puede procesar su petición” care bloca procesarea datelor.

| Componentă | Fix implementat | Rezultat în producție |
|------------|------------------|------------------------|
| **Endpoint REST** | `.../OVCCoordenadas.asmx/ConsultaCPMRC` | Serviciu stabil care acceptă interogări prin coordonate. |
| **Parametri** | CoordenadaX, CoordenadaY, SRS | Sintaxă exactă (case-sensitive) care evită 404. |
| **WSDL SOAP** | `.../OVCCallejero.asmx` (fără `?WSDL`) | Previne „Not Found” la descărcarea definiției. |
| **Failover** | Buffer ~8 m (≈0.00008°) | Salvează click-urile imprecise în zone dense (ex. Madrid). |

**Notă de siguranță înainte de push:** Rulează local `python tests_e2e.py` înainte de push-ul final pe Railway. Testul verifică că `CATASTRO_URL` folosește `www1.sedecatastro.gob.es` și că nu a rămas nicio referință activă către host-ul vechi în codul de testare.

### Ce să observi după deploy (Railway)

- **Logs la pornire:** Verifică în deployment logs dacă mai apare vreun **warning legat de fnmt_root.pem**. Dacă vezi **Succes SSL Catastro**, înseamnă că logica bazată pe BASE_DIR (și CATASTRO_CA_BUNDLE) a localizat corect certificatul și handshake-ul cu `www1.sedecatastro.gob.es` a reușit.
- **Identificare imobil:** La un click în Madrid/Málaga, log-urile **nu** trebuie să conțină `SSLCertVerificationError`. În loc de 422 Unprocessable Entity: **200 OK** (cu date imobil) sau răspuns JSON de eroare controlată (ex. „Referință negăsită”).
- **Dacă vezi 422 Unprocessable Entity:** Verifică dacă nu cumva există un apel rămas către vechiul host (`ovc.catastro.minhap.es`) într-un fișier secundar sau într-o bibliotecă externă care nu folosește `get_catastro_http_client()`. Toate apelurile Catastro trebuie să treacă prin helper-ul din main.
- **Buffer 8 m:** Dacă utilizatorul dă click ușor pe lângă clădire, în log-uri apare **✅ Imobil găsit cu buffer la offset: ...**, confirmând că mecanismul de buffer a salvat cererea.

**Sfat Railway:** Fiindcă în cod folosim `os.environ.setdefault("CATASTRO_CA_BUNDLE", CATASTRO_CERT_PATH)`, variabila este setată doar dacă nu există deja. În panoul Railway, dacă setezi manual **CATASTRO_CA_BUNDLE**, asigură-te că indică calea reală unde se află `fnmt_root.pem` în container (ex. `/app/fnmt_root.pem` dacă fișierul e în rădăcina aplicației în image). Dacă nu setezi variabila, aplicația folosește calea din BASE_DIR (lângă main.py).

**Curățare cache Railway (dacă persistă Hostname mismatch / 422):** Uneori Railway păstrează versiuni vechi în build. Forțează un deploy curat: fă un commit (ex. `git commit -am "FORCE: Remove all old catastro hosts"`), push (`git push railway main`), apoi în consola Railway dă click pe **Redeploy** la ultimul deployment.

**Forțează Railway Rebuild (dacă log-urile arată tot varianta cu underscore):** Dacă fișierele locale sunt corecte (ConsultaCPMRC, CoordenadaX/CoordenadaY) dar în producție se vede încă comportamentul vechi, Railway folosește un build din cache. Pași: (1) `git commit -am "FORCE FIX: Use ConsultaCPMRC and remove underscores"` (2) `git push railway main` (sau `git push origin main` dacă branch-ul de deploy e main). (3) Dashboard Railway → Service → Deployments → cele 3 puncte la ultimul deploy → **Redeploy**.

### Pașii finali pentru stabilitate (după migrare WSDL/SSL)

1. **Commit și Push**
   - `git commit -am "FIX: Fully migrated WSDL to new host"`
   - `git push railway main`

2. **Railway Redeploy**
   - În interfața Railway, apasă **Redeploy** la ultimul deployment. Este esențial ca noul cod să fie cel activ pe server.

3. **Verificare log-uri la pornire**
   - Caută în log-uri mesajul **Succes SSL Catastro**. Dacă apare, sistemul a trecut de testul SSL și este gata să proceseze click-urile pe hartă.

4. **Dacă utilizatorul vede „Informații indisponibile” la click pe hartă**
   - Verifică în log-uri dacă apare **✅ Imobil găsit cu buffer**. Dacă da, SSL-ul este în regulă; problema rămasă este precizia click-ului (punctul poate cădea pe stradă/trotuar în afara poligonului cadastral). Buffer-ul de ~8 m acoperă deja colțurile clădirilor; pentru zone foarte largi poți mări `CATASTRO_BUFFER_DEG` în `main.py`.

### Checklist go-live (Railway)

Când toate condițiile de mai jos sunt îndeplinite, aplicația Vesta OpenHouse este pregătită pentru utilizatori reali, cu conexiune stabilă și securizată la infrastructura cadastrală spaniolă.

| Verificare | Cum | Semn că e OK |
|------------|-----|----------------|
| **Monitorizare Consola Railway** | Caută în deployment logs string-ul **Succes SSL Catastro**. | Apariția lui confirmă că `CATASTRO_CA_BUNDLE` indică fișierul corect și că serverul spaniol a acceptat conexiunea. |
| **Test coordonate Madrid** | Folosește `Invoke-RestMethod` din secțiunea de mai jos (TESTARE.md) cu coordonatele Madrid: `40.4205`, `-3.7058` (sau `40.42056879131868`, `-3.705847207404546`). | Răspuns **JSON** cu `referinta` / `ref_catastral` – buffer 8 m și SSL funcționează corect. |
| **Variabila ENV** | În panoul Railway, variabila de mediu **ENV** = **prod**. | Activează protecția `RuntimeError` care previne căderea accidentală în modul nesecurizat (`verify=False`). |

---

## 1. Teste automate (backend + logică)

Rulează în rădăcina proiectului:

```powershell
cd c:\Users\octav\Vesta-AI
python tests_e2e.py
```

Testează **împotriva backend-ului local** (presupune că ai pornit `python -m uvicorn main:app --port 8000`).

### Testare împotriva Railway

```powershell
$env:API_URL = "https://web-production-34c2a5.up.railway.app"
python tests_e2e.py
```

Verificări:
- Importuri (main, coordonate_la_referinta, catastro_ssl)
- `CATASTRO_URL` folosește noul host `www1.sedecatastro.gob.es` (certificate SSL la zi)
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

**Test cu coordonate Madrid (Plaza de España):**  
Dacă click-ul cade pe stradă/trotuar, Catastro poate returna XML fără referință. Backend-ul reîncearcă automat la **8 direcții** (4 cardinale N/S/E/V + 4 intercardinale NE/NV/SE/SV) la **~8 m** (`CATASTRO_BUFFER_DEG = 0.00008`), astfel că se acoperă și colțurile clădirilor. Pentru a testa cu coordonatele exacte din app (ex. screenshot):

```powershell
$env:API_URL = "http://127.0.0.1:8000"
# Pornește: python -m uvicorn main:app --port 8000, apoi:
Invoke-RestMethod -Uri "$env:API_URL/identifica-imobil/" -Method Post -Body '{"lat":40.42056879131868,"lon":-3.705847207404546}' -ContentType "application/json"
```

În consola serverului vor apărea `[Catastro] URL complet`, `[Catastro] Răspuns XML (brut)` și, dacă s-a găsit imobilul la un punct din buffer, `✅ Imobil găsit cu buffer la offset: ...`.

**Dacă primești în continuare „Referință negăsită în raza de căutare”:**
- **Mărire buffer:** Setează `CATASTRO_BUFFER_DEG = 0.0001` (~11 m) în `main.py` pentru trotuare/zone foarte largi.
- Căutarea are deja 8 direcții (cardinale + diagonale), deci colțurile clădirilor sunt acoperite.

**Sfat producție:** După deploy pe Railway, verifică log-urile. Dacă apar des mesaje `✅ Imobil găsit cu buffer la offset: ...`, mecanismul de buffer este cel care salvează experiența utilizatorului în majoritatea cazurilor.

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

### Test ca utilizator (simulare un tap pe hartă)

Simulează un singur „tap” pe hartă la Madrid; verifică că primești JSON cu referință cadastrală.

1. Pornește backend-ul (dacă testezi local):
   ```powershell
   python -m uvicorn main:app --port 8000
   ```
   - Dacă apare **„Python was not found”**: Încearcă **`py -m uvicorn main:app --port 8000`** (launcher Windows). Sau instalează Python de pe python.org (bifează „Add Python to PATH”) sau folosește **run_backend.bat**.
   - Dacă apare **„No module named uvicorn”**: Dependențele proiectului nu sunt instalate. Din rădăcina proiectului rulează **`py -m pip install -r requirements.txt`** (sau `python -m pip install -r requirements.txt`), apoi din nou `py -m uvicorn main:app --port 8000`. Alternativ, folosește **run_backend.bat** – creează venv și instalează automat din `requirements.txt`.
   - Dacă `uvicorn` nu e recunoscut ca comandă, folosește `python -m uvicorn` sau `py -m uvicorn`.
2. În alt terminal, rulează:
   ```powershell
   cd c:\Users\octav\Desktop\VESTA AI\Vesta-AI
   python test_user_flow.py
   ```
   Pentru Railway: `$env:API_URL = "https://<railway-url>"; python test_user_flow.py`

Așteptat: `[OK] Serverul răspunde`, apoi `[OK] Imobil identificat: referință ...` și la final `=== Test utilizator: SUCCES ===`.

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
