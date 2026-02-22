"""
Test rapid: SSL Catastro + coordonate_la_referinta.
Rulează: python test_catastro_local.py
"""
import sys

print("1. Session SSL Catastro (sistem + fnmt_root.pem)...")
try:
    from catastro_ssl import CATASTRO_HOST, get_catastro_session
    session = get_catastro_session()
    if session is False:
        print("   [SKIP] fnmt_root.pem lipsește – verificare SSL dezactivată")
    else:
        r = session.get(
            f"https://{CATASTRO_HOST}/ovcservweb/OVCSWLocalizacionRC/OVCCoordenadas.asmx/Consulta_RCCOOR",
            params={"SRS": "EPSG:4326", "Coordenada_X": -4.4, "Coordenada_Y": 36.7},
            timeout=15,
        )
        print(f"   [OK] Request SSL: {r.status_code}")
except Exception as e:
    print(f"   [EROARE] {e}")
    sys.exit(1)

print("2. coordonate_la_referinta(36.7, -4.4)...")
try:
    from coordonate_la_referinta import coordonate_la_referinta
    data, err = coordonate_la_referinta(36.7, -4.4)
    if err:
        print(f"   [EROARE] {err}")
        sys.exit(1)
    print(f"   [OK] Referință cadastrală: {data.get('ref_catastral') if data else 'N/A'}")
except Exception as e:
    print(f"   [EROARE] {e}")
    sys.exit(1)

print("\nFuncționalitate Catastro: OK.")
