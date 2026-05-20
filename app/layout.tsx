import { ClientErrorBoundary } from "@/components/client-error-boundary";
import { CookieConsentBanner } from "@/components/cookie-consent-banner";
import { CsrfFetchBridge } from "@/components/csrf-fetch-bridge";
import { LanguageProvider } from "@/components/language-provider";
import { PasswordHealthBanner } from "@/components/password-health-banner";
import { SentryUserContext } from "@/components/sentry-user-context";
import { ServiceWorkerRegister } from "@/components/service-worker-register";
import { ThemeProvider } from "@/components/theme-provider";
import { ConfirmProvider } from "@/components/confirm-dialog";
import { WebVitalsReporter } from "@/components/web-vitals-reporter";
import {
  DEFAULT_LANGUAGE,
  LANGUAGE_BOOTSTRAP_SCRIPT,
  LANGUAGE_COOKIE_NAME,
  isRtlAppLanguage,
  readAppLanguageFromAcceptHeader,
  readAppLanguageFromCookieValue,
  type AppLanguage,
} from "@/lib/language";
import { THEME_BOOTSTRAP_SCRIPT } from "@/lib/theme";
import { SITE_METADATA_BASE } from "@/lib/site-url";
import { cookies, headers } from "next/headers";
import type { Metadata, Viewport } from "next";
import Script from "next/script";
// Order matters: Tailwind layer must come first so its `@layer base` resets
// merge with our existing token + reset CSS. `globals.css` then layers on
// the legacy custom-classname styles. See PROJECT_GAPS_AUDIT.md §12.
import "./styles/tailwind.css";
import "./globals.css";

/**
 * Resolve the initial `<html lang>` server-side so crawlers + the first paint
 * advertise the correct language (cookie set by `LANGUAGE_BOOTSTRAP_SCRIPT`,
 * falls back to `Accept-Language`, then `en`).
 */
async function resolveInitialLanguage(): Promise<AppLanguage> {
  try {
    const cookieStore = await cookies();
    const fromCookie = readAppLanguageFromCookieValue(cookieStore.get(LANGUAGE_COOKIE_NAME)?.value);
    if (fromCookie) return fromCookie;
  } catch {
    // `cookies()` throws outside a request scope (e.g. some build paths) —
    // fall through to header/default.
  }
  try {
    const headerStore = await headers();
    const fromHeader = readAppLanguageFromAcceptHeader(headerStore.get("accept-language"));
    if (fromHeader) return fromHeader;
  } catch {
    // ignore
  }
  return DEFAULT_LANGUAGE;
}

const DEFAULT_SHARE_IMAGE = "/psda.png";
const DEFAULT_DESCRIPTION = "A modern social media web app with personalized themes.";

export const metadata: Metadata = {
  metadataBase: SITE_METADATA_BASE,
  title: { default: "Linksy", template: "%s · Linksy" },
  description: DEFAULT_DESCRIPTION,
  manifest: "/manifest.json",
  applicationName: "Linksy",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "Linksy",
  },
  icons: {
    icon: [{ url: "/psda.png", type: "image/png" }],
    apple: [{ url: "/psda.png", type: "image/png" }],
  },
  // Defaults — per-route `generateMetadata` overrides any field it touches.
  openGraph: {
    type: "website",
    siteName: "Linksy",
    title: "Linksy",
    description: DEFAULT_DESCRIPTION,
    images: [DEFAULT_SHARE_IMAGE],
    locale: "en",
  },
  twitter: {
    card: "summary_large_image",
    title: "Linksy",
    description: DEFAULT_DESCRIPTION,
    images: [DEFAULT_SHARE_IMAGE],
  },
  robots: { index: true, follow: true },
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: dark)", color: "#05030b" },
    { media: "(prefers-color-scheme: light)", color: "#7c3aed" },
  ],
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const initialLanguage = await resolveInitialLanguage();
  const dir = isRtlAppLanguage(initialLanguage) ? "rtl" : "ltr";
  return (
    <html
      lang={initialLanguage}
      dir={dir}
      data-theme="dark"
      data-accent="purple"
      data-font-scale="medium"
      data-motion-pref="system"
      data-motion="full"
      data-language={initialLanguage}
      suppressHydrationWarning
    >
      <head>
        <Script id="language-bootstrap" strategy="beforeInteractive" dangerouslySetInnerHTML={{ __html: LANGUAGE_BOOTSTRAP_SCRIPT }} />
        <Script id="theme-bootstrap" strategy="beforeInteractive" dangerouslySetInnerHTML={{ __html: THEME_BOOTSTRAP_SCRIPT }} />
      </head>
      <body>
        <ThemeProvider>
          <LanguageProvider>
            <ConfirmProvider>
              <CsrfFetchBridge />
              <SentryUserContext />
              <ClientErrorBoundary scope="app.shell">
                {children}
              </ClientErrorBoundary>
              <PasswordHealthBanner />
              <CookieConsentBanner />
              <ServiceWorkerRegister />
              <WebVitalsReporter />
            </ConfirmProvider>
          </LanguageProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
