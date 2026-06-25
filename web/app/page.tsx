"use client";

import { useEffect, useState, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { api } from "@/lib/api";
import { ProductGrid } from "@/components/ProductGrid";
import { HeroCarousel } from "@/components/HeroCarousel";
import { FilterSidebar } from "@/components/FilterSidebar";
import type { Product } from "@/components/ProductCard";

const CATEGORIES = [
  { label: "Ethnic Wear", discount: "50-80% OFF", img: "https://images.unsplash.com/photo-1610030469983-98e550d6193c?w=300&h=380&fit=crop&auto=format", href: "/?q=ethnic" },
  { label: "Men's Shirts", discount: "40-80% OFF", img: "https://images.unsplash.com/photo-1596755094514-f87e34085b2c?w=300&h=380&fit=crop&auto=format", href: "/?q=shirt" },
  { label: "T-Shirts", discount: "30-70% OFF", img: "https://images.unsplash.com/photo-1620012253295-c15cc3e65df4?w=300&h=380&fit=crop&auto=format", href: "/?q=t-shirt" },
  { label: "Dresses", discount: "30-70% OFF", img: "https://images.unsplash.com/photo-1572804013309-59a88b7e92f1?w=300&h=380&fit=crop&auto=format", href: "/?q=dress" },
  { label: "Kids Wear", discount: "40-80% OFF", img: "https://images.unsplash.com/photo-1519238263530-99bdd11df2ea?w=300&h=380&fit=crop&auto=format", href: "/?category=kids" },
  { label: "Sportswear", discount: "30-80% OFF", img: "https://images.unsplash.com/photo-1517838277536-f5f99be501cd?w=300&h=380&fit=crop&auto=format", href: "/?q=sports" },
  { label: "Sneakers", discount: "30-60% OFF", img: "https://images.unsplash.com/photo-1600185365926-3a2ce3cdb9eb?w=300&h=380&fit=crop&auto=format", href: "/?q=sneakers" },
  { label: "Footwear", discount: "UP TO 70% OFF", img: "https://images.unsplash.com/photo-1542291026-7eec264c27ff?w=300&h=380&fit=crop&auto=format", href: "/?q=footwear" },
  { label: "Watches", discount: "UP TO 80% OFF", img: "https://images.unsplash.com/photo-1523170335258-f5ed11844a49?w=300&h=380&fit=crop&auto=format", href: "/?q=watch" },
  { label: "Grooming", discount: "UP TO 60% OFF", img: "https://images.unsplash.com/photo-1556228578-8c89e6adf883?w=300&h=380&fit=crop&auto=format", href: "/?q=grooming" },
  { label: "Handbags", discount: "40-70% OFF", img: "https://images.unsplash.com/photo-1553062407-98eeb64c6a62?w=300&h=380&fit=crop&auto=format", href: "/?q=handbag" },
  { label: "Beauty & Makeup", discount: "UP TO 60% OFF", img: "https://images.unsplash.com/photo-1596462502278-27bfdc403348?w=300&h=380&fit=crop&auto=format", href: "/?q=beauty" },
];

const SORT_OPTIONS = [
  { label: "What's New", value: "" },
  { label: "Price: Low to High", value: "price_asc" },
  { label: "Price: High to Low", value: "price_desc" },
  { label: "Popularity", value: "popular" },
];

function HomeContent() {
  const searchParams = useSearchParams();
  const q = searchParams?.get("q") || "";
  const category = searchParams?.get("category") || "";

  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [sort, setSort] = useState("");

  // multi-select facet state (driven by the FilterSidebar)
  const [categoryIds, setCategoryIds] = useState<number[]>([]);
  const [brands, setBrands] = useState<string[]>([]);
  const [colors, setColors] = useState<string[]>([]);
  const [price, setPrice] = useState<[number, number] | null>(null);

  useEffect(() => {
    setLoading(true);
    setError(null);
    const params = new URLSearchParams();
    if (q) params.set("search", q);
    if (category) params.set("category", category);
    if (categoryIds.length) params.set("category_ids", categoryIds.join(","));
    if (brands.length) params.set("brands", brands.join(","));
    if (colors.length) params.set("colors", colors.join(","));
    if (price) { params.set("min_price", String(price[0])); params.set("max_price", String(price[1])); }
    if (sort) params.set("sort", sort);
    const qs = params.toString();
    // All filtering and sorting happens server-side (see products router).
    api<Product[]>(`/products${qs ? `?${qs}` : ""}`, { auth: false })
      .then((data) => setProducts(data || []))
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [q, category, sort, categoryIds, brands, colors, price]);

  // Reset facet selections when the search/section scope changes.
  useEffect(() => {
    setCategoryIds([]); setBrands([]); setColors([]); setPrice(null);
  }, [q, category]);

  const hasFilters = !!(categoryIds.length || brands.length || colors.length || price || sort);
  function clearFilters() { setCategoryIds([]); setBrands([]); setColors([]); setPrice(null); setSort(""); }

  const showCategories = !q && !category;

  return (
    <div>
      {/* Hero carousel + deals strip */}
      {showCategories && (
        <>
          <HeroCarousel />
          <div style={{ background: "var(--color-text-primary)", color: "var(--color-bg-surface)", padding: "10px 0", overflow: "hidden" }}>
            <div style={{ maxWidth: 1440, margin: "0 auto", padding: "0 24px", display: "flex", gap: 40, justifyContent: "center", flexWrap: "wrap", fontSize: 13, fontWeight: 600, letterSpacing: 0.5 }}>
              <span>🔥 BIGGEST DEALS ON TOP BRANDS</span>
              <span>•</span>
              <span>FREE SHIPPING OVER ₹799</span>
              <span>•</span>
              <span>EASY 14-DAY RETURNS</span>
            </div>
          </div>
        </>
      )}

      {/* Category grid */}
      {showCategories && (
        <section style={{ background: "var(--color-bg-surface)", padding: "32px 0 24px" }}>
          <div style={{ maxWidth: 1440, margin: "0 auto", padding: "0 24px" }}>
            <h2 style={{ fontSize: 20, fontWeight: 700, letterSpacing: 1, color: "var(--color-text-primary)", marginBottom: 20 }}>
              SHOP BY CATEGORY
            </h2>
            <div className="category-grid" style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fill, minmax(160px, 1fr))",
              gap: 16,
            }}>
              {CATEGORIES.map((cat) => (
                <CategoryCard key={cat.label} {...cat} />
              ))}
            </div>
          </div>
        </section>
      )}

      {/* Products section: filter sidebar + grid */}
      <div className="page-pad" style={{ maxWidth: 1440, margin: "0 auto", padding: "24px" }}>
        <div style={{ display: "flex", gap: 24, alignItems: "flex-start" }}>
          <FilterSidebar
            search={q}
            category={category}
            categoryIds={categoryIds} setCategoryIds={setCategoryIds}
            brands={brands} setBrands={setBrands}
            colors={colors} setColors={setColors}
            price={price} setPrice={setPrice}
          />

          <main style={{ flex: 1, minWidth: 0 }}>
            {/* Header row: title + sort */}
            <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 14, flexWrap: "wrap" }}>
              <h2 style={{ flex: 1, fontSize: 16, fontWeight: 700, color: "var(--color-text-primary)" }}>
                {q ? `Results for "${q}"` : category ? `${category.charAt(0).toUpperCase() + category.slice(1)} Store` : "All Products"}
                {!loading && <span style={{ fontWeight: 400, color: "var(--color-text-muted)", fontSize: 14, marginLeft: 8 }}>({products.length} items)</span>}
              </h2>
              <select
                value={sort}
                onChange={(e) => setSort(e.target.value)}
                style={{ padding: "7px 12px", border: "1px solid var(--color-border-default)", borderRadius: "var(--radius-sm)", fontSize: 13, background: "var(--color-bg-surface)", color: "var(--color-text-primary)", fontFamily: "inherit", cursor: "pointer" }}
              >
                {SORT_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            </div>

            {/* Active filter chips */}
            {hasFilters && (
              <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", marginBottom: 16 }}>
                {brands.map((b) => <FilterChip key={`b-${b}`} label={b} onRemove={() => setBrands(brands.filter((x) => x !== b))} />)}
                {colors.map((c) => <FilterChip key={`c-${c}`} label={c} onRemove={() => setColors(colors.filter((x) => x !== c))} />)}
                {categoryIds.length > 0 && <FilterChip label={`${categoryIds.length} categor${categoryIds.length > 1 ? "ies" : "y"}`} onRemove={() => setCategoryIds([])} />}
                {price && <FilterChip label={`₹${price[0].toLocaleString("en-IN")} – ₹${price[1].toLocaleString("en-IN")}`} onRemove={() => setPrice(null)} />}
                {sort && <FilterChip label={SORT_OPTIONS.find((o) => o.value === sort)?.label || sort} onRemove={() => setSort("")} />}
                <button onClick={clearFilters} style={{ background: "none", border: "none", color: "var(--color-accent-default)", fontSize: 13, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}>
                  Clear all
                </button>
              </div>
            )}

            {loading && <SkeletonGrid />}
            {error && <ErrorState message={error} />}
            {!loading && !error && products.length === 0 && (
              <div style={{ textAlign: "center", padding: 60, color: "var(--color-text-muted)" }}>
                <div style={{ fontSize: 48, marginBottom: 16 }}>🔍</div>
                <p style={{ fontSize: 18, fontWeight: 600, color: "var(--color-text-primary)" }}>No products found</p>
                <p style={{ marginTop: 8 }}>Try adjusting your filters</p>
                <button onClick={clearFilters} style={{ marginTop: 20, padding: "10px 24px", background: "var(--color-accent-default)", color: "#fff", border: "none", borderRadius: "var(--radius-sm)", fontWeight: 600, fontSize: 14, cursor: "pointer", fontFamily: "inherit" }}>
                  Clear filters
                </button>
              </div>
            )}
            {!loading && !error && products.length > 0 && <ProductGrid products={products} />}
          </main>
        </div>
      </div>
    </div>
  );
}

