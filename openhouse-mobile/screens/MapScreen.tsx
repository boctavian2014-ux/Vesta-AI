import React, { useState, useCallback, useRef } from "react";
import { View, StyleSheet, TouchableOpacity, Text, ActivityIndicator, Dimensions } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import MapView, { Marker } from "react-native-maps";
import { NativeStackScreenProps } from "@react-navigation/native-stack";
import { useTranslation } from "react-i18next";
import { identificaImobil } from "../api";
import { colors, spacing } from "../theme";
import type { CatastroProperty } from "./PropertyScreen";

const SCREEN_HEIGHT = Dimensions.get("window").height;
// Înălțimea estimată a bottom sheet-ului când e afișat (px)
const PANEL_HEIGHT = 400;
// Câte grade latitudine = 1px la zoom 17 (aproximare pentru ~43° lat, valabilă pt. Spania)
const LAT_DEG_PER_PX_ZOOM17 = 0.0000008;

const MADRID = { latitude: 40.4167, longitude: -3.7037, latitudeDelta: 0.02, longitudeDelta: 0.02 };

export type MapScreenParams = {
  Map: undefined;
  Property: { property: CatastroProperty };
};

type Props = NativeStackScreenProps<MapScreenParams, "Map">;

/** Construiește un obiect CatastroProperty din răspunsul backend (/identifica-imobil/). Backend trimite address și year_built ca string-uri. */
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
  const mapRef = useRef<MapView>(null);
  const [isLoadingProperty, setIsLoadingProperty] = useState(false);
  const [selectedProp, setSelectedProp] = useState<CatastroProperty | null>(null);
  const [errorProperty, setErrorProperty] = useState<string | null>(null);
  const [region, setRegion] = useState(MADRID);

  /**
   * Re-centrează harta cu pitch 3D și offset vertical pentru a nu acoperi markerul cu panoul.
   * Decalăm centrul spre sud (latitudine mai mică) astfel încât markerul să apară în
   * zona vizibilă de deasupra bottom sheet-ului.
   */
  const focusProperty = useCallback((lat: number, lng: number) => {
    // Câte px trebuie să deplasăm markerul în sus față de centrul ecranului:
    //   centrul ecran = SCREEN_HEIGHT/2; centrul zonei vizibile = (SCREEN_HEIGHT - PANEL_HEIGHT)/2
    //   offset_px = SCREEN_HEIGHT/2 - (SCREEN_HEIGHT - PANEL_HEIGHT)/2 = PANEL_HEIGHT/2
    const offsetPx = PANEL_HEIGHT / 2;
    const latOffset = offsetPx * LAT_DEG_PER_PX_ZOOM17;

    mapRef.current?.animateCamera(
      {
        center: { latitude: lat - latOffset, longitude: lng },
        zoom: 17,
        pitch: 45,
        heading: 0,
      },
      { duration: 1000 }
    );
  }, []);

  const onMapPress = useCallback(
    async (e: { nativeEvent: { coordinate: { latitude: number; longitude: number } } }) => {
      const { latitude, longitude } = e.nativeEvent.coordinate;
      setIsLoadingProperty(true);
      setSelectedProp(null);
      setErrorProperty(null);
      focusProperty(latitude, longitude);

      try {
        const res = await identificaImobil(latitude, longitude);
        const data = (res as { data?: Record<string, unknown> }).data;
        const ref = (data && typeof (data as { ref_catastral?: string }).ref_catastral === "string")
          ? (data as { ref_catastral: string }).ref_catastral.trim()
          : "";
        if (ref) {
          setErrorProperty(null);
          const property = buildCatastroProperty(res, latitude, longitude);
          setSelectedProp(property);
          focusProperty(latitude, longitude);
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
    },
    [navigation, t]
  );

  const goToProperty = useCallback(() => {
    if (selectedProp) {
      navigation.navigate("Property", { property: selectedProp });
    }
  }, [navigation, selectedProp]);

  return (
    <SafeAreaView style={styles.safe} edges={["top"]}>
      <View style={StyleSheet.absoluteFillObject}>
        <MapView
          ref={mapRef}
          style={StyleSheet.absoluteFillObject}
          initialRegion={MADRID}
          onRegionChangeComplete={setRegion}
          onPress={onMapPress}
          mapType="satellite"
        >
          {selectedProp && (
            <Marker
              coordinate={{ latitude: selectedProp.lat ?? 0, longitude: selectedProp.lon ?? 0 }}
              title={selectedProp.ref_catastral ?? undefined}
              pinColor={
                (selectedProp.scor_oportunitate ?? 0) >= 50
                  ? "red"
                  : (selectedProp.scor_oportunitate ?? 0) >= 20
                    ? "orange"
                    : "green"
              }
            />
          )}
        </MapView>
        {isLoadingProperty && (
          <View style={styles.loadingOverlay}>
            <ActivityIndicator size="large" color={colors.gold} />
            <Text style={styles.loadingOverlayText}>{t("loading_identify")}</Text>
          </View>
        )}
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
              {/* Adresă + An pe același rând */}
              <View style={styles.panelRow}>
                <View style={styles.panelColMain}>
                  <Text style={styles.panelLabel}>{t("address_label")}</Text>
                  <Text style={styles.panelValue} numberOfLines={1}>
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
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  loadingOverlay: {
    position: "absolute",
    top: 60,
    alignSelf: "center",
    backgroundColor: colors.overlay,
    padding: spacing.lg,
    borderRadius: 8,
  },
  loadingOverlayText: { color: "#fff", marginTop: spacing.sm },
  detailPanel: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
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
  panelColMain: {
    flex: 1,
    paddingRight: spacing.sm,
  },
  panelColYear: {
    width: 64,
    alignItems: "flex-end",
  },
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
