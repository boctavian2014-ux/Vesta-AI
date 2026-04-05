"""
Integrare INE (Instituto Nacional de Estadística) – Indicele Prețurilor Locuințelor (IPV).
Date oficiale trimestriale pentru Spania. Cache TTL=24h (IPV se actualizează trimestrial).

INE serie IPV25171 = Indicele General al Prețurilor Locuințelor (Total España).
API doc: https://www.ine.es/dyngs/DataLab/es/manual.html?cid=66
"""

import logging
import time
from typing import Optional

import requests

logger = logging.getLogger(__name__)

INE_API_URL = "https://servicios.ine.es/wstempus/js/ro/DATOS_SERIE/IPV25171?nult=20"
CACHE_TTL_SECONDS = 24 * 3600  # 24 h – datele se actualizează trimestrial

_cache: dict = {"data": None, "ts": 0.0}


def _quarter_label(fecha: str, anyo) -> str:
    """
    Derivă eticheta trimestrului din câmpul Fecha returnat de INE.
    Exemplu: '2021-04-01T00:00:00' → 'Q2 2021'
    """
    try:
        month = int(str(fecha)[5:7])
        q = (month - 1) // 3 + 1
        return f"Q{q} {anyo}"
    except Exception:
        return str(anyo) if anyo else ""


def get_market_trend() -> list[dict]:
    """
    Returnează lista de puncte de date IPV (Indicele Prețurilor Locuințelor) din INE.
    Cache TTL 24 h. La eroare returnează lista goală (nu blochează generarea raportului).

    Structură fiecare element:
      {
        "date":    str,    # câmpul Fecha brut din INE
        "value":   float,  # valoarea indicelui (ex: 102.4)
        "year":    int,    # ex: 2023
        "quarter": str,    # ex: "Q2 2023"
      }
    """
    now = time.time()
    if _cache["data"] is not None and (now - _cache["ts"]) < CACHE_TTL_SECONDS:
        return _cache["data"]

    try:
        resp = requests.get(INE_API_URL, timeout=10)
        resp.raise_for_status()
        raw = resp.json()
        data_points = raw.get("Data", [])

        trend: list[dict] = []
        for entry in data_points:
            val = entry.get("Valor")
            fecha = entry.get("Fecha", "")
            anyo = entry.get("Anyo")
            if val is not None:
                trend.append({
                    "date": fecha,
                    "value": round(float(val), 2),
                    "year": int(anyo) if anyo else None,
                    "quarter": _quarter_label(fecha, anyo),
                })

        # INE trimite de la cel mai nou → cel mai vechi; inversăm pentru grafic cronologic
        trend.reverse()
        _cache["data"] = trend
        _cache["ts"] = now
        logger.info("INE IPV: %d puncte de date colectate.", len(trend))
        return trend

    except Exception as exc:
        logger.error("Eroare INE IPV: %s", exc)
        return []


def get_capital_appreciation(trend: list[dict]) -> Optional[float]:
    """
    Calculează aprecierea capitalului (%) între primul și ultimul punct IPV.
    Returnează None dacă datele sunt insuficiente.
    """
    valid = [p for p in trend if p.get("value") is not None]
    if len(valid) < 2:
        return None
    start = valid[0]["value"]
    end = valid[-1]["value"]
    if start == 0:
        return None
    return round(((end - start) / start) * 100, 2)


def get_trend_summary(trend: list[dict]) -> dict:
    """
    Returnează un sumar compact al trendului pentru injectare în promptul AI.
    Folosit de expert_report.py și de endpoint-ul /market-trend.
    """
    if not trend:
        return {}
    appreciation = get_capital_appreciation(trend)
    return {
        "source": "INE Spain – Índice de Precios de Vivienda (IPV)",
        "periods": len(trend),
        "start_period": trend[0].get("quarter", ""),
        "end_period": trend[-1].get("quarter", ""),
        "start_index": trend[0].get("value"),
        "end_index": trend[-1].get("value"),
        "capital_appreciation_pct": appreciation,
        # Trimitem doar primele 8 și ultimele 4 puncte în prompt pentru a economisi tokens
        "data_points": [
            {"quarter": p["quarter"], "value": p["value"]}
            for p in (trend[:8] + trend[-4:] if len(trend) > 12 else trend)
        ],
    }
