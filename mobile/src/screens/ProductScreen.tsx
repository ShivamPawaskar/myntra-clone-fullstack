import React, { useEffect, useState } from "react";
import { View, Text, Image, TouchableOpacity, ScrollView, ActivityIndicator, StyleSheet } from "react-native";
import { useTheme } from "../context/ThemeContext";
import { api, getToken } from "../lib/api";
import { trackLocalView } from "../lib/recentlyViewed";

type Product = { id: number; name: string; brand: string; price: number; image_url?: string; stock?: number };

export function ProductScreen({ route }: any) {
  const { id } = route.params;
  const { theme } = useTheme();
  const [product, setProduct] = useState<Product | null>(null);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    // FEATURE 1: track locally first (instant, offline-safe), server records
    // on the authenticated GET below.
    trackLocalView(id);
    (async () => {
      try {
        const hasToken = !!(await getToken());
        const p = await api<Product>(`/products/${id}`, { auth: hasToken });
        setProduct(p);
      } catch (e: any) {
        setMessage(e.message);
      } finally {
        setLoading(false);
      }
    })();
  }, [id]);

  async function addToCart() {
    if (!(await getToken())) {
      setMessage("Please log in to add items to your cart.");
      return;
    }
    try {
      await api("/cart/items", { method: "POST", body: { product_id: id, quantity: 1 } });
      setMessage("Added to cart.");
    } catch (e: any) {
      setMessage(e.message);
    }
  }

  async function addToWishlist() {
    if (!(await getToken())) {
      setMessage("Please log in to use your wishlist.");
      return;
    }
    try {
      await api("/wishlist", { method: "POST", body: { product_id: id } });
      setMessage("Added to wishlist.");
    } catch (e: any) {
      setMessage(e.message);
    }
  }

  if (loading) {
    return (
      <View style={[styles.center, { backgroundColor: theme.colors.bgApp }]}>
        <ActivityIndicator color={theme.colors.accentDefault} />
      </View>
    );
  }
  if (!product) {
    return (
      <View style={[styles.center, { backgroundColor: theme.colors.bgApp }]}>
        <Text style={{ color: theme.colors.textMuted }}>{message || "Not found."}</Text>
      </View>
    );
  }

  const outOfStock = product.stock !== undefined && product.stock <= 0;

  return (
    <ScrollView style={{ flex: 1, backgroundColor: theme.colors.bgApp }}>
      <Image source={{ uri: product.image_url }} style={[styles.hero, { backgroundColor: theme.colors.bgMuted }]} />
      <View style={{ padding: 16 }}>
        <Text style={{ fontSize: 22, fontWeight: "700", color: theme.colors.textPrimary }}>{product.brand}</Text>
        <Text style={{ fontSize: 15, color: theme.colors.textSecondary, marginTop: 4 }}>{product.name}</Text>
        <Text style={{ fontSize: 22, fontWeight: "700", marginTop: 14, color: theme.colors.textPrimary }}>
          ₹{Number(product.price).toLocaleString("en-IN")}
        </Text>
        <Text style={{ marginTop: 6, fontWeight: "600", color: outOfStock ? theme.colors.danger : theme.colors.success }}>
          {outOfStock ? "Out of stock" : "In stock"}
        </Text>

        <View style={{ flexDirection: "row", gap: 12, marginTop: 22 }}>
          <TouchableOpacity
            onPress={addToCart}
            disabled={outOfStock}
            style={{
              flex: 1,
              backgroundColor: outOfStock ? theme.colors.borderStrong : theme.colors.accentDefault,
              borderRadius: 10,
              paddingVertical: 14,
              alignItems: "center",
            }}
          >
            <Text style={{ color: theme.colors.textOnAccent, fontWeight: "700" }}>Add to cart</Text>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={addToWishlist}
            style={{
              flex: 1,
              backgroundColor: theme.colors.bgSurface,
              borderWidth: 1,
              borderColor: theme.colors.borderStrong,
              borderRadius: 10,
              paddingVertical: 14,
              alignItems: "center",
            }}
          >
            <Text style={{ color: theme.colors.textPrimary, fontWeight: "700" }}>♡ Wishlist</Text>
          </TouchableOpacity>
        </View>

        {message && <Text style={{ marginTop: 16, color: theme.colors.textSecondary }}>{message}</Text>}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  hero: { width: "100%", aspectRatio: 3 / 4 },
});
