"""
Scor de oportunitate (Red Flags) 0–100.
Cu cât scorul e mai mare, cu atât casa e mai „roșie” pe hartă.
"""
import re
from typing import Optional


def extrage_an_achizitie(text_complet: str) -> Optional[int]:
    """
    Extrage anul achiziției/tranzacției din textul Nota Simple (OCR).
    Caută pattern-uri tip: "inscrito en ... 1985", "título de compraventa de 1990", etc.
    """
    if not text_complet or not isinstance(text_complet, str):
        return None
    # Ani plauzibili pentru tranzacție (ex: 1950–2025)
    pattern = r"\b(19[5-9]\d|20[0-2]\d)\b"
    matches = re.findall(pattern, text_complet)
    if not matches:
        return None
    # Presupunem că ultimul an găsit în context de „inscripción”/„título” e relevant
    # Simplu: returnăm cel mai vechi an găsit (probabil anul tranzacției)
    years = [int(m) for m in matches]
    return min(years)


def calculeaza_scor_oportunitate(
    date_catastro: dict,
    date_nota_simple: Optional[dict] = None,
    date_satelit: Optional[dict] = None,
) -> int:
    """
    Calculează scor 0–100. Mai mare = mai mult „red flag” = oportunitate.
    Criterii:
    - Imobil foarte vechi (an construcție < 1970): +15
    - Embargo / Afecciones Fiscales în Nota Simple: +50
    - Tranzacție veche (an achiziție < 1995): +40
    - Piscină abandonată / vegetație (analiză satelit): +20
    """
    scor = 0
    an_constructie = date_catastro.get("year_built")
    if an_constructie is not None and an_constructie < 1970:
        scor += 15

    if date_nota_simple:
        text = (date_nota_simple.get("text_complet") or "") if isinstance(date_nota_simple, dict) else ""
        if "Embargo" in text or "Embargos" in text or "Afección" in text or "Afecciones Fiscales" in text:
            scor += 50
        an_achizitie = extrage_an_achizitie(text)
        if an_achizitie is not None and an_achizitie < 1995:
            scor += 40

    if date_satelit and isinstance(date_satelit, dict):
        if date_satelit.get("stare_piscina") == "CRITIC":
            scor += 20

    return min(100, scor)
