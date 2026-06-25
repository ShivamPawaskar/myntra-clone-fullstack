"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { api, setToken } from "@/lib/api";
import { getLocalHistory, clearLocalHistory } from "@/lib/recentlyViewed";

export default function LoginPage() {
  const router = useRouter();
  const [mode, setMode] = useState<"login" | "register">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  function validate() {
    if (mode === "register" && !name.trim()) return "Please enter your name.";
    if (!email.trim() || !email.includes("@")) return "Please enter a valid email.";
    if (password.length < 6) return "Password must be at least 6 characters.";
    return null;
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const validationError = validate();
    if (validationError) { setError(validationError); return; }

    setBusy(true);
    setError(null);
    try {
      const path = mode === "login" ? "/auth/login" : "/auth/register";
      const body = mode === "login" ? { email, password } : { email, password, name };
      const res = await api<{ access_token: string; user?: { name: string } }>(path, { method: "POST", body, auth: false });
      setToken(res.access_token, res.user?.name);

      const local = getLocalHistory();
      if (local.length > 0) {
        await api("/recently-viewed/merge", { method: "POST", body: { local_history: local } }).catch(() => {});
        clearLocalHistory();
      }

      router.push("/");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div style={{
      minHeight: "calc(100vh - var(--header-height))",
      display: "flex",
      alignItems: "stretch",
    }}>
      {/* Left panel */}
      <div style={{
        flex: "0 0 45%",
        background: "linear-gradient(135deg, #ff3f6c 0%, #ff7043 100%)",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        padding: 48,
        color: "#fff",
      }}
        className="login-left-panel"
      >
        <div style={{ maxWidth: 320, textAlign: "center" }}>
          <h1 style={{ fontSize: 36, fontWeight: 900, letterSpacing: -1, fontFamily: "Georgia, serif", fontStyle: "italic", marginBottom: 16 }}>
            myntra
          </h1>
          <p style={{ fontSize: 18, fontWeight: 300, lineHeight: 1.6, opacity: 0.9 }}>
            Login to access your orders, wishlist and personalized recommendations
          </p>
          <div style={{ marginTop: 32, display: "flex", flexDirection: "column", gap: 12, opacity: 0.85 }}>
            {["✓ 10 lakh+ brands & products", "✓ 30-day easy returns", "✓ Secure checkout"].map((t) => (
              <p key={t} style={{ fontSize: 14, fontWeight: 500 }}>{t}</p>
            ))}
          </div>
        </div>
      </div>

      {/* Right panel */}
      <div style={{
        flex: 1,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 48,
        background: "var(--color-bg-surface)",
      }}>
        <div style={{ width: "100%", maxWidth: 400 }}>
          <h2 style={{ fontSize: 22, fontWeight: 700, color: "var(--color-text-primary)", marginBottom: 4 }}>
            {mode === "login" ? "Welcome back!" : "Create account"}
          </h2>
          <p style={{ color: "var(--color-text-muted)", fontSize: 14, marginBottom: 28 }}>
            {mode === "login" ? "Sign in to continue shopping" : "Join millions of fashion lovers"}
          </p>

          <form onSubmit={submit} style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            {mode === "register" && (
              <FormField
                label="Full Name"
                type="text"
                value={name}
                onChange={setName}
                placeholder="Your full name"
              />
            )}
            <FormField
              label="Email Address"
              type="email"
              value={email}
              onChange={setEmail}
              placeholder="name@example.com"
            />
            <FormField
              label="Password"
              type="password"
              value={password}
              onChange={setPassword}
              placeholder="Min. 6 characters"
            />

            {error && (
              <div style={{
                background: "var(--color-accent-subtle)",
                border: "1px solid var(--color-danger)",
                borderRadius: "var(--radius-sm)",
                padding: "10px 14px",
                color: "var(--color-danger)",
                fontSize: 13,
                fontWeight: 500,
              }}>
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={busy}
              style={{
                width: "100%",
                padding: "14px",
                background: busy ? "var(--color-border-strong)" : "var(--color-accent-default)",
                color: "#fff",
                border: "none",
                borderRadius: "var(--radius-sm)",
                fontSize: 15,
                fontWeight: 700,
                letterSpacing: 0.5,
                cursor: busy ? "not-allowed" : "pointer",
                transition: "background 0.2s",
                marginTop: 4,
              }}
            >
              {busy ? "Please wait…" : mode === "login" ? "LOGIN" : "CREATE ACCOUNT"}
            </button>
          </form>

          <div style={{ marginTop: 24, textAlign: "center" }}>
            <span style={{ color: "var(--color-text-muted)", fontSize: 14 }}>
              {mode === "login" ? "New to Myntra? " : "Already have an account? "}
            </span>
            <button
              onClick={() => { setMode(mode === "login" ? "register" : "login"); setError(null); }}
              style={{
                background: "none",
                border: "none",
                color: "var(--color-accent-default)",
                fontWeight: 700,
                fontSize: 14,
                cursor: "pointer",
                fontFamily: "inherit",
              }}
            >
              {mode === "login" ? "Create account" : "Log in"}
            </button>
          </div>

          <p style={{ marginTop: 24, textAlign: "center", fontSize: 12, color: "var(--color-text-muted)", lineHeight: 1.6 }}>
            By continuing, you agree to Myntra&apos;s{" "}
            <Link href="/" style={{ color: "var(--color-accent-default)" }}>Terms of Use</Link> and{" "}
            <Link href="/" style={{ color: "var(--color-accent-default)" }}>Privacy Policy</Link>
          </p>
        </div>
      </div>

      <style>{`
        @media (max-width: 768px) {
          .login-left-panel { display: none !important; }
        }
      `}</style>
    </div>
  );
}

function FormField({ label, type, value, onChange, placeholder }: {
  label: string; type: string; value: string; onChange: (v: string) => void; placeholder: string;
}) {
  return (
    <div>
      <label style={{ display: "block", fontSize: 12, fontWeight: 600, color: "var(--color-text-secondary)", marginBottom: 6, letterSpacing: 0.3 }}>
        {label}
      </label>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        required
        style={{
          width: "100%",
          padding: "11px 14px",
          border: "1px solid var(--color-border-strong)",
          borderRadius: "var(--radius-sm)",
          background: "var(--color-bg-surface)",
          color: "var(--color-text-primary)",
          fontSize: 14,
          fontFamily: "inherit",
          outline: "none",
          transition: "border-color 0.2s",
        }}
        onFocus={(e) => { e.currentTarget.style.borderColor = "var(--color-accent-default)"; }}
        onBlur={(e) => { e.currentTarget.style.borderColor = "var(--color-border-strong)"; }}
      />
    </div>
  );
}
