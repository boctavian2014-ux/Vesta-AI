"""
Simulare utilizator: un „tap” pe hartă la Madrid → așteptăm JSON cu referință cadastrală.
Rulează cu backend pornit: python -m uvicorn main:app --port 8000
Sau împotriva Railway: $env:API_URL = "https://<railway-url>"; python test_user_flow.py
"""
import json
import os
import urllib.request
import urllib.error

API_URL = os.environ.get("API_URL", "http://127.0.0.1:8000")
# Coordonate Madrid (Plaza de España) – ca un user care apasă pe hartă
LAT, LON = 40.42056879131868, -3.705847207404546


def main():
    print("=== Test ca utilizator (un tap pe hartă) ===\n")
    print(f"API: {API_URL}")
    print(f"Coordonate: {LAT}, {LON} (Madrid)\n")

    # 1. Health
    try:
        req = urllib.request.Request(API_URL + "/", method="GET")
        with urllib.request.urlopen(req, timeout=10) as r:
            health = r.read().decode()
        print("[OK] Serverul răspunde (health).")
    except Exception as e:
        print(f"[FAIL] Serverul nu răspunde: {e}")
        print("Pornește backend: python -m uvicorn main:app --port 8000")
        return 1

    # 2. „Tap” pe hartă = POST /identifica-imobil/
    body = json.dumps({"lat": LAT, "lon": LON}).encode("utf-8")
    req = urllib.request.Request(
        API_URL + "/identifica-imobil/",
        data=body,
        method="POST",
        headers={"Content-Type": "application/json"},
    )
    try:
        with urllib.request.urlopen(req, timeout=25) as r:
            raw = r.read().decode()
    except urllib.error.HTTPError as e:
        raw = e.read().decode() if e.fp else ""
        print(f"[FAIL] HTTP {e.code}: {raw[:200]}")
        return 1
    except Exception as e:
        print(f"[FAIL] Eroare la identificare imobil: {e}")
        return 1

    try:
        data = json.loads(raw)
    except json.JSONDecodeError:
        print(f"[FAIL] Răspunsul nu e JSON. Primele caractere: {raw[:80]}")
        return 1

    ref = data.get("referinta") or data.get("ref_catastral") or (data.get("data") or {}).get("ref_catastral")
    if not ref or not str(ref).strip():
        print("[FAIL] Răspuns fără referință cadastrală (ref_catastral/referinta).")
        print("Răspuns:", json.dumps(data, indent=2, ensure_ascii=False)[:500])
        return 1

    print(f"[OK] Imobil identificat: referință {str(ref)[:30]}...")
    payload = data.get("data") or {}
    if payload.get("address"):
        print(f"     Adresă: {payload.get('address', '')[:60]}")
    if payload.get("year_built"):
        print(f"     An construcție: {payload.get('year_built')}")
    print("\n=== Test utilizator: SUCCES ===")
    return 0


if __name__ == "__main__":
    exit(main())
