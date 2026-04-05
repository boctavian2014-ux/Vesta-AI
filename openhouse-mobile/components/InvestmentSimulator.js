/**
 * InvestmentSimulator – Vesta Institutional Dashboard
 *
 * Simulare interactivă a rentabilității (Yield, ROI 5Y) cu:
 *   • Slider preț achiziție (±30% față de listing price)
 *   • Slider chirie estimată (±50% față de baza INE)
 *   • Haptic feedback la traversarea pragurilor de yield (4%, 5%, 6%)
 *   • Culori dinamice (roșu → verde) pe măsura scăderii prețului
 *   • Buton "Salvează pentru PDF" care notifică parent-ul cu scenariul ales
 *
 * Props:
 *   initialPrice  – prețul de listing (ex: 200_000)
 *   sqm           – suprafața (m²)
 *   avgRentSqm    – chirie medie/m² din zona proprietății
 *   annualCagr    – CAGR anual din INE (0.035 fallback)
 *   onScenarioSave(scenario) – callback apelat la salvare
 */
import React, { useState, useEffect, useRef, useCallback } from "react";
import {
  View, Text, StyleSheet, TouchableOpacity, Animated,
} from "react-native";
import Slider from "@react-native-community/slider";
import * as Haptics from "expo-haptics";
import { useTranslation } from "react-i18next";

// ── Constants ─────────────────────────────────────────────────────────────────

const COST_RATIO = 0.25;          // 25% costuri (taxe, întreținere, vacanță)
const YIELD_THRESHOLDS = [4, 5, 6]; // % – praguri haptic feedback
const SPAIN_AVG_YIELD = 4.2;      // % – benchmark Spania

// ── Helpers ───────────────────────────────────────────────────────────────────

function yieldColor(y) {
  if (y >= 6) return "#22c55e";  // green
  if (y >= 5) return "#3b82f6";  // blue
  if (y >= 4) return "#f59e0b";  // amber
  return "#ef4444";              // red
}

function computeMetrics(price, monthlyRent, cagr = 0.035) {
  if (!price || price <= 0) return { grossYield: 0, netYield: 0, roi5y: 0 };
  const annual = monthlyRent * 12;
  const grossYield = parseFloat(((annual / price) * 100).toFixed(2));
  const netYield = parseFloat((grossYield * (1 - COST_RATIO)).toFixed(2));
  const netRent5y = annual * (1 - COST_RATIO) * 5;
  const capitalGain = price * ((1 + cagr) ** 5 - 1);
  const roi5y = parseFloat((((netRent5y + capitalGain) / price) * 100).toFixed(1));
  return { grossYield, netYield, roi5y };
}

// ── KPI Box ───────────────────────────────────────────────────────────────────

function KpiBox({ value, label, color, highlight }) {
  const scale = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    Animated.sequence([
      Animated.timing(scale, { toValue: 1.08, duration: 120, useNativeDriver: true }),
      Animated.timing(scale, { toValue: 1, duration: 180, useNativeDriver: true }),
    ]).start();
  }, [value]);

  return (
    <Animated.View
      style={[
        kpiStyles.box,
        highlight && { borderColor: color, borderWidth: 1.5 },
        { transform: [{ scale }] },
      ]}
    >
      <Text style={[kpiStyles.value, { color: highlight ? color : "#e2e8f0" }]}>{value}</Text>
      <Text style={kpiStyles.label}>{label}</Text>
    </Animated.View>
  );
}

const kpiStyles = StyleSheet.create({
  box: {
    flex: 1, backgroundColor: "#0f172a", borderRadius: 12,
    padding: 12, alignItems: "center", borderWidth: 1, borderColor: "#334155",
  },
  value: { fontSize: 20, fontWeight: "800", lineHeight: 24 },
  label: { fontSize: 10, color: "#64748b", marginTop: 4, textAlign: "center" },
});

// ── Main Component ────────────────────────────────────────────────────────────

