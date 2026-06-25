import React, { useState, useCallback } from "react";
import { View, Text, TouchableOpacity, ScrollView, ActivityIndicator, StyleSheet } from "react-native";
import { useFocusEffect } from "@react-navigation/native";
import { useTheme } from "../context/ThemeContext";
import { api, getToken } from "../lib/api";

type CartItem = { id: number; product_id: number; quantity: number; status: string; price_snapshot: number; version: number };
type CartView = { active: CartItem[]; saved_for_later: CartItem[]; total: number };

export function CartScreen() {
  const { theme } = useTheme();
  const [cart, setCart] = useState<CartView | null>(null);
  const [needsAuth, setNeedsAuth] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!(await getToken())) {
      setNeedsAuth(true);
      setLoading(false);
      return;
    }
    try {
      setCart(await api<CartView>("/cart"));
      setError(null);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  // FEATURE 5: send version on every mutation; on 409 reload + warn.
  async function withConflict(fn: () => Promise<unknown>) {
    try {
      await fn();
      await load();
    } catch (e: any) {
      if (e.status === 409) {
        setError("This item changed in another session. Cart refreshed — please retry.");
        await load();
      } else {
        setError(e.message);
      }
    }
  }

  const updateQty = (it: CartItem, q: number) =>
    withConflict(() => api(`/cart/items/${it.id}`, { method: "PATCH", body: { quantity: q, version: it.version } }));
  const saveForLater = (it: CartItem) =>
    withConflict(() => api(`/cart/items/${it.id}/save-for-later`, { method: "POST", body: { version: it.version } }));
  const moveToCart = (it: CartItem) =>
    withConflict(() => api(`/cart/items/${it.id}/move-to-cart`, { method: "POST", body: { version: it.version } }));
  const removeItem = (it: CartItem) =>
    withConflict(() => api(`/cart/items/${it.id}`, { method: "DELETE" }));

  if (loading) return <Center theme={theme}><ActivityIndicator color={theme.colors.accentDefault} /></Center>;
  if (needsAuth) return <Center theme={theme}><Text style={{ color: theme.colors.textMuted }}>Please log in to view your cart.</Text></Center>;
  if (!cart) return <Center theme={theme}><Text style={{ color: theme.colors.textMuted }}>{error}</Text></Center>;

  return (
    <ScrollView style={{ flex: 1, backgroundColor: theme.colors.bgApp }} contentContainerStyle={{ padding: 16 }}>
      <Text style={{ fontSize: 22, fontWeight: "700", color: theme.colors.textPrimary, marginBottom: 16 }}>Your cart</Text>

      {error && (
        <View style={[styles.banner, { borderColor: theme.colors.warning, backgroundColor: theme.colors.bgSurface }]}>
          <Text style={{ color: theme.colors.textPrimary, fontSize: 13 }}>{error}</Text>
        </View>
      )}

      {cart.active.length === 0 ? (
        <Text style={{ color: theme.colors.textMuted }}>Your cart is empty.</Text>
      ) : (
        <>
          {cart.active.map((item) => (
            <Row key={item.id} item={item} theme={theme}>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
                <QtyBtn theme={theme} label="−" onPress={() => item.quantity > 1 && updateQty(item, item.quantity - 1)} />
                <Text style={{ color: theme.colors.textPrimary, minWidth: 18, textAlign: "center" }}>{item.quantity}</Text>
                <QtyBtn theme={theme} label="+" onPress={() => updateQty(item, item.quantity + 1)} />
              </View>
              <View style={{ flexDirection: "row", gap: 14, marginTop: 8 }}>
                <LinkBtn theme={theme} label="Save for later" onPress={() => saveForLater(item)} />
                <LinkBtn theme={theme} label="Remove" danger onPress={() => removeItem(item)} />
              </View>
            </Row>
          ))}

          <View style={[styles.totalRow, { backgroundColor: theme.colors.bgSurface, borderColor: theme.colors.borderDefault }]}>
            <Text style={{ fontSize: 18, fontWeight: "700", color: theme.colors.textPrimary }}>
              Total: ₹{cart.total.toLocaleString("en-IN")}
            </Text>
          </View>
        </>
      )}

      {cart.saved_for_later.length > 0 && (
        <View style={{ marginTop: 28 }}>
          <Text style={{ fontSize: 18, fontWeight: "700", color: theme.colors.textPrimary, marginBottom: 12 }}>
            Saved for later ({cart.saved_for_later.length})
          </Text>
          {cart.saved_for_later.map((item) => (
            <Row key={item.id} item={item} theme={theme}>
              <View style={{ flexDirection: "row", gap: 14 }}>
                <LinkBtn theme={theme} label="Move to cart" onPress={() => moveToCart(item)} />
                <LinkBtn theme={theme} label="Remove" danger onPress={() => removeItem(item)} />
              </View>
            </Row>
          ))}
        </View>
      )}
    </ScrollView>
  );
}

function Center({ children, theme }: any) {
  return <View style={[styles.center, { backgroundColor: theme.colors.bgApp }]}>{children}</View>;
}
function Row({ item, theme, children }: any) {
  return (
    <View style={[styles.row, { backgroundColor: theme.colors.bgSurface, borderColor: theme.colors.borderDefault }]}>
      <View style={[styles.thumb, { backgroundColor: theme.colors.bgMuted }]} />
      <View style={{ flex: 1 }}>
        <Text style={{ fontWeight: "600", color: theme.colors.textPrimary }}>Product #{item.product_id}</Text>
        <Text style={{ color: theme.colors.textMuted, fontSize: 13, marginBottom: 6 }}>
          ₹{Number(item.price_snapshot).toLocaleString("en-IN")} · qty {item.quantity}
        </Text>
        {children}
      </View>
    </View>
  );
}
function QtyBtn({ label, onPress, theme }: any) {
  return (
    <TouchableOpacity onPress={onPress} style={[styles.qtyBtn, { borderColor: theme.colors.borderStrong, backgroundColor: theme.colors.bgSurface }]}>
      <Text style={{ color: theme.colors.textPrimary, fontSize: 16 }}>{label}</Text>
    </TouchableOpacity>
  );
}
function LinkBtn({ label, onPress, danger, theme }: any) {
  return (
    <TouchableOpacity onPress={onPress}>
      <Text style={{ color: danger ? theme.colors.danger : theme.colors.accentDefault, fontWeight: "600", fontSize: 13 }}>{label}</Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  banner: { padding: 12, borderRadius: 10, borderWidth: 1, marginBottom: 10 },
  row: { flexDirection: "row", gap: 12, padding: 12, borderRadius: 10, borderWidth: 1, marginBottom: 8 },
  thumb: { width: 48, height: 64, borderRadius: 6 },
  qtyBtn: { width: 30, height: 30, borderRadius: 6, borderWidth: 1, alignItems: "center", justifyContent: "center" },
  totalRow: { marginTop: 16, padding: 16, borderRadius: 10, borderWidth: 1 },
});
