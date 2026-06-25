import React, { useCallback } from "react";
import { NavigationContainer, useNavigationContainerRef } from "@react-navigation/native";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";
import { StatusBar } from "expo-status-bar";
import { ThemeProvider, useTheme } from "./src/context/ThemeContext";
import { useNotificationObservers } from "./src/lib/notifications";
import { HomeScreen } from "./src/screens/HomeScreen";
import { ProductScreen } from "./src/screens/ProductScreen";
import { CartScreen } from "./src/screens/CartScreen";
import { LoginScreen } from "./src/screens/LoginScreen";
import { RecommendationsScreen } from "./src/screens/RecommendationsScreen";

const Stack = createNativeStackNavigator();
const Tab = createBottomTabNavigator();

function Tabs() {
  const { theme } = useTheme();
  return (
    <Tab.Navigator
      screenOptions={{
        headerStyle: { backgroundColor: theme.colors.bgSurface },
        headerTintColor: theme.colors.textPrimary,
        tabBarStyle: { backgroundColor: theme.colors.bgSurface, borderTopColor: theme.colors.borderDefault },
        tabBarActiveTintColor: theme.colors.accentDefault,
        tabBarInactiveTintColor: theme.colors.textMuted,
      }}
    >
      <Tab.Screen name="Shop" component={HomeScreen} options={{ headerShown: false }} />
      <Tab.Screen name="For You" component={RecommendationsScreen} options={{ headerShown: false }} />
      <Tab.Screen name="Cart" component={CartScreen} />
      <Tab.Screen name="Account" component={LoginScreen} />
    </Tab.Navigator>
  );
}

function RootNavigator() {
  const { theme, themeName, ready } = useTheme();
  const navRef = useNavigationContainerRef();

  // FEATURE 3: deep-link when a notification is tapped (background/terminated).
  // e.g. a cart-abandonment push carries { deeplink: "/cart" }.
  const onDeepLink = useCallback(
    (data: Record<string, unknown>) => {
      if (data?.deeplink === "/cart" && navRef.isReady()) {
        navRef.navigate("Main" as never);
      }
    },
    [navRef]
  );
  useNotificationObservers(onDeepLink);

  if (!ready) return null; // wait until persisted theme is loaded (no flash)

  return (
    <NavigationContainer ref={navRef}>
      <StatusBar style={themeName === "dark" ? "light" : "dark"} />
      <Stack.Navigator>
        <Stack.Screen name="Main" component={Tabs} options={{ headerShown: false }} />
        <Stack.Screen
          name="Product"
          component={ProductScreen}
          options={{
            headerStyle: { backgroundColor: theme.colors.bgSurface },
            headerTintColor: theme.colors.textPrimary,
            title: "",
          }}
        />
      </Stack.Navigator>
    </NavigationContainer>
  );
}

export default function App() {
  return (
    <ThemeProvider>
      <RootNavigator />
    </ThemeProvider>
  );
}
