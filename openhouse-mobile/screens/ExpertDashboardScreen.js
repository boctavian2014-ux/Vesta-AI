/**
 * Expert Dashboard – Vesta Institutional (49€)
 * Dark Navy (#0f172a), module: Risc · Urbanistic · Financiar · Trend · Comparabile · Sumar
 */
import React, { useEffect, useState, useRef } from "react";
import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet,
  ActivityIndicator, Animated, Alert, Dimensions,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useTranslation } from "react-i18next";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { BarChart, LineChart } from "react-native-gifted-charts";
import { generateProfessionalPDF, buildReportData } from "../utils/pdfReport";
import { getMarketTrend } from "../api";
import InvestmentSimulator from "../components/InvestmentSimulator";
import { spacing } from "../theme";

const { width: SCREEN_W } = Dimensions.get("window");
const CHART_W = SCREEN_W - spacing.lg * 2 - 32;

const BG = "#0f172a";
const CARD_BG = "#1e293b";
const BORDER = "#334155";
const BLUE = "#3b82f6";
const GOLD = "#c6a227";
const GREEN = "#15803d";
const ORANGE = "#ea580c";
const RED = "#dc2626";

const CACHE_PREFIX = "@vesta_report_";

// ── Helpers ───────────────────────────────────────────────────────────────────

function riskColor(score) {
  if (score <= 30) return GREEN;
  if (score <= 60) return ORANGE;
  return RED;
}

function riskLabel(level, t) {
  return t(`risk_level_${level || "medium"}`);
}

function fmt(n, fallback = "—") {
  if (n == null) return fallback;
  return Number(n).toLocaleString();
}

/** Fallback: simulated 3% CAGR trend when real INE data is unavailable */
function buildSimulatedTrend(ppm2) {
  const base = ppm2 || 2500;
  const r = 1.03;
  return [
    { value: Math.round(base / Math.pow(r, 5)), label: "2021" },
    { value: Math.round(base / Math.pow(r, 4)), label: "2022" },
    { value: Math.round(base / Math.pow(r, 3)), label: "2023" },
    { value: Math.round(base / Math.pow(r, 2)), label: "2024" },
    { value: Math.round(base / r),               label: "2025" },
    { value: Math.round(base),                   label: "2026" },
  ];
}

/**
 * Scales real INE IPV index points to EUR/m² using the current ppm2 value.
 * When ppm2 is unknown, returns raw index values with an appropriate label.
 * Labels show year only on Q1 to avoid clutter.
 */
function scaleIneToChart(realTrend, ppm2) {
  const lastIdx = realTrend[realTrend.length - 1].value;
  const scale = ppm2 ? ppm2 / lastIdx : 1;
  return realTrend.map((pt) => ({
    value: Math.round(pt.value * scale),
    label: pt.quarter?.startsWith("Q1") ? String(pt.year ?? "").slice(2) : "",
  }));
}

function buildComparables(fin, address) {
  const base = fin.market_value_min;
  if (!base) return [];
  const zone = address?.split(",")[1]?.trim() || "zone";
  const ppm2 = fin.price_per_m2_registered || null;
  return [
    { label: `Similar · ${zone}`, price: Math.round(base * 0.96), m2: ppm2 ? Math.round(ppm2 * 0.97) : null, delta: -4 },
    { label: `Premium · ${zone}`, price: Math.round(base * 1.08), m2: ppm2 ? Math.round(ppm2 * 1.12) : null, delta: +8 },
    { label: `Entry · ${zone}`,   price: Math.round(base * 0.88), m2: ppm2 ? Math.round(ppm2 * 0.85) : null, delta: -12 },
  ];
}

// ── Sub-components ────────────────────────────────────────────────────────────

