import * as Sentry from "@sentry/nextjs";

const dsn = process.env.SENTRY_DSN?.trim() ?? process.env.NEXT_PUBLIC_SENTRY_DSN?.trim();

function tracesSampleRate(): number {
  const raw = process.env.SENTRY_TRACES_SAMPLE_RATE?.trim();
  if (raw !== undefined && raw !== "") {
    const n = Number(raw);
    return Number.isFinite(n) ? Math.min(1, Math.max(0, n)) : 0;
  }
  return process.env.NODE_ENV === "production" ? 0.05 : 1;
}

function profilesSampleRate(): number | undefined {
  const raw = process.env.SENTRY_PROFILES_SAMPLE_RATE?.trim();
  if (!raw) return undefined;
  const n = Number(raw);
  return Number.isFinite(n) ? Math.min(1, Math.max(0, n)) : undefined;
}

/**
 * Sentry APM. Performance traces are always-on (sampled). CPU profiling is
 * opt-in: setting `SENTRY_PROFILES_SAMPLE_RATE` loads `@sentry/profiling-node`
 * (a native binary, hence isolated behind try/catch so a missing platform
 * binary cannot crash the server). For Datadog/New Relic/Honeycomb, point
 * `OTEL_EXPORTER_OTLP_ENDPOINT` at their OTLP collector — see `lib/otel.ts`
 * and `docs/RUNBOOK.md`.
 */
// `@sentry/profiling-node` ships its own bundled `@sentry/core` whose
// `Integration` type is structurally compatible with `@sentry/nextjs`'s but
// nominally distinct. Use `Sentry.Integration` and cast at the boundary so the
// init call typechecks cleanly without us reaching into the bundled core.
type ProfilingIntegration = Parameters<typeof Sentry.init>[0] extends infer O
  ? O extends { integrations?: infer I }
    ? I extends Array<infer Item>
      ? Item
      : never
    : never
  : never;

async function loadProfilingIntegrations(): Promise<ProfilingIntegration[]> {
  if (profilesSampleRate() === undefined) return [];
  try {
    const { nodeProfilingIntegration } = await import("@sentry/profiling-node");
    return [nodeProfilingIntegration() as unknown as ProfilingIntegration];
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.warn(`[sentry] profiling disabled: ${msg}`);
    return [];
  }
}

if (dsn) {
  const integrations = await loadProfilingIntegrations();
  Sentry.init({
    dsn,
    environment: process.env.SENTRY_ENVIRONMENT ?? process.env.NODE_ENV ?? "development",
    release: process.env.SENTRY_RELEASE?.trim() || undefined,
    tracesSampleRate: tracesSampleRate(),
    profilesSampleRate: profilesSampleRate(),
    integrations,
    sendDefaultPii: false,
  });
}
