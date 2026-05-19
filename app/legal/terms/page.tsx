import { LegalTermsPage } from "@/components/legal-terms-page";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Terms of Service · Linksy",
  description: "Rules and conditions for using the Linksy platform.",
};

export default function LegalTermsRoute() {
  return <LegalTermsPage />;
}
