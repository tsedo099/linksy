"use client";

import * as Sentry from "@sentry/nextjs";
import { useEffect } from "react";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("Global error:", error);
    Sentry.captureException(error);
  }, [error]);

  return (
    <html lang="en" data-theme="dark" data-accent="purple">
      <body>
        <div className="err-page">
          <div className="err-card">
            <div className="err-code">!</div>
            <h1 className="err-title">Critical error</h1>
            <p className="err-text">
              Аппликейшн ноцтой алдаа өгсөн. Хуудсыг дахин ачаалаарай.
            </p>
            {error.digest && (
              <p className="err-digest">Error ID: {error.digest}</p>
            )}
            <div className="err-actions">
              <button type="button" className="err-btn err-btn--primary" onClick={reset}>
                Reload
              </button>
            </div>
          </div>
        </div>
      </body>
    </html>
  );
}
