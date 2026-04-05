import React, { useState, useCallback } from "react";
import {
  View,
  StyleSheet,
  TouchableOpacity,
  Text,
  ActivityIndicator,
  TextInput,
  ScrollView,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { NativeStackScreenProps } from "@react-navigation/native-stack";
import { useTranslation } from "react-i18next";
import { identificaImobil } from "../api";
import { colors, spacing } from "../theme";
import type { CatastroProperty } from "./PropertyScreenInner";

const MADRID = { latitude: 40.4167, longitude: -3.7037 };

export type MapScreenParams = {
  Map: undefined;
  Property: { property: CatastroProperty };
};

type Props = NativeStackScreenProps<MapScreenParams, "Map">;

function buildCatastroProperty(
  res: { data?: Record<string, unknown>; ref_catastral?: string; address?: string; year_built?: string | number; scor?: number },
  latitude: number,
  longitude: number
): CatastroProperty {
  const payload = res.data ?? {};
  const id = (payload.id as number) ?? (res as { data?: { id?: number } }).data?.id ?? 0;
  const rawYear = payload.year_built ?? res.year_built;
  const year = typeof rawYear === "string" ? (rawYear ? parseInt(rawYear, 10) : null) : (rawYear ?? null);
  const yearBuilt = Number.isNaN(year) ? null : year;
  return {
    id: Number(id),
    ref_catastral: String(payload.ref_catastral ?? res.ref_catastral ?? ""),
    address: String(payload.address ?? res.address ?? "").trim() || null,
    year_built: yearBuilt,
    lat: (payload.lat ?? latitude) as number,
    lon: (payload.lon ?? longitude) as number,
    scor_oportunitate: (payload.scor_oportunitate ?? res.scor ?? null) as number | null,
    stare_piscina: (payload.stare_piscina ?? null) as string | null,
    ...payload,
  } as CatastroProperty;
}

export default function MapScreen({ navigation }: Props) {
  const { t } = useTranslation();
  const [latText, setLatText] = useState(String(MADRID.latitude));
  const [lonText, setLonText] = useState(String(MADRID.longitude));
  const [isLoadingProperty, setIsLoadingProperty] = useState(false);
  const [selectedProp, setSelectedProp] = useState<CatastroProperty | null>(null);
  const [errorProperty, setErrorProperty] = useState<string | null>(null);

  const runIdentify = useCallback(async () => {
    const latitude = parseFloat(latText.replace(",", "."));
    const longitude = parseFloat(lonText.replace(",", "."));
    if (Number.isNaN(latitude) || Number.isNaN(longitude)) {
      setErrorProperty(t("error_unavailable"));
      setSelectedProp(null);
      return;
    }
    setIsLoadingProperty(true);
    setSelectedProp(null);
    setErrorProperty(null);
    try {
      const res = await identificaImobil(latitude, longitude);
      const data = (res as { data?: Record<string, unknown> }).data;
      const ref =
        data && typeof (data as { ref_catastral?: string }).ref_catastral === "string"
          ? (data as { ref_catastral: string }).ref_catastral.trim()
          : "";
      if (ref) {
        setErrorProperty(null);
        setSelectedProp(buildCatastroProperty(res, latitude, longitude));
        return;
      }
      setSelectedProp(null);
      setErrorProperty(t("error_unavailable"));
    } catch {
      setSelectedProp(null);
      setErrorProperty(t("error_unavailable"));
    } finally {
      setIsLoadingProperty(false);
    }
  }, [latText, lonText, t]);

  const goToProperty = useCallback(() => {
    if (selectedProp) {
      navigation.navigate("Property", { property: selectedProp });
    }
  }, [navigation, selectedProp]);

  return (
    <SafeAreaView style={styles.safe} edges={["top"]}>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
      >
        <Text style={styles.intro}>{t("map_web_intro")}</Text>
        <Text style={styles.fieldLabel}>{t("map_web_lat")}</Text>
        <TextInput
          style={styles.input}
          value={latText}
          onChangeText={setLatText}
          keyboardType="decimal-pad"
          autoCapitalize="none"
        />
        <Text style={styles.fieldLabel}>{t("map_web_lon")}</Text>
        <TextInput
          style={styles.input}
          value={lonText}
          onChangeText={setLonText}
          keyboardType="decimal-pad"
          autoCapitalize="none"
        />
        <TouchableOpacity style={styles.analyzeBtn} onPress={runIdentify} disabled={isLoadingProperty}>
          {isLoadingProperty ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.analyzeBtnText}>{t("map_web_analyze")}</Text>
          )}
        </TouchableOpacity>
      </ScrollView>
      <View style={styles.detailPanel}>
        {isLoadingProperty ? (
          <View style={styles.panelLoading}>
            <ActivityIndicator size="small" color={colors.gold} />
            <Text style={styles.panelLoadingText}>{t("loading_catastro")}</Text>
          </View>
        ) : errorProperty && !selectedProp?.ref_catastral ? (
          <Text style={styles.panelErrorText}>{errorProperty}</Text>
        ) : selectedProp ? (
          <>
            <View style={styles.panelRow}>
              <View style={styles.panelColMain}>
                <Text style={styles.panelLabel}>{t("address_label")}</Text>
                <Text style={styles.panelValue} numberOfLines={2}>
                  {selectedProp.address || "—"}
                </Text>
              </View>
              <View style={styles.panelColYear}>
                <Text style={styles.panelLabel}>{t("year_label")}</Text>
                <Text style={styles.panelValue}>
                  {selectedProp.year_built != null ? String(selectedProp.year_built) : "—"}
                </Text>
              </View>
            </View>
            <TouchableOpacity style={styles.ctaButton} onPress={goToProperty}>
              <Text style={styles.ctaButtonText}>{t("buy_report_button")}</Text>
            </TouchableOpacity>
            <Text style={styles.ctaGuarantee}>{t("guarantee_official")}</Text>
          </>
        ) : (
          <Text style={styles.panelHint}>{t("hint_tap_roof")}</Text>
        )}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  scroll: { flex: 1 },
  scrollContent: { padding: spacing.lg, paddingBottom: spacing.xl },
  intro: { fontSize: 14, color: colors.textMuted, marginBottom: spacing.lg, lineHeight: 20 },
  fieldLabel: { fontSize: 12, color: colors.textMuted, marginBottom: spacing.xs },
  input: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 8,
    padding: spacing.md,
    fontSize: 16,
    marginBottom: spacing.md,
    color: colors.text,
  },
  analyzeBtn: {
    backgroundColor: colors.primaryPremium,
    paddingVertical: spacing.md,
    borderRadius: 10,
    alignItems: "center",
    marginTop: spacing.sm,
  },
  analyzeBtnText: { color: "#fff", fontWeight: "700", fontSize: 15 },
  detailPanel: {
    backgroundColor: "#fff",
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    paddingBottom: spacing.lg + 16,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: -2 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 8,
  },
  panelRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    marginBottom: spacing.sm,
  },
  panelColMain: { flex: 1, paddingRight: spacing.sm },
  panelColYear: { width: 64, alignItems: "flex-end" },
  panelLoading: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: spacing.md,
    gap: spacing.sm,
  },
  panelLoadingText: { fontSize: 13, color: colors.textMuted },
  panelErrorText: {
    fontSize: 13,
    color: colors.error,
    textAlign: "center",
    paddingVertical: spacing.md,
  },
  panelHint: { fontSize: 13, color: colors.textMuted, textAlign: "center", paddingVertical: spacing.md },
  panelLabel: { fontSize: 11, color: colors.textMuted, marginBottom: 2 },
  panelValue: { fontSize: 14, fontWeight: "600", color: colors.text },
  ctaButton: {
    backgroundColor: colors.primaryPremium,
    paddingVertical: spacing.md,
    borderRadius: 10,
    alignItems: "center",
    marginTop: spacing.sm,
  },
  ctaButtonText: { color: "#fff", fontWeight: "700", fontSize: 15 },
  ctaGuarantee: {
    fontSize: 10,
    color: colors.textMuted,
    textAlign: "center",
    marginTop: spacing.xs,
  },
});
