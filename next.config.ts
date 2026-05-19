import type { NextConfig } from "next";
import { withSentryConfig } from "@sentry/nextjs";
import createBundleAnalyzer from "@next/bundle-analyzer";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { getNextImageRemotePatterns } from "./lib/next-image-patterns";

const projectRoot = dirname(fileURLToPath(import.meta.url));

const withBundleAnalyzer = createBundleAnalyzer({
  enabled: process.env.ANALYZE === "true",
  openAnalyzer: false,
});

const securityHeaders = (): { key: string; value: string }[] => {
  const out: { key: string; value: string }[] = [
    {
      key: "X-DNS-Prefetch-Control",
      value: "on",
    },
    {
      key: "X-Content-Type-Options",
      value: "nosniff",
    },
    {
      key: "Referrer-Policy",
      value: "strict-origin-when-cross-origin",
    },
    {
      key: "X-Frame-Options",
      value: "DENY",
    },
    {
      key: "Permissions-Policy",
      value: "camera=(self), microphone=(self), geolocation=()",
    },
  ];

  if (process.env.NODE_ENV === "production") {
    out.unshift({
      key: "Strict-Transport-Security",
      value: "max-age=63072000; includeSubDomains; preload",
    });
  }

  return out;
};

const nextConfig: NextConfig = {
  output: "standalone",
  turbopack: {
    root: resolve(projectRoot),
  },
  images: {
    remotePatterns: getNextImageRemotePatterns(),
  },
  async headers() {
    return [
      {
        source: "/:path*",
        headers: securityHeaders(),
      },
    ];
  },
};

export default withSentryConfig(withBundleAnalyzer(nextConfig), {
  silent: true,
  org: process.env.SENTRY_ORG,
  project: process.env.SENTRY_PROJECT,
  // Required by the Sentry webpack plugin to upload source maps + create the
  // release. Missing token means the plugin no-ops the upload but still emits
  // the maps locally, so dev builds keep working without leaking the token.
  authToken: process.env.SENTRY_AUTH_TOKEN,
  release: {
    name: process.env.SENTRY_RELEASE,
    create: true,
    finalize: true,
    setCommits: { auto: true, ignoreMissing: true },
  },
  sourcemaps: {
    deleteSourcemapsAfterUpload: true,
  },
  widenClientFileUpload: true,
});
