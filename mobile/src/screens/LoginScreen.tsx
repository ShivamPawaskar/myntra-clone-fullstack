import React, { useState } from "react";
import { View, Text, TextInput, TouchableOpacity, StyleSheet } from "react-native";
import { useTheme } from "../context/ThemeContext";
import { api, setToken } from "../lib/api";
import { getLocalHistory, clearLocalHistory } from "../lib/recentlyViewed";
import { registerForPushNotifications } from "../lib/notifications";

export function LoginScreen({ navigation }: any) {
  const { theme } = useTheme();
  const [mode, setMode] = useState<"login" | "register">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit() {
    setBusy(true);
    setError(null);
    try {
      const path = mode === "login" ? "/auth/login" : "/auth/register";
      const body = mode === "login" ? { email, password } : { email, password, name };
      const res = await api<{ access_token: string }>(path, { method: "POST", body, auth: false });
      await setToken(res.access_token);

      // FEATURE 1: merge anonymous browsing into the account on login.
      const local = await getLocalHistory();
      if (local.length > 0) {
        await api("/recently-viewed/merge", { method: "POST", body: { local_history: local } });
        await clearLocalHistory();
      }

      // FEATURE 3: now that we're authenticated, register this device's
      // push token so the backend can deliver notifications to it.
      registerForPushNotifications().catch(() => {});

      navigation.navigate("Home");
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <View style={{ flex: 1, backgroundColor: theme.colors.bgApp, padding: 24, justifyContent: "center" }}>
      <Text style={{ fontSize: 24, fontWeight: "700", color: theme.colors.textPrimary, marginBottom: 20 }}>
        {mode === "login" ? "Welcome back" : "Create your account"}
      </Text>

      {mode === "register" && (
        <Input theme={theme} placeholder="Name" value={name} onChangeText={setName} />
      )}
      <Input theme={theme} placeholder="Email" value={email} onChangeText={setEmail} keyboardType="email-address" autoCapitalize="none" />
      <Input theme={theme} placeholder="Password" value={password} onChangeText={setPassword} secureTextEntry />

      {error && <Text style={{ color: theme.colors.danger, marginBottom: 12 }}>{error}</Text>}

      <TouchableOpacity
        onPress={submit}
        disabled={busy}
        style={{ backgroundColor: theme.colors.accentDefault, borderRadius: 10, paddingVertical: 14, alignItems: "center" }}
      >
        <Text style={{ color: theme.colors.textOnAccent, fontWeight: "700" }}>
          {busy ? "Please wait…" : mode === "login" ? "Log in" : "Sign up"}
        </Text>
      </TouchableOpacity>

      <TouchableOpacity onPress={() => setMode(mode === "login" ? "register" : "login")} style={{ marginTop: 16 }}>
        <Text style={{ color: theme.colors.textMuted, textAlign: "center" }}>
          {mode === "login" ? "New here? " : "Have an account? "}
          <Text style={{ color: theme.colors.accentDefault, fontWeight: "600" }}>
            {mode === "login" ? "Create one" : "Log in"}
          </Text>
        </Text>
      </TouchableOpacity>
    </View>
  );
}

function Input({ theme, ...props }: any) {
  return (
    <TextInput
      {...props}
      placeholderTextColor={theme.colors.textMuted}
      style={[styles.input, { backgroundColor: theme.colors.bgSurface, borderColor: theme.colors.borderStrong, color: theme.colors.textPrimary }]}
    />
  );
}

const styles = StyleSheet.create({
  input: { borderWidth: 1, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 12, fontSize: 15, marginBottom: 12 },
});
