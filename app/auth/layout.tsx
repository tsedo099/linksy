import type { Metadata } from "next";

/**
 * `app/auth/*` covers forgot-password / reset / verify-email pages. All of
 * them are session-gated dead-ends for crawlers (links contain expiring
 * tokens), so we mark the whole subtree `noindex` once at the layout layer
 * instead of repeating it on every leaf page.
 */
export const metadata: Metadata = {
  robots: { index: false, follow: false },
};

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return children;
}
