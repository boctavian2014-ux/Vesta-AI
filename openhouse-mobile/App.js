import React from "react";
import { NavigationContainer } from "@react-navigation/native";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import MapScreen from "./screens/MapScreen";
import PropertyScreen from "./screens/PropertyScreen";
import SuccessScreen from "./screens/SuccessScreen";
import StatusScreen from "./screens/StatusScreen";

const Stack = createNativeStackNavigator();

export default function App() {
  return (
    <NavigationContainer>
      <Stack.Navigator screenOptions={{ headerTitle: "Vesta" }}>
        <Stack.Screen name="Map" component={MapScreen} />
        <Stack.Screen name="Property" component={PropertyScreen} />
        <Stack.Screen name="Success" component={SuccessScreen} options={{ headerTitle: "Plată reușită" }} />
        <Stack.Screen name="Status" component={StatusScreen} options={{ headerTitle: "Status raport" }} />
      </Stack.Navigator>
    </NavigationContainer>
  );
}
