"""
Grid scanning: Pedregalejo, Málaga.
Împarte zona în celule de ~100m x 100m, pentru fiecare:
1. Obține referință cadastrală (coordonate -> Catastro)
2. Descarcă imagine satelit (Google Static API)
3. Analizează „piscină mlaștină” (OpenCV)
4. Salvează în DB cu scor_oportunitate și stare_piscina.

Rulează: GOOGLE_MAPS_API_KEY=xxx python grid_pedregalejo.py
"""
import os
import time
from typing import Optional

os.chdir(os.path.dirname(os.path.abspath(__file__)))

from coordonate_la_referinta import coordonate_la_referinta
from database import SessionLocal, Property
from red_flags import calculeaza_scor_oportunitate
from vision_abandon import analizeaza_stare_piscina, fetch_google_static_satellite

# Pedregalejo, Málaga (centru aproximativ)
PEDREGALEJO_LAT = 36.72
PEDREGALEJO_LON = -4.38
# ~100m în grade (la lat ~36°): 1° lat ≈ 111km, deci 100m ≈ 0.0009
GRID_STEP_DEG = 0.0009


def process_cell(lat: float, lon: float, api_key: str, db) -> Optional[dict]:
    """
    Pentru o celulă: Catastro -> ref; dacă avem ref, fetch image -> analiză -> save/update.
    Returnează dict cu ref, stare_piscina, scor sau None la skip.
    """
    ref, err = coordonate_la_referinta(lat, lon)
    if err:
        return None
    existing = db.query(Property).filter(Property.ref_catastral == ref).first()
    if not existing:
        prop = Property(
            ref_catastral=ref,
            lat=lat,
            lon=lon,
            address=None,
            year_built=None,
            sq_meters=None,
            scor_oportunitate=0,
        )
        db.add(prop)
        db.commit()
        db.refresh(prop)
        prop_id = prop.id
    else:
        prop_id = existing.id

    img_bytes = fetch_google_static_satellite(lat, lon, api_key, zoom=20, width=400, height=400)
    if not img_bytes:
        return {"ref": ref, "lat": lat, "lon": lon, "eroare": "imagine indisponibilă"}

    try:
        rezultat = analizeaza_stare_piscina(img_bytes)
    except Exception as e:
        return {"ref": ref, "lat": lat, "lon": lon, "eroare": str(e)}

    prop = db.query(Property).filter(Property.id == prop_id).first()
    if prop:
        prop.stare_piscina = rezultat["status"]
        prop.scor_oportunitate = calculeaza_scor_oportunitate(
            {"year_built": prop.year_built},
            None,
            {"stare_piscina": rezultat["status"]},
        )
        db.commit()

    return {
        "ref": ref,
        "lat": lat,
        "lon": lon,
        "stare_piscina": rezultat["status"],
        "procent_verde": rezultat["procent_verde"],
        "scor_oportunitate": prop.scor_oportunitate if prop else 0,
    }


def run_grid(n_lat: int = 3, n_lon: int = 3, delay_sec: float = 0.5):
    """Parcurge un grid n_lat x n_lon în jurul centrului Pedregalejo."""
    api_key = os.getenv("GOOGLE_MAPS_API_KEY", "").strip()
    if not api_key:
        print("Setează GOOGLE_MAPS_API_KEY în mediu.")
        return
    db = SessionLocal()
    try:
        for i in range(n_lat):
            for j in range(n_lon):
                lat = PEDREGALEJO_LAT + (i - n_lat / 2) * GRID_STEP_DEG
                lon = PEDREGALEJO_LON + (j - n_lon / 2) * GRID_STEP_DEG
                r = process_cell(lat, lon, api_key, db)
                if r:
                    print(r)
                time.sleep(delay_sec)
    finally:
        db.close()


if __name__ == "__main__":
    run_grid(n_lat=2, n_lon=2)  # 4 celule pentru test; mărește pentru scan complet