export default function InvestmentSimulator({
  initialPrice = 200000,
  sqm = 80,
  avgRentSqm = 10,
  annualCagr = 0.035,
  onScenarioSave,
}) {
  const { t } = useTranslation();

  const baseRent = Math.round(sqm * avgRentSqm);
  const [price, setPrice] = useState(initialPrice);
  const [rent, setRent] = useState(baseRent || 800);
  const [saved, setSaved] = useState(false);

  const prevYield = useRef(0);
  const metrics = computeMetrics(price, rent, annualCagr);
  const color = yieldColor(metrics.grossYield);

  const priceMin = Math.round(initialPrice * 0.7);
  const priceMax = Math.round(initialPrice * 1.3);
  const rentMin = Math.max(200, Math.round((baseRent || 800) * 0.6));
  const rentMax = Math.round((baseRent || 800) * 1.5);

  // Haptic on threshold crossing
  useEffect(() => {
    YIELD_THRESHOLDS.forEach((thr) => {
      const wasBefore = prevYield.current < thr;
      const isNow = metrics.grossYield >= thr;
      if (wasBefore !== isNow) {
        if (thr >= 6) {
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        } else {
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        }
      }
    });
    prevYield.current = metrics.grossYield;
  }, [metrics.grossYield]);

  // Price delta vs listing
  const delta = price - initialPrice;
  const deltaLabel =
    delta === 0
      ? t("sim_baseline")
      : `${delta > 0 ? "+" : ""}${Math.round(delta / 1000)}k€ vs asking`;

  // Negotiation insight text
  const insightKey =
    metrics.grossYield >= 6
      ? "sim_insight_excellent"
      : metrics.grossYield >= 5
      ? "sim_insight_good"
      : metrics.grossYield >= 4
      ? "sim_insight_fair"
      : "sim_insight_below";
  const insightText = t(insightKey, {
    yield: metrics.grossYield,
    avg: SPAIN_AVG_YIELD,
    delta: Math.abs(metrics.grossYield - SPAIN_AVG_YIELD).toFixed(1),
  });

  const handleSave = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
    onScenarioSave?.({
      purchasePrice: price,
      monthlyRent: rent,
      grossYield: metrics.grossYield,
      netYield: metrics.netYield,
      roi5y: metrics.roi5y,
      annualCagr,
    });
  }, [price, rent, metrics, annualCagr, onScenarioSave]);

  return (
    <View style={styles.card}>
      {/* Header */}
      <View style={styles.headerRow}>
        <Text style={styles.cardTitle}>{t("investment_simulator")}</Text>
        <View style={[styles.livePill, { backgroundColor: color + "22", borderColor: color }]}>
          <Text style={[styles.liveText, { color }]}>LIVE</Text>
        </View>
      </View>

      {/* ── Purchase Price Slider ──────────────────────────────────── */}
      <View style={styles.sliderGroup}>
        <View style={styles.sliderLabelRow}>
          <Text style={styles.sliderLabel}>{t("purchase_price")}</Text>
          <View style={styles.priceWrap}>
            <Text style={[styles.priceText, { color }]}>
              {price.toLocaleString()} €
            </Text>
            <Text style={[styles.deltaText, { color: delta < 0 ? "#22c55e" : delta > 0 ? "#ef4444" : "#64748b" }]}>
              {deltaLabel}
            </Text>
          </View>
        </View>
        <Slider
          style={styles.slider}
          minimumValue={priceMin}
          maximumValue={priceMax}
          step={5000}
          value={price}
          onValueChange={setPrice}
          minimumTrackTintColor={color}
          maximumTrackTintColor="#334155"
          thumbTintColor={color}
        />
        <View style={styles.rangeRow}>
          <Text style={styles.rangeText}>{(priceMin / 1000).toFixed(0)}k€</Text>
          <Text style={styles.rangeText}>{(priceMax / 1000).toFixed(0)}k€</Text>
        </View>
      </View>

      {/* ── Monthly Rent Slider ───────────────────────────────────── */}
      <View style={styles.sliderGroup}>
        <View style={styles.sliderLabelRow}>
          <Text style={styles.sliderLabel}>{t("monthly_rent")}</Text>
          <Text style={styles.priceText}>{Math.round(rent)} €/mo</Text>
        </View>
        <Slider
          style={styles.slider}
          minimumValue={rentMin}
          maximumValue={rentMax}
          step={50}
          value={rent}
          onValueChange={setRent}
          minimumTrackTintColor="#3b82f6"
          maximumTrackTintColor="#334155"
          thumbTintColor="#3b82f6"
        />
        <View style={styles.rangeRow}>
          <Text style={styles.rangeText}>{rentMin}€</Text>
          <Text style={styles.rangeText}>{rentMax}€</Text>
        </View>
      </View>

      {/* ── KPI Grid ────────────────────────────────────────────── */}
      <View style={styles.kpiGrid}>
        <KpiBox
          value={`${metrics.grossYield}%`}
          label="Gross Yield"
          color={color}
          highlight
        />
        <KpiBox
          value={`${metrics.netYield}%`}
          label="Net Yield"
          color="#94a3b8"
        />
        <KpiBox
          value={`${metrics.roi5y}%`}
          label="ROI 5Y"
          color="#c6a227"
          highlight={metrics.roi5y > 30}
        />
      </View>

      {/* ── Threshold Legend ────────────────────────────────────── */}
      <View style={styles.legendRow}>
        {[
          { thr: "< 4%", color: "#ef4444", label: t("sim_below_avg") },
          { thr: "4–5%", color: "#f59e0b", label: t("sim_market_avg") },
          { thr: "5–6%", color: "#3b82f6", label: t("sim_above_avg") },
          { thr: "> 6%", color: "#22c55e", label: t("sim_excellent") },
        ].map((item) => (
          <View key={item.thr} style={styles.legendItem}>
            <View style={[styles.legendDot, { backgroundColor: item.color }]} />
            <Text style={styles.legendLabel}>{item.thr}</Text>
          </View>
        ))}
      </View>

      {/* ── Negotiation Insight ─────────────────────────────────── */}
      <View style={[styles.insightBox, { borderLeftColor: color }]}>
        <Text style={styles.insightIcon}>💡</Text>
        <Text style={styles.insightText}>{insightText}</Text>
      </View>

      {/* ── Save for PDF ───────────────────────────────────────── */}
      <TouchableOpacity
        style={[styles.saveBtn, saved && styles.saveBtnDone]}
        onPress={handleSave}
        activeOpacity={0.85}
      >
        <Text style={styles.saveBtnText}>
          {saved ? `✓ ${t("sim_saved")}` : t("sim_update_pdf")}
        </Text>
      </TouchableOpacity>

      <Text style={styles.disclaimer}>{t("sim_disclaimer")}</Text>
    </View>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  card: {
    backgroundColor: "#0c1a2e",
    borderRadius: 16,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1.5,
    borderColor: "#1e3a8a",
  },

  headerRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 16 },
  cardTitle: { fontSize: 12, fontWeight: "700", color: "#93c5fd", letterSpacing: 1, textTransform: "uppercase" },
  livePill: { borderRadius: 6, borderWidth: 1, paddingHorizontal: 8, paddingVertical: 2 },
  liveText: { fontSize: 10, fontWeight: "800", letterSpacing: 0.8 },

  sliderGroup: { marginBottom: 14 },
  sliderLabelRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-end", marginBottom: 2 },
  sliderLabel: { fontSize: 12, color: "#64748b" },
  priceWrap: { alignItems: "flex-end" },
  priceText: { fontSize: 15, fontWeight: "700", color: "#e2e8f0" },
  deltaText: { fontSize: 10, fontWeight: "600", marginTop: 1 },
  slider: { width: "100%", height: 40 },
  rangeRow: { flexDirection: "row", justifyContent: "space-between", marginTop: -6 },
  rangeText: { fontSize: 10, color: "#475569" },

  kpiGrid: { flexDirection: "row", gap: 8, marginBottom: 12 },

  legendRow: { flexDirection: "row", justifyContent: "space-between", marginBottom: 12, flexWrap: "wrap", gap: 4 },
  legendItem: { flexDirection: "row", alignItems: "center", gap: 4 },
  legendDot: { width: 8, height: 8, borderRadius: 4 },
  legendLabel: { fontSize: 10, color: "#64748b" },

  insightBox: { flexDirection: "row", alignItems: "flex-start", gap: 8, borderLeftWidth: 3, paddingLeft: 10, marginBottom: 14, minHeight: 40 },
  insightIcon: { fontSize: 14, marginTop: 1 },
  insightText: { flex: 1, fontSize: 12, color: "#94a3b8", lineHeight: 18 },

  saveBtn: { backgroundColor: "#1e3a8a", borderRadius: 10, paddingVertical: 12, alignItems: "center" },
  saveBtnDone: { backgroundColor: "#166534" },
  saveBtnText: { color: "#fff", fontWeight: "700", fontSize: 14 },

  disclaimer: { fontSize: 10, color: "#334155", marginTop: 8, textAlign: "center", fontStyle: "italic" },
});
