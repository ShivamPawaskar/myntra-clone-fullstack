"use client";

import { useEffect, useState, useCallback, Fragment } from "react";
import { api, getToken, BASE_URL } from "@/lib/api";

type Txn = {
  id: number;
  invoice_number: string;
  order_id: string;
  payment_mode: string;
  amount: number;
  currency: string;
  status: string;
  created_at: string;
  item_count?: number;
  items?: OrderItem[];
  discount?: number;
  coupon?: { code: string; discount: number } | null;
  tracking?: { current: number; stages: { label: string; at: string; done: boolean }[]; note?: string | null };
};

type OrderItem = {
  product_id: number;
  name: string;
  brand?: string;
  image_url?: string;
  quantity: number;
  unit_price: number;
  line_total: number;
};

type TxnPage = {
  items: Txn[];
  page: number;
  page_size: number;
  total: number;
  total_pages: number;
};

const STATUSES = ["", "success", "pending", "failed", "refunded"];

export default function OrdersPage() {
  const [data, setData] = useState<TxnPage | null>(null);
  const [page, setPage] = useState(1);
  const [status, setStatus] = useState("");
  const [sortDir, setSortDir] = useState<"desc" | "asc">("desc");
  const [needsAuth, setNeedsAuth] = useState(false);
  const [expanded, setExpanded] = useState<number | null>(null);

  const load = useCallback(async () => {
    if (!getToken()) {
      setNeedsAuth(true);
      return;
    }
    const qs = new URLSearchParams({
      page: String(page),
      page_size: "10",
      sort_dir: sortDir,
    });
    if (status) qs.set("status", status);
    const res = await api<TxnPage>(`/transactions?${qs.toString()}`);
    setData(res);
  }, [page, status, sortDir]);

  useEffect(() => {
    load();
  }, [load]);

  // CSV export streams from the server; we hit the endpoint with the auth
  // header via fetch and trigger a browser download from the blob.
  async function exportCsv() {
    const qs = status ? `?status=${status}` : "";
    const res = await fetch(`${BASE_URL}/transactions/export.csv${qs}`, {
      headers: { Authorization: `Bearer ${getToken()}` },
    });
    const blob = await res.blob();
    triggerDownload(blob, "transactions.csv");
  }

  async function downloadReceipt(txn: Txn) {
    const res = await fetch(`${BASE_URL}/transactions/${txn.id}/receipt.pdf`, {
      headers: { Authorization: `Bearer ${getToken()}` },
    });
    const blob = await res.blob();
    triggerDownload(blob, `${txn.invoice_number}.pdf`);
  }

  if (needsAuth)
    return <p style={{ color: "var(--color-text-muted)" }}>Log in to view your order history.</p>;

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "var(--space-lg)" }}>
        <h1 style={{ fontSize: 26, color: "var(--color-text-primary)" }}>Order history</h1>
        <button onClick={exportCsv} style={exportBtn}>Export CSV</button>
      </div>

      <div style={{ display: "flex", gap: "var(--space-md)", marginBottom: "var(--space-md)" }}>
        <select value={status} onChange={(e) => { setPage(1); setStatus(e.target.value); }} style={selectStyle}>
          {STATUSES.map((s) => (
            <option key={s} value={s}>{s ? s[0].toUpperCase() + s.slice(1) : "All statuses"}</option>
          ))}
        </select>
        <button onClick={() => setSortDir((d) => (d === "desc" ? "asc" : "desc"))} style={selectStyle}>
          Date {sortDir === "desc" ? "↓ newest" : "↑ oldest"}
        </button>
      </div>

      {!data ? (
        <p style={{ color: "var(--color-text-muted)" }}>Loading…</p>
      ) : data.items.length === 0 ? (
        <p style={{ color: "var(--color-text-muted)" }}>No transactions found.</p>
      ) : (
        <>
          <div style={{ overflowX: "auto", border: "1px solid var(--color-border-default)", borderRadius: "var(--radius-md)" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", background: "var(--color-bg-surface)" }}>
              <thead>
                <tr style={{ borderBottom: "1px solid var(--color-border-default)" }}>
                  {["Invoice", "Order", "Items", "Mode", "Amount", "Status", "Date", ""].map((h) => (
                    <th key={h} style={thStyle}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {data.items.map((t) => {
                  const hasItems = (t.items?.length ?? 0) > 0;
                  const isOpen = expanded === t.id;
                  return (
                  <Fragment key={t.id}>
                  <tr
                    onClick={() => hasItems && setExpanded(isOpen ? null : t.id)}
                    style={{ borderBottom: "1px solid var(--color-border-default)", cursor: hasItems ? "pointer" : "default" }}
                  >
                    <td style={tdStyle}>{t.invoice_number}</td>
                    <td style={tdStyle}>{t.order_id}</td>
                    <td style={tdStyle}>{hasItems ? `${t.item_count} ${isOpen ? "▲" : "▾"}` : (t.item_count ?? "—")}</td>
                    <td style={tdStyle}>{t.payment_mode}</td>
                    <td style={tdStyle}>₹{Math.round(Number(t.amount)).toLocaleString("en-IN")}</td>
                    <td style={tdStyle}><StatusBadge status={t.status} /></td>
                    <td style={tdStyle}>{new Date(t.created_at).toLocaleDateString("en-IN")}</td>
                    <td style={tdStyle}>
                      <button onClick={(e) => { e.stopPropagation(); downloadReceipt(t); }} style={linkBtn}>Receipt</button>
                    </td>
                  </tr>
                  {isOpen && hasItems && (
                    <tr>
                      <td colSpan={8} style={{ padding: "0 16px 16px", background: "var(--color-bg-muted)" }}>
                        <div style={{ display: "flex", flexDirection: "column", gap: 10, paddingTop: 12 }}>
                          {t.items!.map((it) => (
                            <div key={it.product_id} style={{ display: "flex", alignItems: "center", gap: 12 }}>
                              <div style={{ width: 44, height: 56, borderRadius: 6, overflow: "hidden", background: "var(--color-bg-surface)", flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center" }}>
                                {it.image_url
                                  // eslint-disable-next-line @next/next/no-img-element
                                  ? <img src={it.image_url} alt={it.name} style={{ width: "100%", height: "100%", objectFit: "cover" }} onError={(e) => { e.currentTarget.style.display = "none"; }} />
                                  : <span>👕</span>}
                              </div>
                              <div style={{ flex: 1, minWidth: 0 }}>
                                <div style={{ fontSize: 13, fontWeight: 600, color: "var(--color-text-primary)" }}>{it.brand}</div>
                                <div style={{ fontSize: 13, color: "var(--color-text-secondary)" }}>{it.name}</div>
                              </div>
                              <div style={{ fontSize: 13, color: "var(--color-text-muted)" }}>Qty {it.quantity}</div>
                              <div style={{ fontSize: 13, fontWeight: 600, color: "var(--color-text-primary)", minWidth: 72, textAlign: "right" }}>
                                ₹{Math.round(it.line_total).toLocaleString("en-IN")}
                              </div>
                            </div>
                          ))}
                          {t.coupon && (
                            <div style={{ fontSize: 12, color: "var(--color-success)", fontWeight: 600 }}>
                              🏷 Coupon {t.coupon.code} — saved ₹{Math.round(t.coupon.discount).toLocaleString("en-IN")}
                            </div>
                          )}
                          <TrackingTimeline tracking={t.tracking} />
                        </div>
                      </td>
                    </tr>
                  )}
                  </Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>

          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: "var(--space-md)" }}>
            <span style={{ color: "var(--color-text-muted)", fontSize: 14 }}>
              Page {data.page} of {data.total_pages} · {data.total} total
            </span>
            <div style={{ display: "flex", gap: 8 }}>
              <button disabled={page <= 1} onClick={() => setPage((p) => p - 1)} style={pageBtn(page <= 1)}>Prev</button>
              <button disabled={page >= data.total_pages} onClick={() => setPage((p) => p + 1)} style={pageBtn(page >= data.total_pages)}>Next</button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

function TrackingTimeline({ tracking }: { tracking?: Txn["tracking"] }) {
  if (!tracking) return null;
  if (tracking.note) {
    return <div style={{ fontSize: 13, color: "var(--color-text-muted)", paddingTop: 6 }}>{tracking.note}</div>;
  }
  const { stages, current } = tracking;
  return (
    <div style={{ paddingTop: 12 }}>
      <div style={{ fontSize: 12, fontWeight: 700, color: "var(--color-text-muted)", marginBottom: 10, letterSpacing: 0.3 }}>ORDER STATUS</div>
      <div style={{ display: "flex", alignItems: "flex-start" }}>
        {stages.map((s, i) => {
          const done = s.done;
          const isCurrent = i === current;
          return (
            <div key={s.label} style={{ flex: 1, position: "relative", textAlign: "center" }}>
              {i < stages.length - 1 && (
                <div style={{ position: "absolute", top: 9, left: "50%", width: "100%", height: 2, background: i < current ? "var(--color-success)" : "var(--color-border-default)" }} />
              )}
              <div style={{
                position: "relative", zIndex: 1, width: 20, height: 20, borderRadius: "50%", margin: "0 auto",
                background: done ? "var(--color-success)" : "var(--color-bg-surface)",
                border: `2px solid ${done ? "var(--color-success)" : "var(--color-border-strong)"}`,
                color: "#fff", fontSize: 11, lineHeight: "16px",
                boxShadow: isCurrent ? "0 0 0 4px var(--color-accent-subtle)" : "none",
              }}>{done ? "✓" : ""}</div>
              <div style={{ fontSize: 10.5, marginTop: 5, color: done ? "var(--color-text-primary)" : "var(--color-text-muted)", fontWeight: isCurrent ? 700 : 500, lineHeight: 1.2 }}>
                {s.label}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, string> = {
    success: "var(--color-success)",
    failed: "var(--color-danger)",
    refunded: "var(--color-warning)",
    pending: "var(--color-text-muted)",
  };
  return (
    <span style={{ color: map[status] || "var(--color-text-muted)", fontWeight: 600, fontSize: 13 }}>
      {status}
    </span>
  );
}

function triggerDownload(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

const thStyle: React.CSSProperties = {
  textAlign: "left", padding: "12px 16px", fontSize: 13, fontWeight: 600,
  color: "var(--color-text-muted)",
};
const tdStyle: React.CSSProperties = {
  padding: "12px 16px", fontSize: 14, color: "var(--color-text-primary)",
};
const selectStyle: React.CSSProperties = {
  padding: "8px 12px", borderRadius: "var(--radius-md)",
  border: "1px solid var(--color-border-strong)", background: "var(--color-bg-surface)",
  color: "var(--color-text-primary)", fontSize: 14,
};
const exportBtn: React.CSSProperties = {
  background: "var(--color-bg-surface)", color: "var(--color-text-primary)",
  border: "1px solid var(--color-border-strong)", borderRadius: "var(--radius-md)",
  padding: "10px 18px", fontWeight: 600, fontSize: 14,
};
const linkBtn: React.CSSProperties = {
  background: "none", border: "none", color: "var(--color-accent-default)",
  fontWeight: 600, fontSize: 14,
};
function pageBtn(disabled: boolean): React.CSSProperties {
  return {
    padding: "8px 16px", borderRadius: "var(--radius-md)",
    border: "1px solid var(--color-border-strong)",
    background: "var(--color-bg-surface)",
    color: disabled ? "var(--color-text-muted)" : "var(--color-text-primary)",
    fontWeight: 600, fontSize: 14, cursor: disabled ? "not-allowed" : "pointer",
  };
}