function RiskGauge({ score = 50 }) {
  const animValue = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.timing(animValue, { toValue: score, duration: 1200, useNativeDriver: false }).start();
  }, [score]);
  const color = riskColor(score);
  const size = 140;
  const bw = 12;
  return (
    <View style={[gaugeStyles.wrap, { width: size, height: size }]}>
      <View style={[gaugeStyles.ring, { width: size, height: size, borderRadius: size / 2, borderWidth: bw, borderColor: BORDER }]} />
      <View style={[gaugeStyles.ring, gaugeStyles.absolute, {
        width: size, height: size, borderRadius: size / 2,
        borderWidth: bw, borderColor: color,
        shadowColor: color, shadowOpacity: 0.7, shadowRadius: 16, elevation: 8, opacity: 0.85,
      }]} />
      <View style={gaugeStyles.absolute}>
        <Text style={[gaugeStyles.score, { color }]}>{score}</Text>
        <Text style={gaugeStyles.of}>/100</Text>
      </View>
    </View>
  );
}

const gaugeStyles = StyleSheet.create({
  wrap: { alignItems: "center", justifyContent: "center" },
  ring: { position: "absolute" },
  absolute: { position: "absolute", alignItems: "center", justifyContent: "center" },
  score: { fontSize: 36, fontWeight: "800", lineHeight: 40 },
  of: { fontSize: 13, color: "#64748b", marginTop: 2 },
});

function RedFlagChip({ text }) {
  return (
    <View style={chipStyles.chip}>
      <Text style={chipStyles.dot}>⚠</Text>
      <Text style={chipStyles.text}>{text}</Text>
    </View>
  );
}

const chipStyles = StyleSheet.create({
  chip: { flexDirection: "row", alignItems: "flex-start", gap: 6, backgroundColor: "#2d1515", borderRadius: 8, paddingHorizontal: 10, paddingVertical: 6, marginTop: 6 },
  dot: { color: RED, fontSize: 13, marginTop: 1 },
  text: { color: "#fca5a5", fontSize: 13, flex: 1, lineHeight: 18 },
});

function InfoRow({ label, value, accent }) {
  return (
    <View style={rowStyles.row}>
      <Text style={rowStyles.label}>{label}</Text>
      <Text style={[rowStyles.value, accent && { color: accent, fontWeight: "700" }]}>{value}</Text>
    </View>
  );
}

const rowStyles = StyleSheet.create({
  row: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingVertical: 7, borderBottomWidth: 1, borderBottomColor: BORDER },
  label: { fontSize: 13, color: "#64748b" },
  value: { fontSize: 13, color: "#e2e8f0", fontWeight: "500" },
});

// ── Sticky Header Bar ─────────────────────────────────────────────────────────

function StickyBar({ address, riskScore }) {
  const color = riskColor(riskScore ?? 50);
  return (
    <View style={stickyStyles.bar}>
      <Text style={stickyStyles.address} numberOfLines={1}>{address || "—"}</Text>
      <View style={[stickyStyles.badge, { backgroundColor: color }]}>
        <Text style={stickyStyles.badgeText}>RISK {riskScore ?? "—"}</Text>
      </View>
    </View>
  );
}

const stickyStyles = StyleSheet.create({
  bar: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    backgroundColor: "#0d1b2e", paddingHorizontal: spacing.lg, paddingVertical: 10,
    borderBottomWidth: 1, borderBottomColor: BORDER,
  },
  address: { flex: 1, fontSize: 13, fontWeight: "600", color: "#cbd5e1", marginRight: 10 },
  badge: { borderRadius: 8, paddingHorizontal: 10, paddingVertical: 4 },
  badgeText: { fontSize: 11, fontWeight: "800", color: "#fff", letterSpacing: 0.5 },
});

// ── Valuation Chip ───────────────────────────────────────────────────────────

const VALUATION_COLORS = {
  green: { bg: "#052e16", text: "#4ade80", border: "#166534" },
  orange: { bg: "#1c1400", text: "#fbbf24", border: "#92400e" },
  red: { bg: "#1c0505", text: "#f87171", border: "#7f1d1d" },
  grey: { bg: "#1e293b", text: "#94a3b8", border: "#334155" },
};

