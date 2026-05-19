"use client";

import * as Sentry from "@sentry/nextjs";
import { ErrorBoundary, type FallbackProps } from "react-error-boundary";
import type { ReactNode } from "react";

/**
 * Client-only error boundary for places Next's `error.tsx` does not cover —
 * specifically:
 *   - Errors thrown inside event handlers (Next's error.tsx only catches render
 *     errors).
 *   - Errors inside an isolated widget tree that should not blank the whole
 *     route (e.g. a feed item, a side panel) — wrap the widget in its own
 *     boundary so the rest of the page keeps working.
 *
 * The boundary always reports to Sentry with `component_boundary` tag so
 * dashboards can distinguish them from page-level / route-level errors.
 */

function DefaultFallback({ error, resetErrorBoundary }: FallbackProps) {
  return (
    <div role="alert" className="err-card" style={{ padding: 16, margin: 8 }}>
      <p className="err-text" style={{ marginBottom: 8 }}>
        Something went wrong loading this part of the page.
      </p>
      <p className="err-text" style={{ marginBottom: 12, opacity: 0.7, fontSize: 12 }}>
        {error instanceof Error ? error.message : "Unknown error"}
      </p>
      <button
        type="button"
        className="err-btn err-btn--primary"
        onClick={resetErrorBoundary}
      >
        Retry
      </button>
    </div>
  );
}

export function ClientErrorBoundary({
  children,
  scope,
  fallback,
}: {
  children: ReactNode;
  /** Logical scope (e.g. "feed.story-tray", "messages.thread") for the Sentry tag. */
  scope: string;
  fallback?: (props: FallbackProps) => ReactNode;
}) {
  return (
    <ErrorBoundary
      fallbackRender={fallback ?? DefaultFallback}
      onError={(error, info) => {
        Sentry.withScope((s) => {
          s.setTag("error_boundary", "client");
          s.setTag("boundary_scope", scope);
          s.setExtra("componentStack", info.componentStack);
          Sentry.captureException(error);
        });
      }}
    >
      {children}
    </ErrorBoundary>
  );
}
