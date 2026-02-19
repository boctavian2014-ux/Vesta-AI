import React, { useState, useEffect } from "react";
import { View, Text, TouchableOpacity, StyleSheet, ActivityIndicator } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import * as Linking from "expo-linking";
import { getRequestIdBySession } from "../api";
import { colors, spacing } from "../theme";

function parseSessionIdFromUrl(url) {
  if (!url) return null;
  try {
    const parsed = Linking.parse(url);
    const q = parsed.queryParams || {};
    return q.session_id || null;
  } catch {
    return null;
  }
}

export default function SuccessScreen({ navigation, route }) {
  const url = Linking.useURL();
  const [requestId, setRequestId] = useState(null);
  const [loading, setLoading] = useState(true);
  const [pending, setPending] = useState(false);

  const sessionIdFromUrl = parseSessionIdFromUrl(url);
  const sessionIdFromParams = route.params?.session_id ?? null;
  const sessionId = sessionIdFromParams || sessionIdFromUrl;

  useEffect(() => {
    if (!sessionId) {
      setLoading(false);
      return;
    }
    let cancelled = false;
    getRequestIdBySession(sessionId)
      .then((res) => {
        if (cancelled) return;
        setRequestId(res.request_id || null);
        setPending(res.status === "pending" || !res.request_id);
      })
      .catch(() => {
        if (!cancelled) setPending(true);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
  }, [sessionId]);

  const goToStatus = () => {
    if (requestId) {
      navigation.navigate("Status", { requestId });
    } else {
      navigation.navigate("Status");
    }
  };

  return (
    <SafeAreaView style={styles.container} edges={["bottom"]}>
      <View style={styles.inner}>
        <Text style={styles.title}>Plată reușită</Text>
        <Text style={styles.text}>
          Raportul Nota Simple a fost comandat. Vei primi un email când este gata.
        </Text>
        {loading && <ActivityIndicator size="small" color={colors.primary} style={{ marginBottom: spacing.md }} />}
        {!loading && requestId && (
          <Text style={styles.requestId}>Request ID: <Text style={styles.requestIdValue}>{requestId}</Text></Text>
        )}
        {!loading && pending && !requestId && (
          <Text style={styles.pendingText}>Procesăm plata. Încarcă din nou ecranul sau verifică statusul mai târziu.</Text>
        )}
        <TouchableOpacity style={styles.button} onPress={() => navigation.navigate("Map")}>
          <Text style={styles.buttonText}>Înapoi la hartă</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.secondaryButton} onPress={goToStatus}>
          <Text style={styles.secondaryButtonText}>Verifică status raport</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  inner: { flex: 1, justifyContent: "center", alignItems: "center", padding: spacing.xl },
  title: { fontSize: 22, fontWeight: "700", marginBottom: spacing.md, color: colors.text },
  text: { color: colors.textMuted, textAlign: "center", marginBottom: spacing.xl },
  button: {
    backgroundColor: colors.primary,
    padding: 14,
    paddingHorizontal: spacing.xl,
    borderRadius: 8,
  },
  buttonText: { color: "#fff", fontWeight: "600" },
  secondaryButton: { marginTop: spacing.md },
  secondaryButtonText: { color: colors.primary, fontWeight: "600" },
  requestId: { fontSize: 14, color: colors.textMuted, marginBottom: spacing.md },
  requestIdValue: { fontFamily: "monospace", color: colors.text },
  pendingText: { fontSize: 14, color: colors.textMuted, marginBottom: spacing.md, textAlign: "center" },
});
