"use client";

import { useEffect, useMemo, useState, useCallback } from "react";
import { api } from "@/lib/api";

type Facets = {
  categories: { id: number; name: string; count: number }[];
  brands: { name: string; count: number }[];
  colors: { name: string; count: number }[];
  price: { min: number; max: number };
};

const COLOR_HEX: Record<string, string> = {
  White: "#ffffff", Black: "#1a1a1a", Blue: "#2563eb", "Navy Blue": "#1e293b",
  Green: "#16a34a", Grey: "#6b7280", Red: "#b91c1c", Pink: "#ec4899",
  Yellow: "#eab308", Brown: "#92400e", Maroon: "#7f1d1d", Beige: "#d6ccae",
  Purple: "#7c3aed", Orange: "#ea580c",
};

type Props = {
  search: string;
  category: string;
  categoryIds: number[];
  setCategoryIds: (v: number[]) => void;
  brands: string[];
  setBrands: (v: string[]) => void;
  colors: string[];
  setColors: (v: string[]) => void;
  price: [number, number] | null;
  setPrice: (v: [number, number] | null) => void;
};

function toggle<T>(arr: T[], v: T): T[] {
  return arr.includes(v) ? arr.filter((x) => x !== v) : [...arr, v];
}

export function FilterSidebar(p: Props) {
  const [facets, setFacets] = useState<Facets | null>(null);
  const [brandQuery, setBrandQuery] = useState("");
  const [showAllBrands, setShowAllBrands] = useState(false);
  const [showAllColors, setShowAllColors] = useState(false);

  const loadFacets = useCallback(async () => {
    const qs = new URLSearchParams();
    if (p.search) qs.set("search", p.search);
    if (p.category) qs.set("category", p.category);
    try {
      setFacets(await api<Facets>(`/products/facets${qs.toString() ? `?${qs}` : ""}`, { auth: false }));
    } catch { setFacets(null); }
  }, [p.search, p.category]);

  useEffect(() => { loadFacets(); }, [loadFacets]);

  const filteredBrands = useMemo(() => {
    const list = facets?.brands ?? [];
    const q = brandQuery.trim().toLowerCase();
    return q ? list.filter((b) => b.name.toLowerCase().includes(q)) : list;
  }, [facets, brandQuery]);

  if (!facets) {
    return <aside style={{ width: 240, flexShrink: 0 }} />;
  }

  const visibleBrands = showAllBrands ? filteredBrands : filteredBrands.slice(0, 8);
  const visibleColors = showAllColors ? facets.colors : facets.colors.slice(0, 7);

  return (
    <aside style={{ width: 240, flexShrink: 0 }} className="filter-sidebar">
      {/* Categories */}
      {facets.categories.length > 0 && (
        <Section title="CATEGORIES">
          {facets.categories.map((c) => (
            <CheckRow
              key={c.id}
              checked={p.categoryIds.includes(c.id)}
              onToggle={() => p.setCategoryIds(toggle(p.categoryIds, c.id))}
              label={c.name}
              count={c.count}
            />
          ))}
        </Section>
      )}

      {/* Brand */}
      {facets.brands.length > 0 && (
        <Section title="BRAND">
          <input
            value={brandQuery}
            onChange={(e) => setBrandQuery(e.target.value)}
            placeholder="Search brand"
            style={searchInput}
          />
          {visibleBrands.map((b) => (
            <CheckRow
              key={b.name}
              checked={p.brands.includes(b.name)}
              onToggle={() => p.setBrands(toggle(p.brands, b.name))}
              label={b.name}
              count={b.count}
            />
          ))}
          {filteredBrands.length > 8 && (
            <ShowMore open={showAllBrands} count={filteredBrands.length - 8} onClick={() => setShowAllBrands((s) => !s)} />
          )}
        </Section>
      )}

      {/* Price */}
      <Section title="PRICE">
        <PriceSlider
          min={Math.floor(facets.price.min)}
          max={Math.ceil(facets.price.max)}
          value={p.price ?? [Math.floor(facets.price.min), Math.ceil(facets.price.max)]}
          onChange={(v) => p.setPrice(v)}
        />
      </Section>

      {/* Color */}
      {facets.colors.length > 0 && (
        <Section title="COLOR">
          {visibleColors.map((c) => (
            <div
              key={c.name}
              onClick={() => p.setColors(toggle(p.colors, c.name))}
              style={{ display: "flex", alignItems: "center", gap: 10, padding: "5px 0", cursor: "pointer" }}
            >
              <input type="checkbox" readOnly checked={p.colors.includes(c.name)} style={{ accentColor: "var(--color-accent-default)" }} />
              <span style={{
                width: 18, height: 18, borderRadius: "50%", flexShrink: 0,
                background: COLOR_HEX[c.name] || "#ccc",
                border: "1px solid var(--color-border-strong)",
              }} />
              <span style={{ fontSize: 14, color: "var(--color-text-primary)" }}>{c.name}</span>
              <span style={{ fontSize: 12, color: "var(--color-text-muted)" }}>({c.count})</span>
            </div>
          ))}
          {facets.colors.length > 7 && (
            <ShowMore open={showAllColors} count={facets.colors.length - 7} onClick={() => setShowAllColors((s) => !s)} />
          )}
        </Section>
      )}
    </aside>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ borderTop: "1px solid var(--color-border-default)", padding: "18px 0" }}>
      <h3 style={{ fontSize: 14, fontWeight: 700, color: "var(--color-text-primary)", marginBottom: 12, letterSpacing: 0.5 }}>{title}</h3>
      {children}
    </div>
  );
}

