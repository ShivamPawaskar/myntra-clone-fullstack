"use client";

import Link from "next/link";
import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState, Suspense } from "react";
import { useTheme } from "@/context/ThemeContext";
import { clearToken, isLoggedIn } from "@/lib/api";

const NAV_ITEMS = [
  { label: "MEN", href: "/?category=men" },
  { label: "WOMEN", href: "/?category=women" },
  { label: "KIDS", href: "/?category=kids" },
  { label: "FOOTWEAR", href: "/?q=footwear" },
  { label: "BEAUTY", href: "/?category=beauty" },
  { label: "ACCESSORIES", href: "/?category=accessories" },
  { label: "STUDIO", href: "/?q=ethnic", badge: "NEW" },
];

function SearchBarInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [query, setQuery] = useState(searchParams?.get("q") || "");

  function handleSearch(e: React.FormEvent) {
    e.preventDefault();
    const q = query.trim();
    if (q) router.push(`/?q=${encodeURIComponent(q)}`);
    else router.push("/");
  }

  return (
    <form onSubmit={handleSearch} style={{ flex: 1, maxWidth: 560, position: "relative" }}>
      <input
        type="search"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Search for products, brands and more"
        style={{
          width: "100%",
          height: 38,
          padding: "0 40px 0 16px",
          border: "none",
          borderRadius: "var(--radius-sm)",
          background: "var(--color-bg-muted)",
          color: "var(--color-text-primary)",
          fontSize: 13,
          fontFamily: "inherit",
          outline: "none",
        }}
      />
      <button
        type="submit"
        aria-label="Search"
        style={{
          position: "absolute",
          right: 10,
          top: "50%",
          transform: "translateY(-50%)",
          background: "none",
          border: "none",
          cursor: "pointer",
          color: "var(--color-text-muted)",
          padding: 4,
          display: "flex",
          alignItems: "center",
        }}
      >
        <SearchIcon />
      </button>
    </form>
  );
}

function SearchBar() {
  return (
    <Suspense fallback={<div style={{ flex: 1, maxWidth: 560, height: 38, background: "var(--color-bg-muted)", borderRadius: "var(--radius-sm)" }} />}>
      <SearchBarInner />
    </Suspense>
  );
}

