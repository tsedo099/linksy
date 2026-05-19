"use client";

import { useEffect, useRef, useState } from "react";
import { useFocusTrap } from "@/lib/use-focus-trap";

type Currency = "USD" | "EUR" | "GBP" | "JPY" | "MNT";

type TipDialogProps = {
  toUserId: string;
  toUsername: string;
  toDisplayName: string;
  onClose: () => void;
};

/** Preset amounts (in major units — converted to minor on submit). */
const PRESETS: Record<Currency, number[]> = {
  USD: [3, 5, 10, 25],
  EUR: [3, 5, 10, 25],
  GBP: [3, 5, 10, 25],
  JPY: [300, 500, 1000, 2500],
  MNT: [3000, 5000, 10000, 25000],
};

const ZERO_DECIMAL_CURRENCIES = new Set<Currency>(["JPY", "MNT"]);

function toMinorUnits(major: number, currency: Currency): number {
  if (!Number.isFinite(major) || major <= 0) return 0;
  return ZERO_DECIMAL_CURRENCIES.has(currency)
    ? Math.round(major)
    : Math.round(major * 100);
}

function formatMinor(amount: number, currency: Currency): string {
  const major = ZERO_DECIMAL_CURRENCIES.has(currency) ? amount : amount / 100;
  try {
    return new Intl.NumberFormat(undefined, { style: "currency", currency }).format(major);
  } catch {
    return `${major} ${currency}`;
  }
}

