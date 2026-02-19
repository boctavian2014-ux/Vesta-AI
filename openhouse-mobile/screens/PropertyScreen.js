import React, { useState, useEffect } from "react";
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
import { SafeAreaView } from "react-native-safe-area-context";
import * as Linking from "expo-linking";
import { ensureGuest, createCheckoutSession } from "../api";
import { colors, spacing } from "../theme";

export default function PropertyScreen({ route, navigation }) {
  const property = route.params?.property;
  const [email, setEmail] = useState("");
  const [payLoading, setPayLoading] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!property) {
      if (navigation.canGoBack()) navigation.goBack();
      else navigation.replace("Map");
    }
  }, [property, navigation]);

  if (!property) return null;

  const handleBuyReport = async () => {
    const trimmed = email.trim().toLowerCase();
    if (!trimmed) {
      Alert.alert("Lipsește emailul", "Introdu emailul pentru a primi raportul.");
      return;
    }
    setError(null);
    setPayLoading(true);
    try {
      const guestRes = await ensureGuest(trimmed);
      const baseSuccess = Linking.createURL("success");
      const successUrl = `${baseSuccess}${baseSuccess.includes("?") ? "&" : "?"}session_id={CHECKOUT_SESSION_ID}`;
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
        setError("Nu s-a primit URL de plată.");
      }
    } catch (err) {
      setError(err.message || "Plata nu a putut fi inițiată.");
    } finally {
      setPayLoading(false);
    }
  };

  return (
    <SafeAreaView style={styles.container} edges={["bottom"]}>
      <ScrollView style={styles.scroll} contentContainerStyle={styles.content}>
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
            <Text style={[styles.value, property.stare_piscina === "CRITIC" && { color: colors.error }]}>
              {property.stare_piscina === "CRITIC" ? "Piscină abandonată" : "Întreținut"}
            </Text>
          </>
        )}
        <Text style={styles.label}>Email (pentru raport)</Text>
        <TextInput
          style={styles.input}
          value={email}
          onChangeText={(t) => { setEmail(t); setError(null); }}
          placeholder="tu@email.com"
          keyboardType="email-address"
          autoCapitalize="none"
        />
        {error && (
          <View style={styles.errorBox}>
            <Text style={styles.errorText}>{error}</Text>
            <TouchableOpacity onPress={handleBuyReport} disabled={payLoading}>
              <Text style={styles.retryText}>Reîncearcă</Text>
            </TouchableOpacity>
          </View>
        )}
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
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  scroll: { flex: 1 },
  content: { padding: spacing.xl },
  title: { fontSize: 20, fontWeight: "700", marginBottom: spacing.lg, color: colors.text },
  label: { fontSize: 12, color: colors.textMuted, marginTop: spacing.md },
  value: { fontSize: 16, marginBottom: 4, color: colors.text },
  input: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 8,
    padding: spacing.md,
    marginTop: spacing.sm,
    marginBottom: spacing.lg,
    fontSize: 16,
    color: colors.text,
  },
  errorBox: {
    padding: spacing.md,
    marginBottom: spacing.md,
    backgroundColor: colors.errorBackground,
    borderRadius: 8,
  },
  errorText: { color: colors.error, fontSize: 14, marginBottom: spacing.sm },
  retryText: { color: colors.primary, fontWeight: "600", fontSize: 14 },
  button: {
    backgroundColor: colors.primary,
    padding: spacing.lg,
    borderRadius: 8,
    alignItems: "center",
    marginTop: spacing.sm,
  },
  buttonText: { color: "#fff", fontWeight: "600", fontSize: 16 },
});
