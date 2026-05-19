import { LoginScreen } from "@/components/login-screen";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Sign in",
  description: "Sign in to your Linksy account.",
  // Login pages are dead-ends for SEO and waste crawl budget. Keep them out.
  robots: { index: false, follow: false },
};

export default function LoginPage() {
  return <LoginScreen />;
}
