import React, { useEffect, useState } from "react";
import { View, Text, FlatList, TouchableOpacity, Image, ActivityIndicator, StyleSheet } from "react-native";
import { useTheme } from "../context/ThemeContext";
import { api } from "../lib/api";

type Product = { id: number; name: string; brand: string; price: number; image_url?: string; stock?: number };

export function HomeScreen({ navigation }: any) {
  const { theme, toggleTheme, themeName } = useTheme();
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api<Product[]>("/products", { auth: false })
      .then(setProducts)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <View style={[styles.center, { backgroundColor: theme.colors.bgApp }]}>
        <ActivityIndicator color={theme.colors.accentDefault} />
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: theme.colors.bgApp }}>
      <View style={styles.headerRow}>
        <Text style={{ fontSize: 22, fontWeight: "700", color: theme.colors.accentDefault }}>
          Myntra<Text style={{ color: theme.colors.textPrimary }}>Clone</Text>
        </Text>
        <TouchableOpacity
          onPress={toggleTheme}
          style={{
            backgroundColor: theme.colors.bgMuted,
            borderRadius: 999,
            paddingHorizontal: 14,
            paddingVertical: 8,
            borderWidth: 1,
            borderColor: theme.colors.borderDefault,
          }}
        >
          <Text style={{ color: theme.colors.textPrimary, fontWeight: "500" }}>
            {themeName === "light" ? "🌙 Dark" : "☀️ Light"}
          </Text>
        </TouchableOpacity>
      </View>

      <FlatList
        data={products}
        keyExtractor={(p) => String(p.id)}
        numColumns={2}
        contentContainerStyle={{ padding: 8 }}
        columnWrapperStyle={{ gap: 8 }}
        ItemSeparatorComponent={() => <View style={{ height: 8 }} />}
        renderItem={({ item }) => (
          <TouchableOpacity
            style={[styles.card, { backgroundColor: theme.colors.bgSurface, borderColor: theme.colors.borderDefault }]}
            onPress={() => navigation.navigate("Product", { id: item.id })}
          >
            <Image
              source={{ uri: item.image_url }}
              style={[styles.cardImage, { backgroundColor: theme.colors.bgMuted }]}
            />
            <View style={{ padding: 10 }}>
              <Text style={{ fontWeight: "700", fontSize: 14, color: theme.colors.textPrimary }}>{item.brand}</Text>
              <Text numberOfLines={1} style={{ fontSize: 12, color: theme.colors.textMuted, marginTop: 2 }}>
                {item.name}
              </Text>
              <Text style={{ marginTop: 6, fontWeight: "700", color: theme.colors.textPrimary }}>
                ₹{Number(item.price).toLocaleString("en-IN")}
              </Text>
            </View>
          </TouchableOpacity>
        )}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  card: { flex: 1, borderRadius: 10, borderWidth: 1, overflow: "hidden" },
  cardImage: { width: "100%", aspectRatio: 3 / 4 },
});