export function Header() {
  const { toggleTheme, theme } = useTheme();
  const pathname = usePathname();
  const [loggedIn, setLoggedIn] = useState(false);
  const [cartCount, setCartCount] = useState(0);
  const [cartTick, setCartTick] = useState(0);
  const [wishlistOpen, setWishlistOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setLoggedIn(isLoggedIn());
    const authHandler = () => setLoggedIn(isLoggedIn());
    // A cart mutation (add / remove / checkout) bumps the badge immediately,
    // without waiting for a page navigation.
    const cartHandler = () => setCartTick((t) => t + 1);
    window.addEventListener("auth-changed", authHandler);
    window.addEventListener("cart-changed", cartHandler);
    return () => {
      window.removeEventListener("auth-changed", authHandler);
      window.removeEventListener("cart-changed", cartHandler);
    };
  }, []);

  useEffect(() => {
    if (!loggedIn) { setCartCount(0); return; }
    fetch(`${process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000"}/cart`, {
      headers: { Authorization: `Bearer ${typeof window !== "undefined" ? localStorage.getItem("myntra-clone-token") : ""}` },
    })
      .then((r) => r.json())
      .then((d) => setCartCount(d?.active?.length || 0))
      .catch(() => setCartCount(0));
  }, [loggedIn, pathname, cartTick]);

  function handleLogout() {
    clearToken();
    setLoggedIn(false);
    setCartCount(0);
  }

  return (
    <header
      style={{
        position: "sticky",
        top: 0,
        zIndex: 100,
        background: "var(--color-bg-surface)",
        boxShadow: "0 1px 4px var(--color-shadow-color)",
      }}
    >
      {/* Top row */}
      <div
        className="header-row"
        style={{
          maxWidth: 1440,
          margin: "0 auto",
          padding: "0 24px",
          height: 64,
          display: "flex",
          alignItems: "center",
          gap: 24,
        }}
      >
        {/* Logo */}
        <Link
          href="/"
          className="header-logo"
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            textDecoration: "none",
            flexShrink: 0,
            marginRight: 8,
          }}
        >
          <span
            style={{
              fontWeight: 900,
              fontSize: 28,
              letterSpacing: "-1px",
              color: "var(--color-accent-default)",
              lineHeight: 1,
              fontFamily: "Georgia, serif",
              fontStyle: "italic",
            }}
          >
            myntra
          </span>
        </Link>

        {/* Search */}
        <SearchBar />

        {/* Right icons */}
        <div className="header-icons" style={{ display: "flex", alignItems: "center", gap: 28, flexShrink: 0 }}>
          {/* Theme toggle */}
          <button
            onClick={toggleTheme}
            aria-label="Toggle theme"
            style={{
              background: "none",
              border: "none",
              cursor: "pointer",
              fontSize: 18,
              lineHeight: 1,
              padding: 4,
            }}
            title={theme === "light" ? "Dark mode" : "Light mode"}
          >
            {theme === "light" ? "🌙" : "☀️"}
          </button>

          {/* Profile */}
          <div style={{ position: "relative" }} ref={dropdownRef}>
            <button
              onClick={() => setWishlistOpen((o) => !o)}
              style={{ background: "none", border: "none", cursor: "pointer", display: "flex", flexDirection: "column", alignItems: "center", gap: 2 }}
            >
              <PersonIcon color={loggedIn ? "var(--color-accent-default)" : "var(--color-text-secondary)"} />
              <span style={{ fontSize: 11, color: "var(--color-text-secondary)", fontWeight: 500 }}>
                {loggedIn ? "Profile" : "Login"}
              </span>
            </button>
            {wishlistOpen && (
              <div
                style={{
                  position: "absolute",
                  top: "calc(100% + 8px)",
                  right: 0,
                  background: "var(--color-bg-surface)",
                  border: "1px solid var(--color-border-default)",
                  borderRadius: "var(--radius-md)",
                  boxShadow: "0 8px 24px var(--color-shadow-color)",
                  minWidth: 180,
                  padding: "8px 0",
                  zIndex: 200,
                  animation: "slideDown 0.15s ease",
                }}
              >
                {loggedIn ? (
                  <>
                    <DropItem href="/profile" label="My Profile" onClick={() => setWishlistOpen(false)} />
                    <DropItem href="/orders" label="My Orders" onClick={() => setWishlistOpen(false)} />
                    <DropItem href="/wishlist" label="Wishlist" onClick={() => setWishlistOpen(false)} />
                    <DropItem href="/recommendations" label="For You" onClick={() => setWishlistOpen(false)} />
                    <div style={{ borderTop: "1px solid var(--color-border-default)", margin: "8px 0" }} />
                    <button
                      onClick={() => { handleLogout(); setWishlistOpen(false); }}
                      style={{ width: "100%", textAlign: "left", padding: "10px 20px", fontSize: 14, color: "var(--color-danger)", fontFamily: "inherit", background: "none", border: "none", cursor: "pointer" }}
                    >
                      Logout
                    </button>
                  </>
                ) : (
                  <>
                    <div style={{ padding: "12px 20px 8px" }}>
                      <p style={{ fontSize: 13, color: "var(--color-text-muted)", marginBottom: 10 }}>
                        To access account
                      </p>
                      <Link
                        href="/login"
                        onClick={() => setWishlistOpen(false)}
                        style={{
                          display: "block",
                          textAlign: "center",
                          padding: "8px 16px",
                          border: "2px solid var(--color-accent-default)",
                          borderRadius: "var(--radius-sm)",
                          color: "var(--color-accent-default)",
                          fontWeight: 700,
                          fontSize: 13,
                          letterSpacing: 0.5,
                        }}
                      >
                        LOGIN / SIGNUP
                      </Link>
                    </div>
                    <div style={{ borderTop: "1px solid var(--color-border-default)", margin: "8px 0" }} />
                    <DropItem href="/orders" label="Orders" onClick={() => setWishlistOpen(false)} />
                    <DropItem href="/recommendations" label="For You" onClick={() => setWishlistOpen(false)} />
                  </>
                )}
              </div>
            )}
          </div>

          {/* Wishlist */}
          <Link href={loggedIn ? "/wishlist" : "/login"} style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 2, textDecoration: "none" }}>
            <HeartIcon />
            <span style={{ fontSize: 11, color: "var(--color-text-secondary)", fontWeight: 500 }}>Wishlist</span>
          </Link>

          {/* Bag */}
          <Link href="/cart" style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 2, textDecoration: "none", position: "relative" }}>
            <div style={{ position: "relative" }}>
              <BagIcon />
              {cartCount > 0 && (
                <span style={{
                  position: "absolute",
                  top: -6,
                  right: -8,
                  background: "var(--color-accent-default)",
                  color: "#fff",
                  borderRadius: "var(--radius-pill)",
                  fontSize: 10,
                  fontWeight: 700,
                  minWidth: 16,
                  height: 16,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  padding: "0 4px",
                }}>
                  {cartCount}
                </span>
              )}
            </div>
            <span style={{ fontSize: 11, color: "var(--color-text-secondary)", fontWeight: 500 }}>Bag</span>
          </Link>
        </div>
      </div>

      {/* Category nav */}
      <nav
        className="hide-mobile"
        style={{
          borderTop: "1px solid var(--color-border-default)",
          background: "var(--color-bg-surface)",
        }}
      >
        <div
          style={{
            maxWidth: 1440,
            margin: "0 auto",
            padding: "0 24px",
            display: "flex",
            alignItems: "center",
            gap: 0,
            overflowX: "auto",
          }}
        >
          {NAV_ITEMS.map((item) => (
            <Link
              key={item.label}
              href={item.href}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 4,
                padding: "10px 16px",
                fontSize: 13,
                fontWeight: 700,
                color: "var(--color-text-secondary)",
                letterSpacing: 0.3,
                whiteSpace: "nowrap",
                borderBottom: "2px solid transparent",
                transition: "color 0.15s, border-color 0.15s",
                textDecoration: "none",
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.color = "var(--color-accent-default)";
                e.currentTarget.style.borderBottomColor = "var(--color-accent-default)";
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.color = "var(--color-text-secondary)";
                e.currentTarget.style.borderBottomColor = "transparent";
              }}
            >
              {item.label}
              {item.badge && (
                <span style={{
                  background: "#ff3f6c",
                  color: "#fff",
                  fontSize: 8,
                  fontWeight: 800,
                  padding: "1px 4px",
                  borderRadius: 2,
                  letterSpacing: 0.5,
                }}>
                  {item.badge}
                </span>
              )}
            </Link>
          ))}
        </div>
      </nav>
    </header>
  );
}

function DropItem({ href, label, onClick }: { href: string; label: string; onClick: () => void }) {
  return (
    <Link
      href={href}
      onClick={onClick}
      style={{ display: "block", padding: "10px 20px", fontSize: 14, color: "var(--color-text-primary)", textDecoration: "none" }}
      onMouseEnter={(e) => { e.currentTarget.style.background = "var(--color-bg-muted)"; }}
      onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; }}
    >
      {label}
    </Link>
  );
}

function SearchIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" />
    </svg>
  );
}

function PersonIcon({ color }: { color: string }) {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" /><circle cx="12" cy="7" r="4" />
    </svg>
  );
}

function HeartIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="var(--color-text-secondary)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
    </svg>
  );
}

function BagIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="var(--color-text-secondary)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z" /><line x1="3" y1="6" x2="21" y2="6" /><path d="M16 10a4 4 0 0 1-8 0" />
    </svg>
  );
}
