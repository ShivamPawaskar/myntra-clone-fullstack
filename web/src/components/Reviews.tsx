"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { api, isLoggedIn } from "@/lib/api";

type Review = {
  id: number; user_name: string; rating: number; title: string;
  body: string; verified_purchase: boolean; created_at: string;
};
type Summary = {
  count: number; average: number;
  distribution: Record<string, number>; reviews: Review[];
};

function Stars({ value, size = 14 }: { value: number; size?: number }) {
  return (
    <span style={{ color: "#f59e0b", fontSize: size, letterSpacing: 1 }}>
      {[1, 2, 3, 4, 5].map((i) => (
        <span key={i} style={{ opacity: i <= Math.round(value) ? 1 : 0.25 }}>★</span>
      ))}
    </span>
  );
}

export function Reviews({ productId }: { productId: number }) {
  const router = useRouter();
  const [data, setData] = useState<Summary | null>(null);
  const [rating, setRating] = useState(0);
  const [hover, setHover] = useState(0);
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const load = useCallback(async () => {
    try { setData(await api<Summary>(`/products/${productId}/reviews`, { auth: false })); } catch { /* ignore */ }
  }, [productId]);

  useEffect(() => { load(); }, [load]);

  async function submit() {
    if (!isLoggedIn()) { router.push("/login"); return; }
    if (rating < 1) { setMsg("Please pick a star rating."); return; }
    setBusy(true); setMsg(null);
    try {
      await api(`/products/${productId}/reviews`, { method: "POST", body: { rating, title, body } });
      setTitle(""); setBody(""); setRating(0);
      setMsg("Thanks! Your review was posted.");
      await load();
    } catch (e) {
      setMsg((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const count = data?.count ?? 0;
  const avg = data?.average ?? 0;

  return (
    <section style={{ marginTop: 48, borderTop: "1px solid var(--color-border-default)", paddingTop: 28 }}>
      <h2 style={{ fontSize: 18, fontWeight: 800, color: "var(--color-text-primary)", marginBottom: 20 }}>
        Ratings &amp; Reviews
      </h2>

      <div style={{ display: "flex", gap: 40, flexWrap: "wrap", marginBottom: 28 }}>
        {/* Average */}
        <div style={{ textAlign: "center", minWidth: 120 }}>
          <div style={{ fontSize: 44, fontWeight: 800, color: "var(--color-text-primary)", lineHeight: 1 }}>
            {count ? avg.toFixed(1) : "—"}
          </div>
          <Stars value={avg} size={16} />
          <div style={{ fontSize: 13, color: "var(--color-text-muted)", marginTop: 4 }}>
            {count} review{count !== 1 ? "s" : ""}
          </div>
        </div>

        {/* Distribution */}
        <div style={{ flex: 1, minWidth: 220, display: "flex", flexDirection: "column", gap: 6, justifyContent: "center" }}>
          {[5, 4, 3, 2, 1].map((star) => {
            const n = data?.distribution?.[String(star)] ?? 0;
            const pct = count ? (n / count) * 100 : 0;
            return (
              <div key={star} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12 }}>
                <span style={{ width: 30, color: "var(--color-text-muted)" }}>{star} ★</span>
                <div style={{ flex: 1, height: 7, background: "var(--color-bg-muted)", borderRadius: 4, overflow: "hidden" }}>
                  <div style={{ width: `${pct}%`, height: "100%", background: "#f59e0b" }} />
                </div>
                <span style={{ width: 24, textAlign: "right", color: "var(--color-text-muted)" }}>{n}</span>
              </div>
            );
          })}
        </div>
      </div>

      {/* Write a review */}
      <div style={{ background: "var(--color-bg-muted)", borderRadius: "var(--radius-md)", padding: 18, marginBottom: 28 }}>
        <h3 style={{ fontSize: 14, fontWeight: 700, color: "var(--color-text-primary)", marginBottom: 10 }}>Write a review</h3>
        <div style={{ marginBottom: 10, fontSize: 26, cursor: "pointer", userSelect: "none" }}
             onMouseLeave={() => setHover(0)}>
          {[1, 2, 3, 4, 5].map((i) => (
            <span key={i}
              onMouseEnter={() => setHover(i)}
              onClick={() => setRating(i)}
              style={{ color: "#f59e0b", opacity: i <= (hover || rating) ? 1 : 0.25, paddingRight: 4 }}>★</span>
          ))}
        </div>
        <input
          value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Title (optional)"
          style={inputStyle}
        />
        <textarea
          value={body} onChange={(e) => setBody(e.target.value)} placeholder="Share your experience…" rows={3}
          style={{ ...inputStyle, resize: "vertical" }}
        />
        {msg && <p style={{ fontSize: 13, color: msg.startsWith("Thanks") ? "var(--color-success)" : "var(--color-danger)", margin: "6px 0" }}>{msg}</p>}
        <button onClick={submit} disabled={busy} style={{
          marginTop: 8, padding: "10px 22px", border: "none", borderRadius: "var(--radius-sm)",
          background: busy ? "var(--color-border-strong)" : "var(--color-accent-default)", color: "#fff",
          fontWeight: 700, fontSize: 14, cursor: busy ? "not-allowed" : "pointer", fontFamily: "inherit",
        }}>
          {busy ? "Posting…" : "Submit Review"}
        </button>
      </div>

      {/* List */}
      {count === 0 ? (
        <p style={{ color: "var(--color-text-muted)", fontSize: 14 }}>No reviews yet — be the first to review this product!</p>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
          {data!.reviews.map((r) => (
            <div key={r.id} style={{ borderBottom: "1px solid var(--color-border-default)", paddingBottom: 16 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 4, flexWrap: "wrap" }}>
                <Stars value={r.rating} />
                <span style={{ fontWeight: 700, fontSize: 14, color: "var(--color-text-primary)" }}>{r.title || ""}</span>
                {r.verified_purchase && (
                  <span style={{ fontSize: 11, fontWeight: 700, color: "var(--color-success)", background: "#f0fdf4", border: "1px solid #86efac", borderRadius: 999, padding: "1px 8px" }}>
                    ✓ Verified Purchase
                  </span>
                )}
              </div>
              {r.body && <p style={{ fontSize: 14, color: "var(--color-text-secondary)", marginBottom: 4 }}>{r.body}</p>}
              <p style={{ fontSize: 12, color: "var(--color-text-muted)" }}>
                {r.user_name} · {new Date(r.created_at).toLocaleDateString("en-IN")}
              </p>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

const inputStyle: React.CSSProperties = {
  width: "100%", padding: "9px 12px", marginBottom: 8,
  border: "1px solid var(--color-border-strong)", borderRadius: "var(--radius-sm)",
  background: "var(--color-bg-surface)", color: "var(--color-text-primary)",
  fontSize: 14, fontFamily: "inherit", outline: "none",
};
