"use client";

import { useEffect, useState } from "react";

/**
 * Registers /sw.js for offline + push support and renders a small status pill
 * when the user goes offline or has queued mutations waiting to replay.
 */
export function ServiceWorkerRegister() {
  const [online, setOnline] = useState(true);
  const [queueSize, setQueueSize] = useState(0);

  useEffect(() => {
    if (typeof navigator === "undefined") return;
    setOnline(navigator.onLine !== false);

    let cancelled = false;

    const handleOffline = () => setOnline(false);
    window.addEventListener("offline", handleOffline);

    if (!("serviceWorker" in navigator)) {
      const handleOnline = () => setOnline(true);
      window.addEventListener("online", handleOnline);
      return () => {
        window.removeEventListener("online", handleOnline);
        window.removeEventListener("offline", handleOffline);
      };
    }

    /* Next/Turbopack HMR + an active SW often serves stale JS chunks ("module factory is not available"). */
    if (process.env.NODE_ENV !== "production") {
      const handleOnline = () => setOnline(true);
      window.addEventListener("online", handleOnline);
      navigator.serviceWorker
        .getRegistrations()
        .then((regs) => {
          regs.forEach((r) => {
            void r.unregister();
          });
        })
        .catch(() => undefined);
      return () => {
        window.removeEventListener("online", handleOnline);
        window.removeEventListener("offline", handleOffline);
      };
    }

    const askQueueSize = () => {
      const target = navigator.serviceWorker.controller;
      if (!target) return;
      target.postMessage({ type: "GET_QUEUE_SIZE" });
    };

    const handleMessage = (event: MessageEvent) => {
      if (cancelled) return;
      const data = event.data;
      if (!data || typeof data !== "object") return;
      if (data.type === "QUEUE_SIZE" && typeof data.size === "number") {
        setQueueSize(data.size);
      } else if (data.type === "QUEUE_UPDATED") {
        askQueueSize();
      }
    };

    const handleOnline = () => {
      setOnline(true);
      const target = navigator.serviceWorker.controller;
      if (target) target.postMessage({ type: "FLUSH_QUEUE" });
      askQueueSize();
    };

    window.addEventListener("online", handleOnline);

    navigator.serviceWorker
      .register("/sw.js", { scope: "/" })
      .catch(() => undefined);

    navigator.serviceWorker.addEventListener("message", handleMessage);

    askQueueSize();
    const interval = window.setInterval(askQueueSize, 30_000);

    return () => {
      cancelled = true;
      navigator.serviceWorker.removeEventListener("message", handleMessage);
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
      window.clearInterval(interval);
    };
  }, []);

  if (online && queueSize === 0) return null;

  const label = !online
    ? queueSize > 0
      ? `Offline · ${queueSize} action${queueSize === 1 ? "" : "s"} queued`
      : "Offline mode"
    : `Syncing ${queueSize} action${queueSize === 1 ? "" : "s"}…`;

  return (
    <div
      role="status"
      aria-live="polite"
      style={{
        position: "fixed",
        left: "50%",
        bottom: "calc(env(safe-area-inset-bottom, 0px) + 16px)",
        transform: "translateX(-50%)",
        background: !online ? "rgba(15, 14, 28, 0.92)" : "rgba(124, 58, 237, 0.92)",
        color: "#f5edff",
        padding: "8px 14px",
        borderRadius: 999,
        fontSize: 13,
        fontWeight: 500,
        letterSpacing: 0.2,
        boxShadow: "0 12px 32px rgba(7, 12, 28, 0.45)",
        backdropFilter: "blur(12px)",
        zIndex: 9999,
        pointerEvents: "none",
      }}
    >
      {label}
    </div>
  );
}
