"use client";

import React, { useRef, useState } from "react";
import { useFocusTrap } from "@/lib/use-focus-trap";
import { useRovingTabIndex } from "@/lib/use-roving-tabindex";
import type { MessagesScreenStrings } from "@/lib/i18n/messages-screen-copy";
import { Av } from "./avatar";
import { IcX } from "./icons";
import { apiErrorMessage, type ApiUser } from "./types";

export function ComposeModal({ myId, onClose, onCreated, onError, ms }: {
  myId: string;
  onClose: () => void;
  onCreated: (id: string) => void;
  onError: (message: string) => void;
  ms: MessagesScreenStrings;
}) {
  const [tab, setTab]             = useState<"direct" | "group">("direct");
  const [q, setQ]                 = useState("");
  const [results, setResults]     = useState<ApiUser[]>([]);
  const [selected, setSelected]   = useState<ApiUser[]>([]);
  const [groupName, setGroupName] = useState("");
  const [loading, setLoading]     = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const modalRef = useRef<HTMLDivElement>(null);
  const tabsRef = useRef<HTMLDivElement>(null);
  useFocusTrap(true, modalRef);
  useRovingTabIndex({
    active: true,
    rootRef: tabsRef,
    itemSelector: ".ms-modal-tab",
    orientation: "horizontal",
  });

  function doSearch(v: string) {
    setQ(v);
    if (timerRef.current) clearTimeout(timerRef.current);
    if (!v.trim()) { setResults([]); return; }
    timerRef.current = setTimeout(async () => {
      const r = await fetch(`/api/users/search?q=${encodeURIComponent(v)}`).catch(() => null);
      if (!r?.ok) {
        setResults([]);
        return;
      }
      setResults((await r.json()).users ?? []);
    }, 280);
  }

  function toggle(u: ApiUser) {
    setLocalError(null);
    if (tab === "direct") {
      // direct mode: single-select — replace any previous pick with the new one,
      // or clear it if the user re-taps the same row.
      setSelected((p) => (p[0]?.id === u.id ? [] : [u]));
      return;
    }
    setSelected((p) => (p.find((x) => x.id === u.id) ? p.filter((x) => x.id !== u.id) : [...p, u]));
  }

  function removeChip(id: string) {
    setSelected((p) => p.filter((x) => x.id !== id));
  }

  async function startConvo(users: ApiUser[]) {
    if (loading) return;
    if (users.length === 0) return;
    setLoading(true);
    setLocalError(null);

    try {
      const body = tab === "group"
        ? { isGroup: true, userIds: [myId, ...users.map(u => u.id)], name: groupName.trim() || undefined }
        : { targetUserId: users[0]?.id };
      const r = await fetch("/api/conversations", {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
      }).catch(() => null);
      if (!r?.ok) throw new Error(await apiErrorMessage(r, ms.couldNotStartChat));

      const d = (await r.json().catch(() => null)) as { conversationId?: string } | null;
      if (!d?.conversationId) throw new Error(ms.couldNotStartChat);

      onCreated(d.conversationId);
    } catch (error) {
      const message = error instanceof Error ? error.message : ms.couldNotStartChat;
      setLocalError(message);
      onError(message);
    } finally {
      setLoading(false);
    }
  }

  const canSubmit =
    tab === "direct" ? selected.length === 1 : selected.length >= 2;
  const submitLabel = (() => {
    if (loading) return ms.modalCreating;
    if (tab === "direct") {
      if (selected.length === 0) return ms.modalDirect;
      return `Chat with @${selected[0]!.username}`;
    }
    if (selected.length < 2) return `Pick ${2 - selected.length} more`;
    return ms.modalCreateGroupFmt(selected.length);
  })();

  return (
    <div className="ms-modal-backdrop" onClick={onClose} role="presentation">
      <div
        ref={modalRef}
        className="ms-modal"
        role="dialog"
        aria-modal="true"
        aria-label={ms.modalNewChat}
        onClick={e => e.stopPropagation()}
      >
        <div className="ms-modal-head">
          <span className="ms-modal-title">{ms.modalNewChat}</span>
          <button type="button" className="ms-icon-btn" onClick={onClose} aria-label={ms.modalCloseComposer}><IcX /></button>
        </div>

        {/* tabs */}
        <div ref={tabsRef} className="ms-modal-tabs" role="tablist" aria-label={ms.modalChatType}>
          <button type="button"
            role="tab"
            aria-selected={tab === "direct"}
            className={`ms-modal-tab${tab === "direct" ? " ms-modal-tab--on" : ""}`}
            onClick={() => { setTab("direct"); setSelected([]); }}
            id="ms-tab-direct"
          >
            {ms.modalDirect}
          </button>
          <button type="button"
            role="tab"
            aria-selected={tab === "group"}
            className={`ms-modal-tab${tab === "group" ? " ms-modal-tab--on" : ""}`}
            onClick={() => { setTab("group"); setSelected([]); }}
            id="ms-tab-group"
          >
            {ms.modalGroup}
          </button>
        </div>

        {tab === "group" && (
          <div className="ms-modal-field">
            <input className="ms-modal-input" placeholder={ms.modalGroupNamePh}
              value={groupName} onChange={e => setGroupName(e.target.value)} maxLength={80} />
          </div>
        )}

        <div className="ms-modal-field">
          <input className="ms-modal-input" placeholder={ms.modalSearchUsersPh}
            value={q} onChange={e => doSearch(e.target.value)} autoFocus />
        </div>

        {selected.length > 0 && (
          <div className="ms-modal-chips">
            <span className="ms-modal-chips-label">
              {tab === "group" ? `Selected ${selected.length}` : "To"}
            </span>
            {selected.map(u => (
              <span key={u.id} className="ms-chip">
                @{u.username}
                <button type="button" onClick={() => removeChip(u.id)} aria-label={`Remove ${u.username}`}>×</button>
              </span>
            ))}
          </div>
        )}

        {tab === "group" && selected.length === 0 && (
          <p className="ms-modal-hint">Pick at least 2 people to start a group.</p>
        )}

        {localError && <p className="ms-modal-error">{localError}</p>}

        <div className="ms-modal-results">
          {results.length === 0 && q && <p className="ms-modal-empty">{ms.modalNoPeople}</p>}
          {results.length === 0 && !q && (
            <p className="ms-modal-empty">{tab === "direct" ? "Search a friend by name or @username." : "Search and tap people to add them."}</p>
          )}
          {results.map(u => {
            const sel = selected.some(x => x.id === u.id);
            return (
              <button key={u.id} className={`ms-modal-user${sel ? " ms-modal-user--sel" : ""}`} onClick={() => toggle(u)} disabled={loading}>
                <Av name={u.displayName} uid={u.id} avatarUrl={u.avatarUrl} size={36} />
                <div className="ms-modal-uinfo">
                  <span className="ms-modal-uname">{u.displayName}</span>
                  <span className="ms-modal-usub">@{u.username}</span>
                </div>
                {sel && <span className="ms-modal-check">✓</span>}
              </button>
            );
          })}
        </div>

        <div className="ms-modal-foot">
          <button
            type="button"
            className="ms-modal-create"
            onClick={() => startConvo(selected)}
            disabled={loading || !canSubmit}
          >
            {submitLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
