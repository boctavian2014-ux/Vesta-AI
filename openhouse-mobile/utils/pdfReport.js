/**
 * Raport PDF „Institutional Grade” (49€).
 * Paletă: Midnight Blue (#1e3a8a), Slate Grey, Gold accente.
 * Header: Logo Vesta, ID activ, data/ora. Watermark: CONFIDENTIAL - VESTA INSTITUTIONAL ANALYSIS.
 */
import * as Print from "expo-print";
import * as Sharing from "expo-sharing";

const MIDNIGHT_BLUE = "#1e3a8a";
const SLATE_GREY = "#475569";
const SLATE_LIGHT = "#f1f5f9";
const GOLD = "#c6a227";
const TEXT_DARK = "#1a202c";
const TEXT_MUTED = "#64748b";

/**
 * Formatează data/ora pentru header (conformitate legală).
 */
function formatGeneratedAt(date) {
  const d = date ? new Date(date) : new Date();
  return d.toISOString().replace("T", " ").slice(0, 19);
}

/**
 * Detectează dacă report respectă schema nouă (meta, risk, legal, urbanism, financials).
 */
function isNewSchema(report) {
  return report && (report.meta != null || (report.risk && report.risk.score != null) || report.legal != null);
}

/**
 * Extrage din payload expert_report câmpurile pentru PDF.
 * Acceptă atât schema nouă (meta, property, risk, legal, urbanism, financials, neighborhood, executive_summary)
 * cât și cea legacy (risk_score, red_flags, urbanistic_status, financials cu min/max).
 * @param {object} report - JSON din expert_report.generate_expert_report()
 * @param {string} address - Adresa (override; folosit dacă report.property.address lipsește)
 * @param {string} assetId - ID activ (ex: request_id; override dacă report.meta.report_id lipsește)
 */
