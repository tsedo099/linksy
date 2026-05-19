import "server-only";
import { AsyncLocalStorage } from "node:async_hooks";
import { randomUUID } from "node:crypto";

/**
 * Per-request context propagated via `AsyncLocalStorage`. Anything stored here
 * is available anywhere downstream of the route handler — db helpers, services,
 * background tasks awaited inside the request — without threading the value
 * through every function signature.
 *
 * `requestId` correlates one inbound request across all logs, Sentry events,
 * and (when OTel is on) all spans, so an alert in Sentry can be cross-
 * referenced to a Loki / Datadog log line and a Tempo trace by a single id.
 */
export type RequestContext = {
  requestId: string;
  userId?: string;
  /** `traceparent` value (W3C) if the inbound request had one. */
  traceparent?: string;
};

const storage = new AsyncLocalStorage<RequestContext>();

/** Run `fn` with the given context attached to the async-hooks frame. */
export function runWithRequestContext<T>(ctx: RequestContext, fn: () => T): T {
  return storage.run(ctx, fn);
}

/** Current request context, or `undefined` when called outside a request. */
export function getRequestContext(): RequestContext | undefined {
  return storage.getStore();
}

/** Current request id, or `undefined` when called outside a request. */
export function getRequestId(): string | undefined {
  return storage.getStore()?.requestId;
}

/** RFC 4122 v4 id, or the upstream `x-request-id` if present and well-formed. */
export function deriveRequestId(headerValue: string | null): string {
  const trimmed = headerValue?.trim() ?? "";
  // Defend against header injection: cap length, restrict alphabet.
  if (trimmed && trimmed.length <= 128 && /^[A-Za-z0-9._-]+$/.test(trimmed)) {
    return trimmed;
  }
  return randomUUID();
}
