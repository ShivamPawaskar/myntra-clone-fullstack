"use client";

import Link from "next/link";

const COLUMNS = [
  {
    title: "ONLINE SHOPPING",
    links: ["Men", "Women", "Kids", "Home & Living", "Beauty", "Gift Cards", "Myntra Insider"],
  },
  {
    title: "CUSTOMER POLICIES",
    links: ["Contact Us", "FAQ", "T&C", "Terms Of Use", "Track Orders", "Shipping", "Cancellation", "Returns"],
  },
  {
    title: "USEFUL LINKS",
    links: ["Blog", "Careers", "Site Map", "Corporate Information", "Whitehat", "Cleartrip"],
  },
];

export function Footer() {
  return (
    <footer style={{ background: "var(--color-bg-surface)", borderTop: "1px solid var(--color-border-default)", marginTop: 40 }}>
      <div style={{ maxWidth: 1440, margin: "0 auto", padding: "40px 24px" }}>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 32 }}>
          {COLUMNS.map((col) => (
            <div key={col.title}>
              <h4 style={{ fontSize: 13, fontWeight: 700, letterSpacing: 0.5, color: "var(--color-text-muted)", marginBottom: 16 }}>
                {col.title}
              </h4>
              <ul style={{ listStyle: "none", display: "flex", flexDirection: "column", gap: 10 }}>
                {col.links.map((link) => (
                  <li key={link}>
                    <Link href="/" style={{ fontSize: 13, color: "var(--color-text-secondary)" }}>
                      {link}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}

          {/* App + Social */}
          <div>
            <h4 style={{ fontSize: 13, fontWeight: 700, letterSpacing: 0.5, color: "var(--color-text-muted)", marginBottom: 16 }}>
              EXPERIENCE MYNTRA APP
            </h4>
            <div style={{ display: "flex", gap: 10, marginBottom: 20 }}>
              <div style={{ padding: "8px 12px", background: "var(--color-bg-muted)", borderRadius: "var(--radius-sm)", fontSize: 12, fontWeight: 600, color: "var(--color-text-secondary)" }}>
                📱 Google Play
              </div>
              <div style={{ padding: "8px 12px", background: "var(--color-bg-muted)", borderRadius: "var(--radius-sm)", fontSize: 12, fontWeight: 600, color: "var(--color-text-secondary)" }}>
                🍎 App Store
              </div>
            </div>
            <h4 style={{ fontSize: 13, fontWeight: 700, letterSpacing: 0.5, color: "var(--color-text-muted)", marginBottom: 12 }}>
              KEEP IN TOUCH
            </h4>
            <div style={{ display: "flex", gap: 14, fontSize: 20 }}>
              <span>📘</span><span>📷</span><span>🐦</span><span>▶️</span>
            </div>
          </div>
        </div>

        {/* Trust badges */}
        <div style={{ display: "flex", gap: 32, paddingTop: 32, marginTop: 32, borderTop: "1px solid var(--color-border-default)", flexWrap: "wrap" }}>
          {[
            { icon: "✓", title: "100% ORIGINAL", sub: "guarantee for all products" },
            { icon: "↩", title: "Return within 14 days", sub: "of receiving your order" },
            { icon: "🚚", title: "Free Delivery", sub: "on orders above ₹799" },
          ].map((b) => (
            <div key={b.title} style={{ display: "flex", alignItems: "center", gap: 12 }}>
              <span style={{ fontSize: 24 }}>{b.icon}</span>
              <div>
                <div style={{ fontSize: 13, fontWeight: 700, color: "var(--color-text-primary)" }}>{b.title}</div>
                <div style={{ fontSize: 12, color: "var(--color-text-muted)" }}>{b.sub}</div>
              </div>
            </div>
          ))}
        </div>

        <p style={{ marginTop: 32, fontSize: 12, color: "var(--color-text-muted)", textAlign: "center" }}>
          © 2026 www.myntra-clone.com. A demo project — not affiliated with Myntra.
        </p>
      </div>
    </footer>
  );
}
