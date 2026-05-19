"use client";

import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";

const STORAGE_KEY = "linksy.passwordHealth.v1";

export type StoredPasswordHealth =
  | { severity: "weak"; reason: "too_short" | "missing_classes" | "common"; dismissed?: boolean }
  | { severity: "pwned"; count: number; dismissed?: boolean };

export function persistPasswordHealthFromLogin(value: unknown): void {
  if (!value || typeof window === "undefined") return;
  try {
    const v = value as { severity?: string };
    if (v.severity !== "weak" && v.severity !== "pwned") return;
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(value));
  } catch {
    // sessionStorage can throw under quota / private mode — banner is just a hint.
  }
}

function readStored(): StoredPasswordHealth | null {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as StoredPasswordHealth;
    if (parsed?.severity !== "weak" && parsed?.severity !== "pwned") return null;
    if (parsed.dismissed) return null;
    return parsed;
  } catch {
    return null;
  }
}

function clearStored() {
  try {
    sessionStorage.removeItem(STORAGE_KEY);
  } catch {
    // ignore
  }
}

function markDismissed() {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return;
    const parsed = JSON.parse(raw) as StoredPasswordHealth;
    parsed.dismissed = true;
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(parsed));
  } catch {
    // ignore
  }
}

function copyFor(health: StoredPasswordHealth): { title: string; body: string } {
  if (health.severity === "pwned") {
    return {
      title: "Your password has been exposed.",
      body:
        health.count > 1
          ? `It has appeared in ${health.count.toLocaleString()} known data breaches. Rotate it now to protect your account.`
          : "It has appeared in a known data breach. Rotate it now to protect your account.",
    };
  }
  if (health.reason === "too_short") {
    return {
      title: "Your password is too short.",
      body: "It does not meet the current minimum length. Pick a stronger one.",
    };
  }
  if (health.reason === "missing_classes") {
    return {
      title: "Your password is weak.",
      body: "It is missing required characters (upper, lower, number, symbol). Strengthen it now.",
    };
  }
  return {
    title: "Your password is too common.",
    body: "Pick a unique password that does not appear in breach lists.",
  };
}

export function PasswordHealthBanner() {
  const router = useRouter();
  const pathname = usePathname();
  const [health, setHealth] = useState<StoredPasswordHealth | null>(null);

  useEffect(() => {
    setHealth(readStored());
  }, []);

  if (!health) return null;
  // Don't pile on top of the change-password screen itself.
  if (pathname?.startsWith("/settings")) return null;

  const copy = copyFor(health);
  const urgent = health.severity === "pwned";

  const onRotate = () => {
    markDismissed();
    setHealth(null);
    router.push("/settings?section=change-password");
  };

  const onDismiss = () => {
    markDismissed();
    setHealth(null);
  };

  return (
    <div
      className={`pwh-banner${urgent ? " pwh-banner--urgent" : ""}`}
      role={urgent ? "alert" : "status"}
      aria-live={urgent ? "assertive" : "polite"}
    >
      <div className="pwh-banner__inner">
        <div className="pwh-banner__icon" aria-hidden="true">
          {urgent ? (
            <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 9v4" />
              <path d="M12 17h.01" />
              <path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0Z" />
            </svg>
          ) : (
            <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <rect x="3" y="11" width="18" height="11" rx="2" />
              <path d="M7 11V7a5 5 0 0 1 10 0v4" />
            </svg>
          )}
        </div>
        <div className="pwh-banner__copy">
          <p className="pwh-banner__title">{copy.title}</p>
          <p className="pwh-banner__body">{copy.body}</p>
        </div>
        <div className="pwh-banner__actions">
          <button type="button" className="pwh-banner__btn pwh-banner__btn--primary" onClick={onRotate}>
            Rotate now
          </button>
          <button
            type="button"
            className="pwh-banner__btn pwh-banner__btn--ghost"
            onClick={onDismiss}
            aria-label="Dismiss password rotation reminder"
          >
            Dismiss
          </button>
        </div>
      </div>
    </div>
  );
}

export function __clearPasswordHealthForTest() {
  clearStored();
}
