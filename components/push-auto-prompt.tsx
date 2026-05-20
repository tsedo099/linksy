"use client";

import { useEffect, useState } from "react";
import { registerAndSubscribePush, silentSubscribeIfGranted } from "@/lib/push-client";

const DISMISS_KEY = "linksy:push-prompt:dismissedAt";
const DISMISS_TTL_MS = 7 * 24 * 60 * 60 * 1000; // re-ask after a week
const SHOW_DELAY_MS = 2500; // give the page a moment to settle before banner pops

/**
 * Drop-in component for AppShell. Two jobs:
 *   1. Silently re-subscribe the browser to push on every authenticated
 *      mount when Notification.permission === 'granted' (Instagram-style:
 *      user enables once, every subsequent session is auto-bound without
 *      having to revisit Settings).
 *   2. If permission is 'default' (never asked) and the user hasn't
 *      dismissed the banner recently, show a small in-app prompt that
 *      triggers the browser permission dialog on click. Browsers refuse
 *      to fire requestPermission() outside a user gesture, so we can't
 *      auto-prompt — but one tap on the banner is all it takes.
 */
export function PushAutoPrompt() {
  const [phase, setPhase] = useState<"idle" | "show" | "asking">("idle");
  const [publicKey, setPublicKey] = useState<string | null>(null);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (typeof Notification === "undefined") return;
    if (!("serviceWorker" in navigator) || !("PushManager" in window)) return;

    let cancelled = false;
    (async () => {
      const res = await fetch("/api/push/public-key").catch(() => null);
      if (!res?.ok) return;
      const data = (await res.json().catch(() => null)) as { enabled?: boolean; publicKey?: string | null } | null;
      const pk = typeof data?.publicKey === "string" ? data.publicKey.trim() : null;
      if (!data?.enabled || !pk) return; // VAPID unset on server — nothing to do
      if (cancelled) return;
      setPublicKey(pk);

      // Already granted → silently bind subscription, no UI.
      if (Notification.permission === "granted") {
        void silentSubscribeIfGranted(pk);
        return;
      }
      // Denied or actively blocked → don't nag.
      if (Notification.permission !== "default") return;

      // Re-ask once a week max.
      try {
        const raw = localStorage.getItem(DISMISS_KEY);
        if (raw) {
          const at = Number.parseInt(raw, 10);
          if (Number.isFinite(at) && Date.now() - at < DISMISS_TTL_MS) return;
        }
      } catch { /* localStorage unavailable — fine, just show */ }

      const t = window.setTimeout(() => {
        if (!cancelled) setPhase("show");
      }, SHOW_DELAY_MS);
      return () => window.clearTimeout(t);
    })();
    return () => { cancelled = true; };
  }, []);

  async function enable() {
    if (!publicKey || phase === "asking") return;
    setPhase("asking");
    try {
      await registerAndSubscribePush(publicKey);
      setPhase("idle");
    } catch {
      // Permission denied or subscribe failed — back off and remember.
      try { localStorage.setItem(DISMISS_KEY, String(Date.now())); } catch { /* ignore */ }
      setPhase("idle");
    }
  }

  function dismiss() {
    try { localStorage.setItem(DISMISS_KEY, String(Date.now())); } catch { /* ignore */ }
    setPhase("idle");
  }

  if (phase !== "show") return null;

  return (
    <div className="lkp-banner" role="dialog" aria-label="Enable browser notifications">
      <div className="lkp-text">
        <strong>Stay updated</strong>
        <span>Get notified about likes, comments, follows, and messages — even when Linksy is closed.</span>
      </div>
      <div className="lkp-actions">
        <button type="button" className="lkp-btn lkp-btn--ghost" onClick={dismiss}>Not now</button>
        <button type="button" className="lkp-btn lkp-btn--primary" onClick={enable} disabled={!publicKey}>Enable</button>
      </div>
      <style jsx>{`
        .lkp-banner {
          position: fixed;
          left: 50%;
          bottom: calc(env(safe-area-inset-bottom, 0px) + 4.8rem);
          transform: translateX(-50%);
          z-index: 95;
          width: min(420px, calc(100vw - 1.5rem));
          background: var(--app-card, #14171f);
          color: var(--app-text, #f7fbff);
          border: 1px solid var(--app-border, rgba(255,255,255,0.08));
          border-radius: 16px;
          padding: 0.85rem 1rem 0.95rem;
          box-shadow: 0 24px 64px rgba(0,0,0,0.42);
          display: flex;
          flex-direction: column;
          gap: 0.55rem;
          animation: lkp-pop 0.2s cubic-bezier(0.32, 0.72, 0, 1);
        }
        @media (min-width: 769px) {
          .lkp-banner { bottom: 1.5rem; }
        }
        .lkp-text { display: flex; flex-direction: column; gap: 0.25rem; }
        .lkp-text strong { font-size: 0.9rem; }
        .lkp-text span { font-size: 0.8rem; color: var(--app-text-muted, rgba(255,255,255,0.65)); line-height: 1.35; }
        .lkp-actions { display: flex; gap: 0.5rem; justify-content: flex-end; }
        .lkp-btn {
          padding: 0.45rem 0.9rem;
          border-radius: 10px;
          border: 1px solid transparent;
          font: inherit;
          font-weight: 600;
          font-size: 0.82rem;
          cursor: pointer;
        }
        .lkp-btn--ghost { background: transparent; border-color: var(--app-border, rgba(255,255,255,0.14)); color: var(--app-text, #f7fbff); }
        .lkp-btn--ghost:hover { background: rgba(255,255,255,0.05); }
        .lkp-btn--primary { background: var(--app-accent, #7cecff); color: #07090d; }
        .lkp-btn--primary:hover { filter: brightness(1.08); }
        .lkp-btn--primary:disabled { opacity: 0.55; cursor: not-allowed; }
        @keyframes lkp-pop { from { opacity: 0; transform: translate(-50%, 8px); } to { opacity: 1; transform: translate(-50%, 0); } }
      `}</style>
    </div>
  );
}
