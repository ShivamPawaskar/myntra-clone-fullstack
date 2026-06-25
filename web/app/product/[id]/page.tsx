"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { api, getToken, isLoggedIn } from "@/lib/api";
import { trackLocalView } from "@/lib/recentlyViewed";
import { ProductGrid } from "@/components/ProductGrid";
import { Reviews } from "@/components/Reviews";
import type { Product } from "@/components/ProductCard";

const SIZES = ["XS", "S", "M", "L", "XL", "XXL"];

export default function ProductDetailPage() {
  const params = useParams();
  const router = useRouter();
  const productId = Number(params.id);
  const [product, setProduct] = useState<Product | null>(null);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState<{ text: string; type: "success" | "error" | "info" } | null>(null);
  const [selectedSize, setSelectedSize] = useState<string | null>(null);
  const [wishlisted, setWishlisted] = useState(false);
  const [addingCart, setAddingCart] = useState(false);
  const [imgError, setImgError] = useState(false);
  const [related, setRelated] = useState<Product[]>([]);

  useEffect(() => {
    if (!productId) return;
    trackLocalView(productId);
    api<Product>(`/products/${productId}`, { auth: !!getToken() })
      .then(setProduct)
      .catch((e) => setMessage({ text: e.message, type: "error" }))
      .finally(() => setLoading(false));

    // "You may also like" — pull the catalog and surface a few other items.
    api<Product[]>("/products", { auth: false })
      .then((all) => {
        const others = all.filter((p) => p.id !== productId);
        // Shuffle lightly and take 5 so the strip feels fresh each visit.
        for (let i = others.length - 1; i > 0; i--) {
          const j = Math.floor(Math.random() * (i + 1));
          [others[i], others[j]] = [others[j], others[i]];
        }
        setRelated(others.slice(0, 5));
      })
      .catch(() => setRelated([]));
  }, [productId]);

  async function addToCart() {
    if (!isLoggedIn()) { router.push("/login"); return; }
    if (!selectedSize) { setMessage({ text: "Please select a size", type: "info" }); return; }
    setAddingCart(true);
    setMessage(null);
    try {
      await api("/cart/items", { method: "POST", body: { product_id: productId, quantity: 1 } });
      setMessage({ text: "Added to bag! View your bag →", type: "success" });
    } catch (e) {
      setMessage({ text: (e as Error).message, type: "error" });
    } finally {
      setAddingCart(false);
    }
  }

  async function buyNow() {
    if (!isLoggedIn()) { router.push("/login"); return; }
    if (!selectedSize) { setMessage({ text: "Please select a size", type: "info" }); return; }
    setAddingCart(true);
    setMessage(null);
    try {
      await api("/cart/items", { method: "POST", body: { product_id: productId, quantity: 1 } });
      router.push("/checkout");
    } catch (e) {
      setMessage({ text: (e as Error).message, type: "error" });
      setAddingCart(false);
    }
  }

  async function toggleWishlist() {
    if (!isLoggedIn()) { router.push("/login"); return; }
    try {
      await api("/wishlist", { method: "POST", body: { product_id: productId } });
      setWishlisted(true);
      setMessage({ text: "Added to wishlist!", type: "success" });
    } catch (e) {
      setMessage({ text: (e as Error).message, type: "error" });
    }
  }

  if (loading) return (
    <div style={{ maxWidth: 1440, margin: "0 auto", padding: "40px 24px" }}>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 40 }}>
        <div style={{ aspectRatio: "3/4", background: "var(--color-bg-muted)", borderRadius: "var(--radius-md)", animation: "pulse 1.4s ease-in-out infinite" }} />
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          {[200, 140, 80, 120, 200].map((w, i) => (
            <div key={i} style={{ height: 20, width: w, background: "var(--color-bg-muted)", borderRadius: 4, animation: "pulse 1.4s ease-in-out infinite" }} />
          ))}
        </div>
      </div>
    </div>
  );

  if (!product) return (
    <div style={{ padding: 60, textAlign: "center" }}>
      <p style={{ color: "var(--color-text-muted)" }}>Product not found.</p>
      <Link href="/" style={{ marginTop: 16, display: "inline-block", color: "var(--color-accent-default)", fontWeight: 600 }}>← Back to Shop</Link>
    </div>
  );

  const outOfStock = product.stock !== undefined && product.stock <= 0;
  const mrp = Math.round(product.price * 1.6);
  const discount = Math.round(((mrp - product.price) / mrp) * 100);

  return (
    <div className="page-pad" style={{ maxWidth: 1440, margin: "0 auto", padding: "24px 24px 48px" }}>
      {/* Breadcrumb */}
      <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 20, fontSize: 13, color: "var(--color-text-muted)" }}>
        <Link href="/" style={{ color: "var(--color-text-muted)", textDecoration: "none" }}>Home</Link>
        <span>/</span>
        <span>{product.brand}</span>
        <span>/</span>
        <span style={{ color: "var(--color-text-primary)" }}>{product.name}</span>
      </div>

      <div className="responsive-2col" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 40, alignItems: "start" }}>
        {/* Image */}
        <div style={{ position: "sticky", top: 124 }}>
          <div style={{
            aspectRatio: "3/4",
            borderRadius: "var(--radius-md)",
            overflow: "hidden",
            background: "var(--color-bg-muted)",
          }}>
            {product.image_url && !imgError ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={product.image_url}
                alt={product.name}
                onError={() => setImgError(true)}
                style={{ width: "100%", height: "100%", objectFit: "cover" }}
              />
            ) : (
              <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 80 }}>
                👕
              </div>
            )}
          </div>
        </div>

        {/* Details */}
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 700, color: "var(--color-text-primary)", marginBottom: 4 }}>
            {product.brand}
          </h1>
          <p style={{ fontSize: 15, color: "var(--color-text-secondary)", marginBottom: 16 }}>
            {product.name}
          </p>

          {/* Rating placeholder */}
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 16 }}>
            <span style={{ background: "var(--color-success)", color: "#fff", fontSize: 12, fontWeight: 700, padding: "2px 8px", borderRadius: "var(--radius-sm)", display: "flex", alignItems: "center", gap: 3 }}>
              4.2 ★
            </span>
            <span style={{ fontSize: 13, color: "var(--color-text-muted)" }}>1,234 ratings</span>
          </div>

          {/* Price */}
          <div style={{ background: "var(--color-bg-muted)", borderRadius: "var(--radius-sm)", padding: "12px 16px", marginBottom: 20 }}>
            <div style={{ display: "flex", alignItems: "baseline", gap: 10, flexWrap: "wrap" }}>
              <span style={{ fontSize: 24, fontWeight: 700, color: "var(--color-text-primary)" }}>
                ₹{Math.round(product.price).toLocaleString("en-IN")}
              </span>
              <span style={{ fontSize: 15, color: "var(--color-text-muted)", textDecoration: "line-through" }}>
                MRP ₹{mrp.toLocaleString("en-IN")}
              </span>
              <span style={{ fontSize: 14, fontWeight: 700, color: "#ff905a" }}>
                ({discount}% OFF)
              </span>
            </div>
            <p style={{ fontSize: 12, color: "var(--color-success)", fontWeight: 600, marginTop: 4 }}>
              inclusive of all taxes
            </p>
          </div>

          {/* Stock */}
          <div style={{ marginBottom: 20 }}>
            {outOfStock ? (
              <span style={{ color: "var(--color-danger)", fontWeight: 600, fontSize: 14 }}>● Out of Stock</span>
            ) : (
              <span style={{ color: "var(--color-success)", fontWeight: 600, fontSize: 14 }}>● In Stock</span>
            )}
          </div>

          {/* Size selector */}
          <div style={{ marginBottom: 24 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
              <span style={{ fontSize: 14, fontWeight: 700, color: "var(--color-text-primary)" }}>SELECT SIZE</span>
              <button style={{ background: "none", border: "none", color: "var(--color-accent-default)", fontSize: 13, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" }}>
                SIZE CHART
              </button>
            </div>
            <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
              {SIZES.map((s) => (
                <button
                  key={s}
                  onClick={() => setSelectedSize(s)}
                  style={{
                    width: 48,
                    height: 48,
                    borderRadius: "50%",
                    border: `2px solid ${selectedSize === s ? "var(--color-text-primary)" : "var(--color-border-default)"}`,
                    background: selectedSize === s ? "var(--color-text-primary)" : "var(--color-bg-surface)",
                    color: selectedSize === s ? "var(--color-bg-surface)" : "var(--color-text-primary)",
                    fontSize: 13,
                    fontWeight: 600,
                    cursor: "pointer",
                    fontFamily: "inherit",
                    transition: "all 0.15s",
                  }}
                >
                  {s}
                </button>
              ))}
            </div>
          </div>

          {/* CTA buttons */}
          <div style={{ display: "flex", gap: 12, marginBottom: 20 }}>
            <button
              onClick={addToCart}
              disabled={outOfStock || addingCart}
              style={{
                flex: 1,
                padding: "14px",
                background: outOfStock ? "var(--color-border-strong)" : "var(--color-accent-default)",
                color: "#fff",
                border: "none",
                borderRadius: "var(--radius-sm)",
                fontSize: 15,
                fontWeight: 700,
                cursor: outOfStock ? "not-allowed" : "pointer",
                letterSpacing: 0.5,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: 8,
                fontFamily: "inherit",
                transition: "background 0.2s",
              }}
            >
              🛍 {addingCart ? "ADDING…" : "ADD TO BAG"}
            </button>
            <button
              onClick={toggleWishlist}
              style={{
                flex: 1,
                padding: "14px",
                background: wishlisted ? "var(--color-accent-subtle)" : "var(--color-bg-surface)",
                color: wishlisted ? "var(--color-accent-default)" : "var(--color-text-primary)",
                border: `2px solid ${wishlisted ? "var(--color-accent-default)" : "var(--color-border-default)"}`,
                borderRadius: "var(--radius-sm)",
                fontSize: 15,
                fontWeight: 700,
                cursor: "pointer",
                letterSpacing: 0.5,
                fontFamily: "inherit",
                transition: "all 0.2s",
              }}
            >
              {wishlisted ? "♥ WISHLISTED" : "♡ WISHLIST"}
            </button>
          </div>

          {/* Buy Now — skip the bag, go straight to checkout */}
          <button
            onClick={buyNow}
            disabled={outOfStock || addingCart}
            style={{
              width: "100%",
              padding: "14px",
              marginBottom: 20,
              background: outOfStock ? "var(--color-border-strong)" : "transparent",
              color: outOfStock ? "#fff" : "var(--color-accent-default)",
              border: `2px solid ${outOfStock ? "var(--color-border-strong)" : "var(--color-accent-default)"}`,
              borderRadius: "var(--radius-sm)",
              fontSize: 15,
              fontWeight: 700,
              letterSpacing: 0.5,
              cursor: outOfStock ? "not-allowed" : "pointer",
              fontFamily: "inherit",
              transition: "all 0.2s",
            }}
          >
            ⚡ BUY NOW
          </button>

          {/* Message */}
          {message && (
            <div style={{
              padding: "12px 16px",
              borderRadius: "var(--radius-sm)",
              fontSize: 14,
              fontWeight: 500,
              marginBottom: 16,
              background: message.type === "success" ? "#f0fdf4" : message.type === "error" ? "#fff1f2" : "#f0f9ff",
              color: message.type === "success" ? "var(--color-success)" : message.type === "error" ? "var(--color-danger)" : "#0284c7",
              border: `1px solid ${message.type === "success" ? "var(--color-success)" : message.type === "error" ? "var(--color-danger)" : "#bae6fd"}`,
            }}>
              {message.text}
              {message.text.includes("Added to bag") && (
                <Link href="/cart" style={{ marginLeft: 8, fontWeight: 700, color: "var(--color-success)" }}>Go to bag →</Link>
              )}
            </div>
          )}

          {/* Product details */}
          <div style={{ borderTop: "1px solid var(--color-border-default)", paddingTop: 20 }}>
            <h3 style={{ fontSize: 14, fontWeight: 700, letterSpacing: 0.5, color: "var(--color-text-primary)", marginBottom: 12 }}>
              PRODUCT DETAILS
            </h3>
            <p style={{ fontSize: 14, color: "var(--color-text-secondary)", lineHeight: 1.8 }}>
              {product.description || `${product.name} from ${product.brand}. A premium quality product designed for everyday use with superior comfort and style. Made with high-quality materials for long-lasting wear.`}
            </p>
          </div>

          {/* Delivery info */}
          <div style={{ marginTop: 20, display: "flex", flexDirection: "column", gap: 10 }}>
            {[
              { icon: "🚚", text: "Free delivery on orders above ₹799" },
              { icon: "↩", text: "Easy 30 day returns & exchanges" },
              { icon: "✓", text: "100% Original Products" },
            ].map((item) => (
              <div key={item.text} style={{ display: "flex", alignItems: "center", gap: 10, fontSize: 13, color: "var(--color-text-secondary)" }}>
                <span style={{ fontSize: 16 }}>{item.icon}</span>
                {item.text}
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Ratings & reviews */}
      <Reviews productId={productId} />

      {/* You may also like */}
      {related.length > 0 && (
        <section style={{ marginTop: 48 }}>
          <h2 style={{ fontSize: 18, fontWeight: 700, letterSpacing: 0.5, color: "var(--color-text-primary)", marginBottom: 20 }}>
            YOU MAY ALSO LIKE
          </h2>
          <ProductGrid products={related} />
        </section>
      )}
    </div>
  );
}
