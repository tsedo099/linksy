"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useFocusTrap } from "@/lib/use-focus-trap";
import { computeSafetyNumber, safetyNumbersEqual } from "@/lib/e2ee/safety-number";
import { useRef } from "react";

/**
 * Modal that surfaces the 60-digit E2EE safety number for a 1:1 conversation.
 * Each side recomputes the same digits from the two parties' long-term
 * identity signing keys + user IDs (see [lib/e2ee/safety-number.ts]).
 *
 * UI states:
 *   - loading: GET /api/e2ee/verification/:peer to fetch both identity keys
 *   - ready: number visible, "Mark as verified" + "Compare typed number" buttons
 *   - mismatch: server says peer's fingerprint changed since prior verification
 *   - verified: confirmation toast after POST succeeds
 *
 * The server only stores the *fact* of verification (peer fingerprint at
 * verify time) — never the digits themselves, since both clients can
 * recompute them on demand.
 */

type VerificationApiResponse = {
  me: { userId: string; identitySigningKey: string };
  peer: { userId: string; identitySigningKey: string; identityFingerprint: string };
  verification: { verifiedAt: string; stale: boolean; previousFingerprint: string } | null;
};

export function E2EESafetyNumberDialog({
  peerUserId,
  peerDisplayName,
  onClose,
}: {
  peerUserId: string;
  peerDisplayName: string;
  onClose: () => void;
}) {
  const [state, setState] = useState<
    | { kind: "loading" }
    | { kind: "error"; message: string }
    | {
        kind: "ready";
        safetyNumber: string;
        peerFingerprint: string;
        verification: VerificationApiResponse["verification"];
      }
  >({ kind: "loading" });
  const [submitting, setSubmitting] = useState(false);
  const [compareInput, setCompareInput] = useState("");
  const [compareResult, setCompareResult] = useState<"match" | "mismatch" | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  useFocusTrap(true, rootRef);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch(`/api/e2ee/verification/${peerUserId}`, { credentials: "include" });
        if (!res.ok) {
          const body = (await res.json().catch(() => null)) as { error?: string } | null;
          throw new Error(body?.error ?? `Could not load safety number (${res.status}).`);
        }
        const data = (await res.json()) as VerificationApiResponse;
        const safetyNumber = await computeSafetyNumber({
          myUserId: data.me.userId,
          myIdentitySigningKeyBase64: data.me.identitySigningKey,
          peerUserId: data.peer.userId,
          peerIdentitySigningKeyBase64: data.peer.identitySigningKey,
        });
        if (!cancelled) {
          setState({
            kind: "ready",
            safetyNumber,
            peerFingerprint: data.peer.identityFingerprint,
            verification: data.verification,
          });
        }
      } catch (err) {
        if (cancelled) return;
        setState({ kind: "error", message: err instanceof Error ? err.message : "Could not load safety number." });
      }
    })();
    return () => { cancelled = true; };
  }, [peerUserId]);

  const onVerify = useCallback(async () => {
    if (state.kind !== "ready" || submitting) return;
    setSubmitting(true);
    try {
      const res = await fetch(`/api/e2ee/verification/${peerUserId}`, {
        method: "POST",
        credentials: "include",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ peerIdentityFingerprint: state.peerFingerprint }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as { error?: string } | null;
        throw new Error(body?.error ?? "Could not mark verified.");
      }
      setState({
        ...state,
        verification: {
          verifiedAt: new Date().toISOString(),
          stale: false,
          previousFingerprint: state.peerFingerprint,
        },
      });
    } catch (err) {
      setState({ kind: "error", message: err instanceof Error ? err.message : "Could not mark verified." });
    } finally {
      setSubmitting(false);
    }
  }, [peerUserId, state, submitting]);

  const onRevoke = useCallback(async () => {
    if (state.kind !== "ready" || submitting) return;
    setSubmitting(true);
    try {
      await fetch(`/api/e2ee/verification/${peerUserId}`, { method: "DELETE", credentials: "include" });
      setState({ ...state, verification: null });
    } finally {
      setSubmitting(false);
    }
  }, [peerUserId, state, submitting]);

  const ratingChip = useMemo(() => {
    if (state.kind !== "ready") return null;
    if (state.verification && !state.verification.stale) {
      return { label: `Verified ${new Date(state.verification.verifiedAt).toLocaleDateString()}`, tone: "ok" as const };
    }
    if (state.verification?.stale) {
      return { label: "Peer's key changed since you verified", tone: "warn" as const };
    }
    return { label: "Not yet verified", tone: "neutral" as const };
  }, [state]);

  return (
    <div
      ref={rootRef}
      role="dialog"
      aria-modal="true"
      aria-labelledby="e2ee-safety-title"
      style={{
        position: "fixed", inset: 0, zIndex: 9000,
        display: "flex", alignItems: "center", justifyContent: "center",
        background: "rgba(0,0,0,0.6)",
        padding: 16,
      }}
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          maxWidth: 540, width: "100%",
          background: "var(--app-card)",
          border: "1px solid var(--app-border)",
          borderRadius: 16,
          padding: 24,
          color: "var(--app-text)",
          maxHeight: "90vh", overflowY: "auto",
          boxShadow: "0 30px 80px -40px rgba(0,0,0,0.7)",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
          <h2 id="e2ee-safety-title" style={{ margin: 0, fontSize: 18, fontWeight: 700 }}>
            Verify with {peerDisplayName}
          </h2>
          <button type="button" onClick={onClose} aria-label="Close" style={{ background: "transparent", border: "none", color: "inherit", fontSize: 20, cursor: "pointer" }}>×</button>
        </div>
        <p style={{ margin: "8px 0 16px", color: "var(--app-text-muted)", fontSize: 13, lineHeight: 1.5 }}>
          Compare these 60 digits with {peerDisplayName} over a trusted channel
          (in person, voice call, video call). If they match, the conversation
          is end-to-end encrypted with no man-in-the-middle.
        </p>

        {state.kind === "loading" && (
          <div style={{ padding: "32px 0", textAlign: "center", color: "var(--app-text-muted)" }}>Loading safety number…</div>
        )}

        {state.kind === "error" && (
          <div role="alert" style={{ padding: 12, borderRadius: 8, background: "rgba(239,68,68,0.12)", color: "#fecaca", marginBottom: 12 }}>
            {state.message}
          </div>
        )}

        {state.kind === "ready" && (
          <>
            <div
              style={{
                fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
                fontSize: 17, lineHeight: 1.6, letterSpacing: 1,
                background: "var(--app-card-soft)",
                border: "1px solid var(--app-border)",
                borderRadius: 10,
                padding: "14px 16px",
                userSelect: "all",
                wordBreak: "break-all",
              }}
              aria-label="Safety number"
            >
              {state.safetyNumber}
            </div>

            {ratingChip && (
              <div
                style={{
                  marginTop: 12,
                  display: "inline-flex", alignItems: "center", gap: 6,
                  padding: "6px 10px", borderRadius: 999,
                  fontSize: 12, fontWeight: 600,
                  background:
                    ratingChip.tone === "ok" ? "rgba(34,197,94,0.15)" :
                    ratingChip.tone === "warn" ? "rgba(249,115,22,0.18)" :
                    "rgba(148,163,184,0.18)",
                  color:
                    ratingChip.tone === "ok" ? "#86efac" :
                    ratingChip.tone === "warn" ? "#fdba74" :
                    "#cbd5e1",
                }}
              >
                {ratingChip.label}
              </div>
            )}

            <details style={{ marginTop: 16 }}>
              <summary style={{ cursor: "pointer", color: "var(--app-text-muted)", fontSize: 13 }}>
                Compare a typed number instead
              </summary>
              <div style={{ marginTop: 8, display: "flex", flexDirection: "column", gap: 8 }}>
                <input
                  type="text"
                  inputMode="numeric"
                  value={compareInput}
                  onChange={(e) => {
                    setCompareInput(e.target.value);
                    setCompareResult(null);
                  }}
                  placeholder="Paste the 60-digit number"
                  style={{
                    padding: "10px 12px", borderRadius: 8,
                    background: "var(--app-card-soft)",
                    border: "1px solid var(--app-border)",
                    color: "inherit", fontFamily: "inherit",
                  }}
                />
                <button
                  type="button"
                  className="primary-button"
                  onClick={() => setCompareResult(safetyNumbersEqual(state.safetyNumber, compareInput) ? "match" : "mismatch")}
                  disabled={!compareInput.trim()}
                >
                  Compare
                </button>
                {compareResult === "match" && (
                  <div role="status" style={{ color: "#86efac", fontSize: 13 }}>Numbers match — safe to verify.</div>
                )}
                {compareResult === "mismatch" && (
                  <div role="alert" style={{ color: "#fca5a5", fontSize: 13 }}>
                    Numbers DO NOT match. Do not mark verified — somebody may be intercepting.
                  </div>
                )}
              </div>
            </details>

            <div style={{ display: "flex", gap: 8, marginTop: 20, flexWrap: "wrap" }}>
              {!state.verification || state.verification.stale ? (
                <button type="button" className="primary-button" onClick={onVerify} disabled={submitting}>
                  Mark as verified
                </button>
              ) : (
                <button type="button" className="ghost-link" onClick={onRevoke} disabled={submitting}>
                  Revoke verification
                </button>
              )}
              <button type="button" className="ghost-link" onClick={onClose}>Close</button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
