"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { api, isLoggedIn } from "@/lib/api";
import { ProductGrid } from "@/components/ProductGrid";
import type { Product } from "@/components/ProductCard";

export default function WishlistPage() {
  const [items, setItems] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [needsAuth, setNeedsAuth] = useState(false);

  const load = useCallback(async () => {
    if (!isLoggedIn()) {
      setNeedsAuth(true);
      setLoading(false);
      return;
    }
    try {
      // Wishlist API returns product IDs; fetch the full catalog once and
      // filter — avoids an N+1 of one request per wishlisted product.
      const [ids, all] = await Promise.all([
        api<number[]>("/wishlist"),
        api<Product[]>("/products", { auth: false }),
      ]);
      const idSet = new Set(ids);
      setItems(all.filter((p) => idSet.has(p.id)));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
    window.addEventListener("wishlist-changed", load);
    return () => window.removeEventListener("wishlist-changed", load);
  }, [load]);

  if (needsAuth) {
    return (
      <div style={{ maxWidth: 1440, margin: "0 auto", padding: 24 }}>
        <EmptyState
          icon="♡"
          title="Please log in to view your wishlist"
          sub="Save your favourite items and never lose track of them."
          cta={{ href: "/login", label: "LOGIN / SIGNUP" }}
        />
      </div>
    );
  }

  return (
    <div style={{ maxWidth: 1440, margin: "0 auto", padding: 24, animation: "fadeIn 0.3s ease" }}>
      <h1 style={{ fontSize: 22, fontWeight: 700, color: "var(--color-text-primary)", marginBottom: 4 }}>
        My Wishlist{" "}
        {!loading && (
          <span style={{ fontWeight: 400, fontSize: 15, color: "var(--color-text-muted)" }}>
            ({items.length} item{items.length !== 1 ? "s" : ""})
          </span>
        )}
      </h1>
      <p style={{ color: "var(--color-text-muted)", marginBottom: 24, fontSize: 14 }}>
        Tap the heart on any item to add or remove it here.
      </p>

      {loading ? (
        <p style={{ color: "var(--color-text-muted)" }}>Loading your saved items…</p>
      ) : items.length === 0 ? (
        <EmptyState
          icon="🤍"
          title="Your wishlist is empty"
          sub="Browse products and tap the heart to save them for later."
          cta={{ href: "/", label: "START SHOPPING" }}
        />
      ) : (
        <ProductGrid products={items} allWishlisted />
      )}
    </div>
  );
}

function EmptyState({
  icon, title, sub, cta,
}: {
  icon: string; title: string; sub: string; cta: { href: string; label: string };
}) {
  return (
    <div style={{ textAlign: "center", padding: "60px 20px", color: "var(--color-text-muted)" }}>
      <div style={{ fontSize: 56, marginBottom: 16 }}>{icon}</div>
      <p style={{ fontSize: 18, fontWeight: 700, color: "var(--color-text-primary)", marginBottom: 8 }}>{title}</p>
      <p style={{ marginBottom: 24 }}>{sub}</p>
      <Link
        href={cta.href}
        style={{
          display: "inline-block",
          padding: "12px 32px",
          background: "var(--color-accent-default)",
          color: "#fff",
          borderRadius: "var(--radius-sm)",
          fontWeight: 700,
          fontSize: 14,
          letterSpacing: 0.5,
        }}
      >
        {cta.label}
      </Link>
    </div>
  );
}
