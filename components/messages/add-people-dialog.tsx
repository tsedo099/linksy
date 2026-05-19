"use client";

import { useMemo, useRef, useState } from "react";
import { IcX } from "./icons";
import type { ApiUser } from "./types";

export function AddPeopleDialog({
  conversationId,
  existingMemberIds,
  onClose,
  onAdded,
}: {
  conversationId: string;
  existingMemberIds: string[];
  onClose: () => void;
  onAdded: () => void;
}) {
  const [q, setQ] = useState("");
  const [results, setResults] = useState<ApiUser[]>([]);
  const [selected, setSelected] = useState<ApiUser[]>([]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const existing = useMemo(() => new Set(existingMemberIds), [existingMemberIds]);

  function search(v: string) {
    setQ(v);
    if (timerRef.current) clearTimeout(timerRef.current);
    if (!v.trim()) {
      setResults([]);
      return;
    }
    timerRef.current = setTimeout(async () => {
      try {
        const r = await fetch(`/api/users/search?q=${encodeURIComponent(v)}`);
        if (!r.ok) return;
        const data = await r.json();
        setResults((data.users ?? []).filter((u: ApiUser) => !existing.has(u.id)));
      } catch {
        setResults([]);
      }
    }, 280);
  }

  function toggle(u: ApiUser) {
    setSelected((p) => (p.find((x) => x.id === u.id) ? p.filter((x) => x.id !== u.id) : [...p, u]));
  }

  async function submit() {
    if (selected.length === 0 || busy) return;
    setBusy(true);
    setErr(null);
    try {
      const r = await fetch(`/api/conversations/${conversationId}/members`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userIds: selected.map((u) => u.id) }),
      });
      if (!r.ok) {
        const data = (await r.json().catch(() => null)) as { error?: string } | null;
        throw new Error(data?.error ?? "Could not add members.");
      }
      onAdded();
    } catch (error) {
      setErr(error instanceof Error ? error.message : "Could not add members.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="ms-modal-backdrop" onClick={onClose} role="presentation">
      <div
        className="ms-modal ms-modal--add-people"
        role="dialog"
        aria-label="Add people"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="ms-modal-head">
          <span>Add people</span>
          <button type="button" className="ms-icon-btn" onClick={onClose} aria-label="Close">
            <IcX />
          </button>
        </header>
        <div className="ms-modal-field">
          <input
            type="search"
            className="ms-modal-input"
            placeholder="Search by name or username"
            value={q}
            onChange={(e) => search(e.target.value)}
            autoFocus
          />
        </div>
        {selected.length > 0 ? (
          <div className="ms-modal-chips">
            {selected.map((u) => (
              <span key={u.id} className="ms-chip">
                @{u.username}
                <button type="button" onClick={() => toggle(u)} aria-label={`Remove ${u.username}`}>×</button>
              </span>
            ))}
          </div>
        ) : null}
        <div className="ms-modal-results">
          {results.map((u) => {
            const isSelected = selected.some((s) => s.id === u.id);
            return (
              <button
                key={u.id}
                type="button"
                className={`ms-modal-user${isSelected ? " ms-modal-user--sel" : ""}`}
                onClick={() => toggle(u)}
              >
                <div className="ms-modal-uinfo">
                  <span className="ms-modal-uname">{u.displayName}</span>
                  <span className="ms-modal-usub">@{u.username}</span>
                </div>
                {isSelected ? <span className="ms-modal-check">✓</span> : null}
              </button>
            );
          })}
          {q.trim() && results.length === 0 ? (
            <p className="ms-modal-empty">No matches.</p>
          ) : null}
        </div>
        {err ? <p className="ms-modal-error">{err}</p> : null}
        <div className="ms-modal-foot">
          <button type="button" className="ms-modal-create" disabled={busy || selected.length === 0} onClick={submit}>
            {busy ? "Adding…" : `Add ${selected.length || ""}`.trim()}
          </button>
        </div>
      </div>
    </div>
  );
}
