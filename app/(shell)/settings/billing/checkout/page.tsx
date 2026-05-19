import type { Metadata } from "next";
import { EmbeddedCheckoutScreen } from "@/components/embedded-checkout-screen";

export const metadata: Metadata = {
  title: "Checkout",
  robots: { index: false, follow: false },
};

/**
 * In-app embedded checkout page. Reached from the pricing page with
 * `?priceId=price_…&uiMode=embedded` (or by linking here directly).
 *
 * Server-side guard is unnecessary because the API endpoint
 * `/api/billing/checkout` already requires authentication — an unauthenticated
 * visit just sees the "Checkout unavailable" card.
 */
export default function EmbeddedCheckoutPage() {
  return <EmbeddedCheckoutScreen />;
}
