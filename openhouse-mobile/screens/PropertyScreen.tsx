import React, { useState, useEffect, useRef } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
  Alert,
  Animated,
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

/** Scor de oportunitate: year < 1960 → 95, 1960–1984 → 80, 1985–2004 → 50, >= 2005 → 15. */
function calculateOpportunityScore(year: number | string | null | undefined): number {
  if (year == null || year === "") return 0;
  const y = typeof year === "string" ? parseInt(year, 10) : year;
  if (Number.isNaN(y)) return 0;
  if (y < 1960) return 95;
  if (y < 1985) return 80;
  if (y < 2005) return 50;
  return 15;
}

type ScoreStyle = "pulsatingRed" | "red" | "orange" | "green" | "neutral";
function getScoreStyle(score: number): ScoreStyle {
  if (score >= 95) return "pulsatingRed";
  if (score >= 75) return "red";
  if (score >= 50) return "orange";
  if (score >= 15) return "green";
  return "neutral";
}

export default function PropertyScreen({ route, navigation }: Props) {
  const property = route.params?.property;
  const { initPaymentSheet, presentPaymentSheet } = useStripe();
  const [email, setEmail] = useState("");
  const [payLoading, setPayLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!property) {
      if (navigation.canGoBack()) navigation.goBack();
      else (navigation as { replace: (name: string) => void }).replace("Map");
    }
  }, [property, navigation]);

  if (!property) return null;

  const displayYear =
    property.year_built != null && !Number.isNaN(Number(property.year_built))
      ? String(Number(property.year_built))
      : "—";
  const scorOportunitate =
    property.scor_oportunitate != null
      ? Number(property.scor_oportunitate)
      : calculateOpportunityScore(property.year_built);
  const scoreStyle = getScoreStyle(scorOportunitate);
  const showPotentialText = scorOportunitate > 75;

  const pulseAnim = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    if (scoreStyle !== "pulsatingRed") return;
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, { toValue: 1.15, duration: 600, useNativeDriver: true }),
        Animated.timing(pulseAnim, { toValue: 0.92, duration: 600, useNativeDriver: true }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [scoreStyle, pulseAnim]);

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
        applePay: { merchantCountryCode: "ES" },
        googlePay: { merchantCountryCode: "ES", testEnv: __DEV__ },
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
      (navigation as { navigate: (name: string) => void }).navigate("Success");
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
          <Text style={styles.value}>{displayYear}</Text>
          <Text style={styles.label}>📊 Scor Oportunitate</Text>
          {scorOportunitate > 0 ? (
            <>
              <Animated.Text
                style={[
                  styles.value,
                  styles.scoreValue,
                  scoreStyle === "pulsatingRed" && styles.scorePulsatingRed,
                  scoreStyle === "red" && styles.scoreRed,
                  scoreStyle === "orange" && styles.scoreOrange,
                  scoreStyle === "green" && styles.scoreGreen,
                  scoreStyle === "pulsatingRed" && { transform: [{ scale: pulseAnim }] },
                ]}
              >
                {scorOportunitate}
              </Animated.Text>
              {showPotentialText && (
                <Text style={styles.potentialText}>Potențial ridicat de renovare/investiție</Text>
              )}
            </>
          ) : (
            <Text style={styles.value}>—</Text>
          )}
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
  scoreValue: { fontWeight: "700", fontSize: 18 },
  scorePulsatingRed: { color: "#b91c1c" },
  scoreRed: { color: "#dc2626" },
  scoreOrange: { color: "#ea580c" },
  scoreGreen: { color: "#16a34a" },
  potentialText: { fontSize: 13, color: colors.textMuted, marginTop: 4, fontStyle: "italic" },
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
