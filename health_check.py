#!/usr/bin/env python3
"""
Health check pentru sistemele critice: DB, Stripe, Catastro SSL.
Rulează din rădăcina proiectului: python health_check.py
"""
import os
import sys

# Rădăcina proiectului (unde e și main.py)
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
# Încarcă .env dacă există (opțional: pip install python-dotenv)
try:
    from dotenv import load_dotenv
    load_dotenv(os.path.join(BASE_DIR, ".env"))
except ImportError:
    pass
if BASE_DIR not in sys.path:
    sys.path.insert(0, BASE_DIR)

# Variabile pentru raport
RESULTS = []
FAILED = False


def ok(label: str, msg: str = "OK") -> None:
    RESULTS.append(("ok", label, msg))


def fail(label: str, error: str, tip: str) -> None:
    global FAILED
    FAILED = True
    RESULTS.append(("fail", label, error, tip))


def run_db_check() -> None:
    """Testează conexiunea la DB și accesul la tabelele detailed_reports și users."""
    try:
        from database import SessionLocal, User, DetailedReport
    except ImportError as e:
        fail(
            "Database",
            str(e),
            "Asigură-te că ești în rădăcina proiectului și că database.py există. Verifică DATABASE_URL în .env.",
        )
        return
    session = None
    try:
        session = SessionLocal()
        # Verificăm că tabelele există și sunt accesibile
        session.query(User).limit(1).first()
        session.query(DetailedReport).limit(1).first()
        ok("Database", "ONLINE")
    except Exception as e:
        fail(
            "Database",
            str(e),
            "Verifică DATABASE_URL în .env. Pentru SQLite: sqlite:///./imobiliare.db. Pentru Postgres: postgresql://user:pass@host/db. Rulează migrările dacă tabelele lipsesc.",
        )
    finally:
        if session:
            session.close()


def run_stripe_check() -> None:
    """Verifică cheile Stripe și o conexiune minimă (list PaymentIntent)."""
    import stripe as stripe_module

    key = os.getenv("STRIPE_SECRET_KEY", "").strip()
    if not key:
        fail(
            "Stripe",
            "STRIPE_SECRET_KEY lipsește",
            "Adaugă STRIPE_SECRET_KEY în .env (cheie secretă din Dashboard Stripe → Developers → API keys).",
        )
        return
    try:
        stripe_module.api_key = key
        stripe_module.PaymentIntent.list(limit=1)
        ok("Stripe", "CONNECTED")
    except stripe_module.error.AuthenticationError as e:
        fail("Stripe", str(e), "Cheia secretă este invalidă sau a fost revocată. Generează una nouă în Stripe Dashboard.")
    except stripe_module.error.StripeError as e:
        fail("Stripe", str(e), "Verifică rețeaua și că Stripe API este accesibil.")
    except Exception as e:
        fail("Stripe", str(e), "Verifică că stripe este instalat: pip install stripe.")


def run_catastro_ssl_check() -> None:
    """Verifică fnmt_root.pem și efectuează o interogare de test către Catastro (Referință de test)."""
    cert_path = os.path.join(BASE_DIR, "fnmt_root.pem")
    if not os.path.isfile(cert_path):
        fail(
            "Catastro SSL",
            f"Fișierul nu există: {cert_path}",
            "Descarcă certificatul FNMT de la Catastro și plasează fnmt_root.pem în rădăcina proiectului.",
        )
        return
    # Referință cadastrală de test (exemplu: format 14+ caractere)
    ref_test = "0100017DS1800D"
    codigo_provincia = ref_test[:2]
    codigo_municipio = ref_test[2:5]
    try:
        import requests
    except ImportError:
        fail("Catastro SSL", "Modulul requests lipsește", "Rulează: pip install requests")
        return
    url = "https://ovc.catastro.meh.es/ovcservweb/OVCSWLocalizacionRC/OVCCallejeroCodigos.asmx/Consulta_DNPRC_Codigos"
    params = {
        "CodigoProvincia": codigo_provincia,
        "CodigoMunicipio": codigo_municipio,
        "CodigoMunicipioINE": codigo_municipio,
        "RC": ref_test,
    }
    headers = {
        "User-Agent": "Mozilla/5.0 (HealthCheck/1.0)",
        "Accept": "application/xml, text/xml, */*",
    }
    try:
        r = requests.get(url, params=params, headers=headers, verify=cert_path, timeout=10)
        # Orice răspuns de la server (200, 404, etc.) confirmă că SSL a fost validat
        ok("Catastro SSL", "VALIDATED")
    except requests.exceptions.SSLError as e:
        fail(
            "Catastro SSL",
            str(e),
            "Certificatul fnmt_root.pem nu e acceptat de Catastro. Re-descarcă certificatul sau verifică că e în format PEM.",
        )
    except requests.exceptions.RequestException as e:
        fail(
            "Catastro SSL",
            str(e),
            "Verifică conexiunea la internet și că ovc.catastro.meh.es este accesibil.",
        )


def main() -> None:
    print("=" * 56)
    print("  Vesta AI – Health Check (DB, Stripe, Catastro SSL)")
    print("=" * 56)
    run_db_check()
    run_stripe_check()
    run_catastro_ssl_check()
    print()
    for r in RESULTS:
        if r[0] == "ok":
            _, label, msg = r
            print(f"  ✅ {label}: {msg}")
        else:
            _, label, err, tip = r
            print(f"  ❌ {label}: EROARE")
            print(f"     {err}")
            print(f"     Sfat: {tip}")
    print("=" * 56)
    if FAILED:
        sys.exit(1)
    print("  Toate sistemele sunt operaționale.")
    print("=" * 56)


if __name__ == "__main__":
    main()
