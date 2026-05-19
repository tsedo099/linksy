import "server-only";
import {
  collectDefaultMetrics,
  Counter,
  Gauge,
  Histogram,
  Registry,
} from "prom-client";

/**
 * Prometheus metrics registry. Single instance per process — `globalThis`
 * pinning so a Next.js hot-reload in dev doesn't double-register and throw
 * `Error: A metric with the name X has already been registered`.
 */
declare global {
  // eslint-disable-next-line no-var
  var __linksy_metrics_registry: Registry | undefined;
  // eslint-disable-next-line no-var
  var __linksy_metrics_inited: boolean | undefined;
}

export const registry: Registry =
  globalThis.__linksy_metrics_registry ?? new Registry();

if (!globalThis.__linksy_metrics_registry) {
  registry.setDefaultLabels({
    service: "linksy",
    environment:
      process.env.SENTRY_ENVIRONMENT ?? process.env.NODE_ENV ?? "development",
  });
  // Node.js process metrics — heap, CPU, event loop lag, GC.
  collectDefaultMetrics({ register: registry, prefix: "node_" });
  globalThis.__linksy_metrics_registry = registry;
}

// --- HTTP (server) -----------------------------------------------------

export const httpRequestsTotal = createCounter({
  name: "linksy_http_requests_total",
  help: "Total HTTP requests by route, method, status family.",
  labelNames: ["route", "method", "status_family"],
});

export const httpRequestDurationSeconds = createHistogram({
  name: "linksy_http_request_duration_seconds",
  help: "HTTP request duration in seconds, by route + status family.",
  labelNames: ["route", "method", "status_family"],
  // Reasonable buckets for a web app: 5ms → 8s.
  buckets: [0.005, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2, 4, 8],
});

// --- SSE / fan-out ------------------------------------------------------

export const sseConnectionsOpen = createGauge({
  name: "linksy_sse_connections_open",
  help: "Currently open Server-Sent Events streams, by topic.",
  labelNames: ["topic"],
});

export const ssePublishTotal = createCounter({
  name: "linksy_sse_publish_total",
  help: "Events published to any SSE bus (Redis fan-out).",
  labelNames: ["topic"],
});

// --- BullMQ / background jobs ------------------------------------------

export const queueDepth = createGauge({
  name: "linksy_queue_depth",
  help: "BullMQ queue depth by queue + state (waiting|active|delayed|failed).",
  labelNames: ["queue", "state"],
});

export const queueJobDurationSeconds = createHistogram({
  name: "linksy_queue_job_duration_seconds",
  help: "BullMQ job processing duration in seconds.",
  labelNames: ["queue", "result"],
  buckets: [0.05, 0.1, 0.5, 1, 2.5, 5, 10, 30, 60],
});

// --- Business metrics ---------------------------------------------------

export const signupsTotal = createCounter({
  name: "linksy_signups_total",
  help: "Successful user registrations.",
  labelNames: ["channel"], // email | google | passkey
});

export const loginsTotal = createCounter({
  name: "linksy_logins_total",
  help: "Successful logins.",
  labelNames: ["channel", "had_2fa"],
});

export const postsCreatedTotal = createCounter({
  name: "linksy_posts_created_total",
  help: "Posts created.",
  labelNames: ["kind"], // post | story | reel
});

export const messagesSentTotal = createCounter({
  name: "linksy_messages_sent_total",
  help: "DMs sent (one-to-one + group).",
  labelNames: ["conversation_kind"], // dm | group
});

export const pushDispatchedTotal = createCounter({
  name: "linksy_push_dispatched_total",
  help: "Push notifications dispatched.",
  labelNames: ["platform", "result"], // webpush|fcm|apns × ok|error
});

export const tipsTotal = createCounter({
  name: "linksy_tips_total",
  help: "Stripe tips by lifecycle state.",
  labelNames: ["state"], // created | succeeded | failed
});

export const storyViewsTotal = createCounter({
  name: "linksy_story_views_total",
  help: "Story views recorded (excluding self-views by the author).",
});

export const rumWebVitalHistogram = createHistogram({
  name: "linksy_rum_web_vital_value",
  help: "Core Web Vital sample values (ms; CLS scaled ×1000 → integer ms).",
  labelNames: ["metric", "rating", "device", "country"],
  // 12 buckets spanning 50ms → 32s; LCP/INP/TTFB fit cleanly, CLS×1000 too.
  buckets: [50, 100, 200, 400, 800, 1500, 2500, 4000, 6000, 10_000, 20_000, 32_000],
});

export const rumWebVitalRatingTotal = createCounter({
  name: "linksy_rum_web_vital_rating_total",
  help: "Count of Web Vital samples bucketed by rating, device, country.",
  labelNames: ["metric", "rating", "device", "country"],
});

// --- DAU / MAU (refreshed by `/api/metrics` on each scrape from Redis HLL) ---

export const activeUsersDaily = createGauge({
  name: "linksy_active_users_daily",
  help: "Approximate unique active users for the current UTC day (Redis HLL).",
});

export const activeUsersMonthly = createGauge({
  name: "linksy_active_users_monthly",
  help: "Approximate unique active users for the current UTC month (Redis HLL).",
});

export const activeUsersTrailingWeek = createGauge({
  name: "linksy_active_users_trailing_7d",
  help: "Approximate unique active users over the trailing 7 UTC days.",
});

// --- helpers -----------------------------------------------------------

function createCounter<T extends string>(opts: {
  name: string;
  help: string;
  labelNames?: readonly T[];
}): Counter<T> {
  // Re-use across hot-reload — `registerMetric` throws on duplicate names.
  const existing = registry.getSingleMetric(opts.name) as Counter<T> | undefined;
  if (existing) return existing;
  return new Counter({ ...opts, registers: [registry] });
}

function createGauge<T extends string>(opts: {
  name: string;
  help: string;
  labelNames?: readonly T[];
}): Gauge<T> {
  const existing = registry.getSingleMetric(opts.name) as Gauge<T> | undefined;
  if (existing) return existing;
  return new Gauge({ ...opts, registers: [registry] });
}

function createHistogram<T extends string>(opts: {
  name: string;
  help: string;
  labelNames?: readonly T[];
  buckets?: readonly number[];
}): Histogram<T> {
  const existing = registry.getSingleMetric(opts.name) as Histogram<T> | undefined;
  if (existing) return existing;
  return new Histogram({
    ...opts,
    buckets: opts.buckets ? [...opts.buckets] : undefined,
    registers: [registry],
  });
}

/** Convenience: map an HTTP status code to a 2xx/4xx/5xx label. */
export function statusFamily(status: number): "2xx" | "3xx" | "4xx" | "5xx" | "other" {
  if (status >= 200 && status < 300) return "2xx";
  if (status >= 300 && status < 400) return "3xx";
  if (status >= 400 && status < 500) return "4xx";
  if (status >= 500 && status < 600) return "5xx";
  return "other";
}