function FilterChip({ label, onRemove }: { label: string; onRemove: () => void }) {
  return (
    <span style={{
      display: "inline-flex", alignItems: "center", gap: 6, padding: "5px 10px",
      background: "var(--color-accent-subtle)", color: "var(--color-accent-default)",
      borderRadius: "var(--radius-pill)", fontSize: 12, fontWeight: 600,
    }}>
      {label}
      <button onClick={onRemove} aria-label={`Remove ${label} filter`} style={{ background: "none", border: "none", color: "var(--color-accent-default)", cursor: "pointer", fontSize: 14, lineHeight: 1, padding: 0 }}>×</button>
    </span>
  );
}

function CategoryCard({ label, discount, img, href }: { label: string; discount: string; img: string; href: string }) {
  const [hovered, setHovered] = useState(false);
  return (
    <Link
      href={href}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{ textDecoration: "none", display: "block" }}
    >
      <div style={{
        border: `2px solid ${hovered ? "var(--color-accent-default)" : "var(--color-border-default)"}`,
        borderRadius: "var(--radius-md)",
        overflow: "hidden",
        transition: "border-color 0.2s, box-shadow 0.2s",
        boxShadow: hovered ? "0 4px 16px var(--color-shadow-color)" : "none",
        background: "var(--color-bg-surface)",
      }}>
        <div style={{ aspectRatio: "3/4", overflow: "hidden", background: "var(--color-bg-muted)" }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={img}
            alt={label}
            style={{
              width: "100%",
              height: "100%",
              objectFit: "cover",
              transition: "transform 0.3s ease",
              transform: hovered ? "scale(1.06)" : "scale(1)",
            }}
          />
        </div>
        <div style={{ padding: "10px 12px", background: "#fff7f0" }}>
          <p style={{ fontSize: 13, fontWeight: 600, color: "#282c3f", marginBottom: 2 }}>{label}</p>
          <p style={{ fontSize: 13, fontWeight: 700, color: "#ff905a" }}>{discount}</p>
          <p style={{ fontSize: 12, color: "var(--color-accent-default)", fontWeight: 600, marginTop: 2 }}>Shop Now</p>
        </div>
      </div>
    </Link>
  );
}

