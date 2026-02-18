import React from "react";
import { View, Text, TouchableOpacity, StyleSheet } from "react-native";

export default function SuccessScreen({ navigation }) {
  return (
    <View style={styles.container}>
      <Text style={styles.title}>Plată reușită</Text>
      <Text style={styles.text}>
        Raportul Nota Simple a fost comandat. Vei primi un email când este gata.
      </Text>
      <TouchableOpacity style={styles.button} onPress={() => navigation.navigate("Map")}>
        <Text style={styles.buttonText}>Înapoi la hartă</Text>
      </TouchableOpacity>
      <TouchableOpacity style={styles.secondaryButton} onPress={() => navigation.navigate("Status")}>
        <Text style={styles.secondaryButtonText}>Verifică status raport</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, justifyContent: "center", alignItems: "center", padding: 24 },
  title: { fontSize: 22, fontWeight: "700", marginBottom: 12 },
  text: { color: "#64748b", textAlign: "center", marginBottom: 24 },
  button: {
    backgroundColor: "#6772e5",
    padding: 14,
    paddingHorizontal: 24,
    borderRadius: 8,
  },
  buttonText: { color: "#fff", fontWeight: "600" },
  secondaryButton: { marginTop: 12 },
  secondaryButtonText: { color: "#6772e5", fontWeight: "600" },
});