function CheckRow({ checked, onToggle, label, count }: { checked: boolean; onToggle: () => void; label: string; count: number }) {
  return (
    <label style={{ display: "flex", alignItems: "center", gap: 10, padding: "5px 0", cursor: "pointer" }}>
      <input type="checkbox" checked={checked} onChange={onToggle} style={{ accentColor: "var(--color-accent-default)" }} />
      <span style={{ fontSize: 14, color: "var(--color-text-primary)", flex: 1 }}>{label}</span>
      <span style={{ fontSize: 12, color: "var(--color-text-muted)" }}>({count})</span>
    </label>
  );
}

function ShowMore({ open, count, onClick }: { open: boolean; count: number; onClick: () => void }) {
  return (
    <button onClick={onClick} style={{ background: "none", border: "none", color: "var(--color-accent-default)", fontSize: 13, fontWeight: 700, cursor: "pointer", padding: "8px 0 0", fontFamily: "inherit" }}>
      {open ? "− Show less" : `+ ${count} more`}
    </button>
  );
}

function PriceSlider({ min, max, value, onChange }: { min: number; max: number; value: [number, number]; onChange: (v: [number, number]) => void }) {
  const [lo, hi] = value;
  const range = Math.max(1, max - min);
  const loPct = ((lo - min) / range) * 100;
  const hiPct = ((hi - min) / range) * 100;

  return (
    <div>
      <div style={{ position: "relative", height: 24 }}>
        <div style={{ position: "absolute", top: 11, left: 0, right: 0, height: 3, background: "var(--color-border-default)", borderRadius: 3 }} />
        <div style={{ position: "absolute", top: 11, left: `${loPct}%`, right: `${100 - hiPct}%`, height: 3, background: "var(--color-accent-default)", borderRadius: 3 }} />
        <input
          type="range" min={min} max={max} value={lo} className="price-range"
          onChange={(e) => onChange([Math.min(Number(e.target.value), hi - 1), hi])}
          style={rangeStyle}
        />
        <input
          type="range" min={min} max={max} value={hi} className="price-range"
          onChange={(e) => onChange([lo, Math.max(Number(e.target.value), lo + 1)])}
          style={rangeStyle}
        />
      </div>
      <div style={{ fontSize: 13, color: "var(--color-text-primary)", fontWeight: 600, marginTop: 6 }}>
        ₹{lo.toLocaleString("en-IN")} – ₹{hi.toLocaleString("en-IN")}{hi >= max ? "+" : ""}
      </div>
      <style>{`
        .price-range::-webkit-slider-thumb {
          pointer-events: auto; -webkit-appearance: none; appearance: none;
          width: 16px; height: 16px; border-radius: 50%; background: #fff;
          border: 2px solid var(--color-accent-default); cursor: pointer; margin-top: 0;
        }
        .price-range::-moz-range-thumb {
          pointer-events: auto; width: 16px; height: 16px; border-radius: 50%;
          background: #fff; border: 2px solid var(--color-accent-default); cursor: pointer;
        }
      `}</style>
    </div>
  );
}

const searchInput: React.CSSProperties = {
  width: "100%", padding: "7px 10px", marginBottom: 10,
  border: "1px solid var(--color-border-strong)", borderRadius: "var(--radius-sm)",
  background: "var(--color-bg-surface)", color: "var(--color-text-primary)",
  fontSize: 13, fontFamily: "inherit", outline: "none",
};
const rangeStyle: React.CSSProperties = {
  position: "absolute", top: 0, left: 0, width: "100%", height: 24,
  margin: 0, background: "none", pointerEvents: "none",
  WebkitAppearance: "none", appearance: "none",
};
