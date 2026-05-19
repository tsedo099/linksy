"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useLanguagePreferences } from "@/components/language-provider";

const PRICING_STRINGS = {
  en: {
    back: "Back to home",
    title: "Pricing",
    subtitle: "Pick a plan that fits how you create.",
    cancelled: "Checkout was cancelled. You can try again anytime.",
    notConfiguredA: "Plans aren't configured yet. Set ",
    notConfiguredB: " (and friends) on the server to enable checkout.",
    availablePlans: "Available plans",
    billedYearly: "Billed yearly",
    billedMonthly: "Billed monthly",
    currentPlan: "Current plan",
    redirecting: "Redirecting…",
    subscribe: "Subscribe",
    networkError: "Network error. Please try again.",
    startError: "Could not start checkout. Please try again.",
    termsLink: "Terms of Service",
    privacyLink: "Privacy Policy",
  },
  mn: {
    back: "Нүүр хуудас руу буцах",
    title: "Үнэ",
    subtitle: "Танд тохирох төлөвлөгөөг сонгоно уу.",
    cancelled: "Төлбөр цуцлагдсан. Хүссэн үедээ дахин оролдоно уу.",
    notConfiguredA: "Төлөвлөгөө тохируулагдаагүй байна. Сервер дээр ",
    notConfiguredB: " (мөн адил) env-г тохируулна уу.",
    availablePlans: "Боломжтой төлөвлөгөө",
    billedYearly: "Жил тутам тооцоологдоно",
    billedMonthly: "Сар тутам тооцоологдоно",
    currentPlan: "Одоогийн төлөвлөгөө",
    redirecting: "Шилжүүлж байна…",
    subscribe: "Захиалах",
    networkError: "Сүлжээний алдаа. Дахин оролдоно уу.",
    startError: "Төлбөрийг эхлүүлэх боломжгүй. Дахин оролдоно уу.",
    termsLink: "Үйлчилгээний нөхцөл",
    privacyLink: "Нууцлалын бодлого",
  },
};

export interface PricingPlan {
  priceId: string;
  tier: "PRO" | "FREE";
  interval: "month" | "year";
  label: string;
}

interface Props {
  plans: PricingPlan[];
}

interface MeUser {
  subscriptionTier?: "FREE" | "PRO";
  subscriptionExpiresAt?: string | null;
}

type CheckoutStatus = "idle" | "loading" | "error";

export function PricingScreen({ plans }: Props) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { language } = useLanguagePreferences();
  const t = useMemo(() => (language === "mn" ? PRICING_STRINGS.mn : PRICING_STRINGS.en), [language]);
  const [me, setMe] = useState<MeUser | null>(null);
  const [pendingPriceId, setPendingPriceId] = useState<string | null>(null);
  const [status, setStatus] = useState<CheckoutStatus>("idle");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [authed, setAuthed] = useState<boolean | null>(null);

  const banner = useMemo(() => {
    const v = searchParams.get("checkout");
    if (v === "cancelled") return t.cancelled;
    return null;
  }, [searchParams, t]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch("/api/auth/me", { credentials: "include" });
        if (cancelled) return;
        if (res.status === 401) {
          setAuthed(false);
          return;
        }
        const data = (await res.json().catch(() => null)) as { user?: MeUser } | null;
        setMe(data?.user ?? null);
        setAuthed(Boolean(data?.user));
      } catch {
        if (!cancelled) setAuthed(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const startCheckout = useCallback(
    async (priceId: string) => {
      setErrorMessage(null);
      if (authed === false) {
        router.push(`/login?next=${encodeURIComponent("/pricing")}`);
        return;
      }
      setStatus("loading");
      setPendingPriceId(priceId);
      try {
        const res = await fetch("/api/billing/checkout", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({ priceId }),
        });
        const data = (await res.json().catch(() => null)) as { url?: string; error?: string } | null;
        if (!res.ok || !data?.url) {
          setStatus("error");
          setErrorMessage(data?.error ?? t.startError);
          setPendingPriceId(null);
          return;
        }
        window.location.href = data.url;
      } catch {
        setStatus("error");
        setErrorMessage(t.networkError);
        setPendingPriceId(null);
      }
    },
    [authed, router, t],
  );

  const currentTier = me?.subscriptionTier ?? "FREE";
  const noPlansConfigured = plans.length === 0;

  return (
    <main className="legal-doc">
      <header className="legal-doc-head">
        <Link href="/" className="legal-doc-back" aria-label={t.back}>
          ←
        </Link>
        <h1 className="legal-doc-title">{t.title}</h1>
      </header>

      <div className="legal-doc-body">
        <p className="legal-doc-meta">{t.subtitle}</p>

        {banner ? (
          <div className="legal-doc-card" role="status">
            <div className="legal-doc-card-inner">
              <p>{banner}</p>
            </div>
          </div>
        ) : null}

        {noPlansConfigured ? (
          <section className="legal-doc-section">
            <div className="legal-doc-card">
              <div className="legal-doc-card-inner">
                <p>
                  {t.notConfiguredA}
                  <code className="billing-code">STRIPE_PRICE_PRO_MONTHLY</code>
                  {t.notConfiguredB}
                </p>
              </div>
            </div>
          </section>
        ) : (
          <section className="legal-doc-section">
            <p className="legal-doc-label">{t.availablePlans}</p>
            <ul className="pricing-grid">
              {plans.map((plan) => {
                const isCurrent = currentTier === plan.tier;
                const isLoading = status === "loading" && pendingPriceId === plan.priceId;
                return (
                  <li key={plan.priceId} className="legal-doc-card">
                    <div className="legal-doc-card-inner">
                      <div className="pricing-card-head">
                        <span className="billing-tier-pill">{plan.tier}</span>
                        <span className="legal-doc-meta">
                          {plan.interval === "year" ? t.billedYearly : t.billedMonthly}
                        </span>
                      </div>
                      <p>{plan.label}</p>
                      <div className="billing-actions">
                        <button
                          type="button"
                          className="auth-btn auth-btn--primary"
                          onClick={() => void startCheckout(plan.priceId)}
                          disabled={isLoading || isCurrent}
                          aria-busy={isLoading}
                        >
                          {isCurrent ? t.currentPlan : isLoading ? t.redirecting : t.subscribe}
                        </button>
                      </div>
                    </div>
                  </li>
                );
              })}
            </ul>
          </section>
        )}

        {errorMessage ? (
          <p className="billing-portal-err" role="alert">
            {errorMessage}
          </p>
        ) : null}

        <div className="legal-doc-foot">
          <Link href="/legal/terms" className="legal-doc-foot-link">
            {t.termsLink}
          </Link>
          <span className="legal-doc-meta" style={{ margin: "0 0.5rem" }}>·</span>
          <Link href="/legal/privacy" className="legal-doc-foot-link">
            {t.privacyLink}
          </Link>
        </div>
      </div>
    </main>
  );
}
