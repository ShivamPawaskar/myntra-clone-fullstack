import React, { useState, useCallback } from "react";
import { View, Text, FlatList, TouchableOpacity, Image, ActivityIndicator, StyleSheet } from "react-native";
import { useFocusEffect } from "@react-navigation/native";
import { useTheme } from "../context/ThemeContext";
import { api, getToken } from "../lib/api";

type Product = { id: number; name: string; brand: string; price: number; image_url?: string };

export function RecommendationsScreen({ navigation }: any) {
  const { theme } = useTheme();
  const [items, setItems] = useState<Product[]>([]);
  const [needsAuth, setNeedsAuth] = useState(false);
  const [loading, setLoading] = useState(true);

  useFocusEffect(
    useCallback(() => {
      (async () => {
        setLoading(true);
        if (!(await getToken())) {
          setNeedsAuth(true);
          setLoading(false);
          return;
        }
        setNeedsAuth(false);
        try {
          const d = await api<{ items: Product[] }>("/recommendations");
          setItems(d.items);
        } catch {
          /* ignore */
        } finally {
          setLoading(false);
        }
      })();
    }, [])
  );

  if (loading)
    return <View style={[styles.center, { backgroundColor: theme.colors.bgApp }]}><ActivityIndicator color={theme.colors.accentDefault} /></View>;
  if (needsAuth)
    return <View style={[styles.center, { backgroundColor: theme.colors.bgApp }]}><Text style={{ color: theme.colors.textMuted }}>Log in to see picks for you.</Text></View>;

  return (
    <View style={{ flex: 1, backgroundColor: theme.colors.bgApp }}>
      <Text style={{ fontSize: 22, fontWeight: "700", color: theme.colors.textPrimary, padding: 16, paddingBottom: 4 }}>
        You may also like
      </Text>
      <FlatList
        data={items}
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
            <Image source={{ uri: item.image_url }} style={[styles.cardImage, { backgroundColor: theme.colors.bgMuted }]} />
            <View style={{ padding: 10 }}>
              <Text style={{ fontWeight: "700", fontSize: 14, color: theme.colors.textPrimary }}>{item.brand}</Text>
              <Text numberOfLines={1} style={{ fontSize: 12, color: theme.colors.textMuted, marginTop: 2 }}>{item.name}</Text>
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
  card: { flex: 1, borderRadius: 10, borderWidth: 1, overflow: "hidden" },
  cardImage: { width: "100%", aspectRatio: 3 / 4 },
});
