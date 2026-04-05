/**
 * Ecran hartă cu Mapbox (satellite-streets-v11; pitch 0 Android / 45 iOS pentru stabilitate GPU).
 * Folosește acest fișier după ce instalezi: npm install @rnmapbox/maps
 * și setezi token-ul în config (ex. MAPBOX_ACCESS_TOKEN).
 * Vezi MAPBOX_SETUP.md pentru migrare de la react-native-maps.
 */
import React, { useRef, useState, useCallback, useEffect } from "react";
import { View, StyleSheet, TouchableOpacity, Text, ActivityIndicator, Platform } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { NativeStackScreenProps } from "@react-navigation/native-stack";
import Mapbox, { setAccessToken } from "@rnmapbox/maps";
import { useTranslation } from "react-i18next";
import { identificaImobil } from "../api";
import { colors, spacing } from "../theme";
import type { CatastroProperty } from "./PropertyScreen";

// Expo: doar variabile EXPO_PUBLIC_* sunt incluse în bundle — folosește EXPO_PUBLIC_MAPBOX_TOKEN în .env
const MAPBOX_TOKEN =
  process.env.EXPO_PUBLIC_MAPBOX_TOKEN || process.env.EXPO_PUBLIC_MAPBOX_ACCESS_TOKEN || "";

/** URL explicit — același stil ca StyleURL.SatelliteStreet din SDK (evită valori undefined la import). */
const SATELLITE_STREETS_STYLE = "mapbox://styles/mapbox/satellite-streets-v11";

const MADRID: [number, number] = [-3.70379, 40.41678];

export type MapScreenMapboxParams = {
  Map: undefined;
  Property: { property: CatastroProperty };
};

type Props = NativeStackScreenProps<MapScreenMapboxParams, "Map">;

