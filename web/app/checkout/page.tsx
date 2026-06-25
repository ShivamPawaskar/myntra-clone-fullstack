"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { api, getToken } from "@/lib/api";

type CartItem = { id: number; product_id: number; quantity: number; price_snapshot: number };
type CartView = { active: CartItem[]; total: number };
type CheckoutReport = { can_checkout: boolean; subtotal: number };
type Order = { order_id: string; invoice_number: string; amount: number; payment_mode: string };
type AppliedCoupon = { code: string; description: string; discount: number; final_amount: number };

const PAYMENT_MODES = [
  { id: "Card", label: "Credit / Debit Card", icon: "💳" },
  { id: "UPI", label: "UPI", icon: "📱" },
  { id: "NetBanking", label: "Net Banking", icon: "🏦" },
  { id: "Cash on Delivery", label: "Cash on Delivery", icon: "💵" },
];

export default function CheckoutPage() {
  const router = useRouter();
  const [cart, setCart] = useState<CartView | null>(null);
  const [report, setReport] = useState<CheckoutReport | null>(null);
  const [mode, setMode] = useState("Card");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [needsAuth, setNeedsAuth] = useState(false);
  const [placed, setPlaced] = useState<Order | null>(null);

  // dummy card fields (demo only)
  const [card, setCard] = useState("4242 4242 4242 4242");
  const [holder, setHolder] = useState("");
  const [expiry, setExpiry] = useState("12/27");
  const [cvv, setCvv] = useState("123");
  const [upi, setUpi] = useState("demo@upi");

  // coupon
  const [couponCode, setCouponCode] = useState("");
  const [applied, setApplied] = useState<AppliedCoupon | null>(null);
  const [couponMsg, setCouponMsg] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!getToken()) { setNeedsAuth(true); return; }
    try {
      const [c, r] = await Promise.all([
        api<CartView>("/cart"),
        api<CheckoutReport>("/cart/validate-checkout"),
      ]);
      setCart(c);
      setReport(r);
    } catch (e) {
      setError((e as Error).message);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  async function applyCoupon() {
    setCouponMsg(null);
    if (!couponCode.trim()) { setApplied(null); return; }
    try {
      const r = await api<AppliedCoupon>("/cart/preview-coupon", { method: "POST", body: { code: couponCode } });
      setApplied(r);
      setCouponMsg(`✓ ${r.code} applied — you saved ₹${Math.round(r.discount).toLocaleString("en-IN")}`);
    } catch (e) {
      setApplied(null);
      setCouponMsg((e as Error).message);
    }
  }

  function removeCoupon() {
    setApplied(null); setCouponCode(""); setCouponMsg(null);
  }

  async function pay() {
    setBusy(true);
    setError(null);
    try {
      const order = await api<Order>("/cart/checkout", {
        method: "POST",
        body: { payment_mode: mode, coupon_code: applied ? applied.code : null },
      });
      setPlaced(order);
      window.dispatchEvent(new Event("auth-changed")); // refresh cart count in header
    } catch (e) {
      const err = e as { status?: number; message: string };
      setError(err.status === 409 ? "Some items are no longer available. Please review your bag." : err.message);
    } finally {
      setBusy(false);
    }
  }

  if (needsAuth) return (
    <Centered>
      <div style={{ fontSize: 56, marginBottom: 12 }}>🔒</div>
      <h2 style={{ fontSize: 20, fontWeight: 700, color: "var(--color-text-primary)", marginBottom: 8 }}>Login to checkout</h2>
      <Link href="/login" style={primaryLink}>LOGIN / SIGNUP</Link>
    </Centered>
  );

  // ---- success screen ----
  if (placed) return (
    <Centered>
      <div style={{ fontSize: 64, marginBottom: 12 }}>✅</div>
      <h2 style={{ fontSize: 24, fontWeight: 800, color: "var(--color-text-primary)", marginBottom: 6 }}>Order placed!</h2>
      <p style={{ color: "var(--color-text-muted)", marginBottom: 4 }}>Thank you — your (demo) payment was successful.</p>
      <p style={{ color: "var(--color-text-secondary)", fontSize: 14, marginBottom: 24 }}>
        Order <b>{placed.order_id}</b> · ₹{Math.round(placed.amount).toLocaleString("en-IN")} via {placed.payment_mode}
      </p>
      <div style={{ display: "flex", gap: 12 }}>
        <Link href="/orders" style={primaryLink}>VIEW MY ORDERS</Link>
        <Link href="/" style={secondaryLink}>CONTINUE SHOPPING</Link>
      </div>
    </Centered>
  );

  if (!cart) return <Centered><p style={{ color: "var(--color-text-muted)" }}>Loading…</p></Centered>;

  if (cart.active.length === 0) return (
    <Centered>
      <div style={{ fontSize: 56, marginBottom: 12 }}>🛒</div>
      <h2 style={{ fontSize: 20, fontWeight: 700, color: "var(--color-text-primary)", marginBottom: 8 }}>Your bag is empty</h2>
      <Link href="/" style={primaryLink}>SHOP NOW</Link>
    </Centered>
  );

  const amount = report?.subtotal ?? cart.active.reduce((s, i) => s + i.price_snapshot * i.quantity, 0);
  const blocked = report ? !report.can_checkout : false;
  const discount = applied ? applied.discount : 0;
  const payable = Math.max(0, amount - discount);

  return (
    <div style={{ maxWidth: 1000, margin: "0 auto", padding: "24px 24px 60px" }}>
      <h1 style={{ fontSize: 22, fontWeight: 700, color: "var(--color-text-primary)", marginBottom: 6 }}>Checkout</h1>

      {/* demo gateway banner */}
      <div style={{ background: "#fffbeb", border: "1px solid #fde68a", color: "#92400e", borderRadius: "var(--radius-sm)", padding: "10px 14px", fontSize: 13, marginBottom: 20 }}>
        🧪 <b>Demo payment gateway</b> — no real payment is processed. Fields are pre-filled; any values work.
      </div>

      {error && (
        <div style={{ background: "#fff1f2", border: "1px solid var(--color-danger)", color: "var(--color-danger)", borderRadius: "var(--radius-sm)", padding: "12px 16px", fontSize: 14, marginBottom: 16 }}>
          {error}
        </div>
      )}

      <div className="responsive-2col" style={{ display: "grid", gridTemplateColumns: "1fr 340px", gap: 24, alignItems: "start" }}>
        {/* Payment method */}
        <div style={panel}>
          <h3 style={panelTitle}>Payment Method</h3>
          <div style={{ display: "flex", flexDirection: "column", gap: 10, marginBottom: 20 }}>
            {PAYMENT_MODES.map((m) => (
              <label key={m.id} style={{
                display: "flex", alignItems: "center", gap: 12, padding: "12px 14px",
                border: `1.5px solid ${mode === m.id ? "var(--color-accent-default)" : "var(--color-border-default)"}`,
                borderRadius: "var(--radius-sm)", cursor: "pointer",
                background: mode === m.id ? "var(--color-accent-subtle)" : "transparent",
              }}>
                <input type="radio" name="pay" checked={mode === m.id} onChange={() => setMode(m.id)} />
                <span style={{ fontSize: 18 }}>{m.icon}</span>
                <span style={{ fontSize: 14, fontWeight: 600, color: "var(--color-text-primary)" }}>{m.label}</span>
              </label>
            ))}
          </div>

          {/* Conditional fake fields */}
          {mode === "Card" && (
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              <Field label="Card Number" value={card} onChange={setCard} placeholder="1234 5678 9012 3456" />
              <Field label="Name on Card" value={holder} onChange={setHolder} placeholder="Your name" />
              <div style={{ display: "flex", gap: 12 }}>
                <Field label="Expiry" value={expiry} onChange={setExpiry} placeholder="MM/YY" />
                <Field label="CVV" value={cvv} onChange={setCvv} placeholder="123" />
              </div>
            </div>
          )}
          {mode === "UPI" && (
            <Field label="UPI ID" value={upi} onChange={setUpi} placeholder="name@bank" />
          )}
          {mode === "NetBanking" && (
            <p style={{ fontSize: 13, color: "var(--color-text-muted)" }}>You’ll be “redirected” to your bank (simulated).</p>
          )}
          {mode === "Cash on Delivery" && (
            <p style={{ fontSize: 13, color: "var(--color-text-muted)" }}>Pay in cash when your order arrives.</p>
          )}
        </div>

        {/* Order summary */}
        <div style={{ ...panel, position: "sticky", top: 124 }}>
          <h3 style={panelTitle}>Order Summary</h3>
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: 14, color: "var(--color-text-secondary)", marginBottom: 8 }}>
            <span>Items ({cart.active.reduce((s, i) => s + i.quantity, 0)})</span>
            <span>₹{Math.round(amount).toLocaleString("en-IN")}</span>
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: 14, color: "var(--color-success)", marginBottom: 14 }}>
            <span>Delivery</span><span>FREE</span>
          </div>

          {/* Coupon */}
          <div style={{ borderTop: "1px solid var(--color-border-default)", paddingTop: 14, marginBottom: 8 }}>
            {applied ? (
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <span style={{ fontSize: 13, fontWeight: 600, color: "var(--color-success)" }}>🏷 {applied.code} applied</span>
                <button onClick={removeCoupon} style={{ background: "none", border: "none", color: "var(--color-danger)", fontSize: 12, fontWeight: 600, cursor: "pointer" }}>Remove</button>
              </div>
            ) : (
              <div style={{ display: "flex", gap: 8 }}>
                <input
                  value={couponCode}
                  onChange={(e) => setCouponCode(e.target.value.toUpperCase())}
                  placeholder="Coupon code"
                  style={{ flex: 1, padding: "9px 12px", border: "1px solid var(--color-border-strong)", borderRadius: "var(--radius-sm)", background: "var(--color-bg-surface)", color: "var(--color-text-primary)", fontSize: 13, fontFamily: "inherit", outline: "none" }}
                />
                <button onClick={applyCoupon} style={{ padding: "0 16px", border: "1px solid var(--color-accent-default)", borderRadius: "var(--radius-sm)", background: "transparent", color: "var(--color-accent-default)", fontWeight: 700, fontSize: 13, cursor: "pointer", fontFamily: "inherit" }}>Apply</button>
              </div>
            )}
            {couponMsg && <p style={{ fontSize: 12, marginTop: 6, color: applied ? "var(--color-success)" : "var(--color-danger)" }}>{couponMsg}</p>}
            <p style={{ fontSize: 11, color: "var(--color-text-muted)", marginTop: 6 }}>Try <b>WELCOME15</b>, <b>SAVE10</b>, <b>FLAT200</b> or <b>BIGSALE25</b></p>
          </div>

          {discount > 0 && (
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 14, color: "var(--color-success)", marginBottom: 8 }}>
              <span>Coupon discount</span><span>−₹{Math.round(discount).toLocaleString("en-IN")}</span>
            </div>
          )}

          <div style={{ borderTop: "1px solid var(--color-border-default)", paddingTop: 14, marginBottom: 18, display: "flex", justifyContent: "space-between", fontSize: 17, fontWeight: 800, color: "var(--color-text-primary)" }}>
            <span>Total</span><span>₹{Math.round(payable).toLocaleString("en-IN")}</span>
          </div>
          <button onClick={pay} disabled={busy || blocked} style={{
            width: "100%", padding: 14, border: "none", borderRadius: "var(--radius-sm)",
            background: (busy || blocked) ? "var(--color-border-strong)" : "var(--color-accent-default)",
            color: "#fff", fontSize: 15, fontWeight: 700, letterSpacing: 0.5,
            cursor: (busy || blocked) ? "not-allowed" : "pointer", fontFamily: "inherit",
          }}>
            {busy ? "Processing payment…" : blocked ? "Resolve bag issues first" : `PAY ₹${Math.round(payable).toLocaleString("en-IN")}`}
          </button>
          <Link href="/cart" style={{ display: "block", textAlign: "center", marginTop: 12, fontSize: 13, color: "var(--color-accent-default)", fontWeight: 600 }}>
            ← Back to bag
          </Link>
        </div>
      </div>
    </div>
  );
}

