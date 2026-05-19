import "server-only";
import pino, { type LoggerOptions } from "pino";
import { getRequestContext } from "@/lib/request-context";

function logLevel(): string {
  const fromEnv = process.env.LOG_LEVEL?.trim().toLowerCase();
  if (fromEnv === "fatal" || fromEnv === "error" || fromEnv === "warn" || fromEnv === "info" || fromEnv === "debug" || fromEnv === "trace") {
    return fromEnv;
  }
  return process.env.NODE_ENV === "production" ? "info" : "debug";
}

function serialize(reason: unknown): Record<string, unknown> {
  if (reason instanceof Error) {
    return { kind: "Error", name: reason.name, message: reason.message, stack: reason.stack };
  }
  if (reason !== null && typeof reason === "object") {
    try {
      return { kind: "object", snapshot: JSON.parse(JSON.stringify(reason)) as unknown };
    } catch {
      return { kind: "object", value: String(reason) };
    }
  }
  return { kind: typeof reason, value: reason };
}

const baseOptions: LoggerOptions = {
  level: logLevel(),
  timestamp: pino.stdTimeFunctions.isoTime,
  base: {
    service: process.env.OTEL_SERVICE_NAME?.trim() || "linksy",
    env: process.env.SENTRY_ENVIRONMENT?.trim() || process.env.NODE_ENV || "development",
    release: process.env.SENTRY_RELEASE?.trim() || undefined,
  },
  // Auto-inject request id + user id + W3C traceparent on every line so any
  // log shipper (Loki/Datadog/BetterStack) can join logs ↔ traces ↔ Sentry.
  mixin: () => {
    const ctx = getRequestContext();
    if (!ctx) return {};
    return {
      requestId: ctx.requestId,
      ...(ctx.userId ? { userId: ctx.userId } : {}),
      ...(ctx.traceparent ? { traceparent: ctx.traceparent } : {}),
    };
  },
  // `pino-pretty` is opt-in via `PINO_PRETTY=1` for local dev; production
  // (and the default everywhere) stays one-JSON-per-line so any log shipper
  // (Loki, Datadog Agent, BetterStack) can ingest stdout directly.
  ...(process.env.PINO_PRETTY === "1"
    ? {
        transport: {
          target: "pino-pretty",
          options: { colorize: true, translateTime: "SYS:standard" },
        },
      }
    : {}),
};

export const logger = pino(baseOptions);

/**
 * For fire-and-forget work (XP, notifications, search history write-behind): log rejections instead of swallowing silently.
 */
export function logBackgroundError(scope: string) {
  return (reason: unknown) => {
    logger.warn({ scope, err: serialize(reason) }, "background task rejected");
  };
}
