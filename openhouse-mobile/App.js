import "./i18n";
import React, { useState, useEffect } from "react";
import { View, TouchableOpacity, Text, StyleSheet, ActivityIndicator } from "react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { NavigationContainer } from "@react-navigation/native";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import StripeRoot from "./StripeRoot";
import { useTranslation } from "react-i18next";
import AsyncStorage from "@react-native-async-storage/async-storage";
import OnboardingScreen, { ONBOARDING_STORAGE_KEY } from "./screens/OnboardingScreen";
import MapScreenMapbox from "./screens/MapScreenMapbox";
import PropertyScreen from "./screens/PropertyScreen";
import SuccessScreen from "./screens/SuccessScreen";
import StatusScreen from "./screens/StatusScreen";
import ExpertDashboardScreen from "./screens/ExpertDashboardScreen";
import { colors } from "./theme";

const LANGUAGES = [
  { code: "en", label: "EN" },
  { code: "ro", label: "RO" },
  { code: "de", label: "DE" },
  { code: "es", label: "ES" },
];

function LanguageSwitcher() {
  const { i18n } = useTranslation();
  const current = i18n.language?.slice(0, 2) || "en";
  return (
    <View style={styles.langRow}>
      {LANGUAGES.map(({ code, label }) => (
        <TouchableOpacity
          key={code}
          onPress={() => i18n.changeLanguage(code)}
          style={[styles.langBtn, current === code && styles.langBtnActive]}
        >
          <Text style={[styles.langText, current === code && styles.langTextActive]}>{label}</Text>
        </TouchableOpacity>
      ))}
    </View>
  );
}

const publishableKey = process.env.EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY || "";
const Stack = createNativeStackNavigator();

const linking = {
  prefixes: ["vesta://", "https://vesta-mobile.example.com"],
  config: {
    screens: {
      Map: "",
      Success: "success",
      Status: "status",
    },
  },
};

export default function App() {
  const { t } = useTranslation();
  const [showOnboarding, setShowOnboarding] = useState(true);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    AsyncStorage.getItem(ONBOARDING_STORAGE_KEY)
      .then((value) => {
        setShowOnboarding(value !== "1");
        setReady(true);
      })
      .catch(() => setReady(true));
  }, []);

  const handleOnboardingFinish = () => {
    AsyncStorage.setItem(ONBOARDING_STORAGE_KEY, "1").catch(() => {});
    setShowOnboarding(false);
  };

  if (!ready) {
    return (
      <View style={{ flex: 1, justifyContent: "center", alignItems: "center", backgroundColor: colors.background ?? "#fff" }}>
        <ActivityIndicator size="large" color={colors.primary ?? "#1e3a8a"} />
      </View>
    );
  }

  if (showOnboarding) {
    return (
      <SafeAreaProvider>
        <OnboardingScreen onFinish={handleOnboardingFinish} />
      </SafeAreaProvider>
    );
  }

  const mainApp = (
    <SafeAreaProvider>
      <NavigationContainer linking={linking}>
        <Stack.Navigator
          screenOptions={{
            headerTitle: "",
            headerLeft: () => <LanguageSwitcher />,
          }}
        >
          <Stack.Screen
            name="Map"
            component={MapScreenMapbox}
            options={({ navigation }) => ({
              headerRight: () => (
                <TouchableOpacity
                  onPress={() => navigation.navigate("Status")}
                  style={{ marginRight: 16 }}
                >
                  <Text style={{ color: colors.primary, fontWeight: "600", fontSize: 15 }}>{t("status_report")}</Text>
                </TouchableOpacity>
              ),
            })}
          />
          <Stack.Screen name="Property" component={PropertyScreen} />
          <Stack.Screen name="Success" component={SuccessScreen} options={{ headerTitle: t("payment_success") }} />
          <Stack.Screen name="Status" component={StatusScreen} options={{ headerTitle: t("status_report") }} />
          <Stack.Screen name="Dashboard" component={ExpertDashboardScreen} options={{ headerTitle: "Vesta Expert Report", headerStyle: { backgroundColor: "#0f172a" }, headerTintColor: "#f1f5f9" }} />
        </Stack.Navigator>
      </NavigationContainer>
    </SafeAreaProvider>
  );

  return <StripeRoot publishableKey={publishableKey}>{mainApp}</StripeRoot>;
}

const styles = StyleSheet.create({
  langRow: {
    flexDirection: "row",
    alignItems: "center",
    marginLeft: 8,
    gap: 4,
  },
  langBtn: {
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 6,
  },
  langBtnActive: {
    backgroundColor: colors.primaryPremium ?? "#1e3a8a",
  },
  langText: {
    fontSize: 14,
    fontWeight: "600",
    color: colors.textMuted ?? "#64748b",
  },
  langTextActive: {
    color: "#fff",
  },
});
