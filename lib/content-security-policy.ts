export type ContentSecurityPolicyOptions = {
  nonce?: string;
  reportOnly?: boolean;
  includeVercelLive?: boolean;
};

function uniq(list: string[]) {
  return [...new Set(list)];
}

/**
 * CSP tuned for Next.js App Router + @sentry/nextjs + Google Maps embed ({@see PostLocationMap}).
 * Dev: lax connect-src so HMR / Turbopack websockets work.
 */
export function buildAppContentSecurityPolicy(opts: ContentSecurityPolicyOptions = {}): string {
  const isProd = process.env.NODE_ENV === "production";
  const nonceSource = opts.nonce ? `'nonce-${opts.nonce}'` : null;

  const scriptPieces = isProd
    ? ["'self'", ...(nonceSource ? [nonceSource] : [])]
    : ["'self'", "'unsafe-inline'", "'unsafe-eval'"];
  const stylePieces = isProd
    ? ["'self'", ...(nonceSource ? [nonceSource] : [])]
    : ["'self'", "'unsafe-inline'"];

  function pushOrigin(list: string[], candidate: string) {
    const t = candidate.trim();
    if (!t) return;
    try {
      const u = new URL(t.includes("://") ? t : `https://${t}`);
      const origin = `${u.protocol}//${u.host}`;
      if (!list.includes(origin)) list.push(origin);
    } catch {
      /* ignore malformed env */
    }
  }

  const connectPieces: string[] = ["'self'"];
  const framePieces: string[] = ["https://maps.google.com", "https://www.google.com", "https://*.google.com"];

  const uploadOriginsRaw =
    typeof process.env.NEXT_PUBLIC_ALLOWED_UPLOAD_ORIGINS === "string"
      ? process.env.NEXT_PUBLIC_ALLOWED_UPLOAD_ORIGINS
      : "";
  for (const part of uploadOriginsRaw.split(",")) {
    pushOrigin(connectPieces, part);
  }

  const cdnBase =
    typeof process.env.NEXT_PUBLIC_MEDIA_CDN_BASE === "string"
      ? process.env.NEXT_PUBLIC_MEDIA_CDN_BASE.trim()
      : "";
  if (cdnBase) pushOrigin(connectPieces, cdnBase);

  if (isProd) {
    connectPieces.push(
      "https://*.sentry.io",
      "https://*.ingest.sentry.io",
      "https://*.ingest.us.sentry.io",
      "https://*.ingest.de.sentry.io",
      "https://*.public.blob.vercel-storage.com",
    );
  }

  if (opts.includeVercelLive) {
    scriptPieces.push("https://vercel.live", "https://*.vercel.live");
    stylePieces.push("https://vercel.live", "https://*.vercel.live");
    connectPieces.push("https://vercel.live", "https://*.vercel.live", "wss://*.pusher.com", "https://*.pusher.com");
    framePieces.push("https://vercel.live", "https://*.vercel.live");
  }

  const connectSrc = isProd
    ? uniq(connectPieces).join(" ")
    : "'self' https: http: ws: wss:";

  const directives = [
    "default-src 'self'",
    `script-src ${uniq(scriptPieces).join(" ")}`,
    `style-src ${uniq(stylePieces).join(" ")}`,
    `style-src-elem ${uniq(stylePieces).join(" ")}`,
    "style-src-attr 'unsafe-inline'",
    "img-src 'self' data: blob: https:",
    "media-src 'self' blob: https:",
    "font-src 'self' data: https:",
    `frame-src ${uniq(framePieces).join(" ")}`,
    `connect-src ${connectSrc}`,
    "worker-src 'self' blob:",
    "manifest-src 'self'",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
  ];

  if (isProd) {
    directives.push("upgrade-insecure-requests");
  }

  if (opts.reportOnly) {
    directives.push("report-uri /api/csp-report", "report-to csp-endpoint");
  }

  return directives.join("; ");
}
