import * as Sentry from "@sentry/nextjs";

export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    // OpenTelemetry must initialize BEFORE Sentry / framework instrumentation so
    // outbound HTTP, Prisma, and ioredis spans pick up the OTel context. No-op
    // when `OTEL_EXPORTER_OTLP_ENDPOINT` is unset.
    const { startOtelIfConfigured } = await import("./lib/otel");
    await startOtelIfConfigured();

    await import("./sentry.server.config");

    // Graceful shutdown — installs SIGTERM/SIGINT handlers that drain SSE
    // streams + flip the readiness probe to 503 so k8s removes the pod from
    // the Service before the process exits. Idempotent.
    const { installProcessSignalHandlers } = await import("./lib/shutdown");
    installProcessSignalHandlers();

    // SSE / long-lived response writes (notifications stream, conversation
    // messages, call signaling) emit ECONNRESET when the client closes the
    // tab before the server flushes a heartbeat. The route handlers already
    // clean up on `req.signal` abort, so these are harmless — silence them
    // here instead of letting them surface as uncaughtException noise.
    //
    // Important: we MUST NOT rethrow from inside these handlers — that just
    // re-enters the uncaughtException pipeline and ships duplicate noise
    // (`⨯ uncaughtException: Error: aborted` … `⨯ uncaughtException: Error:
    // aborted` …). Sentry's own integration captures genuine exceptions via
    // its `onUncaughtException` hook, so silently returning here leaves the
    // crash path untouched for real errors and short-circuits the client-
    // disconnect case.
    const isClientDisconnect = (err: unknown): boolean => {
      if (!err || typeof err !== "object") return false;
      const e = err as { code?: string; message?: string };
      return e.code === "ECONNRESET"
        || e.code === "EPIPE"
        || e.code === "ECANCELED"
        || e.message === "aborted"
        || e.message === "AbortError";
    };

    process.on("uncaughtException", (err) => {
      if (isClientDisconnect(err)) return;
      // Real exceptions: let Sentry's instrumentation surface them; do not
      // rethrow (rethrow inside an uncaughtException handler triggers a
      // *new* uncaughtException and floods the logs with duplicates).
      Sentry.captureException(err);
    });

    process.on("unhandledRejection", (reason) => {
      if (isClientDisconnect(reason)) return;
      Sentry.captureException(reason);
    });
  }

  if (process.env.NEXT_RUNTIME === "edge") {
    await import("./sentry.edge.config");
  }
}

export const onRequestError = Sentry.captureRequestError;
