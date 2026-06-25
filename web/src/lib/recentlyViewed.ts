/**
 * FEATURE 1 (client half) — Hybrid Recently Viewed.
 *
 * The "hybrid" requirement means: keep a local copy for instant,
 * offline-capable rendering AND sync to the server for cross-device
 * continuity. This module owns the LOCAL half:
 *
 *   - trackLocalView(): records a view in localStorage immediately (works
 *     even when logged out / offline), deduping and capping at 20 to mirror
 *     the server's rules so the local list never diverges in shape.
 *   - getLocalHistory(): reads the local list (used to render instantly
 *     before the server response arrives, and to feed the merge-on-login).
 *   - The merge-on-login flow (sending local history up so anonymous
 *     browsing isn't lost) is triggered from the auth flow — see
 *     app/login: after a successful login it POSTs getLocalHistory() to
 *     /recently-viewed/merge, then clears the local anonymous list.
 */

const KEY = "myntra-clone-recently-viewed";
const MAX = 20;

export type LocalView = { product_id: number; viewed_at: string };

export function getLocalHistory(): LocalView[] {
  if (typeof window === "undefined") return [];
  try {
    return JSON.parse(localStorage.getItem(KEY) || "[]");
  } catch {
    return [];
  }
}

export function trackLocalView(productId: number) {
  if (typeof window === "undefined") return;
  const now = new Date().toISOString();
  let history = getLocalHistory();
  // dedup: drop any existing entry for this product, then unshift the fresh
  // one so it's newest-first — same dedup rule the server enforces.
  history = history.filter((h) => h.product_id !== productId);
  history.unshift({ product_id: productId, viewed_at: now });
  history = history.slice(0, MAX); // cap at 20, mirroring the server
  localStorage.setItem(KEY, JSON.stringify(history));
}

export function clearLocalHistory() {
  if (typeof window === "undefined") return;
  localStorage.removeItem(KEY);
}
