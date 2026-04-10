"""
Integrare INE (Instituto Nacional de Estadística) – Indicele Prețurilor Locuințelor (IPV).
Date oficiale trimestriale pentru Spania. Cache TTL=24h (IPV se actualizează trimestrial).

INE serie IPV769 = Total Nacional. General. Índice (IPV — precios de la vivienda).
Notă: codul vechi IPV25171 nu mai returnează date pe API-ul Tempus (răspuns gol).

API doc: https://www.ine.es/dyngs/DataLab/es/manual.html?cid=66
"""

import logging
import time
from datetime import datetime, timezone
from typing import Optional, Union

import requests

logger = logging.getLogger(__name__)

# Total Nacional · Índice (recomandat). IPV25171 pe Tempus returnează body gol.
INE_API_URL_PRIMARY = "https://servicios.ine.es/wstempus/js/ES/DATOS_SERIE/IPV769?nult=40"
# Rezervă: Nacional Base 2007 · General · Índice (aceeași operațiune IPV, alt cod).
INE_API_URL_FALLBACK = "https://servicios.ine.es/wstempus/js/ES/DATOS_SERIE/IPV1?nult=40"

CACHE_TTL_SECONDS = 24 * 3600  # 24 h – datele se actualizează trimestrial
EMPTY_BACKOFF_SECONDS = 300  # nu bate INE la fiecare request dacă ambele URL-uri sunt goale

_cache: dict = {"data": None, "ts": 0.0, "empty_until": 0.0}

INE_REQUEST_HEADERS = {
    "User-Agent": "Vesta-AI/1.0 (market trend; +https://github.com/boctavian2014-ux/Vesta-AI)",
    "Accept": "application/json",
}


def _normalize_fecha(fecha: Union[str, int, float, None], anyo) -> tuple[str, Optional[int]]:
    """
    INE returnează Fecha fie ca string ISO, fie ca timestamp în milisecunde (int).
    Returnează (date_str YYYY-MM-DD sau echivalent, luna 1–12 pentru trimestru).
    """
    if fecha is None:
        return "", None
    try:
        if isinstance(fecha, (int, float)) and fecha > 1_000_000_000_000:
            dt = datetime.fromtimestamp(fecha / 1000.0, tz=timezone.utc)
            return dt.strftime("%Y-%m-%d"), dt.month
        s = str(fecha)
        if len(s) >= 10 and s[4] == "-" and s[7] == "-":
            month = int(s[5:7])
            return s[:10], month
        return s, None
    except Exception:
        return str(fecha), None


def _quarter_label(fecha_raw: Union[str, int, float, None], anyo) -> str:
    """
    Derivă eticheta trimestrului din câmpul Fecha returnat de INE.
    """
    _, month = _normalize_fecha(fecha_raw, anyo)
    try:
        if month is not None:
            q = (month - 1) // 3 + 1
            return f"Q{q} {anyo}"
    except Exception:
        pass
    return str(anyo) if anyo else ""


def _points_from_ine_payload(raw: dict) -> list[dict]:
    """Construiește lista trend din obiectul JSON returnat de DATOS_SERIE."""
    data_points = raw.get("Data", [])
    if not isinstance(data_points, list):
        return []
    trend: list[dict] = []
    for entry in data_points:
        if not isinstance(entry, dict):
            continue
        val = entry.get("Valor")
        fecha_raw = entry.get("Fecha", "")
        anyo = entry.get("Anyo")
        if val is not None:
            date_str, _ = _normalize_fecha(fecha_raw, anyo)
            trend.append({
                "date": date_str or str(fecha_raw),
                "value": round(float(val), 2),
                "year": int(anyo) if anyo else None,
                "quarter": _quarter_label(fecha_raw, anyo),
            })
    trend.reverse()
    return trend


def _fetch_ine_series(url: str) -> list[dict]:
    resp = requests.get(url, timeout=20, headers=INE_REQUEST_HEADERS)
    resp.raise_for_status()
    if not (resp.content or b"").strip():
        logger.warning("INE răspuns gol la %s", url.split("?")[0])
        return []
    raw = resp.json()
    if not isinstance(raw, dict):
        return []
    return _points_from_ine_payload(raw)


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
    # Cache doar rezultate cu date; nu păstrăm [] 24h (bloca redeploy-urile / serii noi).
    if _cache["data"] and len(_cache["data"]) > 0 and (now - _cache["ts"]) < CACHE_TTL_SECONDS:
        return _cache["data"]
    if now < float(_cache.get("empty_until") or 0):
        return []

    try:
        trend = _fetch_ine_series(INE_API_URL_PRIMARY)
        if not trend:
            logger.info("INE IPV769 fără puncte; încerc IPV1.")
            trend = _fetch_ine_series(INE_API_URL_FALLBACK)

        if trend:
            _cache["data"] = trend
            _cache["ts"] = now
            _cache["empty_until"] = 0.0
            logger.info("INE IPV: %d puncte colectate.", len(trend))
        else:
            _cache["empty_until"] = now + EMPTY_BACKOFF_SECONDS
            logger.error("INE IPV: nici IPV769 nici IPV1 nu au întors puncte.")

        return trend

    except Exception as exc:
        _cache["empty_until"] = now + EMPTY_BACKOFF_SECONDS
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
