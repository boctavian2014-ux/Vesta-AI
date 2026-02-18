import React, { useState } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Alert,
  Linking,
} from "react-native";
import { getStatusRaport } from "../api";

export default function StatusScreen() {
  const [requestId, setRequestId] = useState("");
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState(null);

  const onCheck = async () => {
    const id = requestId.trim();
    if (!id) {
      Alert.alert("Introdu request_id", "ID-ul îl primești la comandarea raportului.");
      return;
    }
    setLoading(true);
    setData(null);
    try {
      const res = await getStatusRaport(id);
      setData(res);
    } catch (err) {
      Alert.alert("Eroare", err.message || "Raport negăsit.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={styles.container}>
      <Text style={styles.label}>Request ID (ex. req_abc123...)</Text>
      <TextInput
        style={styles.input}
        value={requestId}
        onChangeText={setRequestId}
        placeholder="req_..."
        autoCapitalize="none"
      />
      <TouchableOpacity style={styles.button} onPress={onCheck} disabled={loading}>
        {loading ? <ActivityIndicator color="#fff" /> : <Text style={styles.buttonText}>Verifică status</Text>}
      </TouchableOpacity>
      {data && (
        <View style={styles.result}>
          <Text style={styles.resultTitle}>Status: {data.status}</Text>
          {data.extracted_owner && <Text>Proprietar: {data.extracted_owner}</Text>}
          {data.pdf_url && (
            <TouchableOpacity onPress={() => Linking.openURL(data.pdf_url)} style={styles.link}>
              <Text style={styles.linkText}>Deschide PDF</Text>
            </TouchableOpacity>
          )}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 24 },
  label: { fontSize: 14, marginBottom: 8 },
  input: {
    borderWidth: 1,
    borderColor: "#e2e8f0",
    borderRadius: 8,
    padding: 12,
    marginBottom: 16,
    fontSize: 16,
  },
  button: { backgroundColor: "#6772e5", padding: 16, borderRadius: 8, alignItems: "center" },
  buttonText: { color: "#fff", fontWeight: "600" },
  result: { marginTop: 24, padding: 16, backgroundColor: "#f1f5f9", borderRadius: 8 },
  resultTitle: { fontWeight: "600", marginBottom: 8 },
  link: { marginTop: 8 },
  linkText: { color: "#6772e5", fontWeight: "600" },
});
