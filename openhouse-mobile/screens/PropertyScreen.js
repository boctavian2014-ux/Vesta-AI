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
  Switch,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useStripe } from "@stripe/stripe-react-native";
import { creeazaPlata } from "../api";
import { colors, spacing } from "../theme";

export default function PropertyScreen({ route, navigation }) {
  const property = route.params?.property;
  const { initPaymentSheet, presentPaymentSheet } = useStripe();
  const [email, setEmail] = useState("");
  const [payLoading, setPayLoading] = useState(false);
  const [error, setError] = useState(null);
  const [isPremium, setIsPremium] = useState(false);
  const pret = isPremium ? 50 : 19;

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
        tip: isPremium ? "premium" : "standard",
        email: trimmed,
        property_id: property.id,
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
        {property.analiza_ai != null && property.analiza_ai !== "" && (
          <>
            <Text style={styles.label}>Analiză AI (oportunitate renovare)</Text>
            <Text style={[styles.value, styles.analizaBlock]}>{property.analiza_ai}</Text>
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
        <View style={styles.selector}>
          <Text style={styles.selectorLabel}>Raport Premium (+Carte Funciară)</Text>
          <Switch
            value={isPremium}
            onValueChange={setIsPremium}
            trackColor={{ false: colors.border, true: colors.primary }}
            thumbColor="#fff"
          />
        </View>
        {isPremium && (
          <View style={styles.premiumBox}>
            <Text style={styles.premiumTitle}>Raport Complet Investitor (Nota Simple)</Text>
            <Text style={styles.premiumBullet}>✅ Datele Proprietarului: Află cine deține legal imobilul.</Text>
            <Text style={styles.premiumBullet}>✅ Verificare Sarcini: Vezi dacă există ipoteci, sechestre sau datorii la stat.</Text>
            <Text style={styles.premiumBullet}>✅ Suprafață Legală: Confirmă metrii pătrați din Cartea Funciară.</Text>
            <Text style={styles.premiumNote}>⏱️ Livrare: Analiza AI este instantă, Nota Simple se livrează în 2-24h.</Text>
          </View>
        )}
        {isPremium && (
          <View style={styles.badgeWrap}>
            <Text style={styles.badge}>RECOMANDAT PENTRU INVESTITORI</Text>
          </View>
        )}
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
            <Text style={styles.buttonText}>Cumpără raport proprietar ({pret}€)</Text>
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
  analizaBlock: { marginBottom: spacing.md },
  selector: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: spacing.lg,
    paddingVertical: spacing.sm,
  },
  selectorLabel: { fontSize: 15, color: colors.text, fontWeight: "500" },
  premiumBox: {
    backgroundColor: "#f0f4ff",
    padding: 15,
    borderRadius: 10,
    marginVertical: 10,
    marginBottom: 4,
  },
  premiumTitle: {
    fontWeight: "700",
    color: "#1a1a1a",
    marginBottom: 8,
    fontSize: 15,
  },
  premiumBullet: {
    fontSize: 13,
    color: "#444",
    marginBottom: 4,
  },
  premiumNote: {
    fontSize: 12,
    fontStyle: "italic",
    marginTop: 10,
    color: colors.primary || "#007AFF",
  },
  badgeWrap: {
    alignSelf: "flex-start",
    marginBottom: spacing.sm,
  },
  badge: {
    fontSize: 11,
    fontWeight: "700",
    color: colors.primary || "#007AFF",
    backgroundColor: "#e8eeff",
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 6,
    overflow: "hidden",
  },
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
