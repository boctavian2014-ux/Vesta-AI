"""
Raport expert Vesta (49€): combină Nota Simple, date cadastrale și observații satelit
într-un JSON structurat (schema institutional) generat de GPT-4/Claude.
Schema se mapează direct în PDF și UI.
"""
import json
import os
from datetime import date
from typing import Any, Optional

OPENAI_API_KEY = os.getenv("OPENAI_API_KEY")
OPENAI_MODEL = os.getenv("OPENAI_EXPERT_MODEL", "gpt-4o")

# Schema exactă cerută de la AI (injectată în system prompt)
JSON_SCHEMA = {
    "meta": {
        "report_id": "string",
        "as_of_date": "YYYY-MM-DD",
        "currency": "EUR",
        "language": "en|ro|es|de",
    },
    "property": {
        "address": "string",
        "country": "string",
        "lat": 0,
        "lng": 0,
        "asset_type": "apartment|house|land|mixed",
    },
    "risk": {
        "score": 0,
        "level": "low|medium|high",
        "drivers": ["string"],
    },
    "legal": {
        "summary": "string",
        "active_mortgages": ["string"],
        "encumbrances": ["string"],
        "red_flags": ["string"],
    },
    "urbanism": {
        "registered_built_m2": 0,
        "estimated_built_m2": 0,
        "discrepancy_percent": 0,
        "suspected_illegal_works": False,
        "comment": "string",
    },
    "financials": {
        "market_value_min": 0,
        "market_value_max": 0,
        "expected_rent_min": 0,
        "expected_rent_max": 0,
        "gross_yield_percent": 0,
        "roi_5_years_percent": 0,
        "valuation_confidence_score": 0,
        "price_per_m2_zone": 0,
        "price_per_m2_registered": 0,
        "price_per_m2_ai_estimate": 0,
    },
    "neighborhood": {
        "pros": ["string"],
        "cons": ["string"],
    },
    "executive_summary": "string",
}

SYSTEM_PROMPT = """
You are a Senior Real Estate Investment Analyst at Vesta, producing paid
institutional-grade property reports (price point: 49 EUR).

You ALWAYS answer in this language: {language} (one of: en, ro, es, de).

Goal:
Transform raw legal, cadastral, satellite and market data into a
structured, investor-ready JSON object that can be rendered directly
into a professional PDF report.

STRICT OUTPUT FORMAT:
- Return ONLY valid JSON that matches exactly this schema (fields and types):
{schema}

CONCEPTS:
- "Registered" = what appears in official registry / cadastral documents.
- "Estimated" = what you infer from satellite and market context.
- "Risk score" = 0 (very safe) to 100 (extremely risky).

FINANCIAL FORMULAS (apply these exactly):
1. Gross Rental Yield:
   gross_yield_percent = (expected_rent_min * 12) / market_value_min * 100
   Use midpoints if needed: ((rent_min+rent_max)/2 * 12) / ((val_min+val_max)/2) * 100

2. ROI 5 Years (roi_5_years_percent):
   - Annual capital appreciation: 3% compounded
   - Net cash flow per year: (annual_rent - estimated_annual_costs)
     where estimated_annual_costs ≈ 25% of gross rent (taxes, maintenance, vacancy)
   - roi_5_years_percent = ((value_at_year5 - value_today + cumulative_net_cashflow) / value_today) * 100
   - value_at_year5 = market_value_min * (1.03^5)

3. Price per m²:
   - price_per_m2_zone: from market_data avg_sale_price_sqm
   - price_per_m2_registered: market_value_min / registered_built_m2
   - price_per_m2_ai_estimate: market_value_min / estimated_built_m2

4. valuation_confidence_score (0–100):
   Start at 80. Deduct:
   - 15 if no Nota Simple text provided
   - 10 if no market data provided
   - 10 if discrepancy_percent > 10%
   - 5 for each red flag (max −20)
   Add:
   - 10 if market data has avg_sale_price_sqm and avg_rent_price_sqm

POLICY:
- Be conservative and transparent about uncertainty.
- Do NOT invent precise legal facts; you may infer likelihood and describe it.
- If some input data is missing or low quality, reflect that in the comment fields.
- Do NOT output any explanations outside the JSON. No prose before or after.
"""


