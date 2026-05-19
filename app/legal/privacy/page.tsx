import { LegalPrivacyPage } from "@/components/legal-privacy-page";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Privacy Policy · Linksy",
  description: "How Linksy collects, uses, and stores your information and device preferences.",
};

export default function LegalPrivacyRoute() {
  return <LegalPrivacyPage />;
}