function buildCatastroProperty(
  res: {
    data?: Record<string, unknown>;
    ref_catastral?: string;
    address?: string;
    year_built?: string | number;
    scor?: number;
  },
  latitude: number,
  longitude: number
): CatastroProperty {
  const payload = res.data ?? {};
  const id = (payload.id as number) ?? 0;
  const rawYear = payload.year_built ?? res.year_built;
  const year = typeof rawYear === "string" ? (rawYear ? parseInt(rawYear, 10) : null) : (rawYear ?? null);
  const yearBuilt = Number.isNaN(year as number) ? null : (year as number);
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

export default function MapScreenMapbox({ navigation }: Props) {
  const { t } = useTranslation();
  const cameraRef = useRef<Mapbox.Camera>(null);
  const [mapLoadError, setMapLoadError] = useState<string | null>(null);
  /** Native setAccessToken este async; MapView nu trebuie montat înainte ca tokenul să fie setat pe UI thread. */
  const [mapTokenReady, setMapTokenReady] = useState(false);
  const [isLoadingProperty, setIsLoadingProperty] = useState(false);
  const [selectedProp, setSelectedProp] = useState<CatastroProperty | null>(null);
  const [errorProperty, setErrorProperty] = useState<string | null>(null);
  const [centerCoord, setCenterCoord] = useState<[number, number]>(MADRID);

  useEffect(() => {
    if (!MAPBOX_TOKEN) {
      setMapTokenReady(false);
      return;
    }
    let cancelled = false;
    Promise.resolve(setAccessToken(MAPBOX_TOKEN))
      .then(() => {
        if (!cancelled) setMapTokenReady(true);
      })
      .catch((e) => {
        if (!cancelled) {
          setMapLoadError(e instanceof Error ? e.message : "setAccessToken failed");
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const propertyCoords: [number, number] | null =
    selectedProp != null && selectedProp.lat != null && selectedProp.lon != null
      ? [selectedProp.lon, selectedProp.lat]
      : null;

  const onMapPress = useCallback(
    async (e: { geometry: { coordinates: [number, number] } }) => {
      const [longitude, latitude] = e.geometry.coordinates;
      setIsLoadingProperty(true);
      setSelectedProp(null);
      setErrorProperty(null);
      setCenterCoord([longitude, latitude]);

      try {
        const res = await identificaImobil(latitude, longitude);
        const data = (res as { data?: Record<string, unknown> }).data;
        const ref =
          data && typeof (data as { ref_catastral?: string }).ref_catastral === "string"
            ? (data as { ref_catastral: string }).ref_catastral.trim()
            : "";
        if (ref) {
          setErrorProperty(null);
          const property = buildCatastroProperty(res, latitude, longitude);
          setSelectedProp(property);
          cameraRef.current?.setCamera({
            centerCoordinate: [longitude, latitude],
            padding: { paddingBottom: 280 },
            animationDuration: 500,
          });
        } else {
          setSelectedProp(null);
          setErrorProperty(t("error_unavailable"));
        }
      } catch {
        setSelectedProp(null);
        setErrorProperty(t("error_unavailable"));
      } finally {
        setIsLoadingProperty(false);
      }
    },
    [t]
  );

  const onMarkerPress = useCallback(() => {
    if (selectedProp) {
      navigation.navigate("Property", { property: selectedProp });
    }
  }, [navigation, selectedProp]);

  const initialCoords = propertyCoords ?? centerCoord;

  return (
    <SafeAreaView style={styles.safe} edges={["top"]}>
      <View style={styles.container}>
        {MAPBOX_TOKEN && mapTokenReady ? (
          <View
            style={styles.map}
            {...(Platform.OS === "android" ? { collapsable: false } : {})}
          >
            <Mapbox.MapView
              style={StyleSheet.absoluteFillObject}
              styleURL={SATELLITE_STREETS_STYLE}
              logoEnabled={false}
              attributionEnabled
              surfaceView={Platform.OS === "android" ? false : undefined}
              onMapLoadingError={() => {
                setMapLoadError("Map style or tiles failed to load (check token & network).");
                if (__DEV__) {
                  console.warn("[Mapbox] onMapLoadingError");
                }
              }}
              onDidFinishLoadingMap={() => setMapLoadError(null)}
              onPress={onMapPress}
            >
              <Mapbox.Camera
                ref={cameraRef}
                zoomLevel={16}
                centerCoordinate={initialCoords}
                pitch={Platform.OS === "android" ? 0 : 45}
                animationDuration={1000}
              />
              {propertyCoords && (
                <Mapbox.PointAnnotation
                  id="propertyMarker"
                  coordinate={propertyCoords}
                  onSelected={onMarkerPress}
                >
                  <View style={styles.markerContainer}>
                    <View
                      style={[
                        styles.markerInner,
                        (selectedProp?.scor_oportunitate ?? 0) >= 50
                          ? styles.markerRed
                          : (selectedProp?.scor_oportunitate ?? 0) >= 20
                            ? styles.markerOrange
                            : styles.markerGreen,
                      ]}
                    />
                  </View>
                </Mapbox.PointAnnotation>
              )}
            </Mapbox.MapView>
          </View>
        ) : MAPBOX_TOKEN ? (
          <View style={[styles.map, styles.mapBooting]}>
            <ActivityIndicator size="large" color={colors.gold} />
            <Text style={styles.mapBootingText}>Loading map…</Text>
          </View>
        ) : (
          <View style={[styles.map, styles.mapBooting]} />
        )}

        {!MAPBOX_TOKEN ? (
          <View style={styles.tokenBanner}>
            <Text style={styles.tokenBannerText}>
              Missing EXPO_PUBLIC_MAPBOX_TOKEN — add it to .env and restart Metro.
            </Text>
          </View>
        ) : null}
        {mapLoadError && MAPBOX_TOKEN ? (
          <View style={styles.tokenBanner}>
            <Text style={styles.tokenBannerText}>
              Map tiles failed to load. Check Mapbox token (scopes / URL restrictions) and billing.{"\n"}
              {mapLoadError}
            </Text>
          </View>
        ) : null}
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
              <Text style={styles.panelLabel}>{t("address_label")}</Text>
              <Text style={styles.panelValue} numberOfLines={2}>
                {selectedProp.address || "—"}
              </Text>
              <Text style={styles.panelLabel}>{t("year_label")}</Text>
              <Text style={styles.panelValue}>{selectedProp.year_built ?? "—"}</Text>
              <Text style={styles.valueProp}>{t("value_prop")}</Text>
              <TouchableOpacity
                style={styles.ctaButton}
                onPress={() => navigation.navigate("Property", { property: selectedProp })}
              >
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
  container: { flex: 1 },
  map: { flex: 1 },
  mapBooting: {
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "#e2e8f0",
  },
  mapBootingText: { marginTop: 12, fontSize: 14, color: colors.textMuted },
  tokenBanner: {
    position: "absolute",
    top: 48,
    left: 12,
    right: 12,
    backgroundColor: "rgba(185, 28, 28, 0.95)",
    padding: 12,
    borderRadius: 8,
    zIndex: 20,
  },
  tokenBannerText: { color: "#fff", fontSize: 13, lineHeight: 18 },
  markerContainer: {
    height: 30,
    width: 30,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(59, 130, 246, 0.3)",
    borderRadius: 15,
  },
  markerInner: {
    height: 12,
    width: 12,
    borderRadius: 6,
    borderWidth: 2,
    borderColor: "white",
  },
  markerGreen: { backgroundColor: "#22c55e" },
  markerOrange: { backgroundColor: "#f97316" },
  markerRed: { backgroundColor: "#ef4444" },
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
    padding: spacing.xl,
    paddingBottom: spacing.xl + 24,
    minHeight: 120,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: -2 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 8,
  },
  panelLoading: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: spacing.lg,
    gap: spacing.md,
  },
  panelLoadingText: { fontSize: 15, color: colors.textMuted },
  panelErrorText: {
    fontSize: 15,
    color: colors.error,
    textAlign: "center",
    paddingVertical: spacing.lg,
  },
  panelHint: { fontSize: 15, color: colors.textMuted, textAlign: "center", paddingVertical: spacing.lg },
  panelLabel: { fontSize: 12, color: colors.textMuted, marginTop: spacing.sm, marginBottom: 2 },
  panelValue: { fontSize: 16, color: colors.text, marginBottom: spacing.sm },
  valueProp: { fontSize: 12, color: colors.textMuted, fontStyle: "italic", marginTop: spacing.xs, marginBottom: spacing.sm },
  ctaButton: {
    backgroundColor: colors.primaryPremium,
    paddingVertical: spacing.lg,
    paddingHorizontal: spacing.xl,
    borderRadius: 10,
    alignItems: "center",
    marginTop: spacing.lg,
  },
  ctaButtonText: { color: "#fff", fontWeight: "700", fontSize: 16 },
  ctaGuarantee: {
    fontSize: 11,
    color: colors.textMuted,
    textAlign: "center",
    marginTop: spacing.sm,
    paddingHorizontal: spacing.md,
  },
});