def build_user_prompt(inputs: dict) -> str:
    """
    Construiește user prompt-ul cu datele brute.
    inputs așteptat:
      nota_simple_text, cadastral_json, satellite_notes, market_data (sau market_json),
      market_trend (sumar INE IPV – opțional), address, country, lat, lng
    """
    trend_summary = inputs.get("market_trend") or {}
    trend_section = ""
    if trend_summary:
        cap_app = trend_summary.get("capital_appreciation_pct")
        trend_section = f"""
6) OFFICIAL HOUSING PRICE INDEX (INE Spain – IPV):
Source: {trend_summary.get('source', 'INE Spain')}
Period: {trend_summary.get('start_period', '')} → {trend_summary.get('end_period', '')}
Index start: {trend_summary.get('start_index')} | Index end: {trend_summary.get('end_index')}
Capital Appreciation ({trend_summary.get('start_period', '')}–{trend_summary.get('end_period', '')}): {f'+{cap_app}%' if cap_app and cap_app > 0 else f'{cap_app}%' if cap_app is not None else 'N/A'}
Quarterly data: {json.dumps(trend_summary.get('data_points', []), ensure_ascii=False)}

Use this index to calibrate your ROI 5-year projection (roi_5_years_percent) and
to contextualize the capital appreciation in the executive_summary.
"""

    return f"""
INPUT DATA FOR VESTA ANALYSIS

1) OFFICIAL REGISTRY / CADASTRAL TEXT (raw, may be noisy):
\"\"\"{inputs.get('nota_simple_text', '') or '(not provided)'}\"\"\"

2) CADASTRAL STRUCTURED DATA (JSON):
{json.dumps(inputs.get('cadastral_json', inputs.get('cadastral_json') or {}), ensure_ascii=False)}

3) SATELLITE / VISION OBSERVATIONS (from your computer vision pipeline):
\"\"\"{inputs.get('satellite_notes', '') or '(none)'}\"\"\"

4) MARKET DATA (recent sales, rents, comparables) as JSON:
{json.dumps(inputs.get('market_data', inputs.get('market_json') or {}), ensure_ascii=False)}

5) BASIC CONTEXT:
- Address: {inputs.get('address', '')}
- Country: {inputs.get('country', '')}
- Coordinates: {inputs.get('lat', 0)}, {inputs.get('lng', 0)}
{trend_section}
Task:
Using ONLY the information above, populate ALL fields of the JSON schema.
If some numeric value cannot be reasonably estimated, set it to null and
explain briefly in the relevant comment/driver text.

Remember: Output must be VALID JSON and nothing else.
""".strip()


def build_user_prompt_with_engine(inputs: dict, engine_metrics: dict | None = None) -> str:
    """
    Extinde promptul de bază cu metricile pre-calculate de VestaFinancialEngine (secțiunea 7).
    Permite AI-ului să valideze / rafineze valorile calculase determinist.
    """
    base_prompt = build_user_prompt(inputs)
    if not engine_metrics:
        return base_prompt

    val_diff = engine_metrics.get("valuation_diff_pct")
    val_note = (
        f"{val_diff:+.1f}% vs market avg" if val_diff is not None else "N/A"
    )

    engine_section = f"""

7) PRE-COMPUTED FINANCIAL METRICS (VestaFinancialEngine – deterministic, use as baseline):
   Gross Yield:              {engine_metrics.get('gross_yield_pct', 'N/A')}%
   Net Yield (−25% costs):  {engine_metrics.get('net_yield_pct', 'N/A')}%
   Monthly Rent Estimate:   {engine_metrics.get('monthly_rent_estimate', 'N/A')} EUR
   Capital Appreciation 5Y: {engine_metrics.get('capital_appreciation_5y_pct', 'N/A')}% (CAGR: {engine_metrics.get('annual_cagr_pct', 'N/A')}%/yr)
   ROI 5 Years:              {engine_metrics.get('roi_5y_pct', 'N/A')}%
   Valuation vs Market:     {engine_metrics.get('valuation_status', 'N/A')} ({val_note})
   Opportunity Score:       {engine_metrics.get('opportunity_score', 'N/A')}/100
   Data Source:             {engine_metrics.get('data_source', 'N/A')}

Cross-check these pre-computed values with your analysis.
You may override them with better estimates if your data justifies it,
but keep the same order of magnitude. Use gross_yield_percent and roi_5_years_percent
from these metrics if no better estimate is available.
"""

    return base_prompt + engine_section


