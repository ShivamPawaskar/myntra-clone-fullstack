"use client";

import { useEffect, useState } from "react";
import { api, getToken } from "@/lib/api";
import { ProductGrid } from "@/components/ProductGrid";
import type { Product } from "@/components/ProductCard";

export default function RecommendationsPage() {
  const [items, setItems] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [needsAuth, setNeedsAuth] = useState(false);

  useEffect(() => {
    if (!getToken()) {
      setNeedsAuth(true);
      setLoading(false);
      return;
    }
    api<{ items: Product[] }>("/recommendations")
      .then((d) => setItems(d.items))
      .finally(() => setLoading(false));
  }, []);

  if (needsAuth)
    return <p style={{ color: "var(--color-text-muted)" }}>Log in to see picks chosen for you.</p>;

  return (
    <div>
      <h1 style={{ fontSize: 28, marginBottom: 4, color: "var(--color-text-primary)" }}>
        You may also like
      </h1>
      <p style={{ color: "var(--color-text-muted)", marginBottom: "var(--space-xl)" }}>
        Based on what you&apos;ve browsed, wishlisted, and what shoppers like you love.
      </p>
      {loading ? (
        <p style={{ color: "var(--color-text-muted)" }}>Loading…</p>
      ) : (
        <ProductGrid products={items} />
      )}
    </div>
  );
}