function SkeletonGrid() {
  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))", gap: 16 }}>
      {Array.from({ length: 12 }).map((_, i) => (
        <div key={i} style={{
          borderRadius: "var(--radius-md)",
          overflow: "hidden",
          background: "var(--color-bg-surface)",
          boxShadow: "0 1px 4px var(--color-shadow-color)",
        }}>
          <div style={{ aspectRatio: "3/4", background: "var(--color-bg-muted)", animation: "pulse 1.4s ease-in-out infinite" }} />
          <div style={{ padding: "10px 12px" }}>
            <div style={{ height: 14, width: "60%", background: "var(--color-bg-muted)", borderRadius: 4, marginBottom: 8, animation: "pulse 1.4s ease-in-out infinite" }} />
            <div style={{ height: 12, width: "80%", background: "var(--color-bg-muted)", borderRadius: 4, marginBottom: 8, animation: "pulse 1.4s ease-in-out infinite" }} />
            <div style={{ height: 14, width: "40%", background: "var(--color-bg-muted)", borderRadius: 4, animation: "pulse 1.4s ease-in-out infinite" }} />
          </div>
        </div>
      ))}
    </div>
  );
}

function ErrorState({ message }: { message: string }) {
  return (
    <div style={{ padding: 60, textAlign: "center", color: "var(--color-text-muted)" }}>
      <div style={{ fontSize: 48, marginBottom: 16 }}>⚠️</div>
      <p style={{ fontWeight: 700, fontSize: 16, color: "var(--color-text-primary)", marginBottom: 8 }}>
        Couldn&apos;t load products
      </p>
      <p style={{ marginBottom: 8 }}>{message}</p>
      <p style={{ fontSize: 13 }}>Make sure the backend is running on http://localhost:8000</p>
    </div>
  );
}

export default function HomePage() {
  return (
    <Suspense fallback={<div style={{ padding: 60, textAlign: "center", color: "var(--color-text-muted)" }}>Loading…</div>}>
      <HomeContent />
    </Suspense>
  );
}
