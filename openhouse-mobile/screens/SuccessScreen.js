import React, { useState, useEffect, useRef } from "react";
import {
  View, Text, TouchableOpacity, StyleSheet,
  ActivityIndicator, Alert, Animated, Platform,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useTranslation } from "react-i18next";
import * as Linking from "expo-linking";
import * as Haptics from "expo-haptics";
import { getRequestIdBySession } from "../api";
import { generateProfessionalPDF, buildReportData } from "../utils/pdfReport";
import { spacing } from "../theme";

function parseSessionIdFromUrl(url) {
  if (!url) return null;
  try {
    const parsed = Linking.parse(url);
    return parsed.queryParams?.session_id || null;
  } catch {
    return null;
  }
}

/** Generează un ID vizual de tip VST-2026-XXXXX */
function formatReportId(rawId) {
  if (!rawId) return null;
  const short = String(rawId).slice(-6).toUpperCase();
  return `VST-${new Date().getFullYear()}-${short}`;
}

export default function SuccessScreen({ navigation, route }) {
  const { t } = useTranslation();
  const url = Linking.useURL();

  const [requestId, setRequestId] = useState(null);
  const [loading, setLoading] = useState(true);
  const [pending, setPending] = useState(false);
  const [pdfLoading, setPdfLoading] = useState(false);

  const sessionIdFromUrl = parseSessionIdFromUrl(url);
  const sessionIdFromParams = route.params?.session_id ?? null;
  const sessionId = sessionIdFromParams || sessionIdFromUrl;
  const address = route.params?.address ?? "";

  // Animații
  const checkScale = useRef(new Animated.Value(0)).current;
  const fadeIn = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    // Haptic + animație la mount
    Animated.sequence([
      Animated.spring(checkScale, { toValue: 1, tension: 60, friction: 7, useNativeDriver: true }),
      Animated.timing(fadeIn, { toValue: 1, duration: 400, useNativeDriver: true }),
    ]).start();
    try {
      if (Platform.OS === "ios") {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      } else {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
      }
    } catch (_) {}
  }, []);

  useEffect(() => {
    if (!sessionId) { setLoading(false); return; }
    let cancelled = false;
    getRequestIdBySession(sessionId)
      .then((res) => {
        if (cancelled) return;
        setRequestId(res.request_id || null);
        setPending(res.status === "pending" || !res.request_id);
      })
      .catch(() => { if (!cancelled) setPending(true); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [sessionId]);

  const goToStatus = () =>
    navigation.navigate("Status", requestId ? { requestId, address } : {});

  const onGeneratePDF = async () => {
    setPdfLoading(true);
    try {
      await generateProfessionalPDF(buildReportData({}, address || "Property", requestId || ""));
    } catch (err) {
      Alert.alert("Error", err?.message || "Could not generate PDF.");
    } finally {
      setPdfLoading(false);
    }
  };

  const displayId = formatReportId(requestId);
  const today = new Date().toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });

  return (
    <SafeAreaView style={styles.container} edges={["top", "bottom"]}>
      <View style={styles.inner}>

        {/* Checkmark animat */}
        <Animated.View style={[styles.checkCircle, { transform: [{ scale: checkScale }] }]}>
          <Text style={styles.checkEmoji}>✓</Text>
        </Animated.View>

        <Animated.View style={{ opacity: fadeIn, alignItems: "center", width: "100%" }}>
          <Text style={styles.title}>{t("success_title")}</Text>
          <Text style={styles.subtitle}>{t("success_subtitle")}</Text>

          {/* Card detalii tranzacție */}
          <View style={styles.infoCard}>
            {loading ? (
              <ActivityIndicator size="small" color="#60a5fa" />
            ) : (
              <>
                <View style={styles.infoRow}>
                  <Text style={styles.infoLabel}>{t("success_report_id")}</Text>
                  <Text style={styles.infoValue}>{displayId ?? "—"}</Text>
                </View>
                <View style={styles.infoDivider} />
                <View style={styles.infoRow}>
                  <Text style={styles.infoLabel}>{t("success_date")}</Text>
                  <Text style={styles.infoValue}>{today}</Text>
                </View>
                {address ? (
                  <>
                    <View style={styles.infoDivider} />
                    <View style={styles.infoRow}>
                      <Text style={styles.infoLabel}>{t("address_label")}</Text>
                      <Text style={[styles.infoValue, { flex: 1, textAlign: "right" }]} numberOfLines={1}>{address}</Text>
                    </View>
                  </>
                ) : null}
                {pending && !requestId && (
                  <Text style={styles.pendingNote}>{t("success_pending")}</Text>
                )}
              </>
            )}
          </View>

          {/* Butoane acțiune */}
          <TouchableOpacity
            style={[styles.pdfButton, pdfLoading && styles.btnDisabled]}
            onPress={onGeneratePDF}
            disabled={pdfLoading}
          >
            {pdfLoading
              ? <ActivityIndicator size="small" color="#0f172a" />
              : <Text style={styles.pdfButtonText}>{t("generate_executive_summary")}</Text>
            }
          </TouchableOpacity>

          <TouchableOpacity style={styles.statusButton} onPress={goToStatus}>
            <Text style={styles.statusButtonText}>{t("check_status")}</Text>
          </TouchableOpacity>

          <TouchableOpacity style={styles.linkButton} onPress={() => navigation.navigate("Map")}>
            <Text style={styles.linkButtonText}>{t("back_to_map")}</Text>
          </TouchableOpacity>
        </Animated.View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#0f172a",
  },
  inner: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: spacing.xl,
  },
  checkCircle: {
    width: 100,
    height: 100,
    borderRadius: 50,
    backgroundColor: "#15803d",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: spacing.xl,
    shadowColor: "#15803d",
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.6,
    shadowRadius: 20,
    elevation: 12,
  },
  checkEmoji: {
    fontSize: 52,
    color: "#fff",
    lineHeight: 62,
  },
  title: {
    fontSize: 24,
    fontWeight: "700",
    color: "#fff",
    textAlign: "center",
    marginBottom: spacing.sm,
  },
  subtitle: {
    fontSize: 15,
    color: "#94a3b8",
    textAlign: "center",
    marginBottom: spacing.xl,
    lineHeight: 22,
  },
  infoCard: {
    backgroundColor: "#1e293b",
    borderRadius: 14,
    padding: spacing.lg,
    width: "100%",
    marginBottom: spacing.xl,
    borderWidth: 1,
    borderColor: "#334155",
  },
  infoRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: spacing.sm,
  },
  infoDivider: {
    height: 1,
    backgroundColor: "#334155",
  },
  infoLabel: {
    fontSize: 13,
    color: "#64748b",
    fontWeight: "500",
  },
  infoValue: {
    fontSize: 13,
    color: "#e2e8f0",
    fontWeight: "600",
    fontVariant: ["tabular-nums"],
  },
  pendingNote: {
    marginTop: spacing.md,
    fontSize: 12,
    color: "#fbbf24",
    textAlign: "center",
    lineHeight: 18,
  },
  pdfButton: {
    backgroundColor: "#c6a227",
    paddingVertical: 16,
    borderRadius: 12,
    alignItems: "center",
    width: "100%",
    marginBottom: spacing.md,
  },
  btnDisabled: { opacity: 0.6 },
  pdfButtonText: {
    color: "#0f172a",
    fontWeight: "700",
    fontSize: 16,
  },
  statusButton: {
    backgroundColor: "#1e3a8a",
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: "center",
    width: "100%",
    marginBottom: spacing.md,
  },
  statusButtonText: {
    color: "#fff",
    fontWeight: "600",
    fontSize: 15,
  },
  linkButton: {
    paddingVertical: spacing.sm,
  },
  linkButtonText: {
    color: "#64748b",
    fontSize: 14,
    fontWeight: "500",
  },
});
