"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

const STORAGE_KEY = "linksy-cookie-consent-v1";

export const COOKIE_CONSENT_UPDATED_EVENT = "linksy-cookie-consent-updated";

type ConsentPayload = {
  v: 1;
  /** true = all optional categories accepted; false = essential only */
  analyticsAccepted: boolean;
  updatedAt: number;
};

function readConsent(): ConsentPayload | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const data = JSON.parse(raw) as ConsentPayload;
    if (data.v !== 1 || typeof data.analyticsAccepted !== "boolean") return null;
    return data;
  } catch {
    return null;
  }
}

function writeConsent(analyticsAccepted: boolean) {
  const payload: ConsentPayload = {
    v: 1,
    analyticsAccepted,
    updatedAt: Date.now(),
  };
  localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
  window.dispatchEvent(new Event(COOKIE_CONSENT_UPDATED_EVENT));
}

export function CookieConsentBanner() {
  const [open, setOpen] = useState<boolean | null>(null);

  useEffect(() => {
    setOpen(readConsent() === null);
  }, []);

  if (open !== true) {
    return null;
  }

  function acceptAll() {
    writeConsent(true);
    setOpen(false);
  }

  function essentialOnly() {
    writeConsent(false);
    setOpen(false);
  }

  return (
    <div className="cookie-consent" role="region" aria-label="Cookie consent">
      <div className="cookie-consent__inner">
        <p className="cookie-consent__text">
          We use cookies and similar storage to keep you signed in, remember essential preferences, and improve the product.
          Read more in our{" "}
          <Link href="/legal/privacy">Privacy Policy</Link>
          {" "}(including{" "}
          <Link href="/legal/privacy#cookies">cookies</Link>
          ).
        </p>
        <div className="cookie-consent__actions">
          <button type="button" className="cookie-consent__btn cookie-consent__btn--primary" onClick={acceptAll}>
            Accept all
          </button>
          <button type="button" className="cookie-consent__btn cookie-consent__btn--ghost" onClick={essentialOnly}>
            Essential only
          </button>
        </div>
      </div>
    </div>
  );
}

/**
 * Returns whether the user has opted in to optional / analytics-style cookies.
 * Safe on server (returns false).
 */
export function getStoredCookieAnalyticsConsent(): boolean {
  if (typeof window === "undefined") return false;
  const c = readConsent();
  return c?.analyticsAccepted === true;
}
