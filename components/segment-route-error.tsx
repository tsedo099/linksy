"use client";

import * as Sentry from "@sentry/nextjs";
import Link from "next/link";
import { useEffect } from "react";

/** Shared UI for per-segment route `error.tsx` boundaries (isolates crashes from the rest of the shell). */
export default function SegmentRouteError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("Route segment error:", error);
    Sentry.captureException(error);
  }, [error]);

  return (
    <div className="err-page">
      <div className="err-card">
        <div className="err-code">500</div>
        <h1 className="err-title">Something went wrong</h1>
        <p className="err-text">Гэнэтийн алдаа гарлаа. Дахин оролдоно уу.</p>
        {error.digest ? <p className="err-digest">Error ID: {error.digest}</p> : null}
        <div className="err-actions">
          <button type="button" className="err-btn err-btn--primary" onClick={reset}>
            Try again
          </button>
          <Link href="/home" className="err-btn err-btn--ghost">
            Home
          </Link>
        </div>
      </div>
    </div>
  );
}
