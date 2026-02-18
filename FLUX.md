# Flux cap-coadă

```
Hartă → Click → Catastro → Baza de date → Stripe Checkout → [Plată] →
  → Webhook Stripe → DetailedReport (processing) → Solicita Registru →
  → API Registru procesează Nota Simple →
  → Webhook Registru-update → status=completed, PDF + proprietar →
  → Email notificare utilizator
```

## Test local (pe calculatorul tău)

1. **Baza de date** – se creează automat la pornirea backend-ului (`imobiliare.db`).

2. **Backend**
   ```bash
   cd C:\Users\octav
   uvicorn main:app --reload
   ```

3. **Frontend**
   ```bash
   cd C:\Users\octav\frontend
   npm install
   npm run dev
   ```

4. Deschide http://localhost:3000 → click pe o casă (Madrid/Valencia) → introdu email → Cumpără raport (19€) → redirect la Stripe.

5. **Test API fără browser** (opțional):
   ```bash
   python run_flux_test.py
   type flux_test_result.txt
   ```
