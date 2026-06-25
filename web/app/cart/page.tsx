"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { api, getToken } from "@/lib/api";
import type { Product } from "@/components/ProductCard";

type CartItem = {
  id: number;
  product_id: number;
  quantity: number;
  status: string;
  price_snapshot: number;
  version: number;
};

type CartView = {
  active: CartItem[];
  saved_for_later: CartItem[];
  total: number;
};

export default function CartPage() {
  const router = useRouter();
  const [cart, setCart] = useState<CartView | null>(null);
  const [products, setProducts] = useState<Record<number, Product>>({});
  const [error, setError] = useState<string | null>(null);
  const [needsAuth, setNeedsAuth] = useState(false);

  const load = useCallback(async () => {
    if (!getToken()) { setNeedsAuth(true); return; }
    try {
      const data = await api<CartView>("/cart");
      setCart(data);
      setError(null);

      // Fetch product details for all items
      const allItems = [...(data.active || []), ...(data.saved_for_later || [])];
      const unique = [...new Set(allItems.map((i) => i.product_id))];
      const fetched = await Promise.all(
        unique.map((id) => api<Product>(`/products/${id}`, { auth: false }).catch(() => null))
      );
      const map: Record<number, Product> = {};
      fetched.forEach((p, i) => { if (p) map[unique[i]] = p; });
      setProducts(map);
    } catch (e) {
      setError((e as Error).message);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  async function withConflictHandling(fn: () => Promise<unknown>) {
    try {
      await fn();
      await load();
    } catch (e) {
      const err = e as { status?: number; message: string };
      if (err.status === 409) {
        setError("Item changed in another session. Cart refreshed — please try again.");
        await load();
      } else {
        setError(err.message);
      }
    }
  }

  const updateQty = (item: CartItem, q: number) =>
    withConflictHandling(() => api(`/cart/items/${item.id}`, { method: "PATCH", body: { quantity: q, version: item.version } }));

  const saveForLater = (item: CartItem) =>
    withConflictHandling(() => api(`/cart/items/${item.id}/save-for-later`, { method: "POST", body: { version: item.version } }));

  const moveToCart = (item: CartItem) =>
    withConflictHandling(() => api(`/cart/items/${item.id}/move-to-cart`, { method: "POST", body: { version: item.version } }));

  const removeItem = (item: CartItem) =>
    withConflictHandling(() => api(`/cart/items/${item.id}`, { method: "DELETE" }));

  if (needsAuth) return (
    <div style={{ maxWidth: 480, margin: "80px auto", textAlign: "center", padding: "0 24px" }}>
      <div style={{ fontSize: 64, marginBottom: 16 }}>🛍</div>
      <h2 style={{ fontSize: 22, fontWeight: 700, color: "var(--color-text-primary)", marginBottom: 8 }}>Your bag is waiting</h2>
      <p style={{ color: "var(--color-text-muted)", marginBottom: 24 }}>Login to see the items you added to your bag</p>
      <Link href="/login" style={{
        display: "inline-block",
        padding: "13px 40px",
        background: "var(--color-accent-default)",
        color: "#fff",
        borderRadius: "var(--radius-sm)",
        fontWeight: 700,
        fontSize: 14,
        letterSpacing: 0.5,
      }}>
        LOGIN / SIGNUP
      </Link>
    </div>
  );

  if (!cart) return (
    <div style={{ maxWidth: 1200, margin: "0 auto", padding: "40px 24px" }}>
      <CartSkeleton />
    </div>
  );

  const subtotal = cart.active.reduce((sum, i) => sum + i.price_snapshot * i.quantity, 0);
  const itemCount = cart.active.reduce((sum, i) => sum + i.quantity, 0);

  return (
    <div style={{ maxWidth: 1200, margin: "0 auto", padding: "24px 24px 60px" }}>
      <h1 style={{ fontSize: 20, fontWeight: 700, color: "var(--color-text-primary)", marginBottom: 24 }}>
        My Bag
        {itemCount > 0 && (
          <span style={{ fontWeight: 400, color: "var(--color-text-muted)", fontSize: 15, marginLeft: 8 }}>
            ({itemCount} item{itemCount !== 1 ? "s" : ""})
          </span>
        )}
      </h1>

      {error && (
        <div style={{ background: "#fff1f2", border: "1px solid var(--color-danger)", borderRadius: "var(--radius-sm)", padding: "12px 16px", color: "var(--color-danger)", fontSize: 14, marginBottom: 16 }}>
          {error}
        </div>
      )}

      {cart.active.length === 0 ? (
        <div style={{ textAlign: "center", padding: "60px 24px" }}>
          <div style={{ fontSize: 64, marginBottom: 16 }}>🛒</div>
          <h2 style={{ fontSize: 20, fontWeight: 700, color: "var(--color-text-primary)", marginBottom: 8 }}>Your bag is empty</h2>
          <p style={{ color: "var(--color-text-muted)", marginBottom: 24 }}>Add items to it now</p>
          <Link href="/" style={{ display: "inline-block", padding: "12px 32px", background: "var(--color-accent-default)", color: "#fff", borderRadius: "var(--radius-sm)", fontWeight: 700, fontSize: 14 }}>
            SHOP NOW
          </Link>
        </div>
      ) : (
        <div className="responsive-2col" style={{ display: "grid", gridTemplateColumns: "1fr 360px", gap: 24, alignItems: "start" }}>
          {/* Cart items */}
          <div>
            {cart.active.map((item) => (
              <CartRow
                key={item.id}
                item={item}
                product={products[item.product_id]}
                onInc={() => updateQty(item, item.quantity + 1)}
                onDec={() => item.quantity > 1 && updateQty(item, item.quantity - 1)}
                onSave={() => saveForLater(item)}
                onRemove={() => removeItem(item)}
              />
            ))}
          </div>

          {/* Price summary */}
          <div style={{ position: "sticky", top: 124, background: "var(--color-bg-surface)", border: "1px solid var(--color-border-default)", borderRadius: "var(--radius-md)", padding: 20 }}>
            <h3 style={{ fontSize: 14, fontWeight: 700, letterSpacing: 0.5, color: "var(--color-text-muted)", marginBottom: 16 }}>
              PRICE DETAILS ({itemCount} item{itemCount !== 1 ? "s" : ""})
            </h3>

            <div style={{ display: "flex", flexDirection: "column", gap: 12, marginBottom: 16 }}>
              <PriceRow label="Total MRP" value={`₹${Math.round(subtotal * 1.6).toLocaleString("en-IN")}`} />
              <PriceRow label="Discount on MRP" value={`-₹${Math.round(subtotal * 0.6).toLocaleString("en-IN")}`} green />
              <PriceRow label="Convenience Fee" value="FREE" green />
            </div>

            <div style={{ borderTop: "1px solid var(--color-border-default)", paddingTop: 14, marginBottom: 20 }}>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 16, fontWeight: 700, color: "var(--color-text-primary)" }}>
                <span>Total Amount</span>
                <span>₹{Math.round(subtotal).toLocaleString("en-IN")}</span>
              </div>
              <p style={{ fontSize: 12, color: "var(--color-success)", fontWeight: 600, marginTop: 4 }}>
                You will save ₹{Math.round(subtotal * 0.6).toLocaleString("en-IN")} on this order
              </p>
            </div>

            <button
              onClick={() => router.push("/checkout")}
              style={{
                width: "100%",
                padding: "14px",
                background: "var(--color-accent-default)",
                color: "#fff",
                border: "none",
                borderRadius: "var(--radius-sm)",
                fontSize: 15,
                fontWeight: 700,
                cursor: "pointer",
                letterSpacing: 0.5,
                fontFamily: "inherit",
              }}
            >
              PLACE ORDER
            </button>
          </div>
        </div>
      )}

      {/* Saved for later */}
      {cart.saved_for_later.length > 0 && (
        <section style={{ marginTop: 40 }}>
          <h2 style={{ fontSize: 16, fontWeight: 700, color: "var(--color-text-primary)", marginBottom: 16 }}>
            SAVED FOR LATER ({cart.saved_for_later.length})
          </h2>
          {cart.saved_for_later.map((item) => (
            <CartRow
              key={item.id}
              item={item}
              product={products[item.product_id]}
              saved
              onMove={() => moveToCart(item)}
              onRemove={() => removeItem(item)}
            />
          ))}
        </section>
      )}
    </div>
  );
}

function CartRow({
  item, product, saved, onInc, onDec, onSave, onMove, onRemove,
}: {
  item: CartItem; product?: Product; saved?: boolean;
  onInc?: () => void; onDec?: () => void; onSave?: () => void; onMove?: () => void; onRemove?: () => void;
}) {
  return (
    <div style={{
      display: "flex",
      gap: 16,
      padding: "20px 0",
      borderBottom: "1px solid var(--color-border-default)",
    }}>
      {/* Product image */}
      <Link href={`/product/${item.product_id}`}>
        <div style={{ width: 96, height: 124, borderRadius: "var(--radius-sm)", overflow: "hidden", background: "var(--color-bg-muted)", flexShrink: 0 }}>
          {product?.image_url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={product.image_url} alt={product.name} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
          ) : (
            <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 32 }}>👕</div>
          )}
        </div>
      </Link>

      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontWeight: 700, fontSize: 15, color: "var(--color-text-primary)", marginBottom: 2 }}>
          {product?.brand || `Brand`}
        </div>
        <div style={{ fontSize: 14, color: "var(--color-text-secondary)", marginBottom: 8, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {product?.name || `Product #${item.product_id}`}
        </div>
        <div style={{ fontSize: 16, fontWeight: 700, color: "var(--color-text-primary)", marginBottom: 12 }}>
          ₹{Math.round(item.price_snapshot).toLocaleString("en-IN")}
          {product && (
            <span style={{ fontSize: 12, color: "var(--color-text-muted)", textDecoration: "line-through", marginLeft: 8, fontWeight: 400 }}>
              ₹{Math.round(item.price_snapshot * 1.6).toLocaleString("en-IN")}
            </span>
          )}
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 16, flexWrap: "wrap" }}>
          {!saved && (
            <div style={{ display: "flex", alignItems: "center", border: "1px solid var(--color-border-default)", borderRadius: "var(--radius-sm)", overflow: "hidden" }}>
              <button onClick={onDec} style={{ width: 32, height: 32, background: "none", border: "none", cursor: "pointer", fontSize: 16, color: "var(--color-text-primary)", display: "flex", alignItems: "center", justifyContent: "center" }}>−</button>
              <span style={{ minWidth: 36, textAlign: "center", fontSize: 14, fontWeight: 600, color: "var(--color-text-primary)", padding: "0 4px", borderLeft: "1px solid var(--color-border-default)", borderRight: "1px solid var(--color-border-default)" }}>{item.quantity}</span>
              <button onClick={onInc} style={{ width: 32, height: 32, background: "none", border: "none", cursor: "pointer", fontSize: 16, color: "var(--color-text-primary)", display: "flex", alignItems: "center", justifyContent: "center" }}>+</button>
            </div>
          )}

          {!saved && (
            <button onClick={onSave} style={{ background: "none", border: "none", color: "var(--color-text-secondary)", fontSize: 13, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" }}>
              SAVE FOR LATER
            </button>
          )}
          {saved && (
            <button onClick={onMove} style={{ background: "none", border: "none", color: "var(--color-accent-default)", fontSize: 13, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" }}>
              MOVE TO BAG
            </button>
          )}
          <button onClick={onRemove} style={{ background: "none", border: "none", color: "var(--color-text-muted)", fontSize: 13, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" }}>
            REMOVE
          </button>
        </div>
      </div>
    </div>
  );
}

function PriceRow({ label, value, green }: { label: string; value: string; green?: boolean }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", fontSize: 14, color: green ? "var(--color-success)" : "var(--color-text-secondary)" }}>
      <span>{label}</span>
      <span style={{ fontWeight: green ? 600 : 400 }}>{value}</span>
    </div>
  );
}

function CartSkeleton() {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      {[1, 2, 3].map((i) => (
        <div key={i} style={{ display: "flex", gap: 16, padding: "20px 0", borderBottom: "1px solid var(--color-border-default)" }}>
          <div style={{ width: 96, height: 124, background: "var(--color-bg-muted)", borderRadius: "var(--radius-sm)", animation: "pulse 1.4s ease-in-out infinite" }} />
          <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 8 }}>
            <div style={{ height: 16, width: 120, background: "var(--color-bg-muted)", borderRadius: 4, animation: "pulse 1.4s ease-in-out infinite" }} />
            <div style={{ height: 14, width: 200, background: "var(--color-bg-muted)", borderRadius: 4, animation: "pulse 1.4s ease-in-out infinite" }} />
            <div style={{ height: 18, width: 80, background: "var(--color-bg-muted)", borderRadius: 4, animation: "pulse 1.4s ease-in-out infinite" }} />
          </div>
        </div>
      ))}
    </div>
  );
}
