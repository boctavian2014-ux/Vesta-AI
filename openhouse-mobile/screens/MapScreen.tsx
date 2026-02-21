import React, { useState, useCallback } from "react";
import { View, StyleSheet, TouchableOpacity, Text, ActivityIndicator } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import MapView, { Marker } from "react-native-maps";
import { NativeStackScreenProps } from "@react-navigation/native-stack";
import { identificaImobil } from "../api";
import { colors, spacing } from "../theme";
import type { CatastroProperty } from "./PropertyScreen";

const MADRID = { latitude: 40.4167, longitude: -3.7037, latitudeDelta: 0.02, longitudeDelta: 0.02 };
const FRIENDLY_ERROR =
  "Informații indisponibile pentru acest punct. Încearcă să dai click pe centrul clădirii.";

export type MapScreenParams = {
  Map: undefined;
  Property: { property: CatastroProperty };
};

type Props = NativeStackScreenProps<MapScreenParams, "Map">;

/** Construiește un obiect CatastroProperty din răspunsul backend (/identifica-imobil/). */
function buildCatastroProperty(
  res: { data?: Record<string, unknown>; ref_catastral?: string; address?: string; year_built?: number; scor?: number },
  latitude: number,
  longitude: number
): CatastroProperty {
  const payload = res.data ?? {};
  const id = (payload.id as number) ?? (res as { data?: { id?: number } }).data?.id ?? 0;
  return {
    id: Number(id),
    ref_catastral: (payload.ref_catastral ?? res.ref_catastral ?? "") as string,
    address: (payload.address ?? res.address ?? null) as string | null,
    year_built: (payload.year_built ?? res.year_built ?? null) as number | null,
    lat: (payload.lat ?? latitude) as number,
    lon: (payload.lon ?? longitude) as number,
    scor_oportunitate: (payload.scor_oportunitate ?? res.scor ?? null) as number | null,
    stare_piscina: (payload.stare_piscina ?? null) as string | null,
    ...payload,
  } as CatastroProperty;
}

export default function MapScreen({ navigation }: Props) {
  const [isLoadingProperty, setIsLoadingProperty] = useState(false);
  const [selectedProp, setSelectedProp] = useState<CatastroProperty | null>(null);
  const [errorProperty, setErrorProperty] = useState<string | null>(null);
  const [region, setRegion] = useState(MADRID);

  const onMapPress = useCallback(async (e: { nativeEvent: { coordinate: { latitude: number; longitude: number } } }) => {
    const { latitude, longitude } = e.nativeEvent.coordinate;
    setIsLoadingProperty(true);
    setSelectedProp(null);
    setErrorProperty(null);
    try {
      const res = await identificaImobil(latitude, longitude);
      const property = buildCatastroProperty(res, latitude, longitude);
      setSelectedProp(property);
    } catch (_err) {
      setErrorProperty(FRIENDLY_ERROR);
    } finally {
      setIsLoadingProperty(false);
    }
  }, []);

  const goToProperty = useCallback(() => {
    if (selectedProp) {
      navigation.navigate("Property", { property: selectedProp });
    }
  }, [navigation, selectedProp]);

  return (
    <SafeAreaView style={styles.safe} edges={["top"]}>
      <View style={StyleSheet.absoluteFillObject}>
        <MapView
          style={StyleSheet.absoluteFillObject}
          initialRegion={MADRID}
          region={region}
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
            <Text style={styles.loadingOverlayText}>Se identifică imobilul…</Text>
          </View>
        )}
        {/* Panou jos: Adresa, Anul + buton → Property */}
        <View style={styles.detailPanel}>
          {isLoadingProperty ? (
            <View style={styles.panelLoading}>
              <ActivityIndicator size="small" color={colors.gold} />
              <Text style={styles.panelLoadingText}>Se interoghează Catastro Spania...</Text>
            </View>
          ) : errorProperty ? (
            <Text style={styles.panelErrorText}>{errorProperty}</Text>
          ) : selectedProp ? (
            <>
              <Text style={styles.panelLabel}>Adresa</Text>
              <Text style={styles.panelValue} numberOfLines={2}>
                {selectedProp.address || "—"}
              </Text>
              <Text style={styles.panelLabel}>Anul</Text>
              <Text style={styles.panelValue}>{selectedProp.year_built ?? "—"}</Text>
              <TouchableOpacity style={styles.ctaButton} onPress={goToProperty}>
                <Text style={styles.ctaButtonText}>Cumpără Raport Nota Simple (19€)</Text>
              </TouchableOpacity>
            </>
          ) : (
            <Text style={styles.panelHint}>Dă click pe o clădire pe hartă.</Text>
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
  ctaButton: {
    backgroundColor: colors.primary,
    paddingVertical: spacing.lg,
    paddingHorizontal: spacing.xl,
    borderRadius: 10,
    alignItems: "center",
    marginTop: spacing.lg,
  },
  ctaButtonText: { color: "#fff", fontWeight: "700", fontSize: 16 },
});