def _clean_json_response(text: str) -> str:
    """Extrage JSON din răspuns (poate fi învelit în ```json ... ```)."""
    text = (text or "").strip()
    for marker in ("```json", "```"):
        if marker in text:
            parts = text.split(marker, 1)
            if len(parts) > 1:
                text = parts[1]
            if "```" in text:
                text = text.split("```", 1)[0]
            break
    return text.strip()


def _default_report(language: str, error: Optional[str] = None) -> dict[str, Any]:
    """Raport implicit în caz de eroare sau lipsă API key."""
    today = date.today().isoformat()
    out = {
        "meta": {
            "report_id": "",
            "as_of_date": today,
            "currency": "EUR",
            "language": language,
        },
        "property": {"address": "", "country": "", "lat": 0, "lng": 0, "asset_type": "apartment"},
        "risk": {"score": 50, "level": "medium", "drivers": []},
        "legal": {"summary": "", "active_mortgages": [], "encumbrances": [], "red_flags": []},
        "urbanism": {
            "registered_built_m2": None,
            "estimated_built_m2": None,
            "discrepancy_percent": None,
            "suspected_illegal_works": False,
            "comment": "",
        },
        "financials": {
            "market_value_min": None,
            "market_value_max": None,
            "expected_rent_min": None,
            "expected_rent_max": None,
            "gross_yield_percent": None,
            "roi_5_years_percent": None,
            "valuation_confidence_score": None,
            "price_per_m2_zone": None,
            "price_per_m2_registered": None,
            "price_per_m2_ai_estimate": None,
        },
        "neighborhood": {"pros": [], "cons": []},
        "executive_summary": "",
    }
    if error:
        out["error"] = error
    return out


