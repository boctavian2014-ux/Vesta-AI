"""
Testare completă: backend (local sau Railway) + logică Catastro.
Rulează: python tests_e2e.py
Opțional: API_URL=https://web-production-34c2a5.up.railway.app python tests_e2e.py
"""
import os
import sys

API_URL = os.environ.get("API_URL", "http://127.0.0.1:8000")
FAILED = []


def ok(name):
    print(f"  [OK] {name}")


def fail(name, msg):
    print(f"  [FAIL] {name}: {msg}")
    FAILED.append((name, msg))


def test_imports():
    """Importuri principale."""
    try:
        from main import app, CATASTRO_URL, CATASTRO_CERT_PATH
        from coordonate_la_referinta import coordonate_la_referinta
        from catastro_ssl import get_catastro_session
        ok("Importuri (main, coordonate_la_referinta, catastro_ssl)")
    except Exception as e:
        fail("Importuri", str(e))


def test_catastro_url_constant():
    """URL Catastro: folosește ovc.catastro.meh.es (Consulta_RCCOOR)."""
    from main import CATASTRO_URL
    if "ovc.-" in CATASTRO_URL:
        fail("CATASTRO_URL", "URL conține ovc.- (cratimă greșită)")
    elif "ovc.catastro.meh.es" in CATASTRO_URL:
        ok("CATASTRO_URL corect (ovc.catastro.meh.es)")
    else:
        fail("CATASTRO_URL", "URL trebuie să folosească ovc.catastro.meh.es: " + CATASTRO_URL[:60])


def test_coordonate_la_referinta_xml():
    """coordonate_la_referinta folosește XML (ET.fromstring), nu .json()."""
    import ast
    with open("coordonate_la_referinta.py", "r", encoding="utf-8") as f:
        code = f.read()
    if "response.json()" in code and "Catastro" in code:
        fail("coordonate_la_referinta", "Folosește response.json() pe răspuns Catastro (trebuie ET.fromstring)")
    if "ET.fromstring" in code:
        ok("coordonate_la_referinta folosește ET.fromstring (XML)")
    else:
        fail("coordonate_la_referinta", "Nu folosește ET.fromstring pentru XML Catastro")


def test_identifica_returns_json_structure():
    """Endpoint /identifica-imobil/ trebuie să returneze JSON cu referinta și data."""
    import ast
    with open("main.py", "r", encoding="utf-8") as f:
        code = f.read()
    if '"referinta"' not in code and "'referinta'" not in code:
        fail("main.py", "Răspuns identifica-imobil fără câmp 'referinta'")
    else:
        ok("main.py returnează 'referinta' în JSON")
    if '"data"' in code and "property_to_dict" in code:
        ok("main.py returnează 'data' (property_to_dict)")
    else:
        fail("main.py", "Lipsește 'data' sau property_to_dict în răspuns")


def test_api_health():
    """GET / pe API (Railway sau local)."""
    try:
        import urllib.request
        req = urllib.request.Request(API_URL + "/", method="GET")
        with urllib.request.urlopen(req, timeout=10) as r:
            data = r.read().decode()
            if "message" in data or "Serverul" in data or "activ" in data:
                ok("GET / (health)")
            else:
                fail("GET /", "Răspuns neașteptat: " + data[:80])
    except Exception as e:
        fail("GET /", str(e))


def test_api_identifica_imobil():
    """POST /identifica-imobil/ returnează JSON cu referinta și data."""
    try:
        import urllib.request
        import json
        body = json.dumps({"lat": 36.7212, "lon": -4.4212}).encode()
        req = urllib.request.Request(
            API_URL + "/identifica-imobil/",
            data=body,
            headers={"Content-Type": "application/json"},
            method="POST",
        )
        with urllib.request.urlopen(req, timeout=20) as r:
            raw = r.read().decode()
            if raw.strip().startswith("<"):
                fail("POST /identifica-imobil/", "Răspunsul e XML/HTML, nu JSON. Primele caractere: " + raw[:50])
                return
            data = json.loads(raw)
            if "data" not in data:
                fail("POST /identifica-imobil/", "Lipsește 'data' în răspuns")
            elif "referinta" not in data and "ref_catastral" not in str(data.get("data", {})):
                fail("POST /identifica-imobil/", "Lipsește referinta/ref_catastral")
            else:
                ref = data.get("referinta") or (data.get("data") or {}).get("ref_catastral")
                ok(f"POST /identifica-imobil/ → JSON cu referinta: {str(ref)[:20]}...")
    except urllib.error.HTTPError as e:
        body = e.read().decode() if e.fp else ""
        if body.strip().startswith("<") or body.strip().startswith("I"):
            fail("POST /identifica-imobil/", f"Serverul a returnat non-JSON (status {e.code}): " + body[:60])
        else:
            fail("POST /identifica-imobil/", f"HTTP {e.code}: {body[:100]}")
    except Exception as e:
        fail("POST /identifica-imobil/", str(e))


def test_global_exception_handler():
    """FastAPI are handler global care returnează JSON la erori."""
    with open("main.py", "r", encoding="utf-8") as f:
        code = f.read()
    if "exception_handler" in code and "JSONResponse" in code:
        ok("Handler global excepții (returnează JSON)")
    else:
        fail("main.py", "Lipsește handler global care returnează JSON la erori")


def test_mobile_api_parse_safe():
    """App mobil: la eroare nu face .json() direct (evită Unexpected character)."""
    with open("openhouse-mobile/api.js", "r", encoding="utf-8") as f:
        code = f.read()
    if "await r.text()" in code or "r.text()" in code:
        ok("api.js: citește text înainte de parse (evită JSON Parse error)")
    elif "!r.ok" in code and "text" in code:
        ok("api.js: tratare erori cu text")
    else:
        fail("api.js", "La răspuns eroare se face .json() direct (risc XML/text)")


def main():
    print("=== Testare completă Vesta / OpenHouse ===\n")
    print("1. Cod (importuri, constante, XML vs JSON)")
    test_imports()
    test_catastro_url_constant()
    test_coordonate_la_referinta_xml()
    test_identifica_returns_json_structure()
    test_global_exception_handler()
    test_mobile_api_parse_safe()

    print("\n2. API (URL =", API_URL, ")")
    test_api_health()
    test_api_identifica_imobil()

    print()
    if FAILED:
        print("EȘEC:", len(FAILED), "test(e)")
        for name, msg in FAILED:
            print("  -", name, ":", msg[:80])
        sys.exit(1)
    print("Toate testele au trecut.")
    sys.exit(0)


if __name__ == "__main__":
    main()
