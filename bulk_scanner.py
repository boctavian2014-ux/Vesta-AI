"""
Scanare în masă: listă de coordonate (lat, lon) → Catastro → salvare în imobiliare.db.
Folosește un CSV cu coloane: lat, lon, year_built (opțional).
Proprietățile cu year_built < 1970 primesc scor de oportunitate (red flag).
"""
import csv
import os
import sys
from typing import Optional

# Același DB ca backend-ul
os.chdir(os.path.dirname(os.path.abspath(__file__)))

from coordonate_la_referinta import coordonate_la_referinta
from database import SessionLocal, Property
from red_flags import calculeaza_scor_oportunitate


def scan_coord(lat: float, lon: float, year_built: Optional[int], db) -> bool:
    """Identifică imobil la (lat, lon), salvează în DB. Returnează True dacă a salvat (nou sau existent)."""
    ref, err = coordonate_la_referinta(lat, lon)
    if err:
        print(f"  Skip {lat:.4f}, {lon:.4f}: {err}")
        return False
    existing = db.query(Property).filter(Property.ref_catastral == ref).first()
    if existing:
        if year_built is not None and existing.year_built != year_built:
            existing.year_built = year_built
            existing.scor_oportunitate = calculeaza_scor_oportunitate({"year_built": year_built}, None)
            db.commit()
        return True
    scor = calculeaza_scor_oportunitate({"year_built": year_built}, None)
    prop = Property(
        ref_catastral=ref,
        lat=lat,
        lon=lon,
        address=None,
        year_built=year_built,
        sq_meters=None,
        scor_oportunitate=scor,
    )
    db.add(prop)
    db.commit()
    print(f"  Salvat {ref} @ ({lat:.4f}, {lon:.4f}) an={year_built} scor={scor}")
    return True


def run_csv(path: str):
    """Citește CSV cu header: lat, lon, year_built (opțional)."""
    db = SessionLocal()
    try:
        with open(path, newline="", encoding="utf-8") as f:
            r = csv.DictReader(f)
            if "lat" not in r.fieldnames or "lon" not in r.fieldnames:
                print("CSV trebuie să aibă coloane: lat, lon, year_built (opțional)")
                return
            n, ok = 0, 0
            for row in r:
                n += 1
                lat = float(row["lat"])
                lon = float(row["lon"])
                year_built = None
                if "year_built" in row and row["year_built"].strip():
                    year_built = int(row["year_built"])
                if scan_coord(lat, lon, year_built, db):
                    ok += 1
        print(f"Total: {n} rânduri, {ok} salvate/actualizate.")
    finally:
        db.close()


def run_grid_example():
    """Exemplu: grilă mică în Madrid (2x2 puncte). Pentru test rapid."""
    db = SessionLocal()
    # Puncte în jurul centrului Madrid
    points = [
        (40.4167, -3.7033),
        (40.4175, -3.7020),
        (40.4155, -3.7045),
        (40.4180, -3.7050),
    ]
    try:
        for lat, lon in points:
            scan_coord(lat, lon, None, db)
    finally:
        db.close()


if __name__ == "__main__":
    if len(sys.argv) > 1:
        run_csv(sys.argv[1])
    else:
        print("Utilizare: python bulk_scanner.py <fisier.csv>")
        print("CSV: lat, lon, year_built (opțional)")
        print("Exemplu grilă Madrid (2x2):")
        run_grid_example()
