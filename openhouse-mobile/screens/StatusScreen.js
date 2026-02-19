import React, { useState, useEffect } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Alert,
  Linking,
  ScrollView,
  Modal,
  Share,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { getStatusRaport, getCartaOferta } from "../api";
import { colors, spacing } from "../theme";

export default function StatusScreen({ route }) {
  const initialRequestId = route.params?.requestId ?? "";
  const [requestId, setRequestId] = useState(initialRequestId);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [data, setData] = useState(null);
  const [cartaOferta, setCartaOferta] = useState(null);
  const [cartaLoading, setCartaLoading] = useState(false);

  const onCheck = async () => {
    const id = requestId.trim();
    if (!id) {
      Alert.alert("Introdu request_id", "ID-ul îl primești la comandarea raportului.");
      return;
    }
    setError(null);
    setData(null);
    setLoading(true);
    try {
      const res = await getStatusRaport(id);
      setData(res);
    } catch (err) {
      setError(err.message || "Raport negăsit.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const id = initialRequestId.trim();
    if (!id) return;
    let cancelled = false;
    setError(null);
    setData(null);
    setLoading(true);
    getStatusRaport(id)
      .then((res) => { if (!cancelled) setData(res); })
      .catch((err) => { if (!cancelled) setError(err.message || "Raport negăsit."); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [initialRequestId]);

  const openCartaOferta = async () => {
    if (!data?.report_id) return;
    setCartaLoading(true);
    setCartaOferta(null);
    try {
      const res = await getCartaOferta(data.report_id);
      setCartaOferta(res);
    } catch (err) {
      Alert.alert("Eroare", err.message || "Nu s-a putut încărca carta de ofertă.");
    } finally {
      setCartaLoading(false);
    }
  };

  const shareCarta = () => {
    if (!cartaOferta?.texto_completo) return;
    Share.share({
      message: cartaOferta.texto_completo,
      title: "Carta de ofertă",
    }).catch(() => {});
  };

  return (
    <SafeAreaView style={styles.container} edges={["bottom"]}>
      <ScrollView style={styles.scroll} contentContainerStyle={styles.content}>
        <Text style={styles.label}>Request ID (ex. req_abc123...)</Text>
        <TextInput
          style={styles.input}
          value={requestId}
          onChangeText={(t) => { setRequestId(t); setError(null); }}
          placeholder="req_..."
          autoCapitalize="none"
        />
        {error && (
          <View style={styles.errorBox}>
            <Text style={styles.errorText}>{error}</Text>
            <TouchableOpacity onPress={onCheck} disabled={loading}>
              <Text style={styles.retryText}>Reîncearcă</Text>
            </TouchableOpacity>
          </View>
        )}
        <TouchableOpacity style={styles.button} onPress={onCheck} disabled={loading}>
          {loading ? <ActivityIndicator color="#fff" /> : <Text style={styles.buttonText}>Verifică status</Text>}
        </TouchableOpacity>
        {data && (
          <View style={styles.result}>
            <Text style={styles.resultTitle}>Status: {data.status}</Text>
            {data.extracted_owner && <Text style={styles.resultText}>Proprietar: {data.extracted_owner}</Text>}
            {data.pdf_url && (
              <TouchableOpacity onPress={() => Linking.openURL(data.pdf_url)} style={styles.link}>
                <Text style={styles.linkText}>Deschide PDF</Text>
              </TouchableOpacity>
            )}
            {data.status === "completed" && data.report_id && (
              <TouchableOpacity onPress={openCartaOferta} style={styles.link} disabled={cartaLoading}>
                {cartaLoading ? (
                  <ActivityIndicator size="small" color={colors.primary} />
                ) : (
                  <Text style={styles.linkText}>Carta de ofertă</Text>
                )}
              </TouchableOpacity>
            )}
          </View>
        )}
      </ScrollView>

      <Modal visible={!!cartaOferta} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <ScrollView style={styles.modalScroll}>
              <Text style={styles.modalText}>{cartaOferta?.texto_completo}</Text>
            </ScrollView>
            <View style={styles.modalActions}>
              <TouchableOpacity style={styles.modalButton} onPress={shareCarta}>
                <Text style={styles.modalButtonText}>Partajează</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.modalButtonSecondary} onPress={() => setCartaOferta(null)}>
                <Text style={styles.modalButtonSecondaryText}>Închide</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  scroll: { flex: 1 },
  content: { padding: spacing.xl },
  label: { fontSize: 14, marginBottom: spacing.sm, color: colors.text },
  input: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 8,
    padding: spacing.md,
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
  button: { backgroundColor: colors.primary, padding: spacing.lg, borderRadius: 8, alignItems: "center" },
  buttonText: { color: "#fff", fontWeight: "600" },
  result: { marginTop: spacing.xl, padding: spacing.lg, backgroundColor: colors.backgroundMuted, borderRadius: 8 },
  resultTitle: { fontWeight: "600", marginBottom: spacing.sm, color: colors.text },
  resultText: { color: colors.text, marginBottom: spacing.sm },
  link: { marginTop: spacing.sm },
  linkText: { color: colors.primary, fontWeight: "600" },
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.5)",
    justifyContent: "center",
    padding: spacing.xl,
  },
  modalContent: {
    backgroundColor: colors.background,
    borderRadius: 8,
    maxHeight: "80%",
  },
  modalScroll: { maxHeight: 400, padding: spacing.lg },
  modalText: { fontSize: 14, color: colors.text },
  modalActions: { flexDirection: "row", padding: spacing.lg, gap: spacing.md },
  modalButton: {
    flex: 1,
    backgroundColor: colors.primary,
    padding: spacing.md,
    borderRadius: 8,
    alignItems: "center",
  },
  modalButtonText: { color: "#fff", fontWeight: "600" },
  modalButtonSecondary: {
    flex: 1,
    padding: spacing.md,
    borderRadius: 8,
    alignItems: "center",
    borderWidth: 1,
    borderColor: colors.border,
  },
  modalButtonSecondaryText: { color: colors.text },
});
