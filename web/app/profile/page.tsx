"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { api, getToken, clearToken } from "@/lib/api";

type User = { id: number; email: string; name: string };
type Order = { id: number; invoice_number: string; order_id: string; amount: number; payment_mode: string; status: string; created_at: string; item_count: number };
type OrderPage = { items: Order[]; total: number };

export default function ProfilePage() {
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [orders, setOrders] = useState<Order[]>([]);
  const [orderCount, setOrderCount] = useState(0);
  const [needsAuth, setNeedsAuth] = useState(false);

  const load = useCallback(async () => {
    if (!getToken()) { setNeedsAuth(true); return; }
    try {
      const me = await api<User>("/auth/me");
      setUser(me);
      const o = await api<OrderPage>("/transactions?page=1&page_size=5");
      setOrders(o.items);
      setOrderCount(o.total);
    } catch {
      setNeedsAuth(true);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  function logout() {
    clearToken();
    router.push("/");
  }

  if (needsAuth) return (
    <div style={{ maxWidth: 460, margin: "80px auto", textAlign: "center", padding: "0 24px" }}>
      <div style={{ fontSize: 56, marginBottom: 12 }}>👤</div>
      <h2 style={{ fontSize: 20, fontWeight: 700, color: "var(--color-text-primary)", marginBottom: 8 }}>Login to view your profile</h2>
      <Link href="/login" style={primaryLink}>LOGIN / SIGNUP</Link>
    </div>
  );

  if (!user) return <p style={{ maxWidth: 1000, margin: "40px auto", padding: "0 24px", color: "var(--color-text-muted)" }}>Loading…</p>;

  const initial = (user.name || user.email || "?").trim().charAt(0).toUpperCase();

  return (
    <div style={{ maxWidth: 1000, margin: "0 auto", padding: "32px 24px 60px" }}>
      <h1 style={{ fontSize: 22, fontWeight: 700, color: "var(--color-text-primary)", marginBottom: 24 }}>My Profile</h1>

      <div className="responsive-2col" style={{ display: "grid", gridTemplateColumns: "320px 1fr", gap: 24, alignItems: "start" }}>
        {/* Account card */}
        <div style={card}>
          <div style={{ display: "flex", alignItems: "center", gap: 14, marginBottom: 20 }}>
            <div style={{
              width: 56, height: 56, borderRadius: "50%", flexShrink: 0,
              background: "var(--color-accent-default)", color: "#fff",
              display: "flex", alignItems: "center", justifyContent: "center",
              fontSize: 24, fontWeight: 800,
            }}>{initial}</div>
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: 17, fontWeight: 700, color: "var(--color-text-primary)" }}>{user.name}</div>
              <div style={{ fontSize: 13, color: "var(--color-text-muted)", overflow: "hidden", textOverflow: "ellipsis" }}>{user.email}</div>
            </div>
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
            <NavRow href="/orders" label="My Orders" sub={`${orderCount} order${orderCount !== 1 ? "s" : ""}`} />
            <NavRow href="/wishlist" label="Wishlist" />
            <NavRow href="/recommendations" label="Recommended for you" />
            <NavRow href="/cart" label="My Bag" />
          </div>

          <button onClick={logout} style={{
            width: "100%", marginTop: 20, padding: 12, border: "1px solid var(--color-danger)",
            borderRadius: "var(--radius-sm)", background: "transparent", color: "var(--color-danger)",
            fontWeight: 700, fontSize: 14, cursor: "pointer", fontFamily: "inherit",
          }}>Logout</button>
        </div>

        {/* Recent orders */}
        <div style={card}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
            <h3 style={{ fontSize: 15, fontWeight: 700, color: "var(--color-text-primary)" }}>Recent Orders</h3>
            <Link href="/orders" style={{ fontSize: 13, color: "var(--color-accent-default)", fontWeight: 600 }}>View all →</Link>
          </div>

          {orders.length === 0 ? (
            <div style={{ textAlign: "center", padding: "32px 0" }}>
              <div style={{ fontSize: 40, marginBottom: 8 }}>📦</div>
              <p style={{ color: "var(--color-text-muted)", marginBottom: 16 }}>No orders yet.</p>
              <Link href="/" style={primaryLink}>START SHOPPING</Link>
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              {orders.map((o) => (
                <div key={o.id} style={{
                  display: "flex", justifyContent: "space-between", alignItems: "center",
                  padding: "12px 14px", border: "1px solid var(--color-border-default)", borderRadius: "var(--radius-sm)",
                }}>
                  <div>
                    <div style={{ fontSize: 14, fontWeight: 600, color: "var(--color-text-primary)" }}>{o.order_id}</div>
                    <div style={{ fontSize: 12, color: "var(--color-text-muted)" }}>
                      {new Date(o.created_at).toLocaleDateString("en-IN")} · {o.item_count} item{o.item_count !== 1 ? "s" : ""} · {o.payment_mode}
                    </div>
                  </div>
                  <div style={{ textAlign: "right" }}>
                    <div style={{ fontSize: 15, fontWeight: 700, color: "var(--color-text-primary)" }}>₹{Math.round(o.amount).toLocaleString("en-IN")}</div>
                    <div style={{ fontSize: 12, fontWeight: 600, color: o.status === "success" ? "var(--color-success)" : "var(--color-text-muted)" }}>{o.status}</div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function NavRow({ href, label, sub }: { href: string; label: string; sub?: string }) {
  return (
    <Link href={href} style={{
      display: "flex", justifyContent: "space-between", alignItems: "center",
      padding: "11px 4px", borderBottom: "1px solid var(--color-border-default)",
      color: "var(--color-text-primary)", fontSize: 14, textDecoration: "none",
    }}>
      <span>{label}</span>
      <span style={{ fontSize: 12, color: "var(--color-text-muted)" }}>{sub ? `${sub} ›` : "›"}</span>
    </Link>
  );
}

const card: React.CSSProperties = {
  background: "var(--color-bg-surface)", border: "1px solid var(--color-border-default)",
  borderRadius: "var(--radius-md)", padding: 20,
};
const primaryLink: React.CSSProperties = {
  display: "inline-block", padding: "12px 28px", background: "var(--color-accent-default)",
  color: "#fff", borderRadius: "var(--radius-sm)", fontWeight: 700, fontSize: 14, letterSpacing: 0.5,
};
