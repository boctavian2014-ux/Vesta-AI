"""
VestaFinancialEngine – Motor de analiză financiară pentru active imobiliare.

Calcule deterministe (<500ms), fără API AI. Bazat pe formule CFA/RICS standard:
  • Gross / Net Rental Yield
  • CAGR real din date INE (compound annual growth rate – formula exactă)
  • ROI 5 ani (chirii nete cumulate + apreciere capital)
  • Valuation Status (under/over-priced vs. media pieței)
  • Opportunity Score 0-100

Acest modul este injected în promptul AI ca "pre-computed baseline" (secțiunea 7)
și este expus direct prin endpoint-ul POST /financial-analysis pentru scenarii What-if.
"""

from __future__ import annotations

from typing import Any, Optional


class VestaFinancialEngine:
    """
    Args:
        property_data:  { listing_price, sqm }
        market_data:    { avg_sqm_price, avg_rent_sqm, city? }
        ine_trend:      list[{ value, quarter, year }] din market_data.get_market_trend()

    Fallback-uri:
        • CAGR fallback = 3.5% / an (media istorică Spania dacă nu avem date INE)
        • avg_rent_sqm fallback = 0 (yield-ul va fi 0 fără date de chirie)
    """

    COST_RATIO = 0.25      # 25% din chirie brută = taxe, întreținere, vacanță
    FALLBACK_CAGR = 0.035  # 3.5% / an – media istorică Spania (2015-2024)
    SPAIN_AVG_YIELD = 4.2  # % – benchmark Spania (INE / Idealista research)

    def __init__(
        self,
        property_data: dict[str, Any],
        market_data: dict[str, Any],
        ine_trend: Optional[list[dict]] = None,
    ) -> None:
        self.price = float(property_data.get("listing_price") or 0)
        self.sqm = float(property_data.get("sqm") or 1)
        self.avg_sqm_price = float(market_data.get("avg_sqm_price") or 0)
        self.avg_rent_sqm = float(market_data.get("avg_rent_sqm") or 0)
        self.city = market_data.get("city", "Spain")
        self.ine_trend = [p for p in (ine_trend or []) if p.get("value") is not None]

    # ── Yield ────────────────────────────────────────────────────────────────

    def calculate_monthly_rent_estimate(self) -> Optional[float]:
        """Chirie lunară estimată = suprafață × preț mediu chirie/m²"""
        if self.avg_rent_sqm <= 0:
            return None
        return round(self.sqm * self.avg_rent_sqm, 0)

    def calculate_gross_yield(self) -> float:
        """Randament Brut (%) = (Chirie Anuală / Preț Achiziție) × 100"""
        if self.price <= 0 or self.avg_rent_sqm <= 0:
            return 0.0
        annual_rent = self.sqm * self.avg_rent_sqm * 12
        return round((annual_rent / self.price) * 100, 2)

    def calculate_net_yield(self) -> float:
        """Randament Net (%) = Randament Brut × (1 − COST_RATIO)"""
        return round(self.calculate_gross_yield() * (1 - self.COST_RATIO), 2)

    # ── CAGR & Capital Appreciation ──────────────────────────────────────────

    def calculate_annual_cagr(self) -> float:
        """
        CAGR real din date INE:
            CAGR = (last_index / first_index)^(1 / n_years) − 1
        n_years = n_quarters / 4 (date trimestriale INE)
        Fallback: 3.5% / an dacă nu avem cel puțin 4 trimestre.
        """
        if len(self.ine_trend) < 4:
            return self.FALLBACK_CAGR
        first_val = float(self.ine_trend[0]["value"])
        last_val = float(self.ine_trend[-1]["value"])
        if first_val <= 0:
            return self.FALLBACK_CAGR
        n_years = len(self.ine_trend) / 4.0
        cagr = (last_val / first_val) ** (1.0 / n_years) - 1
        return round(cagr, 4)

    def calculate_capital_appreciation_5y(self) -> float:
        """
        Apreciere Capital 5 ani (%) = ((1 + CAGR)^5 − 1) × 100
        Formula compound corectă.
        """
        cagr = self.calculate_annual_cagr()
        return round(((1 + cagr) ** 5 - 1) * 100, 2)

    # ── ROI 5 Ani ────────────────────────────────────────────────────────────

    def calculate_roi_5y(self) -> float:
        """
        ROI Total 5 ani (%):
            Net Rent Cumulated (5 ani) = Chirie Anuală Brută × (1 − COST_RATIO) × 5
            Capital Gain = Preț × ((1 + CAGR)^5 − 1)
            ROI % = (Net Rent 5Y + Capital Gain) / Preț × 100
        """
        if self.price <= 0:
            return 0.0
        annual_gross_rent = (self.sqm * self.avg_rent_sqm * 12) if self.avg_rent_sqm > 0 else 0
        cumulative_net_rent_5y = annual_gross_rent * (1 - self.COST_RATIO) * 5
        capital_gain = self.price * ((1 + self.calculate_annual_cagr()) ** 5 - 1)
        total_return = cumulative_net_rent_5y + capital_gain
        return round((total_return / self.price) * 100, 2)

    # ── Valuation Status ─────────────────────────────────────────────────────

    def get_valuation_status(self) -> dict[str, Any]:
        """
        Compară prețul/m² al activului cu media pieței.
        Returnează: { label, diff_pct, color, negotiation_note }
        """
        if self.avg_sqm_price <= 0 or self.sqm <= 0 or self.price <= 0:
            return {"label": "Insufficient data", "diff_pct": None, "color": "grey", "negotiation_note": ""}

        current_sqm = self.price / self.sqm
        diff_pct = round(((current_sqm - self.avg_sqm_price) / self.avg_sqm_price) * 100, 1)

        if diff_pct < -15:
            return {
                "label": "Highly Underpriced – Strong Opportunity",
                "diff_pct": diff_pct,
                "color": "green",
                "negotiation_note": f"Asset is {abs(diff_pct):.1f}% below zone average. Immediate equity upside on acquisition.",
            }
        if diff_pct < -5:
            return {
                "label": "Underpriced – Fair Buy",
                "diff_pct": diff_pct,
                "color": "green",
                "negotiation_note": f"Below zone average by {abs(diff_pct):.1f}%. Negotiate to retain margin.",
            }
        if diff_pct <= 5:
            return {
                "label": "Fair Market Value",
                "diff_pct": diff_pct,
                "color": "grey",
                "negotiation_note": "Price aligns with zone comparables. Limited negotiation room.",
            }
        if diff_pct <= 15:
            return {
                "label": "Slightly Overpriced",
                "diff_pct": diff_pct,
                "color": "orange",
                "negotiation_note": f"Asset is {diff_pct:.1f}% above zone average. Use comparables data as negotiation leverage.",
            }
        return {
            "label": "Overpriced – Elevated Risk",
            "diff_pct": diff_pct,
            "color": "red",
            "negotiation_note": f"Asset priced {diff_pct:.1f}% above zone market. Significant downside risk if market corrects.",
        }

    # ── Opportunity Score ────────────────────────────────────────────────────

    def calculate_opportunity_score(self) -> int:
        """
        Scor de oportunitate 0-100. Combină yield, poziționare față de piață și momentum INE.
        Baseline: 50.
        +/− yield vs. benchmark (4.2% Spania): ±20 max
        +/− valuation vs. market: ±20 max (sub-piață = bonus)
        +/− INE CAGR > 3%: ±10
        """
        score = 50

        gross_yield = self.calculate_gross_yield()
        if gross_yield > 0:
            yield_delta = gross_yield - self.SPAIN_AVG_YIELD
            score += max(-20, min(20, int(yield_delta * 4)))

        val_status = self.get_valuation_status()
        if val_status["diff_pct"] is not None:
            score += max(-20, min(20, int(-val_status["diff_pct"] / 1.5)))

        cagr = self.calculate_annual_cagr()
        if cagr > 0.04:
            score += 10
        elif cagr > 0.03:
            score += 5
        elif cagr < 0:
            score -= 10
        elif cagr < 0.02:
            score -= 5

        return max(0, min(100, score))

    # ── What-if ──────────────────────────────────────────────────────────────

    def what_if(self, new_price: float) -> dict[str, Any]:
        """
        Recalculează metricile pentru un preț de achiziție alternativ.
        Util pentru scenarii de negociere sau comparare.
        """
        alt_engine = VestaFinancialEngine(
            property_data={"listing_price": new_price, "sqm": self.sqm},
            market_data={"avg_sqm_price": self.avg_sqm_price, "avg_rent_sqm": self.avg_rent_sqm},
            ine_trend=self.ine_trend,
        )
        return alt_engine.generate_full_metrics()

    # ── Full Report ──────────────────────────────────────────────────────────

    def generate_full_metrics(self) -> dict[str, Any]:
        """Generează toate metricile financiare pentru Dashboard, PDF și prompt AI."""
        val = self.get_valuation_status()
        cagr_pct = round(self.calculate_annual_cagr() * 100, 2)
        monthly_rent = self.calculate_monthly_rent_estimate()
        gross_yield = self.calculate_gross_yield()

        return {
            "gross_yield_pct": gross_yield,
            "net_yield_pct": self.calculate_net_yield(),
            "monthly_rent_estimate": monthly_rent,
            "annual_rent_estimate": round(monthly_rent * 12, 0) if monthly_rent else None,
            "capital_appreciation_5y_pct": self.calculate_capital_appreciation_5y(),
            "annual_cagr_pct": cagr_pct,
            "roi_5y_pct": self.calculate_roi_5y(),
            "valuation_status": val["label"],
            "valuation_diff_pct": val["diff_pct"],
            "valuation_color": val["color"],
            "negotiation_note": val["negotiation_note"],
            "opportunity_score": self.calculate_opportunity_score(),
            "price_per_sqm": round(self.price / self.sqm, 0) if self.sqm > 0 and self.price > 0 else None,
            "market_avg_sqm": self.avg_sqm_price or None,
            "yield_vs_benchmark": round(gross_yield - self.SPAIN_AVG_YIELD, 2) if gross_yield > 0 else None,
            "ine_data_points": len(self.ine_trend),
            "data_source": "INE Spain IPV" if len(self.ine_trend) >= 4 else "Vesta Model (3.5% CAGR fallback)",
        }