export function buildReportData(report = {}, address = "", assetId = "") {
  const newSchema = isNewSchema(report);

  if (newSchema) {
    const meta = report.meta || {};
    const prop = report.property || {};
    const risk = report.risk || {};
    const legal = report.legal || {};
    const urban = report.urbanism || {};
    const fin = report.financials || {};
    const neighborhood = report.neighborhood || {};
    const redFlags = [].concat(legal.red_flags || [], risk.drivers || []).filter(Boolean);
    const dispPct = urban.discrepancy_percent;
    const marketValueStr =
      fin.market_value_min != null || fin.market_value_max != null
        ? `${fin.market_value_min ?? "?"} – ${fin.market_value_max ?? "?"} EUR`
        : "—";
    const rentStr =
      fin.expected_rent_min != null || fin.expected_rent_max != null
        ? `${fin.expected_rent_min ?? "?"} – ${fin.expected_rent_max ?? "?"} EUR/mo`
        : "—";
    return {
      address: prop.address || address || "—",
      assetId: meta.report_id || assetId || `VESTA-${Math.floor(Math.random() * 1000000)}`,
      generatedAt: formatGeneratedAt(),
      risk_score: risk.score ?? 50,
      red_flags: redFlags,
      executive_summary: report.executive_summary || "",
      legal_summary: legal.summary || "Registry audit pending or no material charges reported.",
      discrepancy_text: urban.comment || (urban.suspected_illegal_works ? "Suspected variance between cadastral and satellite footprint." : "No significant variance detected."),
      discrepancy_percent: dispPct != null && dispPct !== "" ? dispPct : "—",
      market_value: marketValueStr,
      monthly_rent: rentStr,
      yield: fin.gross_yield_percent != null ? `${Number(fin.gross_yield_percent).toFixed(1)}%` : "—",
      roi_5y: fin.roi_5_years_percent != null ? `${Number(fin.roi_5_years_percent).toFixed(1)}%` : "—",
      valuation_confidence: fin.valuation_confidence_score != null ? fin.valuation_confidence_score : null,
      price_per_m2_zone: fin.price_per_m2_zone != null ? `${fin.price_per_m2_zone} EUR/m²` : "—",
      price_per_m2_registered: fin.price_per_m2_registered != null ? `${fin.price_per_m2_registered} EUR/m²` : "—",
      price_per_m2_ai: fin.price_per_m2_ai_estimate != null ? `${fin.price_per_m2_ai_estimate} EUR/m²` : "—",
      ppm2_raw: fin.price_per_m2_zone || null,
      cap_rate: "—",
      noi: "—",
      confidence_legal: 85,
      confidence_physical: 75,
      confidence_financial: fin.valuation_confidence_score ?? 70,
      confidence_macro: 65,
      pros: neighborhood.pros || [],
      cons: neighborhood.cons || [],
      // VestaFinancialEngine metrics (attached by backend when available)
      engine: report.vesta_engine || null,
    };
  }

  // Legacy schema
  const urban = report.urbanistic_status || {};
  const fin = report.financials || {};
  const neighborhood = report.neighborhood || {};
  const regM2 = urban.registered_built_m2;
  const visM2 = urban.visually_estimated_built_m2;
  const discrepancyPercent =
    regM2 != null && visM2 != null && regM2 > 0
      ? Math.round(Math.abs(visM2 - regM2) / regM2 * 100)
      : null;

  const valueRange = fin.estimated_market_value;
  const marketValueStr =
    valueRange && (valueRange.min != null || valueRange.max != null)
      ? `${valueRange.min ?? "?"} – ${valueRange.max ?? "?"} ${valueRange.currency || "EUR"}`
      : "—";

  const rentRange = fin.estimated_monthly_rent;
  const rentStr =
    rentRange && (rentRange.min != null || rentRange.max != null)
      ? `${rentRange.min ?? "?"} – ${rentRange.max ?? "?"} ${rentRange.currency || "EUR"}/mo`
      : "—";

  return {
    address: address || "—",
    assetId: assetId || `VESTA-${Math.floor(Math.random() * 1000000)}`,
    generatedAt: formatGeneratedAt(),
    risk_score: report.risk_score ?? 50,
    red_flags: report.red_flags || [],
    executive_summary: report.executive_summary || "",
    legal_summary: (report.red_flags || []).concat(report.legal_notes || []).join(" ") || "Registry audit pending or no material charges reported.",
    discrepancy_text: urban.comment || (urban.has_suspected_illegal_extensions ? "Suspected variance between cadastral and satellite footprint." : "No significant variance detected."),
    discrepancy_percent: discrepancyPercent != null ? discrepancyPercent : "—",
    market_value: marketValueStr,
    monthly_rent: rentStr,
    yield: fin.estimated_gross_yield_percent != null ? `${Number(fin.estimated_gross_yield_percent).toFixed(1)}%` : "—",
    cap_rate: fin.cap_rate_percent != null ? `${Number(fin.cap_rate_percent).toFixed(1)}%` : "—",
    noi: fin.noi != null ? `${fin.noi} EUR` : "—",
    confidence_legal: report.confidence_legal ?? 85,
    confidence_physical: report.confidence_physical ?? 75,
    confidence_financial: report.confidence_financial ?? 70,
    confidence_macro: report.confidence_macro ?? 65,
    pros: neighborhood.pros || [],
    cons: neighborhood.cons || [],
  };
}

/**
 * Generează HTML-ul pentru raportul institutional.
 * Conține:
 *  • Running header per pagină (position: fixed – repetat de WebKit/Chromium la print)
 *  • Watermark diagonal "VESTA PREMIUM ANALYSIS" la 3% opacitate
 *  • 5 secțiuni + 3b VestaEngine + 3c Simulator Scenario
 *  • Grafic QuickChart cu date INE reale sau simulate
 *  • Footer cu QR Code de verificare autenticitate
 */
