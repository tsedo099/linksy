"use client";

import { createContext, useCallback, useContext, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";

type ConfirmOptions = {
  message: string;
  /** Optional short title above the message. Falls back to "Are you sure?" */
  title?: string;
  /** Label for the confirm button. Defaults to "Confirm". */
  confirmLabel?: string;
  /** Label for the cancel button. Defaults to "Cancel". */
  cancelLabel?: string;
  /** Render the confirm button in a destructive red style. Defaults to true
   *  because almost every prompt in the app is a destructive action. */
  destructive?: boolean;
};

type ConfirmFn = (messageOrOpts: string | ConfirmOptions) => Promise<boolean>;

const ConfirmCtx = createContext<ConfirmFn | null>(null);

type PendingPrompt = ConfirmOptions & {
  resolve: (value: boolean) => void;
};

export function ConfirmProvider({ children }: { children: ReactNode }) {
  const [pending, setPending] = useState<PendingPrompt | null>(null);

  const confirm = useCallback<ConfirmFn>((messageOrOpts) => {
    return new Promise<boolean>((resolve) => {
      const opts: ConfirmOptions = typeof messageOrOpts === "string"
        ? { message: messageOrOpts }
        : messageOrOpts;
      setPending({ ...opts, resolve });
    });
  }, []);

  const handle = (value: boolean) => {
    if (!pending) return;
    pending.resolve(value);
    setPending(null);
  };

  return (
    <ConfirmCtx.Provider value={confirm}>
      {children}
      {pending && typeof window !== "undefined" && createPortal(
        <div className="lkc-overlay" onClick={() => handle(false)} role="dialog" aria-modal="true">
          <div className="lkc-card" onClick={(e) => e.stopPropagation()}>
            <div className="lkc-title">{pending.title ?? "Are you sure?"}</div>
            <div className="lkc-msg">{pending.message}</div>
            <div className="lkc-actions">
              <button
                type="button"
                className="lkc-btn lkc-btn--ghost"
                onClick={() => handle(false)}
                autoFocus
              >
                {pending.cancelLabel ?? "Cancel"}
              </button>
              <button
                type="button"
                className={`lkc-btn ${pending.destructive !== false ? "lkc-btn--danger" : "lkc-btn--primary"}`}
                onClick={() => handle(true)}
              >
                {pending.confirmLabel ?? "Confirm"}
              </button>
            </div>
          </div>
          <style jsx>{`
            .lkc-overlay {
              position: fixed; inset: 0; z-index: 10000;
              background: rgba(5, 6, 12, 0.62);
              backdrop-filter: blur(6px);
              -webkit-backdrop-filter: blur(6px);
              display: flex; align-items: center; justify-content: center;
              padding: 1rem;
              animation: lkc-fade 0.12s ease-out;
            }
            .lkc-card {
              background: var(--app-card, #14171f);
              color: var(--app-text, #f7fbff);
              border: 1px solid var(--app-border, rgba(255,255,255,0.08));
              border-radius: 16px;
              padding: 1.25rem 1.25rem 1rem;
              width: min(420px, calc(100vw - 2rem));
              box-shadow: 0 24px 64px rgba(0,0,0,0.55);
              animation: lkc-pop 0.15s cubic-bezier(0.32, 0.72, 0, 1);
            }
            .lkc-title {
              font-size: 1rem;
              font-weight: 700;
              margin-bottom: 0.45rem;
              line-height: 1.2;
            }
            .lkc-msg {
              font-size: 0.92rem;
              line-height: 1.45;
              color: var(--app-text-muted, rgba(255,255,255,0.7));
              margin-bottom: 1.25rem;
            }
            .lkc-actions {
              display: flex;
              gap: 0.6rem;
              justify-content: flex-end;
            }
            .lkc-btn {
              padding: 0.55rem 1rem;
              border-radius: 10px;
              border: 1px solid transparent;
              font: inherit;
              font-weight: 600;
              font-size: 0.88rem;
              cursor: pointer;
              transition: transform 0.08s ease, background 0.12s ease, border-color 0.12s ease;
            }
            .lkc-btn:active { transform: scale(0.97); }
            .lkc-btn--ghost {
              background: transparent;
              border-color: var(--app-border, rgba(255,255,255,0.14));
              color: var(--app-text, #f7fbff);
            }
            .lkc-btn--ghost:hover { background: rgba(255,255,255,0.05); }
            .lkc-btn--primary {
              background: var(--app-accent, #7cecff);
              color: #07090d;
            }
            .lkc-btn--primary:hover { filter: brightness(1.08); }
            .lkc-btn--danger {
              background: #dc2626;
              color: #fff;
            }
            .lkc-btn--danger:hover { background: #b91c1c; }
            @keyframes lkc-fade { from { opacity: 0; } to { opacity: 1; } }
            @keyframes lkc-pop { from { opacity: 0; transform: scale(0.95); } to { opacity: 1; transform: scale(1); } }
          `}</style>
        </div>,
        document.body,
      )}
    </ConfirmCtx.Provider>
  );
}

/**
 * `const confirm = useConfirm(); if (await confirm("Block @yuri?")) ...`
 * Drop-in replacement for `window.confirm` that renders a themed modal
 * instead of the browser's native chrome.
 */
export function useConfirm(): ConfirmFn {
  const ctx = useContext(ConfirmCtx);
  if (!ctx) {
    // Fallback to native confirm so a forgotten Provider wrap doesn't
    // crash destructive flows.
    return (input) => Promise.resolve(window.confirm(typeof input === "string" ? input : input.message));
  }
  return ctx;
}
