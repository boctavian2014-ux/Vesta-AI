# Backend OpenHouse Spain – pornire și configurare

## Pornire rapidă (Windows)

1. **Deschide terminal** în folderul proiectului: `C:\Users\octav\Vesta-AI`.

2. **Rulează:**
   ```bat
   run_backend.bat
   ```
   La prima rulare se creează mediu virtual (`venv`), se instalează dependențele și pornește serverul pe **http://0.0.0.0:8000**.

3. **Verificare:** deschide în browser **http://localhost:8000** – ar trebui să vezi: `{"message":"Serverul imobiliar este activ!"}`

4. **Documentație API:** http://localhost:8000/docs

---

## Pornire manuală (orice OS)

```bash
cd C:\Users\octav\Vesta-AI
python -m venv venv
venv\Scripts\activate          # Windows
# source venv/bin/activate     # Linux/macOS
pip install -r requirements.txt
uvicorn main:app --reload --host 0.0.0.0 --port 8000
```

`--host 0.0.0.0` este necesar ca **app-ul mobil** (telefon în rețea) să poată accesa API-ul pe IP-ul PC-ului.

---

## Variabile de mediu (opțional)

Copiază `.env.example` în `.env` și ajustează doar ce folosești:

| Variabilă | Obligatoriu | Descriere |
|-----------|-------------|-----------|
| `DATABASE_URL` | Nu | Implicit: SQLite `./imobiliare.db`. Pentru PostgreSQL (ex. Railway): `postgresql://user:pass@host:5432/db` |
| `CORS_ORIGINS` | Nu | Implicit: permitem orice origin (dev + mobil). Producție: `https://domeniu.ro` |
| `STRIPE_SECRET_KEY` | Doar pentru plată | Cheie Stripe pentru checkout 19€ |
| `STRIPE_WEBHOOK_SECRET` | Doar pentru plată | Secret webhook Stripe |
| `GOOGLE_MAPS_API_KEY` | Nu | Pentru analiza satelit (piscină) |
| `CATASTRO_CA_BUNDLE` | Nu | Cale către `fnmt_root.pem` pentru verificare SSL Catastro (recomandat în producție) |

**Pentru doar „identificare imobil” pe hartă** nu e nevoie de Stripe sau Google; baza de date se creează automat (SQLite) la prima rulare.

### Verificare SSL Catastro (FNMT)

API-ul Catastro (Spania) este semnat cu certificate FNMT care nu sunt în trust store-ul standard. Pentru **verificare SSL activă** (fără risc MITM):

1. Descarcă certificatul rădăcină: [Certificados raíz de la FNMT](https://www.sede.fnmt.gob.es/descargas/certificados-raiz-de-la-fnmt) → **AC Raíz FNMT-RCM** → [AC_Raiz_FNMT-RCM_SHA256.cer](https://www.sede.fnmt.gob.es/documents/10445900/10526749/AC_Raiz_FNMT-RCM_SHA256.cer).
2. Convertește din DER în PEM (dacă e cazul):  
   `openssl x509 -inform DER -in AC_Raiz_FNMT-RCM_SHA256.cer -out fnmt_root.pem`
3. Salvează `fnmt_root.pem` în **rădăcina proiectului** (acolo unde e `main.py`). Backend-ul îl folosește automat la cererile către Catastro.
4. Opțional: setează `CATASTRO_CA_BUNDLE=/cale/absolută/fnmt_root.pem` dacă fișierul e în alt loc.

Dacă `fnmt_root.pem` lipsește, verificarea SSL este dezactivată pentru Catastro și în consolă apare un avertisment.

---

## Ce face backend-ul la pornire

- Creează fișierul **imobiliare.db** (SQLite) dacă nu există și tabelele: `properties`, `users`, `detailed_reports`, etc.
- Expune endpoint-uri pentru app mobil și frontend: identificare imobil, guest, checkout Stripe, status raport, carta de ofertă.

## Test rapid

```bash
curl http://localhost:8000/
curl -X POST http://localhost:8000/identifica-imobil/ -H "Content-Type: application/json" -d "{\"lat\": 40.4167, \"lon\": -3.7037}"
```

Al doilea apel apelează API-ul Catastro (Spania); coordonatele din exemplu sunt pentru Madrid.