export function TipDialog({ toUserId, toUsername, toDisplayName, onClose }: TipDialogProps) {
  const [currency, setCurrency] = useState<Currency>("USD");
  const [amountMajor, setAmountMajor] = useState<number>(PRESETS.USD[1] ?? 0);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const ref = useRef<HTMLDivElement>(null);
  useFocusTrap(true, ref);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  // Reset preset when currency switches so we don't end up with $3000.
  useEffect(() => {
    setAmountMajor(PRESETS[currency][1] ?? 0);
  }, [currency]);

  const amountMinor = toMinorUnits(amountMajor, currency);
  const canSubmit = !busy && amountMinor >= 50 && amountMinor <= 50_000_00;

  async function submit() {
    if (!canSubmit) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/tips", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          toUserId,
          amount: amountMinor,
          currency,
          message: message.trim() ? message.trim() : undefined,
        }),
      });
      const data = (await res.json().catch(() => null)) as { url?: string; error?: string } | null;
      if (!res.ok || !data?.url) {
        throw new Error(data?.error ?? "Could not start payment.");
      }
      // Hand off to Stripe-hosted Checkout. Intentional full-page nav —
      // React Compiler flags `window.location.href =` as immutable; the
      // assignment is the navigation side-effect itself, not a reactive
      // state change, so we use `assign()` (same effect, lint-clean).
      window.location.assign(data.url);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not start payment.");
      setBusy(false);
    }
  }

  return (
    <div
      role="presentation"
      onClick={onClose}
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.6)",
        zIndex: 200,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "1rem",
      }}
    >
      <div
        ref={ref}
        role="dialog"
        aria-modal="true"
        aria-label={`Send a tip to ${toDisplayName}`}
        onClick={(e) => e.stopPropagation()}
        style={{
          width: "100%",
          maxWidth: 420,
          background: "var(--app-card)",
          borderRadius: 16,
          border: "1px solid var(--app-border)",
          padding: "1.4rem 1.5rem",
          color: "var(--text)",
        }}
      >
        <header style={{ display: "flex", justifyContent: "space-between", marginBottom: ".8rem" }}>
          <strong style={{ fontSize: "1.05rem" }}>Send a tip</strong>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            style={{ background: "transparent", border: "none", color: "var(--muted)", cursor: "pointer", fontSize: "1.1rem" }}
          >
            ×
          </button>
        </header>

        <p style={{ margin: "0 0 1rem", color: "var(--muted)", fontSize: ".88rem" }}>
          Tip <strong style={{ color: "var(--text)" }}>{toDisplayName}</strong> @{toUsername}
        </p>

        <label style={{ display: "block", fontSize: ".72rem", textTransform: "uppercase", letterSpacing: ".05em", color: "var(--muted)", marginBottom: ".35rem" }}>
          Currency
        </label>
        <select
          value={currency}
          onChange={(e) => setCurrency(e.target.value as Currency)}
          style={{
            width: "100%",
            padding: ".55rem .7rem",
            borderRadius: 10,
            background: "var(--app-card-soft, var(--app-background))",
            border: "1px solid var(--app-border)",
            color: "var(--text)",
            marginBottom: ".9rem",
            font: "inherit",
          }}
        >
          <option value="USD">USD ($)</option>
          <option value="EUR">EUR (€)</option>
          <option value="GBP">GBP (£)</option>
          <option value="JPY">JPY (¥)</option>
          <option value="MNT">MNT (₮)</option>
        </select>

        <label style={{ display: "block", fontSize: ".72rem", textTransform: "uppercase", letterSpacing: ".05em", color: "var(--muted)", marginBottom: ".35rem" }}>
          Amount
        </label>
        <div style={{ display: "flex", gap: ".4rem", marginBottom: ".5rem", flexWrap: "wrap" }}>
          {PRESETS[currency].map((value) => (
            <button
              key={value}
              type="button"
              onClick={() => setAmountMajor(value)}
              style={{
                flex: "1 0 auto",
                padding: ".55rem .7rem",
                borderRadius: 999,
                border: amountMajor === value
                  ? "1px solid var(--app-accent, #7c3aed)"
                  : "1px solid var(--app-border)",
                background: amountMajor === value
                  ? "rgba(124, 58, 237, .14)"
                  : "var(--app-card-soft, var(--app-background))",
                color: "var(--text)",
                fontWeight: 700,
                cursor: "pointer",
              }}
            >
              {formatMinor(toMinorUnits(value, currency), currency)}
            </button>
          ))}
        </div>
        <input
          type="number"
          min={ZERO_DECIMAL_CURRENCIES.has(currency) ? "50" : "0.50"}
          max={ZERO_DECIMAL_CURRENCIES.has(currency) ? "5000000" : "50000"}
          step={ZERO_DECIMAL_CURRENCIES.has(currency) ? "1" : "0.01"}
          value={amountMajor}
          onChange={(e) => setAmountMajor(Number(e.target.value) || 0)}
          placeholder="Custom amount"
          style={{
            width: "100%",
            padding: ".55rem .7rem",
            borderRadius: 10,
            background: "var(--app-card-soft, var(--app-background))",
            border: "1px solid var(--app-border)",
            color: "var(--text)",
            marginBottom: ".9rem",
            font: "inherit",
          }}
        />

        <label style={{ display: "block", fontSize: ".72rem", textTransform: "uppercase", letterSpacing: ".05em", color: "var(--muted)", marginBottom: ".35rem" }}>
          Message (optional)
        </label>
        <textarea
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          maxLength={200}
          rows={2}
          placeholder="Add a short note…"
          style={{
            width: "100%",
            padding: ".55rem .7rem",
            borderRadius: 10,
            background: "var(--app-card-soft, var(--app-background))",
            border: "1px solid var(--app-border)",
            color: "var(--text)",
            font: "inherit",
            resize: "vertical",
            marginBottom: ".5rem",
          }}
        />
        <p style={{ margin: "0 0 .9rem", color: "var(--muted)", fontSize: ".72rem", textAlign: "right" }}>
          {message.length}/200
        </p>

        {error ? (
          <p style={{ color: "#fca5a5", fontSize: ".84rem", margin: "0 0 .8rem" }}>{error}</p>
        ) : null}

        <button
          type="button"
          onClick={submit}
          disabled={!canSubmit}
          style={{
            width: "100%",
            padding: ".75rem",
            borderRadius: 12,
            border: "none",
            background: canSubmit
              ? "linear-gradient(135deg, #a855f7, #06b6d4)"
              : "rgba(255,255,255,0.08)",
            color: "#fff",
            fontWeight: 700,
            cursor: canSubmit ? "pointer" : "not-allowed",
            fontSize: ".95rem",
          }}
        >
          {busy ? "Opening Stripe…" : `Tip ${formatMinor(amountMinor, currency)}`}
        </button>
        <p style={{ marginTop: ".7rem", color: "var(--muted)", fontSize: ".72rem", textAlign: "center" }}>
          Secure payment on Stripe. You&apos;ll be redirected.
        </p>
      </div>
    </div>
  );
}