function ValuationChip({ label, diffPct, color = "grey" }) {
  const c = VALUATION_COLORS[color] || VALUATION_COLORS.grey;
  return (
    <View style={[valStyles.chip, { backgroundColor: c.bg, borderColor: c.border }]}>
      <Text style={[valStyles.label, { color: c.text }]}>{label}</Text>
      {diffPct != null && (
        <Text style={[valStyles.diff, { color: c.text }]}>
          {diffPct >= 0 ? "+" : ""}{diffPct}% vs market
        </Text>
      )}
    </View>
  );
}

const valStyles = StyleSheet.create({
  chip: { borderRadius: 10, borderWidth: 1, padding: spacing.sm, marginTop: spacing.md },
  label: { fontSize: 13, fontWeight: "700" },
  diff: { fontSize: 12, marginTop: 2, opacity: 0.85 },
});

// ── Opportunity Score ─────────────────────────────────────────────────────────

function OpportunityScore({ score, t }) {
  const color = score >= 65 ? GREEN : score >= 45 ? ORANGE : RED;
  const label = score >= 65 ? t("opp_high") : score >= 45 ? t("opp_medium") : t("opp_low");
  return (
    <View style={oppStyles.wrap}>
      <View style={[oppStyles.bar, { width: `${score}%`, backgroundColor: color }]} />
      <View style={oppStyles.row}>
        <Text style={oppStyles.label}>{t("dash_opportunity")}</Text>
        <Text style={[oppStyles.score, { color }]}>{score}/100 · {label}</Text>
      </View>
    </View>
  );
}

const oppStyles = StyleSheet.create({
  wrap: { marginTop: spacing.md },
  bar: { height: 6, borderRadius: 3, marginBottom: 6 },
  row: { flexDirection: "row", justifyContent: "space-between" },
  label: { fontSize: 12, color: "#64748b" },
  score: { fontSize: 12, fontWeight: "700" },
});

// ── What-if Panel ─────────────────────────────────────────────────────────────


// ── Historical Trend ──────────────────────────────────────────────────────────

function HistoricalTrend({ ppm2, realTrend, capitalAppreciationPct, t }) {
  let chartData, isReal, growthPct;

  if (realTrend && realTrend.length >= 2) {
    isReal = true;
    chartData = scaleIneToChart(realTrend, ppm2);
    // Use official INE appreciation when available
    if (capitalAppreciationPct != null) {
      growthPct = Number(capitalAppreciationPct).toFixed(1);
    } else {
      const first = realTrend[0].value;
      const last = realTrend[realTrend.length - 1].value;
      growthPct = (((last - first) / first) * 100).toFixed(1);
    }
  } else {
    isReal = false;
    chartData = buildSimulatedTrend(ppm2);
    const pts = chartData;
    growthPct = (((pts[5].value - pts[0].value) / pts[0].value) * 100).toFixed(1);
  }

  return (
    <View style={styles.card}>
      <View style={trendStyles.titleRow}>
        <Text style={styles.cardTitle}>{t("dash_trend_title")}</Text>
        {isReal && (
          <View style={trendStyles.liveBadge}>
            <Text style={trendStyles.liveDot}>●</Text>
            <Text style={trendStyles.liveText}>INE LIVE</Text>
          </View>
        )}
      </View>
      <LineChart
        data={chartData}
        color={BLUE}
        thickness={3}
        dataPointsColor="#1e3a8a"
        dataPointsRadius={4}
        noOfSections={3}
        areaChart
        startFillColor="rgba(59,130,246,0.3)"
        endFillColor="rgba(59,130,246,0.01)"
        yAxisColor={BORDER}
        xAxisColor={BORDER}
        yAxisTextStyle={{ color: "#94a3b8", fontSize: 10 }}
        xAxisLabelTextStyle={{ color: "#94a3b8", fontSize: 10 }}
        backgroundColor={CARD_BG}
        width={CHART_W}
        height={140}
        curved
        isAnimated
        hideRules={false}
        rulesColor={BORDER}
      />
      <View style={trendStyles.insightRow}>
        <Text style={trendStyles.arrow}>↑</Text>
        <Text style={trendStyles.insight}>
          +{growthPct}% {t("dash_trend_insight")}
        </Text>
      </View>
      <Text style={trendStyles.source}>
        {isReal ? "Sursa: INE Spain – Índice de Precios de Vivienda (IPV)" : t("dash_trend_simulated")}
      </Text>
    </View>
  );
}