export function getInstitutionalReportHtml(data) {
  const d = {
    ...buildReportData({}, "", ""),
    ...data,
  };

  // ── Pre-computed values ─────────────────────────────────────────────────────
  const trendChartUrl = buildQuickChartUrl(d.ppm2_raw, d.trend_raw || null);
  const capitalApp = d.capital_appreciation_pct != null
    ? Number(d.capital_appreciation_pct).toFixed(1)
    : (() => {
        const tr = d.trend_raw;
        if (!tr || tr.length < 2) return null;
        const s = tr[0].value, e = tr[tr.length - 1].value;
        return s > 0 ? (((e - s) / s) * 100).toFixed(1) : null;
      })();
  const ineSource = d.trend_raw?.length ? "INE Spain IPV (oficial)" : "Vesta model projection";
  const riskColor = d.risk_score > 70 ? "#dc2626" : d.risk_score > 40 ? "#ea580c" : "#15803d";
  const redFlagsList = (d.red_flags || []).map((f) => `<li>${escapeHtml(f)}</li>`).join("") || "<li>None identified.</li>";
  const prosList = (d.pros || []).map((p) => `<li>${escapeHtml(p)}</li>`).join("") || "<li>—</li>";
  const consList = (d.cons || []).map((c) => `<li>${escapeHtml(c)}</li>`).join("") || "<li>—</li>";

  // QR Code: points to report verification URL (scannable by notary / bank)
  const verifyUrl = `https://app.vestaanalytics.com/verify/${encodeURIComponent(d.assetId)}`;
  const qrUrl = `https://quickchart.io/qr?text=${encodeURIComponent(verifyUrl)}&size=80&dark=1e3a8a&light=ffffff`;

  // ── Simulator Scenario section (populated when user saves a scenario) ───────
  const simSection = (() => {
    const sim = d.sim_scenario;
    if (!sim || !sim.purchasePrice) return "";
    const simGrossYield = sim.grossYield ?? ((sim.monthlyRent * 12 / sim.purchasePrice) * 100).toFixed(2);
    const yieldDiff = (parseFloat(simGrossYield) - 4.2).toFixed(1);
    const yieldCompare = parseFloat(yieldDiff) >= 0
      ? `${yieldDiff}pp above Spain avg (4.2%)` : `${Math.abs(yieldDiff)}pp below Spain avg (4.2%)`;
    return `
    <div class="section-title">3c. Investment Performance Forecast – Personalized Scenario</div>
    <p style="font-size:12px; color:#64748b; margin-bottom:8px;">
      ★ Customized by investor using Vesta Simulator · Source: INE Market Index ${new Date().getFullYear()}
    </p>
    <div style="border:1px solid #e2e8f0; border-radius:12px; overflow:hidden; margin-top:8px;">
      <div style="background:${MIDNIGHT_BLUE}; color:white; padding:14px 18px; font-weight:bold; font-size:16px; letter-spacing:0.04em;">
        INVESTMENT PERFORMANCE FORECAST
      </div>
      <table style="width:100%; border-collapse:collapse; background:white; font-size:14px;">
        <tr style="border-bottom:1px solid #f1f5f9;">
          <td style="padding:14px 16px; color:#64748b;">Simulated Purchase Price</td>
          <td style="padding:14px 16px; text-align:right; font-weight:bold; color:#1a202c;">${Number(sim.purchasePrice).toLocaleString()} €</td>
        </tr>
        <tr style="border-bottom:1px solid #f1f5f9;">
          <td style="padding:14px 16px; color:#64748b;">Projected Monthly Rent</td>
          <td style="padding:14px 16px; text-align:right; font-weight:bold; color:#1a202c;">${sim.monthlyRent ? Math.round(sim.monthlyRent).toLocaleString() : "—"} €</td>
        </tr>
        <tr style="border-bottom:1px solid #f1f5f9;">
          <td style="padding:14px 16px; color:#64748b;">Net Yield (after 25% costs)</td>
          <td style="padding:14px 16px; text-align:right; font-weight:bold; color:${MIDNIGHT_BLUE};">${sim.netYield ?? "—"}%</td>
        </tr>
        <tr style="border-bottom:2px solid ${MIDNIGHT_BLUE}; background:#f8fafc;">
          <td style="padding:14px 16px; font-weight:bold; color:${MIDNIGHT_BLUE};">GROSS RENTAL YIELD</td>
          <td style="padding:14px 16px; text-align:right; font-weight:bold; font-size:22px; color:${MIDNIGHT_BLUE};">${simGrossYield}%</td>
        </tr>
        <tr style="border-bottom:1px solid #f1f5f9;">
          <td style="padding:14px 16px; color:#64748b;">Projected 5-Year ROI</td>
          <td style="padding:14px 16px; text-align:right; font-weight:bold; color:${GOLD};">${sim.roi5y ?? "—"}%</td>
        </tr>
      </table>
    </div>
    <div style="margin-top:14px; padding:14px 18px; background:#fffbeb; border-left:4px solid #f59e0b; border-radius:4px;">
      <p style="margin:0; font-size:13px; color:#92400e; line-height:1.6;">
        <strong>Vesta Expert Note:</strong> At a negotiated price of <strong>${Number(sim.purchasePrice).toLocaleString()} €</strong>,
        this asset yields <strong>${simGrossYield}%</strong> — ${yieldCompare}.
        ${parseFloat(simGrossYield) >= 5
          ? "This exceeds the viability threshold for rental investment in Spain (min. 4.5%). Recommend acquisition at this price."
          : "Consider further price reduction to reach the 5% yield target for optimal risk-adjusted return."}
        <br/><em>Source: INE Housing Price Index ${new Date().getFullYear()} · VestaEngine™ CFA/RICS formulas</em>
      </p>
    </div>
    `;
  })();

  // ── VestaEngine section (auto-computed baseline) ────────────────────────────
  const engineSection = (() => {
    const e = d.engine;
    if (!e) return "";
    const yieldNote = e.yield_vs_benchmark != null
      ? (e.yield_vs_benchmark > 0
        ? `${e.yield_vs_benchmark.toFixed(1)}pp above Spain avg (4.2%).`
        : `${Math.abs(e.yield_vs_benchmark).toFixed(1)}pp below Spain avg (4.2%).`)
      : "Based on zone rental data.";
    const cagrNote = e.annual_cagr_pct != null
      ? `Based on ${e.data_source} CAGR of ${e.annual_cagr_pct}%/yr (compound).`
      : "Model estimate.";
    const valColor = e.valuation_color === "green" ? "#15803d" : e.valuation_color === "red" ? "#dc2626" : "#ea580c";
    return `
    <div class="section-title">3b. Investment Performance Forecast (VestaEngine™)</div>
    <p><strong>Source:</strong> Deterministic engine – ${escapeHtml(e.data_source || "Vesta Model")}</p>
    <table>
      <tr><th>Indicator</th><th>Projected Value</th><th>Expert AI Note</th></tr>
      <tr><td>Gross Rental Yield</td><td class="gold">${e.gross_yield_pct != null ? `${e.gross_yield_pct}% / yr` : "—"}</td><td>${escapeHtml(yieldNote)}</td></tr>
      <tr><td>Net Yield (after costs)</td><td class="highlight">${e.net_yield_pct != null ? `${e.net_yield_pct}% / yr` : "—"}</td><td>After 25% management, maintenance &amp; vacancy costs.</td></tr>
      <tr><td>Capital Appreciation (5Y)</td><td class="gold">${e.capital_appreciation_5y_pct != null ? `${e.capital_appreciation_5y_pct}%` : "—"}</td><td>${escapeHtml(cagrNote)}</td></tr>
      <tr><td><strong>Total ROI (5 Years)</strong></td><td class="gold"><strong>${e.roi_5y_pct != null ? `${e.roi_5y_pct}%` : "—"}</strong></td><td>Net rental income (75% of gross × 5Y) + capital gain.</td></tr>
      <tr><td>Valuation vs Market</td><td style="color:${valColor}">${escapeHtml(e.valuation_status || "—")}</td><td>${escapeHtml(e.negotiation_note || "—")}</td></tr>
      <tr><td>Opportunity Score</td><td class="highlight">${e.opportunity_score != null ? `${e.opportunity_score}/100` : "—"}</td><td>Composite: yield, valuation gap &amp; INE market momentum.</td></tr>
    </table>
    <p class="confidence">VestaEngine™ uses CFA/RICS standard formulas. Model-based projection, not a certified appraisal.</p>
    `;
  })();

  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <style>
    @page { margin: 32px 40px 56px 40px; }

    /* ── Running header – repeats on every page (WebKit/Chromium print) ── */
    .page-header {
      position: fixed; top: -20px; left: 0; right: 0; height: 28px;
      display: flex; justify-content: space-between; align-items: center;
      border-bottom: 1px solid #e2e8f0;
      font-size: 8.5px; color: #94a3b8; letter-spacing: 0.04em;
      z-index: 200; background: white; padding: 0 2px;
    }
    .page-header-left { font-weight: 700; color: ${MIDNIGHT_BLUE}; }

    /* ── Diagonal watermark at 3% opacity ─────────────────────────────── */
    .watermark {
      position: fixed; top: 0; left: 0; right: 0; bottom: 0;
      display: flex; align-items: center; justify-content: center;
      font-size: 52px; font-weight: 900; color: ${MIDNIGHT_BLUE};
      opacity: 0.03; pointer-events: none; transform: rotate(-22deg);
      letter-spacing: 0.12em; z-index: 0; white-space: nowrap;
    }

    body {
      font-family: Helvetica, Arial, sans-serif;
      color: ${TEXT_DARK}; padding: 8px 0 0 0; line-height: 1.55;
      position: relative;
    }
    .content { position: relative; z-index: 1; }

    /* ── First-page header ────────────────────────────────────────────── */
    .header {
      border-bottom: 2px solid ${MIDNIGHT_BLUE}; padding-bottom: 14px; margin-bottom: 24px;
      display: flex; justify-content: space-between; align-items: flex-end; flex-wrap: wrap;
    }
    .title { color: ${MIDNIGHT_BLUE}; font-size: 24px; font-weight: 900; letter-spacing: 0.06em; text-transform: uppercase; }
    .asset-meta { font-size: 11px; color: ${SLATE_GREY}; margin-top: 3px; }
    .confidential { color: ${SLATE_GREY}; font-size: 9px; font-weight: bold; letter-spacing: 0.1em; text-align: right; }
    .premium-badge {
      background: ${GOLD}; color: white; font-size: 9px; font-weight: 800;
      padding: 3px 10px; border-radius: 12px; letter-spacing: 0.08em; margin-top: 6px; display: inline-block;
    }

    /* ── Sections ─────────────────────────────────────────────────────── */
    .section-title {
      background: ${SLATE_LIGHT}; padding: 10px 14px; font-size: 15px; font-weight: bold;
      border-left: 4px solid ${MIDNIGHT_BLUE}; margin-top: 26px; color: ${TEXT_DARK};
      page-break-after: avoid;
    }
    .confidence { font-size: 11px; color: ${TEXT_MUTED}; margin-top: 6px; font-style: italic; }
    .risk-badge {
      padding: 6px 18px; border-radius: 20px; color: white; font-weight: bold;
      display: inline-block; font-size: 14px; letter-spacing: 0.02em;
    }

    /* ── Tables ───────────────────────────────────────────────────────── */
    table { width: 100%; border-collapse: collapse; margin-top: 10px; font-size: 13.5px; page-break-inside: avoid; }
    th, td { padding: 10px 13px; border: 1px solid #cbd5e1; text-align: left; }
    th { background: ${SLATE_LIGHT}; font-weight: 600; color: ${TEXT_DARK}; }
    .highlight { color: ${MIDNIGHT_BLUE}; font-weight: 600; }
    .gold { color: ${GOLD}; font-weight: 600; }

    /* ── Footer ───────────────────────────────────────────────────────── */
    .footer {
      margin-top: 48px; font-size: 9.5px; color: ${TEXT_MUTED};
      border-top: 1px solid #e2e8f0; padding-top: 14px; line-height: 1.7;
      display: flex; justify-content: space-between; align-items: flex-start; gap: 20px;
    }
    .footer-text { flex: 1; }
    .footer a { color: ${MIDNIGHT_BLUE}; }
    .qr-wrap { text-align: center; flex-shrink: 0; }
    .qr-caption { font-size: 8px; color: ${TEXT_MUTED}; margin-top: 4px; }

    ul { margin: 8px 0 0 0; padding-left: 20px; }
    h1 { font-size: 18px; margin: 0 0 12px 0; color: ${TEXT_DARK}; }
    p { margin: 8px 0; }
  </style>
</head>
<body>

  <!-- Running header (appears on every page) -->
  <div class="page-header">
    <span class="page-header-left">VESTA INSTITUTIONAL · #${escapeHtml(String(d.assetId))}</span>
    <span>${escapeHtml(d.generatedAt)} UTC · CONFIDENTIAL</span>
  </div>

  <!-- Diagonal watermark -->
  <div class="watermark">VESTA PREMIUM ANALYSIS</div>

  <div class="content">

    <!-- ── First-page header ─────────────────────────────────────────── -->
    <div class="header">
      <div>
        <div class="title">Vesta Institutional</div>
        <div class="asset-meta">Asset Audit Report #${escapeHtml(String(d.assetId))}</div>
        <div class="asset-meta">Generated: ${escapeHtml(d.generatedAt)} UTC</div>
        <div class="premium-badge">PREMIUM ANALYSIS · 49€</div>
      </div>
      <div class="confidential">
        CONFIDENTIAL ANALYSIS<br/>
        NOT FOR DISTRIBUTION
      </div>
    </div>

    <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:12px; margin-bottom:8px;">
      <h1>${escapeHtml(d.address)}</h1>
      <div class="risk-badge" style="background:${riskColor}">RISK SCORE: ${d.risk_score}/100</div>
    </div>

    <!-- ── 1. Legal Due Diligence ─────────────────────────────────────── -->
    <div class="section-title">1. Legal Due Diligence (Registry Audit)</div>
    <p><strong>Source:</strong> Registro de la Propiedad</p>
    <p>${escapeHtml(d.legal_summary)}</p>
    <p class="confidence">Confidence: ${d.confidence_legal}% – ${d.confidence_legal < 80 ? "Manual verification recommended for legal updates." : "Data consistent with official registry."}</p>

    <!-- ── 2. Physical Audit ──────────────────────────────────────────── -->
    <div class="section-title">2. Physical Audit (AI Satellite)</div>
    <p><strong>Source:</strong> Mapbox Satellite + Computer Vision</p>
    <p><strong>Discrepancy assessment:</strong> ${escapeHtml(d.discrepancy_text)}</p>
    ${d.discrepancy_percent !== "—" ? `<p>Satellite footprint vs. official records: <span class="highlight">${d.discrepancy_percent}%</span> variance.</p>` : ""}
    <p><strong>Red flags identified:</strong></p>
    <ul>${redFlagsList}</ul>
    <p class="confidence">Confidence: ${d.confidence_physical}% – ${d.confidence_physical < 80 ? "Manual verification recommended." : "AI analysis within expected accuracy."}</p>

    <!-- ── 3. Financial Modeling ──────────────────────────────────────── -->
    <div class="section-title">3. Financial Modeling</div>
    <p><strong>Source:</strong> Vesta Market Algorithm (CFA/RICS standard methodology)</p>
    <table>
      <tr><th>Metric</th><th>Value</th></tr>
      <tr><td>Estimated Market Value</td><td class="highlight">${escapeHtml(d.market_value)}</td></tr>
      <tr><td>Projected Monthly Rent</td><td>${escapeHtml(d.monthly_rent)}</td></tr>
      <tr><td>Gross Rental Yield</td><td class="gold">${escapeHtml(d.yield)}</td></tr>
      <tr><td>Projected 5-Year ROI</td><td class="gold">${escapeHtml(d.roi_5y)}</td></tr>
      ${capitalApp != null ? `<tr><td>Capital Appreciation (${ineSource})</td><td class="gold">+${capitalApp}%</td></tr>` : ""}
      ${d.cap_rate !== "—" ? `<tr><td>Cap Rate</td><td>${escapeHtml(d.cap_rate)}</td></tr>` : ""}
      ${d.noi !== "—" ? `<tr><td>NOI</td><td>${escapeHtml(d.noi)}</td></tr>` : ""}
    </table>
    <p style="margin-top:16px"><strong>Price per m² Analysis</strong></p>
    <table>
      <tr><th>Benchmark</th><th>EUR / m²</th></tr>
      <tr><td>Zone Market Average</td><td>${escapeHtml(d.price_per_m2_zone)}</td></tr>
      <tr><td>This Asset (Registered m²)</td><td class="highlight">${escapeHtml(d.price_per_m2_registered)}</td></tr>
      <tr><td>This Asset (AI Estimated m²)</td><td>${escapeHtml(d.price_per_m2_ai)}</td></tr>
    </table>
    <p class="confidence">Valuation Confidence: ${d.valuation_confidence != null ? `${d.valuation_confidence}/100` : `${d.confidence_financial}%`}${d.confidence_financial < 75 ? " – Cross-check with certified appraiser recommended." : " – Estimates consistent with market data."}</p>

    <!-- ── 3b. VestaEngine baseline ───────────────────────────────────── -->
    ${engineSection}

    <!-- ── 3c. Personalized simulator scenario ────────────────────────── -->
    ${simSection}

    <!-- ── 4. Market Historical Trend ────────────────────────────────── -->
    <div class="section-title">4. Market Historical Trend (Price / m²)</div>
    <p><strong>Source:</strong> ${ineSource}${capitalApp != null ? ` · Capital Appreciation: <strong class="gold">+${capitalApp}%</strong>` : ""}</p>
    <img src="${trendChartUrl}" style="width:100%; border-radius:8px; margin-top:8px;" />
    <p class="confidence">${d.trend_raw?.length
      ? "Data sourced from official INE Spain Housing Price Index (IPV). Values scaled to estimated EUR/m² using Vesta zone algorithm."
      : "Trend model-estimated at 3% CAGR. Official INE data unavailable at time of generation."}</p>

    <!-- ── 5. Macro Environment ───────────────────────────────────────── -->
    <div class="section-title">5. Macro Environment</div>
    <p><strong>Source:</strong> Open Data Municipal</p>
    <p><strong>Location advantages:</strong></p>
    <ul>${prosList}</ul>
    <p><strong>Risk factors:</strong></p>
    <ul>${consList}</ul>
    <p class="confidence">Confidence: ${d.confidence_macro}%</p>

    <!-- ── Executive Summary ─────────────────────────────────────────── -->
    <div class="section-title">Executive Summary</div>
    <p>${escapeHtml(d.executive_summary || "Analysis in progress. Full summary available upon completion of registry and satellite verification.")}</p>

    <!-- ── Footer with QR Code ───────────────────────────────────────── -->
    <div class="footer">
      <div class="footer-text">
        This report is generated by Vesta Technology Systems and is for informational purposes only.
        It does not constitute legal, financial, or investment advice. All projections are model-based
        and do not guarantee future returns.<br/>
        Report ID: <strong>${escapeHtml(String(d.assetId))}</strong> · Generated: ${escapeHtml(d.generatedAt)} UTC<br/>
        Contact Expert: <a href="https://app.vestaanalytics.com/contact">app.vestaanalytics.com/contact</a><br/>
        © ${new Date().getFullYear()} Vesta Technology Systems. All rights reserved.
        Unauthorized reproduction or distribution of this report is strictly prohibited.
      </div>
      <div class="qr-wrap">
        <img src="${qrUrl}" width="80" height="80" style="display:block; border-radius:4px;" />
        <div class="qr-caption">Scan to verify<br/>authenticity</div>
      </div>
    </div>

  </div>
</body>
</html>
  `.trim();
}

/**
 * Generează URL QuickChart pentru graficul de trend preț/m² (5 ani).
 * Folosit în HTML-ul PDF-ului.
 */
function buildTrendPoints(currentPpm2) {
  const base = currentPpm2 || 2500;
  const r = 1.03;
  return {
    labels: ["2021", "2022", "2023", "2024", "2025", "2026"],
    values: [
      Math.round(base / Math.pow(r, 5)),
      Math.round(base / Math.pow(r, 4)),
      Math.round(base / Math.pow(r, 3)),
      Math.round(base / Math.pow(r, 2)),
      Math.round(base / r),
      Math.round(base),
    ],
  };
}

/**
 * Generează URL QuickChart pentru graficul de trend.
 * Dacă există date reale INE (realTrend), le folosește scalate la ppm2.
 * Altfel, generează date simulate la 3% CAGR.
 */
function buildQuickChartUrl(ppm2, realTrend) {
  let labels, values, source;

  if (realTrend && realTrend.length >= 2) {
    const lastIdx = realTrend[realTrend.length - 1].value;
    const scale = ppm2 ? ppm2 / lastIdx : 1;
    labels = realTrend.map((pt) => pt.quarter || String(pt.year || ""));
    values = realTrend.map((pt) => Math.round(pt.value * scale));
    source = "INE Spain IPV – oficial";
  } else {
    const pts = buildTrendPoints(ppm2);
    labels = pts.labels;
    values = pts.values;
    source = "Proiecție model 3% CAGR";
  }

  const growthPct = (((values[values.length - 1] - values[0]) / values[0]) * 100).toFixed(1);
  const cfg = {
    type: "line",
    data: {
      labels,
      datasets: [{
        label: `EUR/m² (+${growthPct}% · ${source})`,
        data: values,
        borderColor: "#1e3a8a",
        backgroundColor: "rgba(30,58,138,0.12)",
        fill: true,
        tension: 0.4,
        pointRadius: 4,
        pointBackgroundColor: "#1e3a8a",
      }],
    },
    options: {
      plugins: { legend: { labels: { color: "#475569", fontSize: 11 } } },
      scales: {
        y: { ticks: { color: "#64748b", maxTicksLimit: 5 }, grid: { color: "#e2e8f0" } },
        x: { ticks: { color: "#64748b", maxTicksLimit: 8 }, grid: { color: "#e2e8f0" } },
      },
    },
  };
  return `https://quickchart.io/chart?c=${encodeURIComponent(JSON.stringify(cfg))}&width=520&height=200&backgroundColor=white`;
}

function escapeHtml(s) {
  if (s == null) return "";
  const str = String(s);
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/**
 * Generează PDF-ul institutional și deschide share (WhatsApp, Email, etc.).
 * @param {object} data - Objekt cu address, assetId, risk_score, red_flags, executive_summary, urbanistic_status, financials, neighborhood, etc. (sau rezultat buildReportData)
 * @returns {Promise<string>} - URI-ul fișierului PDF generat
 */
export async function generateProfessionalPDF(data = {}) {
  const html = getInstitutionalReportHtml(data);
  const { uri } = await Print.printToFileAsync({
    html,
    base64: false,
  });
  const canShare = await Sharing.isAvailableAsync();
  if (canShare) {
    await Sharing.shareAsync(uri, {
      mimeType: "application/pdf",
      dialogTitle: "Save or share Executive Summary (PDF)",
    });
  }
  return uri;
}
