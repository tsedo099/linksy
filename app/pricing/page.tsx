import { PricingScreen, type PricingPlan } from "@/components/pricing-screen";
import { listConfiguredPrices } from "@/lib/stripe";
import { absoluteUrl } from "@/lib/site-url";
import type { Metadata } from "next";

export const dynamic = "force-dynamic";

const TITLE = "Pricing";
const DESCRIPTION =
  "Compare Free, Pro, and Elite plans on Linksy — themed feeds, creator tools, and end-to-end encrypted DMs.";

export const metadata: Metadata = {
  title: TITLE,
  description: DESCRIPTION,
  alternates: { canonical: "/pricing" },
  openGraph: {
    type: "website",
    title: TITLE,
    description: DESCRIPTION,
    url: absoluteUrl("/pricing"),
    siteName: "Linksy",
  },
  twitter: {
    card: "summary_large_image",
    title: TITLE,
    description: DESCRIPTION,
  },
};

export default function PricingPage() {
  const plans: PricingPlan[] = listConfiguredPrices().map((p) => ({
    priceId: p.priceId,
    tier: p.tier,
    interval: p.interval,
    label: p.label,
  }));

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify({
            "@context": "https://schema.org",
            "@type": "PriceSpecification",
            url: absoluteUrl("/pricing"),
            name: "Linksy plans",
            offers: plans.map((plan) => ({
              "@type": "Offer",
              name: plan.label,
              category: plan.tier,
              priceSpecification: {
                "@type": "UnitPriceSpecification",
                billingDuration: plan.interval === "year" ? "P1Y" : "P1M",
              },
            })),
          }),
        }}
      />
      <PricingScreen plans={plans} />
    </>
  );
}
