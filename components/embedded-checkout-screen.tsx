"use client";

import { useEffect, useState } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { loadStripe, type Stripe as StripeJS } from "@stripe/stripe-js";
import { EmbeddedCheckoutProvider, EmbeddedCheckout } from "@stripe/react-stripe-js";

/**
 * In-app embedded Stripe Checkout. Mounts the Stripe-hosted form inline
 * (iframe + secure fields) so the user stays on `/settings/billing/checkout`
 * for the whole flow — no domain hop to `checkout.stripe.com`.
 *
 * Query param: `?priceId=price_…`. The server creates an embedded session
 * (`ui_mode: "embedded"`) and returns a `client_secret`, which Stripe's
 * `EmbeddedCheckoutProvider` consumes. PCI scope stays with Stripe — card
 * data never touches our origin.
 *
 * After payment Stripe redirects to the session's `return_url` (set by the
 * checkout API to `/settings/billing?checkout=success&session_id=…`).
 */
let stripePromise: Promise<StripeJS | null> | null = null;
function getStripePromise(): Promise<StripeJS | null> {
  if (!stripePromise) {
    const pk = process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY?.trim();
    if (!pk) {
      return Promise.resolve(null);
    }
    stripePromise = loadStripe(pk);
  }
  return stripePromise;
}

export function EmbeddedCheckoutScreen() {
  const router = useRouter();
  const params = useSearchParams();
  const priceId = params.get("priceId")?.trim() ?? "";

  const [clientSecret, setClientSecret] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    if (!priceId) {
      setError("Missing priceId in URL.");
      setLoading(false);
      return;
    }
    void (async () => {
      try {
        const res = await fetch("/api/billing/checkout", {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ priceId, uiMode: "embedded" }),
        });
        if (!res.ok) {
          const body = (await res.json().catch(() => null)) as { error?: string } | null;
          throw new Error(body?.error ?? `Could not start checkout (${res.status}).`);
        }
        const data = (await res.json()) as { clientSecret?: string };
        if (cancelled) return;
        if (!data.clientSecret) {
          throw new Error("Stripe did not return a client secret.");
        }
        setClientSecret(data.clientSecret);
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : "Checkout failed.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [priceId]);

  if (loading) {
    return (
      <div style={containerStyle}>
        <p style={statusStyle}>Loading checkout…</p>
      </div>
    );
  }

  if (error || !clientSecret) {
    return (
      <div style={containerStyle}>
        <div style={errorCardStyle} role="alert">
          <h2 style={{ margin: "0 0 .5rem", fontSize: 18, fontWeight: 700 }}>Checkout unavailable</h2>
          <p style={{ margin: "0 0 1rem", color: "var(--app-text-muted)" }}>{error ?? "Unknown error."}</p>
          <button
            type="button"
            className="primary-button"
            onClick={() => router.push("/pricing")}
          >
            Back to pricing
          </button>
        </div>
      </div>
    );
  }

  return (
    <div style={containerStyle}>
      <EmbeddedCheckoutProvider stripe={getStripePromise()} options={{ clientSecret }}>
        <EmbeddedCheckout />
      </EmbeddedCheckoutProvider>
    </div>
  );
}

const containerStyle = {
  maxWidth: 720,
  margin: "0 auto",
  padding: "2rem 1rem 4rem",
  minHeight: "100vh",
};
const statusStyle = {
  padding: "3rem 0",
  textAlign: "center" as const,
  color: "var(--app-text-muted)",
};
const errorCardStyle = {
  padding: "2rem",
  borderRadius: 14,
  background: "var(--app-card)",
  border: "1px solid var(--app-border)",
  textAlign: "center" as const,
};
