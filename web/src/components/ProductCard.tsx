"use client";

import Link from "next/link";
import { useState } from "react";
import { api, isLoggedIn } from "@/lib/api";

export type Product = {
  id: number;
  name: string;
  brand: string;
  price: number;
  image_url?: string;
  stock?: number;
  discount?: number;
  description?: string;
};

export function ProductCard({ product, initialWishlisted = false }: { product: Product; initialWishlisted?: boolean }) {
  const outOfStock = product.stock !== undefined && product.stock <= 0;
  const [wishlisted, setWishlisted] = useState(initialWishlisted);
  const [hovered, setHovered] = useState(false);

  const mrp = Math.round(product.price * 1.6);
  const discount = product.discount ?? Math.round(((mrp - product.price) / mrp) * 100);

  async function toggleWishlist(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    if (!isLoggedIn()) {
      window.location.href = "/login";
      return;
    }
    const next = !wishlisted;
    setWishlisted(next); // optimistic
    try {
      if (next) {
        await api("/wishlist", { method: "POST", body: { product_id: product.id } });
      } else {
        await api(`/wishlist/${product.id}`, { method: "DELETE" });
      }
      // Keep the wishlist page in sync if it's open.
      window.dispatchEvent(new Event("wishlist-changed"));
    } catch {
      setWishlisted(!next); // revert on failure
    }
  }

  return (
    <Link href={`/product/${product.id}`} style={{ textDecoration: "none", display: "block" }}>
      <article
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
        style={{
          background: "var(--color-bg-surface)",
          borderRadius: "var(--radius-md)",
          overflow: "hidden",
          transition: "box-shadow 0.35s var(--ease-premium), transform 0.35s var(--ease-premium)",
          transform: hovered ? "translateY(-6px)" : "translateY(0)",
          boxShadow: hovered ? "var(--shadow-lg)" : "var(--shadow-sm)",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          cursor: "pointer",
        }}
      >
        {/* Image */}
        <div style={{ position: "relative", aspectRatio: "3 / 4", overflow: "hidden", background: "var(--color-bg-muted)" }}>
          {product.image_url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={product.image_url}
              alt={product.name}
              style={{
                width: "100%",
                height: "100%",
                objectFit: "cover",
                transition: "transform 0.3s ease",
                transform: hovered ? "scale(1.05)" : "scale(1)",
              }}
            />
          ) : (
            <div style={{ width: "100%", height: "100%", background: "var(--color-bg-muted)", display: "flex", alignItems: "center", justifyContent: "center" }}>
              <span style={{ fontSize: 40 }}>👕</span>
            </div>
          )}

          {/* Out of stock overlay */}
          {outOfStock && (
            <div style={{
              position: "absolute",
              inset: 0,
              background: "rgba(255,255,255,0.7)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}>
              <span style={{ fontWeight: 700, fontSize: 13, color: "#282c3f", letterSpacing: 0.5 }}>OUT OF STOCK</span>
            </div>
          )}

          {/* Discount badge */}
          {discount >= 10 && !outOfStock && (
            <span style={{
              position: "absolute",
              top: 8,
              left: 0,
              background: "var(--color-accent-default)",
              color: "#fff",
              fontSize: 11,
              fontWeight: 700,
              padding: "3px 8px",
              borderRadius: "0 var(--radius-sm) var(--radius-sm) 0",
            }}>
              {discount}% OFF
            </span>
          )}

          {/* Wishlist */}
          <button
            onClick={toggleWishlist}
            aria-label="Add to wishlist"
            style={{
              position: "absolute",
              top: 8,
              right: 8,
              background: "rgba(255,255,255,0.9)",
              border: "none",
              borderRadius: "50%",
              width: 32,
              height: 32,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              cursor: "pointer",
              boxShadow: "0 1px 4px rgba(0,0,0,0.15)",
              opacity: hovered || wishlisted ? 1 : 0,
              transition: "opacity 0.2s ease",
            }}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill={wishlisted ? "#ff3f6c" : "none"} stroke="#ff3f6c" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
            </svg>
          </button>
        </div>

        {/* Info */}
        <div style={{ padding: "10px 12px 12px", flex: 1 }}>
          <div style={{ fontWeight: 700, fontSize: 14, color: "var(--color-text-primary)", marginBottom: 2 }}>
            {product.brand}
          </div>
          <div style={{
            fontSize: 13,
            color: "var(--color-text-muted)",
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
            marginBottom: 6,
          }}>
            {product.name}
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
            <span style={{ fontWeight: 700, fontSize: 14, color: "var(--color-text-primary)" }}>
              ₹{Math.round(product.price).toLocaleString("en-IN")}
            </span>
            <span style={{ fontSize: 12, color: "var(--color-text-muted)", textDecoration: "line-through" }}>
              ₹{mrp.toLocaleString("en-IN")}
            </span>
            <span style={{ fontSize: 12, fontWeight: 700, color: "#ff905a" }}>
              ({discount}% OFF)
            </span>
          </div>
        </div>
      </article>
    </Link>
  );
}
