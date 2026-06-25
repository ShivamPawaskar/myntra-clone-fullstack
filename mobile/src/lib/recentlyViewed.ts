/**
 * FEATURE 1 (mobile, local half) — Hybrid Recently Viewed via AsyncStorage.
 *
 * Same rules as the web localStorage version (dedup, newest-first, cap 20)
 * so the local list shape matches the server's. On login the saved local
 * history is POSTed to /recently-viewed/merge then cleared, so anonymous
 * browsing isn't lost when the user signs in.
 */

import AsyncStorage from "@react-native-async-storage/async-storage";

const KEY = "myntra-clone-recently-viewed";
const MAX = 20;

export type LocalView = { product_id: number; viewed_at: string };

export async function getLocalHistory(): Promise<LocalView[]> {
  try {
    return JSON.parse((await AsyncStorage.getItem(KEY)) || "[]");
  } catch {
    return [];
  }
}

export async function trackLocalView(productId: number) {
  const now = new Date().toISOString();
  let history = await getLocalHistory();
  history = history.filter((h) => h.product_id !== productId);
  history.unshift({ product_id: productId, viewed_at: now });
  history = history.slice(0, MAX);
  await AsyncStorage.setItem(KEY, JSON.stringify(history));
}

export async function clearLocalHistory() {
  await AsyncStorage.removeItem(KEY);
}
