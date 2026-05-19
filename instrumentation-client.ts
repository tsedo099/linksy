import * as Sentry from "@sentry/nextjs";

const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN?.trim() ?? process.env.SENTRY_DSN?.trim();

function tracesSampleRate(): number {
  const raw = process.env.NEXT_PUBLIC_SENTRY_TRACES_SAMPLE_RATE?.trim() ?? process.env.SENTRY_TRACES_SAMPLE_RATE?.trim();
  if (raw !== undefined && raw !== "") {
    const n = Number(raw);
    return Number.isFinite(n) ? Math.min(1, Math.max(0, n)) : 0;
  }
  return process.env.NODE_ENV === "production" ? 0.05 : 1;
}

function clampedRate(raw: string | undefined, fallback: number): number {
  const trimmed = raw?.trim();
  if (!trimmed) return fallback;
  const n = Number(trimmed);
  return Number.isFinite(n) ? Math.min(1, Math.max(0, n)) : fallback;
}

/**
 * Session replay — privacy-first defaults:
 *   - `maskAllText`, `blockAllMedia`, `maskAllInputs` so a replay never
 *     captures the body of a DM, the contents of a password field, a profile
 *     photo, etc. Matches `sendDefaultPii: false` on the server config.
 *   - Sampling defaults to 0% sessions / 100% on-error in production, so the
 *     bandwidth budget is bounded but we never miss a session that produced
 *     a Sentry event. Override with `NEXT_PUBLIC_SENTRY_REPLAYS_SESSION_RATE`
 *     and `NEXT_PUBLIC_SENTRY_REPLAYS_ERROR_RATE`.
 */
const sessionReplayRate = clampedRate(
  process.env.NEXT_PUBLIC_SENTRY_REPLAYS_SESSION_RATE,
  process.env.NODE_ENV === "production" ? 0 : 0,
);
const errorReplayRate = clampedRate(
  process.env.NEXT_PUBLIC_SENTRY_REPLAYS_ERROR_RATE,
  process.env.NODE_ENV === "production" ? 1 : 0,
);

if (dsn) {
  Sentry.init({
    dsn,
    environment: process.env.SENTRY_ENVIRONMENT ?? process.env.NODE_ENV ?? "development",
    release:
      process.env.NEXT_PUBLIC_SENTRY_RELEASE?.trim() ||
      process.env.SENTRY_RELEASE?.trim() ||
      undefined,
    tracesSampleRate: tracesSampleRate(),
    replaysSessionSampleRate: sessionReplayRate,
    replaysOnErrorSampleRate: errorReplayRate,
    integrations: [
      Sentry.replayIntegration({
        maskAllText: true,
        maskAllInputs: true,
        blockAllMedia: true,
      }),
    ],
    sendDefaultPii: false,
  });
}

export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;