const trendStyles = StyleSheet.create({
  titleRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: spacing.md },
  liveBadge: { flexDirection: "row", alignItems: "center", backgroundColor: "#064e3b", borderRadius: 6, paddingHorizontal: 8, paddingVertical: 3, gap: 4 },
  liveDot: { color: "#34d399", fontSize: 8 },
  liveText: { color: "#34d399", fontSize: 10, fontWeight: "700", letterSpacing: 0.5 },
  insightRow: { flexDirection: "row", alignItems: "center", marginTop: spacing.md, gap: 6 },
  arrow: { fontSize: 16, color: GREEN, fontWeight: "800" },
  insight: { fontSize: 13, color: "#86efac", fontWeight: "600" },
  source: { fontSize: 10, color: "#475569", marginTop: 6, fontStyle: "italic" },
});

// ── Market Comparables ────────────────────────────────────────────────────────

function MarketComparables({ fin, address, t }) {
  const comps = buildComparables(fin, address);
  if (!comps.length) return null;
  return (
    <View style={styles.card}>
      <Text style={styles.cardTitle}>{t("dash_comparables")}</Text>
      {comps.map((c, i) => (
        <View key={i} style={compStyles.row}>
          <View style={compStyles.iconWrap}>
            <Text style={compStyles.icon}>🏠</Text>
          </View>
          <View style={compStyles.info}>
            <Text style={compStyles.label}>{c.label}</Text>
            {c.m2 != null && <Text style={compStyles.sub}>{fmt(c.m2)} EUR/m²</Text>}
          </View>
          <View style={compStyles.priceWrap}>
            <Text style={compStyles.price}>€{fmt(c.price)}</Text>
            <Text style={[compStyles.delta, { color: c.delta >= 0 ? GREEN : RED }]}>
              {c.delta >= 0 ? "+" : ""}{c.delta}% vs subject
            </Text>
          </View>
        </View>
      ))}
      <Text style={compStyles.disclaimer}>{t("dash_comp_disclaimer")}</Text>
    </View>
  );
}

const compStyles = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center", paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: BORDER, gap: 10 },
  iconWrap: { width: 36, height: 36, borderRadius: 10, backgroundColor: "#1e3a8a22", alignItems: "center", justifyContent: "center" },
  icon: { fontSize: 18 },
  info: { flex: 1 },
  label: { fontSize: 13, color: "#cbd5e1", fontWeight: "600" },
  sub: { fontSize: 11, color: "#64748b", marginTop: 2 },
  priceWrap: { alignItems: "flex-end" },
  price: { fontSize: 14, fontWeight: "700", color: "#f1f5f9" },
  delta: { fontSize: 11, fontWeight: "600", marginTop: 2 },
  disclaimer: { fontSize: 11, color: "#475569", marginTop: spacing.md, fontStyle: "italic" },
});

// ── Main Screen ───────────────────────────────────────────────────────────────

