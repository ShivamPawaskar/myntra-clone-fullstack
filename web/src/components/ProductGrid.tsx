"use client";

import { ProductCard, type Product } from "./ProductCard";

export function ProductGrid({
  products,
  allWishlisted = false,
}: {
  products: Product[];
  allWishlisted?: boolean;
}) {
  return (
    <div
      className="product-grid"
      style={{
        display: "grid",
        gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))",
        gap: "var(--space-md)",
      }}
    >
      {products.map((p) => (
        <ProductCard key={p.id} product={p} initialWishlisted={allWishlisted} />
      ))}
    </div>
  );
}
