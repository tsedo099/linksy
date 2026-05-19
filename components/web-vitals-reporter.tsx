"use client";

import { useEffect, useRef } from "react";
import type { Metric } from "web-vitals";
import { COOKIE_CONSENT_UPDATED_EVENT, getStoredCookieAnalyticsConsent } from "@/components/cookie-consent-banner";

const ENDPOINT = "/api/metrics/web-vitals";

type NetworkInformation = {
  effectiveType?: "slow-2g" | "2g" | "3g" | "4g";
  downlink?: number;
  rtt?: number;
};

type NavigatorWithHints = Navigator & {
  connection?: NetworkInformation;
  deviceMemory?: number;
};

function readDeviceHints(): Record<string, unknown> | undefined {
  if (typeof navigator === "undefined") return undefined;
  const nav = navigator as NavigatorWithHints;
  const ua = nav.userAgent.toLowerCase();
  let kind: "mobile" | "tablet" | "desktop" | undefined;
  if (/ipad|tablet|playbook|silk|(android(?!.*mobi))/.test(ua)) kind = "tablet";
  else if (/mobi|iphone|ipod|blackberry|iemobile|opera mini/.test(ua)) kind = "mobile";
  else kind = "desktop";

  const conn = nav.connection;
  const hints: Record<string, unknown> = { kind };
  if (conn?.effectiveType) hints.effectiveType = conn.effectiveType;
  if (typeof conn?.downlink === "number") hints.downlinkMbps = conn.downlink;
  if (typeof conn?.rtt === "number") hints.rttMs = conn.rtt;
  if (typeof nav.deviceMemory === "number") hints.deviceMemoryGb = nav.deviceMemory;
  if (typeof nav.hardwareConcurrency === "number") {
    hints.hardwareConcurrency = nav.hardwareConcurrency;
  }
  return hints;
}

function send(metric: Metric) {
  if (typeof window === "undefined") return;

  const body = JSON.stringify({
    name: metric.name,
    value: metric.value,
    rating: metric.rating,
    id: metric.id,
    navigationType: metric.navigationType,
    path: window.location.pathname,
    device: readDeviceHints(),
  });

  if (typeof navigator !== "undefined" && typeof navigator.sendBeacon === "function") {
    try {
      const blob = new Blob([body], { type: "application/json" });
      if (navigator.sendBeacon(ENDPOINT, blob)) return;
    } catch {
      // sendBeacon can throw with strict CSP — fall through to fetch
    }
  }

  void fetch(ENDPOINT, {
    method: "POST",
    body,
    headers: { "Content-Type": "application/json" },
    keepalive: true,
  }).catch(() => undefined);
}

/**
 * Reports Core Web Vitals (LCP, INP, CLS, FCP, TTFB) to /api/metrics/web-vitals.
 * Disabled in development to avoid noise; opt in via NEXT_PUBLIC_ENABLE_RUM=true.
 */
export function WebVitalsReporter() {
  const startedRef = useRef(false);

  useEffect(() => {
    const enabled =
      process.env.NODE_ENV === "production" || process.env.NEXT_PUBLIC_ENABLE_RUM === "true";
    if (!enabled) return;

    let cancelled = false;

    function start() {
      if (startedRef.current || cancelled) return;
      if (!getStoredCookieAnalyticsConsent()) return;
      startedRef.current = true;

      void import("web-vitals").then(({ onCLS, onFCP, onINP, onLCP, onTTFB }) => {
        if (cancelled) return;
        onCLS(send);
        onFCP(send);
        onINP(send);
        onLCP(send);
        onTTFB(send);
      });
    }

    start();
    window.addEventListener(COOKIE_CONSENT_UPDATED_EVENT, start);

    return () => {
      cancelled = true;
      window.removeEventListener(COOKIE_CONSENT_UPDATED_EVENT, start);
    };
  }, []);

  return null;
}
