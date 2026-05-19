"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";

function IcBack() {
  return (
    <svg width={17} height={17} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="m15 18-6-6 6-6" />
    </svg>
  );
}

type SubscriptionStatus =
  | "INCOMPLETE"
  | "INCOMPLETE_EXPIRED"
  | "TRIALING"
  | "ACTIVE"
  | "PAST_DUE"
  | "CANCELED"
  | "UNPAID"
  | "PAUSED";

interface MeUser {
  subscriptionTier?: string;
  subscriptionExpiresAt?: string | null;
  subscriptionStatus?: SubscriptionStatus | null;
  subscriptionCancelAtPeriodEnd?: boolean;
  subscriptionTrialEnd?: string | null;
  subscriptionPriceId?: string | null;
}

type Quota = {
  used: number;
  quota: number;
  tier: "FREE" | "PRO";
  allowed: boolean;
};

function resetsInLabel(now: Date = new Date()): string {
  const tomorrowUtc = Date.UTC(
    now.getUTCFullYear(),
    now.getUTCMonth(),
    now.getUTCDate() + 1,
  );
  const msLeft = tomorrowUtc - now.getTime();
  if (msLeft <= 0) return "<1m";
  const minutes = Math.floor(msLeft / 60_000);
  if (minutes < 60) return minutes < 1 ? "<1m" : `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  return `${hours}h`;
}

function formatTierLabel(tier: string) {
  return tier.charAt(0) + tier.slice(1).toLowerCase();
}

function describeStatus(status: SubscriptionStatus | null | undefined): string | null {
  if (!status) return null;
  switch (status) {
    case "ACTIVE":
      return "Active";
    case "TRIALING":
      return "Trial";
    case "PAST_DUE":
      return "Past due — update your payment method";
    case "UNPAID":
      return "Unpaid — last invoice failed";
    case "CANCELED":
      return "Cancelled";
    case "PAUSED":
      return "Paused";
    case "INCOMPLETE":
    case "INCOMPLETE_EXPIRED":
      return "Checkout not finished";
  }
}

export function BillingScreen() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [user, setUser] = useState<MeUser>({ subscriptionTier: "FREE" });
  const [portalBusy, setPortalBusy] = useState(false);
  const [portalMessage, setPortalMessage] = useState<string | null>(null);
  const [quota, setQuota] = useState<Quota | null>(null);
  // Re-render every 60s so the "Resets in Xh" copy stays current without
  // refetching the quota.
  const [, setTick] = useState(0);
  useEffect(() => {
    const id = window.setInterval(() => setTick((n) => n + 1), 60_000);
    return () => window.clearInterval(id);
  }, []);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch("/api/ai/quota", { credentials: "include" });
        if (!res.ok) return;
        const data = (await res.json().catch(() => null)) as { quota?: Quota } | null;
        if (!cancelled && data?.quota) setQuota(data.quota);
      } catch { /* ignore */ }
    })();
    return () => { cancelled = true; };
  }, []);

  const checkoutResult = useMemo(() => {
    const v = searchParams.get("checkout");
    if (v === "success") return "Subscription updated. Thanks for upgrading!";
    if (v === "cancelled") return "Checkout was cancelled — no charge was made.";
    return null;
  }, [searchParams]);

  const loadMe = useCallback(async () => {
    const response = await fetch("/api/auth/me");
    if (response.status === 401) {
      router.replace("/login");
      return;
    }
    const data = (await response.json().catch(() => null)) as { user?: MeUser } | null;
    if (data?.user) setUser(data.user);
  }, [router]);

  useEffect(() => {
    void loadMe();
  }, [loadMe]);

  const openPortal = useCallback(async () => {
    setPortalMessage(null);
    setPortalBusy(true);
    try {
      const response = await fetch("/api/billing/portal", { method: "POST" });
      const data = (await response.json().catch(() => null)) as { error?: string; url?: string } | null;

      if (!response.ok || !data?.url) {
        setPortalMessage(data?.error ?? "Could not open billing portal.");
        return;
      }

      window.location.href = data.url;
    } catch {
      setPortalMessage("Could not open billing portal.");
    } finally {
      setPortalBusy(false);
    }
  }, []);

  const tier = user.subscriptionTier ?? "FREE";
  const expiresAt = user.subscriptionExpiresAt ?? null;
  const status = user.subscriptionStatus ?? null;
  const cancelAtPeriodEnd = Boolean(user.subscriptionCancelAtPeriodEnd);
  const trialEnd = user.subscriptionTrialEnd ?? null;

  const renewCopy = expiresAt
    ? new Date(expiresAt).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" })
    : null;
  const trialCopy = trialEnd
    ? new Date(trialEnd).toLocaleString(undefined, { dateStyle: "medium" })
    : null;
  const statusCopy = describeStatus(status);

  return (
      <div className="legal-doc">
        <header className="legal-doc-head">
          <button
            type="button"
            className="legal-doc-back"
            onClick={() => router.push("/settings")}
            aria-label="Back to settings"
          >
            <IcBack />
          </button>
          <h1 className="legal-doc-title">Billing</h1>
        </header>

        <div className="legal-doc-body">
          <p className="legal-doc-meta">Subscription &amp; payments</p>

          {checkoutResult ? (
            <div className="legal-doc-card" role="status">
              <div className="legal-doc-card-inner">
                <p>{checkoutResult}</p>
              </div>
            </div>
          ) : null}

          <section className="legal-doc-section">
            <p className="legal-doc-label">Current plan</p>
            <div className="legal-doc-card">
              <div className="legal-doc-card-inner billing-plan-row">
                <span className="billing-tier-pill">{formatTierLabel(tier)}</span>
                {tier === "FREE" && !expiresAt ? (
                  <p className="billing-renewal billing-renewal--muted">You&apos;re on the free plan.</p>
                ) : (
                  <div>
                    {statusCopy ? <p className="billing-renewal">{statusCopy}</p> : null}
                    {trialCopy && status === "TRIALING" ? (
                      <p className="billing-renewal">Trial ends: {trialCopy}</p>
                    ) : null}
                    {renewCopy ? (
                      <p className="billing-renewal">
                        {cancelAtPeriodEnd ? "Ends" : "Renews"}: {renewCopy}
                      </p>
                    ) : (
                      <p className="billing-renewal billing-renewal--muted">
                        No paid renewal date on file.
                      </p>
                    )}
                  </div>
                )}
              </div>
            </div>
          </section>

          {quota ? (
            <section className="legal-doc-section">
              <p className="legal-doc-label">AI usage today</p>
              <div className="legal-doc-card">
                <div className="legal-doc-card-inner billing-quota-row">
                  <div className="billing-quota-meta">
                    <span className="billing-quota-count">
                      <strong>{quota.used}</strong>
                      <span className="billing-quota-divider">/</span>
                      <span>{quota.quota}</span>
                      <span className="billing-quota-tier">{quota.tier === "PRO" ? "Pro" : "Free"}</span>
                    </span>
                    <span className="billing-quota-reset">Resets in {resetsInLabel()} (00:00 UTC)</span>
                  </div>
                  <div className="billing-quota-bar" aria-hidden="true">
                    <div
                      className={`billing-quota-bar-fill${quota.used >= quota.quota ? " billing-quota-bar-fill--full" : ""}`}
                      style={{ width: `${Math.min(100, Math.round((quota.used / Math.max(1, quota.quota)) * 100))}%` }}
                    />
                  </div>
                  {quota.tier === "FREE" && (
                    <p className="billing-quota-hint">
                      Upgrade to Pro for {Math.round((500 / Math.max(1, quota.quota)) * 10) / 10}× more daily AI requests (500/day).
                    </p>
                  )}
                </div>
              </div>
            </section>
          ) : null}

          <section className="legal-doc-section">
            <p className="legal-doc-label">{tier === "FREE" ? "Upgrade" : "Change plan"}</p>
            <div className="legal-doc-card">
              <div className="legal-doc-card-inner">
                <p>See available plans and pricing tiers.</p>
                <div className="billing-actions">
                  <Link href="/pricing" className="auth-btn auth-btn--primary">
                    {tier === "FREE" ? "View plans" : "Compare plans"}
                  </Link>
                </div>
              </div>
            </div>
          </section>

          <section className="legal-doc-section">
            <p className="legal-doc-label">Manage</p>
            <div className="legal-doc-card">
              <div className="legal-doc-card-inner">
                <p>
                  Update payment method, download invoices, or cancel through the Stripe billing
                  portal.
                </p>
                <div className="billing-actions">
                  <button
                    type="button"
                    className="auth-btn"
                    onClick={() => void openPortal()}
                    disabled={portalBusy}
                  >
                    {portalBusy ? "Opening…" : "Manage billing"}
                  </button>
                </div>
                {portalMessage ? (
                  <p className="billing-portal-err" role="alert">
                    {portalMessage}
                  </p>
                ) : null}
              </div>
            </div>
          </section>

          <div className="legal-doc-foot">
            <Link href="/legal/terms" className="legal-doc-foot-link">
              Terms of Service
            </Link>
            <span className="legal-doc-meta" style={{ margin: "0 0.5rem" }}>
              ·
            </span>
            <Link href="/legal/privacy" className="legal-doc-foot-link">
              Privacy Policy
            </Link>
          </div>
        </div>
      </div>
  );
}
