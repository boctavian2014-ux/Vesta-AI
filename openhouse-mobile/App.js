import React from "react";
import { TouchableOpacity, Text } from "react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { NavigationContainer } from "@react-navigation/native";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import MapScreen from "./screens/MapScreen";
import PropertyScreen from "./screens/PropertyScreen";
import SuccessScreen from "./screens/SuccessScreen";
import StatusScreen from "./screens/StatusScreen";
import { colors } from "./theme";

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
  return (
    <SafeAreaProvider>
      <NavigationContainer linking={linking}>
        <Stack.Navigator screenOptions={{ headerTitle: "Vesta" }}>
        <Stack.Screen
          name="Map"
          component={MapScreen}
          options={({ navigation }) => ({
            headerRight: () => (
              <TouchableOpacity
                onPress={() => navigation.navigate("Status")}
                style={{ marginRight: 16 }}
              >
                <Text style={{ color: colors.primary, fontWeight: "600", fontSize: 15 }}>Status raport</Text>
              </TouchableOpacity>
            ),
          })}
        />
        <Stack.Screen name="Property" component={PropertyScreen} />
        <Stack.Screen name="Success" component={SuccessScreen} options={{ headerTitle: "Plată reușită" }} />
        <Stack.Screen name="Status" component={StatusScreen} options={{ headerTitle: "Status raport" }} />
        </Stack.Navigator>
      </NavigationContainer>
    </SafeAreaProvider>
  );
}
