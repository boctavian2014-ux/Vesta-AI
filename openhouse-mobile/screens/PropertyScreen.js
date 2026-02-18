import React, { useState } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
  Alert,
} from "react-native";
import * as Linking from "expo-linking";
import { ensureGuest, createCheckoutSession } from "../api";

export default function PropertyScreen({ route, navigation }) {
  const { property } = route.params;
  const [email, setEmail] = useState("");
  const [payLoading, setPayLoading] = useState(false);

  const handleBuyReport = async () => {
    const trimmed = email.trim().toLowerCase();
    if (!trimmed) {
      Alert.alert("Lipsește emailul", "Introdu emailul pentru a primi raportul.");
      return;
    }
    setPayLoading(true);
    try {
      const guestRes = await ensureGuest(trimmed);
      const successUrl = Linking.createURL("success");
      const cancelUrl = Linking.createURL("/");
      const checkoutRes = await createCheckoutSession(
        property.id,
        guestRes.user_id,
        successUrl,
        cancelUrl
      );
      if (checkoutRes.checkout_url) {
        await Linking.openURL(checkoutRes.checkout_url);
      } else {
        Alert.alert("Eroare", "Nu s-a primit URL de plată.");
      }
    } catch (err) {
      Alert.alert("Eroare", err.message || "Plata nu a putut fi inițiată.");
    } finally {
      setPayLoading(false);
    }
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Text style={styles.title}>Detalii proprietate</Text>
      <Text style={styles.label}>Ref. cadastrală</Text>
      <Text style={styles.value}>{property.ref_catastral}</Text>
      <Text style={styles.label}>Adresă</Text>
      <Text style={styles.value}>{property.address || "—"}</Text>
      <Text style={styles.label}>An construcție</Text>
      <Text style={styles.value}>{property.year_built ?? "—"}</Text>
      <Text style={styles.label}>Scor oportunitate</Text>
      <Text style={styles.value}>
        {property.scor_oportunitate ?? "—"} (
        {property.scor_oportunitate >= 50 ? "Roșu" : property.scor_oportunitate >= 20 ? "Galben" : "Verde"})
      </Text>
      {property.stare_piscina && (
        <>
          <Text style={styles.label}>Stare piscină (satelit)</Text>
          <Text style={[styles.value, property.stare_piscina === "CRITIC" && { color: "#b91c1c" }]}>
            {property.stare_piscina === "CRITIC" ? "Piscină abandonată" : "Întreținut"}
          </Text>
        </>
      )}
      <Text style={styles.label}>Email (pentru raport)</Text>
      <TextInput
        style={styles.input}
        value={email}
        onChangeText={setEmail}
        placeholder="tu@email.com"
        keyboardType="email-address"
        autoCapitalize="none"
      />
      <TouchableOpacity
        style={styles.button}
        onPress={handleBuyReport}
        disabled={payLoading}
      >
        {payLoading ? (
          <ActivityIndicator color="#fff" />
        ) : (
          <Text style={styles.buttonText}>Cumpără raport proprietar (19€)</Text>
        )}
      </TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { padding: 24 },
  title: { fontSize: 20, fontWeight: "700", marginBottom: 16 },
  label: { fontSize: 12, color: "#64748b", marginTop: 12 },
  value: { fontSize: 16, marginBottom: 4 },
  input: {
    borderWidth: 1,
    borderColor: "#e2e8f0",
    borderRadius: 8,
    padding: 12,
    marginTop: 8,
    marginBottom: 16,
    fontSize: 16,
  },
  button: {
    backgroundColor: "#6772e5",
    padding: 16,
    borderRadius: 8,
    alignItems: "center",
    marginTop: 8,
  },
  buttonText: { color: "#fff", fontWeight: "600", fontSize: 16 },
});
