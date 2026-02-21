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
import { useStripe } from "@stripe/stripe-react-native";
import { NativeStackScreenProps } from "@react-navigation/native-stack";
import { creeazaPlata } from "../api";
import { colors, spacing } from "../theme";

/** Tip pentru proprietatea din Catastro (trimis din MapScreen). */
export interface CatastroProperty {
  id: number;
  ref_catastral?: string | null;
  address?: string | null;
  year_built?: number | null;
  lat?: number;
  lon?: number;
  scor_oportunitate?: number | null;
  stare_piscina?: string | null;
  [key: string]: unknown;
}

export type PropertyScreenParams = {
  Property: { property: CatastroProperty };
};

type Props = NativeStackScreenProps<PropertyScreenParams, "Property">;

export default function PropertyScreen({ route, navigation }: Props) {
  const property = route.params?.property;
  const { initPaymentSheet, presentPaymentSheet } = useStripe();
  const [email, setEmail] = useState("");
  const [payLoading, setPayLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
      const res = await creeazaPlata({
        tip: "standard",
        email: trimmed,
        property_id: property.id, // obligatoriu pentru metadata Stripe și crearea raportului la webhook
      });
      const clientSecret = res?.clientSecret;
      if (!clientSecret) {
        setError(res?.error || "Nu s-a primit secretul plății.");
        return;
      }
      const { error: initErr } = await initPaymentSheet({
        paymentIntentClientSecret: clientSecret,
        merchantDisplayName: "Vesta AI",
        applePay: true,
        googlePay: true,
        defaultBillingDetails: { name: "Utilizator Vesta" },
      });
      if (initErr) {
        setError(initErr.message || "Eroare la pregătirea plății.");
        return;
      }
      const { error: payErr } = await presentPaymentSheet();
      if (payErr) {
        Alert.alert("Eroare plată", payErr.message || "Plata a fost anulată sau a eșuat.");
        return;
      }
      Alert.alert("Plată reușită", "Raportul se generează. Vei primi notificare pe email.");
      navigation.navigate("Success");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Plata nu a putut fi inițiată.");
    } finally {
      setPayLoading(false);
    }
  };

  return (
    <SafeAreaView style={styles.container} edges={["bottom"]}>
      <ScrollView style={styles.scroll} contentContainerStyle={styles.content}>
        <Text style={styles.title}>Detalii proprietate</Text>
        <View style={styles.cardCatastro}>
          <Text style={styles.cardTitle}>Date Catastro (Spania)</Text>
          <Text style={styles.label}>📍 Dirección</Text>
          <Text style={styles.value}>{property.address || "—"}</Text>
          <Text style={styles.label}>📅 Año de Construcción</Text>
          <Text style={styles.value}>{property.year_built ?? "—"}</Text>
          <Text style={styles.label}>🆔 Ref. Catastral</Text>
          <Text style={[styles.value, styles.valueCode]}>{property.ref_catastral || "—"}</Text>
        </View>
        <Text style={styles.label}>Email (pentru raport)</Text>
        <TextInput
          style={styles.input}
          value={email}
          onChangeText={(t) => {
            setEmail(t);
            setError(null);
          }}
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
        <TouchableOpacity style={styles.button} onPress={handleBuyReport} disabled={payLoading}>
          {payLoading ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.buttonText}>Cumpără Raport Nota Simple (19€)</Text>
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
  cardCatastro: {
    backgroundColor: colors.backgroundMuted || "#f1f5f9",
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 12,
    padding: spacing.lg,
    marginBottom: spacing.lg,
  },
  cardTitle: { fontSize: 16, fontWeight: "600", marginBottom: spacing.md, color: colors.text },
  label: { fontSize: 12, color: colors.textMuted, marginTop: spacing.md },
  value: { fontSize: 16, marginBottom: 4, color: colors.text },
  valueCode: { fontFamily: "monospace", fontSize: 14 },
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
