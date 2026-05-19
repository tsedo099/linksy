import "server-only";
import type { NextRequest } from "next/server";
import * as Sentry from "@sentry/nextjs";
import {
  httpRequestDurationSeconds,
  httpRequestsTotal,
  statusFamily,
} from "@/lib/metrics";
import {
  deriveRequestId,
  runWithRequestContext,
  type RequestContext,
} from "@/lib/request-context";
import { logger } from "@/lib/logger";

/**
 * Wrap a Next App-Router route handler so it:
 *
 *   1. Assigns/propagates a `requestId` (`X-Request-ID` header, or fresh uuid)
 *      and exposes it via {@link getRequestContext} for all downstream code +
 *      pino mixin.
 *   2. Logs `request.start` / `request.finish` with `method`, `route`, `status`,
 *      `duration_ms`, and the request id — the structured-logging contract
 *      shippers (Loki/Datadog) ingest.
 *   3. Records `linksy_http_requests_total` + `linksy_http_request_duration_seconds`.
 *   4. Tags the Sentry isolation scope with `request_id` so any captured event
 *      can be joined to a log line / trace by id.
 *   5. Echoes the request id back on the response as `X-Request-ID` so the
 *      client can include it in user-reported bugs.
 *
 *   export const POST = withMetrics("/api/auth/login", async (req) => { ... });
 *
 * Pass the **route template** (not the resolved URL) so label cardinality stays
 * bounded — `/api/posts/[id]/like`, not `/api/posts/abc123/like`.
 */
export function withMetrics<TArgs extends [NextRequest, ...unknown[]]>(
  route: string,
  handler: (...args: TArgs) => Promise<Response> | Response,
): (...args: TArgs) => Promise<Response> {
  return async (...args: TArgs): Promise<Response> => {
    const req = args[0];
    const method = req.method.toUpperCase();
    const requestId = deriveRequestId(req.headers.get("x-request-id"));
    const traceparent = req.headers.get("traceparent")?.trim() || undefined;
    const requestCtx: RequestContext = { requestId, traceparent };

    return runWithRequestContext(requestCtx, async () => {
      Sentry.getCurrentScope().setTag("request_id", requestId);
      const startedAt = process.hrtime.bigint();
      logger.info(
        { scope: "http.request.start", method, route },
        "request.start",
      );
      let status = 500;
      try {
        const res = await handler(...args);
        status = res.status;
        // Echo the id back so clients can include it in bug reports.
        try {
          res.headers.set("x-request-id", requestId);
        } catch {
          // some Response objects are frozen (e.g. NextResponse.redirect) —
          // skip rather than crash the request
        }
        return res;
      } catch (err) {
        status = 500;
        throw err;
      } finally {
        const elapsedSec = Number(process.hrtime.bigint() - startedAt) / 1e9;
        const family = statusFamily(status);
        const labels = { route, method, status_family: family };
        httpRequestsTotal.inc(labels);
        httpRequestDurationSeconds.observe(labels, elapsedSec);
        logger.info(
          {
            scope: "http.request.finish",
            method,
            route,
            status,
            status_family: family,
            duration_ms: Math.round(elapsedSec * 1000),
          },
          "request.finish",
        );
      }
    });
  };
}
