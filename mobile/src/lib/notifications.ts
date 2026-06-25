/**
 * FEATURE 3 (mobile) — Push notification client.
 *
 * Covers the three app states the requirement calls out, which on the
 * client are handled in distinct ways:
 *
 *   FOREGROUND  — the OS does NOT show a tray notification while the app is
 *                 focused; instead our setNotificationHandler decides what
 *                 to do (here: show it as a heads-up banner anyway via
 *                 shouldShowAlert). addNotificationReceivedListener fires so
 *                 the app can also update in-app UI (e.g. badge a tab).
 *   BACKGROUND  — the OS shows the notification in the tray automatically;
 *                 when the user taps it, addNotificationResponseReceivedListener
 *                 fires with the payload so we can deep-link.
 *   TERMINATED  — the app isn't running; the OS shows the tray notification.
 *                 On next launch, getLastNotificationResponseAsync returns
 *                 the notification that opened the app so we can deep-link
 *                 even though no listener was alive when it arrived.
 *
 * registerForPushNotifications() obtains the Expo push token and sends it to
 * the backend (/notifications/register-device), which stores it for the
 * logged-in user. The backend worker then delivers to this token.
 */

import { useEffect, useRef } from "react";
import { Platform } from "react-native";
import * as Notifications from "expo-notifications";
import * as Device from "expo-device";
import Constants from "expo-constants";
import { api } from "./api";

// Foreground presentation policy: show banner + play sound even when the
// app is open, so foreground notifications aren't silently swallowed.
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
  }),
});

export async function registerForPushNotifications(): Promise<string | null> {
  // Push only works on physical devices, not simulators.
  if (!Device.isDevice) {
    return null;
  }

  const { status: existing } = await Notifications.getPermissionsAsync();
  let finalStatus = existing;
  if (existing !== "granted") {
    const { status } = await Notifications.requestPermissionsAsync();
    finalStatus = status;
  }
  if (finalStatus !== "granted") {
    return null;
  }

  // Android requires a notification channel to display heads-up banners.
  if (Platform.OS === "android") {
    await Notifications.setNotificationChannelAsync("default", {
      name: "Default",
      importance: Notifications.AndroidImportance.HIGH,
      vibrationPattern: [0, 250, 250, 250],
      lightColor: "#ff3f6c",
    });
  }

  const projectId = Constants.expoConfig?.extra?.eas?.projectId ?? Constants.easConfig?.projectId;
  const tokenData = await Notifications.getExpoPushTokenAsync(
    projectId ? { projectId } : undefined
  );
  const token = tokenData.data;

  // Send the token to our backend for this logged-in user. The backend
  // upserts by token (reinstall/refresh just updates ownership).
  try {
    await api("/notifications/register-device", {
      method: "POST",
      body: { token, platform: Platform.OS === "ios" ? "ios" : "android" },
    });
  } catch {
    // If registration fails (e.g. not logged in yet), we still return the
    // token so the caller can retry after auth.
  }

  return token;
}

/**
 * Hook wiring up the foreground + tap listeners and the cold-start
 * (terminated) deep-link check. Call once near the app root.
 */
export function useNotificationObservers(onDeepLink?: (data: Record<string, unknown>) => void) {
  const receivedSub = useRef<Notifications.Subscription>();
  const responseSub = useRef<Notifications.Subscription>();

  useEffect(() => {
    // FOREGROUND: notification arrives while app is open.
    receivedSub.current = Notifications.addNotificationReceivedListener(() => {
      // Hook point for in-app UI updates (badge a tab, refresh a list, etc).
    });

    // BACKGROUND tap: user taps a tray notification to open the app.
    responseSub.current = Notifications.addNotificationResponseReceivedListener((response) => {
      const data = response.notification.request.content.data;
      if (data && onDeepLink) onDeepLink(data);
    });

    // TERMINATED cold-start: app was launched by tapping a notification.
    Notifications.getLastNotificationResponseAsync().then((response) => {
      const data = response?.notification.request.content.data;
      if (data && onDeepLink) onDeepLink(data);
    });

    return () => {
      receivedSub.current?.remove();
      responseSub.current?.remove();
    };
  }, [onDeepLink]);
}