export default function ExpertDashboardScreen({ route, navigation }) {
  const { t } = useTranslation();
  const requestId = route.params?.requestId ?? "";
  const addressParam = route.params?.address ?? "";
  const reportParam = route.params?.reportData ?? null;

  const [report, setReport] = useState(reportParam);
  const [loadingPDF, setLoadingPDF] = useState(false);
  const [ineData, setIneData] = useState(null);        // raw INE points array
  const [ineAppPct, setIneAppPct] = useState(null);    // capital appreciation %
  const [savedScenario, setSavedScenario] = useState(null); // InvestmentSimulator scenario

  // Load cached report
  useEffect(() => {
    if (report || !requestId) return;
    AsyncStorage.getItem(CACHE_PREFIX + requestId)
      .then((raw) => { if (raw) setReport(JSON.parse(raw)); })
      .catch(() => {});
  }, [requestId]);

  // Save report to cache
  useEffect(() => {
    if (!report || !requestId) return;
    AsyncStorage.setItem(CACHE_PREFIX + requestId, JSON.stringify(report)).catch(() => {});
  }, [report, requestId]);

  // Fetch real INE IPV market trend
  useEffect(() => {
    getMarketTrend()
      .then((res) => {
        if (res?.data?.length) {
          setIneData(res.data);
          setIneAppPct(res.capital_appreciation_pct ?? null);
        }
      })
      .catch(() => {}); // graceful degradation – falls back to simulated trend
  }, []);

  const onExportPDF = async () => {
    setLoadingPDF(true);
    try {
      const data = buildReportData(report || {}, addressParam, requestId);
      if (ineData?.length) {
        data.trend_raw = ineData;
        data.capital_appreciation_pct = ineAppPct;
      }
      // Override financial metrics with user's saved simulator scenario
      if (savedScenario) {
        data.sim_scenario = savedScenario;
        // Override yield and ROI with user's chosen values
        if (savedScenario.grossYield) data.yield = `${savedScenario.grossYield}%`;
        if (savedScenario.roi5y) data.roi_5y = `${savedScenario.roi5y}%`;
        data.sim_price = savedScenario.purchasePrice;
        data.sim_rent = savedScenario.monthlyRent;
      }
      await generateProfessionalPDF(data);
    } catch (err) {
      Alert.alert("Error", err?.message || "Could not generate PDF.");
    } finally {
      setLoadingPDF(false);
    }
  };

  if (!report) {
    return (
      <SafeAreaView style={styles.safe} edges={["bottom"]}>
        <View style={styles.noData}>
          <Text style={styles.noDataEmoji}>📊</Text>
          <Text style={styles.noDataText}>{t("dashboard_no_data")}</Text>
          <TouchableOpacity style={styles.backBtn} onPress={() => navigation.goBack()}>
            <Text style={styles.backBtnText}>{t("back_to_map")}</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  const meta = report.meta || {};
  const prop = report.property || {};
  const risk = report.risk || {};
  const legal = report.legal || {};
  const urban = report.urbanism || {};
  const fin = report.financials || {};
  const nb = report.neighborhood || {};

  const displayAddress = prop.address || addressParam || "—";
  const riskScore = risk.score ?? 50;
  const redFlags = [...(legal.red_flags || []), ...(risk.drivers || [])].filter(Boolean);

  const barData = [
    {
      value: urban.registered_built_m2 || 0,
      label: t("dash_urban_reg"),
      frontColor: "#475569",
      topLabelComponent: () => (
        <Text style={{ color: "#94a3b8", fontSize: 11, marginBottom: 4 }}>{urban.registered_built_m2 ?? "—"}m²</Text>
      ),
    },
    {
      value: urban.estimated_built_m2 || 0,
      label: t("dash_urban_ai"),
      frontColor: BLUE,
      topLabelComponent: () => (
        <Text style={{ color: "#93c5fd", fontSize: 11, marginBottom: 4 }}>{urban.estimated_built_m2 ?? "—"}m²</Text>
      ),
    },
  ];

  const finBarData = [
    {
      value: fin.market_value_min || 0,
      label: t("dash_fin_min"),
      frontColor: "#475569",
      topLabelComponent: () => (
        <Text style={{ color: "#94a3b8", fontSize: 10, marginBottom: 4 }}>
          {fin.market_value_min ? `€${fmt(fin.market_value_min)}` : "—"}
        </Text>
      ),
    },
    {
      value: fin.market_value_max || 0,
      label: t("dash_fin_max"),
      frontColor: GOLD,
      topLabelComponent: () => (
        <Text style={{ color: "#fde68a", fontSize: 10, marginBottom: 4 }}>
          {fin.market_value_max ? `€${fmt(fin.market_value_max)}` : "—"}
        </Text>
      ),
    },
  ];

  return (
    <SafeAreaView style={styles.safe} edges={["bottom"]}>

      {/* ── Sticky Header Bar ─────────────────────────────────────────── */}
      <StickyBar address={displayAddress} riskScore={riskScore} />

      <ScrollView style={styles.scroll} contentContainerStyle={styles.content}>

        {/* ── Report meta ──────────────────────────────────────────────── */}
        <View style={styles.metaRow}>
          <Text style={styles.metaId}>
            {meta.report_id || requestId ? `#${meta.report_id || requestId}` : "VESTA INSTITUTIONAL"}
          </Text>
          {meta.as_of_date && <Text style={styles.metaDate}>{meta.as_of_date}</Text>}
        </View>

        {/* ── 1. Risk Module ──────────────────────────────────────────── */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>{t("section_risk")}</Text>
          <View style={styles.riskRow}>
            <RiskGauge score={riskScore} />
            <View style={styles.riskMeta}>
              <Text style={[styles.riskLevel, { color: riskColor(riskScore) }]}>
                {riskLabel(risk.level, t).toUpperCase()}
              </Text>
              {redFlags.slice(0, 3).map((f, i) => <RedFlagChip key={i} text={f} />)}
            </View>
          </View>
        </View>

        {/* ── 2. Urbanistic Module ────────────────────────────────────── */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>{t("section_urbanism")}</Text>
          {(urban.registered_built_m2 || urban.estimated_built_m2) ? (
            <>
              <BarChart
                data={barData}
                barWidth={44}
                noOfSections={4}
                isAnimated
                hideRules={false}
                rulesColor={BORDER}
                backgroundColor={CARD_BG}
                yAxisColor={BORDER}
                xAxisColor={BORDER}
                yAxisTextStyle={{ color: "#64748b", fontSize: 11 }}
                xAxisLabelTextStyle={{ color: "#94a3b8", fontSize: 11 }}
                width={CHART_W}
                height={140}
                barBorderRadius={4}
                spacing={48}
              />
              {urban.discrepancy_percent != null && (
                <View style={styles.discrepancyBadge}>
                  <Text style={styles.discrepancyText}>
                    {t("discrepancy")}: {urban.discrepancy_percent}%
                    {urban.suspected_illegal_works ? "  ⚠ " + t("dash_suspected_illegal") : ""}
                  </Text>
                </View>
              )}
              {urban.comment ? <Text style={styles.urbanComment}>{urban.comment}</Text> : null}
            </>
          ) : (
            <Text style={styles.naText}>{t("dash_data_na")}</Text>
          )}
        </View>

        {/* ── 3. Financial Module ─────────────────────────────────────── */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>{t("section_financials")}</Text>
          {(fin.market_value_min || fin.market_value_max) ? (
            <BarChart
              data={finBarData}
              barWidth={44}
              noOfSections={4}
              isAnimated
              hideRules={false}
              rulesColor={BORDER}
              backgroundColor={CARD_BG}
              yAxisColor={BORDER}
              xAxisColor={BORDER}
              yAxisTextStyle={{ color: "#64748b", fontSize: 11 }}
              xAxisLabelTextStyle={{ color: "#94a3b8", fontSize: 11 }}
              width={CHART_W}
              height={140}
              barBorderRadius={4}
              spacing={48}
            />
          ) : null}
          <View style={styles.finRows}>
            <InfoRow label={t("dash_fin_yield")} value={fin.gross_yield_percent != null ? `${Number(fin.gross_yield_percent).toFixed(1)}%` : "—"} accent={GOLD} />
            <InfoRow label={t("dash_fin_roi5")} value={fin.roi_5_years_percent != null ? `${Number(fin.roi_5_years_percent).toFixed(1)}%` : "—"} accent={GOLD} />
            {ineAppPct != null && (
              <InfoRow label={t("dash_fin_ine_app")} value={`+${Number(ineAppPct).toFixed(1)}%`} accent={GREEN} />
            )}
            <InfoRow label={t("dash_fin_rent")} value={fin.expected_rent_min != null ? `€${fmt(fin.expected_rent_min)} – €${fmt(fin.expected_rent_max)}/mo` : "—"} />
            <InfoRow label={t("dash_fin_value")} value={fin.market_value_min != null ? `€${fmt(fin.market_value_min)} – €${fmt(fin.market_value_max)}` : "—"} />
            {fin.price_per_m2_zone != null && (
              <InfoRow label={t("dash_fin_ppm2")} value={`${fmt(fin.price_per_m2_zone)} EUR/m²`} />
            )}
            {fin.valuation_confidence_score != null && (
              <InfoRow label={t("dash_fin_valconf")} value={`${fin.valuation_confidence_score}/100`} />
            )}
          </View>

          {/* Valuation Status from VestaEngine (if available) */}
          {report.vesta_engine?.valuation_status && (
            <ValuationChip
              label={report.vesta_engine.valuation_status}
              diffPct={report.vesta_engine.valuation_diff_pct}
              color={report.vesta_engine.valuation_color || "grey"}
            />
          )}
          {report.vesta_engine?.negotiation_note ? (
            <Text style={styles.naText}>{report.vesta_engine.negotiation_note}</Text>
          ) : null}

          {/* Opportunity Score */}
          {report.vesta_engine?.opportunity_score != null && (
            <OpportunityScore score={report.vesta_engine.opportunity_score} t={t} />
          )}
        </View>

        {/* ── 4. Historical Trend (INE LineChart) ─────────────────────── */}
        <HistoricalTrend
          ppm2={fin.price_per_m2_zone}
          realTrend={ineData}
          capitalAppreciationPct={ineAppPct}
          t={t}
        />

        {/* ── 4b. Investment Simulator (Sliders + Haptics) ────────────── */}
        {fin.market_value_min != null && (
          <InvestmentSimulator
            initialPrice={fin.market_value_min}
            sqm={urban.registered_built_m2 || urban.estimated_built_m2 || 80}
            avgRentSqm={
              fin.expected_rent_min && (urban.registered_built_m2 || urban.estimated_built_m2)
                ? fin.expected_rent_min / (urban.registered_built_m2 || urban.estimated_built_m2)
                : 10
            }
            annualCagr={
              ineAppPct != null
                ? Math.pow(1 + ineAppPct / 100, 0.2) - 1  // convert 5Y total to annual
                : 0.035
            }
            onScenarioSave={(scenario) => {
              setSavedScenario(scenario);
            }}
          />
        )}

        {/* ── 5. Market Comparables ───────────────────────────────────── */}
        <MarketComparables fin={fin} address={displayAddress} t={t} />

        {/* ── 6. Neighborhood ─────────────────────────────────────────── */}
        {((nb.pros?.length > 0) || (nb.cons?.length > 0)) && (
          <View style={styles.card}>
            <Text style={styles.cardTitle}>{t("section_neighborhood")}</Text>
            {nb.pros?.slice(0, 3).map((p, i) => (
              <View key={i} style={styles.nbRow}>
                <Text style={styles.nbIconGood}>✓</Text>
                <Text style={styles.nbText}>{p}</Text>
              </View>
            ))}
            {nb.cons?.slice(0, 2).map((c, i) => (
              <View key={i} style={styles.nbRow}>
                <Text style={styles.nbIconBad}>✕</Text>
                <Text style={[styles.nbText, { color: "#fca5a5" }]}>{c}</Text>
              </View>
            ))}
          </View>
        )}

        {/* ── 7. Executive Summary ─────────────────────────────────────── */}
        {report.executive_summary ? (
          <View style={styles.card}>
            <Text style={styles.cardTitle}>{t("section_summary")}</Text>
            <Text style={styles.summaryText}>{report.executive_summary}</Text>
          </View>
        ) : null}

        <View style={{ height: 96 }} />
      </ScrollView>

      {/* ── Floating Action Button (PDF Export) ──────────────────────── */}
      <TouchableOpacity
        style={[fabStyles.fab, loadingPDF && fabStyles.fabDisabled]}
        onPress={onExportPDF}
        disabled={loadingPDF}
        activeOpacity={0.88}
      >
        {loadingPDF
          ? <ActivityIndicator size="small" color="#fff" />
          : <>
              <Text style={fabStyles.icon}>📄</Text>
              <Text style={fabStyles.label}>PDF</Text>
              {savedScenario && <View style={fabStyles.dot} />}
            </>
        }
      </TouchableOpacity>

    </SafeAreaView>
  );
}

const fabStyles = StyleSheet.create({
  fab: {
    position: "absolute", bottom: 28, right: 20,
    width: 64, height: 64, borderRadius: 32,
    backgroundColor: GOLD,
    alignItems: "center", justifyContent: "center",
    shadowColor: GOLD, shadowOpacity: 0.5, shadowRadius: 12, shadowOffset: { width: 0, height: 4 },
    elevation: 10,
  },
  fabDisabled: { opacity: 0.6 },
  icon: { fontSize: 22, lineHeight: 26 },
  label: { fontSize: 10, fontWeight: "800", color: "#0f172a", marginTop: -2, letterSpacing: 0.5 },
  dot: { position: "absolute", top: 6, right: 6, width: 10, height: 10, borderRadius: 5, backgroundColor: "#22c55e", borderWidth: 2, borderColor: "#0f172a" },
});

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: BG },
  scroll: { flex: 1 },
  content: { padding: spacing.lg, paddingTop: spacing.md },

  metaRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: spacing.md },
  metaId: { fontSize: 11, color: "#60a5fa", fontWeight: "700", letterSpacing: 1 },
  metaDate: { fontSize: 11, color: "#64748b" },

  card: {
    backgroundColor: CARD_BG, borderRadius: 16, padding: spacing.lg,
    marginBottom: spacing.md, borderWidth: 1, borderColor: BORDER,
  },
  cardTitle: { fontSize: 12, fontWeight: "700", color: "#60a5fa", letterSpacing: 1, textTransform: "uppercase", marginBottom: spacing.md },

  riskRow: { flexDirection: "row", alignItems: "flex-start", gap: spacing.lg },
  riskMeta: { flex: 1 },
  riskLevel: { fontSize: 16, fontWeight: "800", letterSpacing: 0.5, marginBottom: 6 },

  discrepancyBadge: { marginTop: spacing.md, backgroundColor: "#1c1917", borderRadius: 8, padding: spacing.sm },
  discrepancyText: { color: "#fbbf24", fontSize: 13, fontWeight: "600" },
  urbanComment: { marginTop: spacing.sm, fontSize: 13, color: "#94a3b8", lineHeight: 20 },
  naText: { color: "#64748b", fontSize: 13, fontStyle: "italic" },

  finRows: { marginTop: spacing.md },

  nbRow: { flexDirection: "row", alignItems: "flex-start", gap: 8, marginTop: 6 },
  nbIconGood: { color: GREEN, fontWeight: "700", fontSize: 13, marginTop: 1 },
  nbIconBad: { color: RED, fontWeight: "700", fontSize: 13, marginTop: 1 },
  nbText: { flex: 1, color: "#cbd5e1", fontSize: 13, lineHeight: 18 },

  summaryText: { color: "#cbd5e1", fontSize: 14, lineHeight: 22 },

  noData: { flex: 1, alignItems: "center", justifyContent: "center", padding: spacing.xl, backgroundColor: BG },
  noDataEmoji: { fontSize: 64, marginBottom: spacing.lg },
  noDataText: { color: "#94a3b8", fontSize: 16, textAlign: "center", marginBottom: spacing.xl },
  backBtn: { backgroundColor: BLUE, paddingVertical: 14, paddingHorizontal: 32, borderRadius: 12 },
  backBtnText: { color: "#fff", fontWeight: "700", fontSize: 15 },
});
