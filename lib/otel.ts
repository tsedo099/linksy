import "server-only";

/**
 * OpenTelemetry Node SDK bootstrap. Opt-in via env:
 *   - `OTEL_EXPORTER_OTLP_ENDPOINT`  collector endpoint (e.g. http://tempo:4318)
 *   - `OTEL_SERVICE_NAME`            service name reported on every span (default `linksy`)
 *   - `OTEL_EXPORTER_OTLP_HEADERS`   optional `key1=val1,key2=val2` auth headers
 *
 * Loaded from `instrumentation.ts` before Sentry. Sentry's @sentry/nextjs build
 * already speaks OpenTelemetry under the hood, so we register an additional
 * BatchSpanProcessor that forwards spans to OTLP/HTTP for Tempo/Jaeger; Sentry
 * keeps its own pipeline untouched.
 *
 * The package set is intentionally minimal — auto-instrumentation comes from
 * Sentry (HTTP, fetch, Prisma, ioredis, etc.). If you need extra packages,
 * register them via `instrumentations: [...]` in `NodeSDK`.
 */

let started = false;

export async function startOtelIfConfigured(): Promise<void> {
  if (started) return;
  const endpoint = process.env.OTEL_EXPORTER_OTLP_ENDPOINT?.trim();
  if (!endpoint) return;

  try {
    const [
      { NodeSDK },
      { OTLPTraceExporter },
      { BatchSpanProcessor },
      { resourceFromAttributes },
      { ATTR_SERVICE_NAME, ATTR_SERVICE_VERSION },
    ] = await Promise.all([
      import("@opentelemetry/sdk-node"),
      import("@opentelemetry/exporter-trace-otlp-http"),
      import("@opentelemetry/sdk-trace-base"),
      import("@opentelemetry/resources"),
      import("@opentelemetry/semantic-conventions"),
    ]);

    const headers = parseOtlpHeaders(process.env.OTEL_EXPORTER_OTLP_HEADERS);
    const exporter = new OTLPTraceExporter({
      url: endpoint.replace(/\/+$/, "") + "/v1/traces",
      headers,
    });

    const sdk = new NodeSDK({
      resource: resourceFromAttributes({
        [ATTR_SERVICE_NAME]: process.env.OTEL_SERVICE_NAME?.trim() || "linksy",
        [ATTR_SERVICE_VERSION]: process.env.SENTRY_RELEASE?.trim() || process.env.npm_package_version || "0.1.0",
        "deployment.environment":
          process.env.SENTRY_ENVIRONMENT?.trim() || process.env.NODE_ENV || "development",
      }),
      spanProcessors: [new BatchSpanProcessor(exporter)],
    });

    sdk.start();
    started = true;

    const flush = async () => {
      try {
        await sdk.shutdown();
      } catch {
        /* swallow — best-effort on shutdown */
      }
    };
    process.once("SIGTERM", flush);
    process.once("SIGINT", flush);
  } catch (err) {
    // Missing peer dep or bad config — log once and continue without OTel.
    const msg = err instanceof Error ? err.message : String(err);
    console.warn(`[otel] disabled: ${msg}`);
  }
}

function parseOtlpHeaders(raw: string | undefined): Record<string, string> | undefined {
  const trimmed = raw?.trim();
  if (!trimmed) return undefined;
  const out: Record<string, string> = {};
  for (const pair of trimmed.split(",")) {
    const idx = pair.indexOf("=");
    if (idx <= 0) continue;
    const key = pair.slice(0, idx).trim();
    const value = pair.slice(idx + 1).trim();
    if (key && value) out[key] = value;
  }
  return Object.keys(out).length ? out : undefined;
}