function Field({ label, value, onChange, placeholder }: { label: string; value: string; onChange: (v: string) => void; placeholder: string }) {
  return (
    <label style={{ display: "block", flex: 1 }}>
      <span style={{ display: "block", fontSize: 12, fontWeight: 600, color: "var(--color-text-secondary)", marginBottom: 6 }}>{label}</span>
      <input value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} style={{
        width: "100%", padding: "10px 12px", border: "1px solid var(--color-border-strong)",
        borderRadius: "var(--radius-sm)", background: "var(--color-bg-surface)",
        color: "var(--color-text-primary)", fontSize: 14, fontFamily: "inherit", outline: "none",
      }} />
    </label>
  );
}

function Centered({ children }: { children: React.ReactNode }) {
  return <div style={{ maxWidth: 480, margin: "80px auto", textAlign: "center", padding: "0 24px" }}>{children}</div>;
}

const panel: React.CSSProperties = {
  background: "var(--color-bg-surface)", border: "1px solid var(--color-border-default)",
  borderRadius: "var(--radius-md)", padding: 20,
};
const panelTitle: React.CSSProperties = {
  fontSize: 13, fontWeight: 700, letterSpacing: 0.5, color: "var(--color-text-muted)", marginBottom: 16,
};
const primaryLink: React.CSSProperties = {
  display: "inline-block", padding: "13px 32px", background: "var(--color-accent-default)",
  color: "#fff", borderRadius: "var(--radius-sm)", fontWeight: 700, fontSize: 14, letterSpacing: 0.5,
};
const secondaryLink: React.CSSProperties = {
  display: "inline-block", padding: "13px 32px", background: "transparent",
  color: "var(--color-accent-default)", border: "1.5px solid var(--color-accent-default)",
  borderRadius: "var(--radius-sm)", fontWeight: 700, fontSize: 14, letterSpacing: 0.5,
};