def generate_expert_report(inputs: dict, language: str = "en") -> dict[str, Any]:
    """
    Generează raportul expert în schema institutional (meta, property, risk, legal, urbanism, financials, neighborhood, executive_summary).

    Args:
        inputs: dict cu nota_simple_text, cadastral_json, satellite_notes, market_data (sau market_json),
                address, country, lat, lng.
        language: en, ro, es sau de.

    Returns:
        Dict cu schema completă. La eroare, returnează _default_report + cheie "error".
    """
    if not OPENAI_API_KEY:
        return _default_report(language, error="OPENAI_API_KEY not set")

    # Pre-compute deterministic financial metrics to inject as baseline into the AI prompt.
    # Import here to avoid circular deps (financial_analysis imports nothing from expert_report).
    engine_metrics: dict | None = None
    try:
        from financial_analysis import VestaFinancialEngine
        from market_data import get_market_trend
        market_data = inputs.get("market_data") or inputs.get("market_json") or {}
        listing_price = market_data.get("listing_price") or 0
        sqm = inputs.get("sqm") or (
            (inputs.get("cadastral_json") or {}).get("sqm") or
            (inputs.get("cadastral_json") or {}).get("superficie_construida") or 0
        )
        avg_sqm = market_data.get("avg_sqm_price") or market_data.get("avg_sale_price_sqm") or 0
        avg_rent = market_data.get("avg_rent_sqm") or market_data.get("avg_rent_price_sqm") or 0
        if listing_price > 0 and sqm > 0:
            engine = VestaFinancialEngine(
                property_data={"listing_price": listing_price, "sqm": sqm},
                market_data={"avg_sqm_price": avg_sqm, "avg_rent_sqm": avg_rent},
                ine_trend=get_market_trend(),
            )
            engine_metrics = engine.generate_full_metrics()
    except Exception:
        pass  # Non-critical – proceed without engine metrics

    schema_str = json.dumps(JSON_SCHEMA, ensure_ascii=False, indent=2)
    system = SYSTEM_PROMPT.format(language=language, schema=schema_str)
    user_content = build_user_prompt_with_engine(inputs, engine_metrics)

    try:
        from openai import OpenAI

        client = OpenAI(api_key=OPENAI_API_KEY)
        response = client.chat.completions.create(
            model=OPENAI_MODEL,
            messages=[
                {"role": "system", "content": system},
                {"role": "user", "content": user_content},
            ],
            max_tokens=2500,
            temperature=0.2,
        )
        raw = (response.choices[0].message.content or "").strip()
        raw = _clean_json_response(raw)
        report = json.loads(raw)

        # Normalizare: asigură toate cheile de top-level
        for key, default in [
            ("meta", {"report_id": "", "as_of_date": date.today().isoformat(), "currency": "EUR", "language": language}),
            ("property", {"address": "", "country": "", "lat": 0, "lng": 0, "asset_type": "apartment"}),
            ("risk", {"score": 50, "level": "medium", "drivers": []}),
            ("legal", {"summary": "", "active_mortgages": [], "encumbrances": [], "red_flags": []}),
            ("urbanism", {"registered_built_m2": None, "estimated_built_m2": None, "discrepancy_percent": None, "suspected_illegal_works": False, "comment": ""}),
            ("financials", {"market_value_min": None, "market_value_max": None, "expected_rent_min": None, "expected_rent_max": None, "gross_yield_percent": None, "roi_5_years_percent": None, "valuation_confidence_score": None, "price_per_m2_zone": None, "price_per_m2_registered": None, "price_per_m2_ai_estimate": None}),
            ("neighborhood", {"pros": [], "cons": []}),
            ("executive_summary", ""),
        ]:
            if key not in report:
                report[key] = default
            elif isinstance(report[key], dict) and isinstance(default, dict):
                for k, v in default.items():
                    report[key].setdefault(k, v)
        report.setdefault("executive_summary", report.get("executive_summary") or "")

        # Attach deterministic engine metrics for dashboard and PDF use
        if engine_metrics:
            report.setdefault("vesta_engine", engine_metrics)

        return report
    except json.JSONDecodeError as e:
        return _default_report(language, error=f"Invalid JSON from model: {e}")
    except Exception as e:
        return _default_report(language, error=str(e))


def generate_expert_report_legacy(
    language: str,
    nota_simple_text: str,
    cadastral_json: Optional[dict] = None,
    satellite_notes: Optional[str] = None,
    market_json: Optional[dict] = None,
    address: str = "",
    country: str = "",
    lat: Optional[float] = None,
    lng: Optional[float] = None,
) -> dict[str, Any]:
    """
    Semnătură legacy: primește argumente separate și apelează generate_expert_report(inputs, language).
    Returnează noua schemă (meta, property, risk, legal, urbanism, financials, neighborhood, executive_summary).
    """
    inputs = {
        "nota_simple_text": nota_simple_text or "",
        "cadastral_json": cadastral_json or {},
        "satellite_notes": satellite_notes or "",
        "market_data": market_json or {},
        "market_json": market_json or {},
        "address": address or "",
        "country": country or "",
        "lat": lat if lat is not None else 0,
        "lng": lng if lng is not None else 0,
    }
    return generate_expert_report(inputs, language=language)
