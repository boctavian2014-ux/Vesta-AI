import React, { useState, useCallback } from "react";
import { View, StyleSheet, TouchableOpacity, Text, ActivityIndicator, Alert } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import MapView, { Marker } from "react-native-maps";
import { identificaImobil } from "../api";
import { colors, spacing } from "../theme";

const MADRID = { latitude: 40.4167, longitude: -3.7037, latitudeDelta: 0.02, longitudeDelta: 0.02 };

export default function MapScreen({ navigation }) {
  const [loading, setLoading] = useState(false);
  const [selectedProp, setSelectedProp] = useState(null);
  const [region, setRegion] = useState(MADRID);

  const onMapPress = useCallback(
    async (e) => {
      const { latitude, longitude } = e.nativeEvent.coordinate;
      setLoading(true);
      setSelectedProp(null);
      try {
        const res = await identificaImobil(latitude, longitude);
        setSelectedProp(res.data);
      } catch (err) {
        const msg = err.message || "Nu s-a putut identifica imobilul.";
        const isNetwork =
          /network request failed|failed to fetch|load failed|could not connect|econnrefused|timeout/i.test(msg);
        const is404 = /\(404\)|not found/i.test(msg);
        const is422 = /\(422\)|catastro|referința|unprocessable/i.test(msg);
        let displayMsg = msg;
        if (isNetwork) {
          displayMsg =
            "Nu s-a putut contacta serverul. Verifică internetul și că backend-ul rulează. Pe telefon, folosește URL-ul API din rețeaua locală (ex: http://IP_PC:8000) sau Railway.";
        } else if (is404) {
          displayMsg =
            "Endpoint negăsit (404). Verifică că EXPO_PUBLIC_API_URL este URL-ul corect al backend-ului OpenHouse. Dacă API-ul e la o cale (ex. /api), include-o: https://domeniu.ro/api";
        } else if (is422) {
          displayMsg = msg + "\n\nÎncearcă un punct pe uscat în Spania (ex. Madrid, Málaga). Locațiile în afara Spaniei sau pe mare nu au referință cadastrală.";
        }
        Alert.alert("Eroare", displayMsg);
      } finally {
        setLoading(false);
      }
    },
    []
  );

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
              coordinate={{ latitude: selectedProp.lat, longitude: selectedProp.lon }}
              title={selectedProp.ref_catastral}
              pinColor={selectedProp.scor_oportunitate >= 50 ? "red" : selectedProp.scor_oportunitate >= 20 ? "orange" : "green"}
            />
          )}
        </MapView>
        {loading && (
          <View style={styles.loading}>
            <ActivityIndicator size="large" color={colors.primary} />
            <Text style={styles.loadingText}>Se identifică imobilul…</Text>
          </View>
        )}
        {selectedProp && (
          <TouchableOpacity
            style={styles.fab}
            onPress={() => navigation.navigate("Property", { property: selectedProp })}
          >
            <Text style={styles.fabText}>Detalii & Raport 19€</Text>
          </TouchableOpacity>
        )}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  loading: {
    position: "absolute",
    top: 60,
    alignSelf: "center",
    backgroundColor: colors.overlay,
    padding: spacing.lg,
    borderRadius: 8,
  },
  loadingText: { color: "#fff", marginTop: spacing.sm },
  fab: {
    position: "absolute",
    bottom: 32,
    left: spacing.xl,
    right: spacing.xl,
    backgroundColor: colors.primary,
    padding: spacing.lg,
    borderRadius: 8,
    alignItems: "center",
  },
  fabText: { color: "#fff", fontWeight: "600", fontSize: 16 },
});
