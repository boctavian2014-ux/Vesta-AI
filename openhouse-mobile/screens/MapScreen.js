import React, { useState, useCallback } from "react";
import { View, StyleSheet, TouchableOpacity, Text, ActivityIndicator, Alert } from "react-native";
import MapView, { Marker } from "react-native-maps";
import { identificaImobil } from "../api";

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
        Alert.alert("Eroare", err.message || "Nu s-a putut identifica imobilul.");
      } finally {
        setLoading(false);
      }
    },
    []
  );

  return (
    <View style={StyleSheet.absoluteFillObject}>
      <MapView
        style={StyleSheet.absoluteFillObject}
        initialRegion={MADRID}
        region={region}
        onRegionChangeComplete={setRegion}
        onPress={onMapPress}
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
          <ActivityIndicator size="large" color="#6772e5" />
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
  );
}

const styles = StyleSheet.create({
  loading: {
    position: "absolute",
    top: 60,
    alignSelf: "center",
    backgroundColor: "rgba(0,0,0,0.7)",
    padding: 16,
    borderRadius: 8,
  },
  loadingText: { color: "#fff", marginTop: 8 },
  fab: {
    position: "absolute",
    bottom: 32,
    left: 24,
    right: 24,
    backgroundColor: "#6772e5",
    padding: 16,
    borderRadius: 8,
    alignItems: "center",
  },
  fabText: { color: "#fff", fontWeight: "600", fontSize: 16 },
});
