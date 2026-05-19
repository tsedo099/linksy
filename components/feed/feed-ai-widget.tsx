"use client";

import { useAiAgentBridge, type PostAudience } from "@/lib/stores/ai-agent-bridge";
import { useAiWidgetStore } from "@/lib/stores/ai-widget";
import { Sparkles } from "lucide-react";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";

/**
 * Floating /home mini-chat for Linksy AI — mirrors the DMWidget pattern:
 * a small bubble in the bottom-right that expands to a docked chat panel.
 * Shares storage + action handlers with the full `/ai` screen so chat
 * history (`linksy:ai-chat-history`) and seeded post drafts stay
 * consistent across surfaces.
 */

type Turn = { role: "user" | "model"; text: string };

type AgentAction =
  | { name: "navigate"; args: { path: string } }
  | { name: "set_post_caption"; args: { caption: string } }
  | { name: "set_post_location"; args: { location: string } }
  | { name: "set_post_audience"; args: { audience: PostAudience } }
  | { name: "open_image_picker"; args: Record<string, never> }
  | { name: "open_story_editor"; args: Record<string, never> };

const HISTORY_STORAGE_KEY = "linksy:ai-chat-history";
const HISTORY_MAX_TURNS = 80;

function loadStoredHistory(): Turn[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(HISTORY_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((t): t is Turn => t && (t.role === "user" || t.role === "model") && typeof t.text === "string")
      .slice(-HISTORY_MAX_TURNS);
  } catch {
    return [];
  }
}

function storeHistory(turns: Turn[]) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(HISTORY_STORAGE_KEY, JSON.stringify(turns.slice(-HISTORY_MAX_TURNS)));
  } catch {}
}

export function AiWidget() {
  const router = useRouter();
  const open = useAiWidgetStore((s) => s.open);
  const setOpen = useAiWidgetStore((s) => s.setOpen);
  const seedPostDraft = useAiAgentBridge((s) => s.seedPostDraft);
  const requestImagePicker = useAiAgentBridge((s) => s.requestImagePicker);
  const requestStoryEditor = useAiAgentBridge((s) => s.requestStoryEditor);

  const [turns, setTurns] = useState<Turn[]>([]);
  const [hydrated, setHydrated] = useState(false);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    setTurns(loadStoredHistory());
    setHydrated(true);
  }, []);
  useEffect(() => {
    if (!hydrated) return;
    storeHistory(turns);
  }, [turns, hydrated]);
  useEffect(() => {
    if (open) scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
  }, [turns, open]);

  const executeActions = useCallback((actions: AgentAction[]) => {
    let didNavigate = false;
    for (const action of actions) {
      switch (action.name) {
        case "navigate":
          if (typeof action.args?.path === "string" && action.args.path.startsWith("/")) {
            router.push(action.args.path);
            didNavigate = true;
            // Auto-close the widget so the user can see the destination page.
            setOpen(false);
          }
          break;
        case "set_post_caption":
          if (typeof action.args?.caption === "string") seedPostDraft({ caption: action.args.caption });
          break;
        case "set_post_location":
          if (typeof action.args?.location === "string") seedPostDraft({ location: action.args.location });
          break;
        case "set_post_audience":
          if (["PUBLIC", "FRIENDS", "CLOSE_CIRCLE"].includes(action.args?.audience)) {
            seedPostDraft({ audience: action.args.audience });
          }
          break;
        case "open_image_picker":
          window.setTimeout(() => requestImagePicker(), didNavigate ? 400 : 0);
          break;
        case "open_story_editor":
          // Story modal is mounted by AppShell, so close the mini-widget
          // first to keep focus / z-index simple.
          setOpen(false);
          requestStoryEditor();
          break;
      }
    }
  }, [router, seedPostDraft, requestImagePicker, requestStoryEditor, setOpen]);

  const send = useCallback(async (text: string) => {
    const trimmed = text.trim();
    if (!trimmed || sending) return;
    setError(null);
    setDraft("");
    const nextHistory: Turn[] = [...turns, { role: "user", text: trimmed }];
    setTurns(nextHistory);
    setSending(true);
    try {
      const response = await fetch("/api/ai/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ history: nextHistory }),
      });
      const data = await response.json().catch(() => null);
      if (!response.ok) throw new Error(data?.error ?? `Request failed (${response.status})`);
      const replyText: string = data?.text ?? "";
      const actions: AgentAction[] = Array.isArray(data?.actions) ? data.actions : [];
      const displayText = replyText.trim() || (actions.length ? "Done." : "(no reply)");
      setTurns([...nextHistory, { role: "model", text: displayText }]);
      if (actions.length) executeActions(actions);
    } catch (err) {
      setError(err instanceof Error ? err.message : "AI request failed");
    } finally {
      setSending(false);
    }
  }, [sending, turns, executeActions]);

  return (
    <>
      {!open ? (
        <button
          type="button"
          className="ai-bubble"
          onClick={() => setOpen(true)}
          aria-label="Open Linksy AI"
        >
          <Sparkles width={26} height={26} strokeWidth={1.75} aria-hidden />
        </button>
      ) : (
        <AiMiniPanel
          turns={turns}
          draft={draft}
          sending={sending}
          error={error}
          scrollRef={scrollRef}
          onDraftChange={setDraft}
          onClose={() => setOpen(false)}
          onOpenFull={() => { setOpen(false); router.push("/ai"); }}
          onSend={(text) => void send(text)}
        />
      )}
      <style>{`
        .ai-bubble {
          position: fixed;
          /* Stacked above the DM bubble (DM at bottom: 1.5rem with 64px
             height) with a 0.9rem visual gap. Same right offset + size
             so both bubbles match on a single vertical axis. */
          bottom: calc(1.5rem + 64px + 0.9rem);
          right: calc(var(--feed-rail-size, 5.35rem) + 1.25rem);
          z-index: 150;
          width: 64px;
          height: 64px;
          border-radius: 50%;
          background: linear-gradient(135deg, var(--app-accent), var(--app-accent-secondary, #a855f7));
          color: #fff;
          border: none;
          cursor: pointer;
          display: flex;
          align-items: center;
          justify-content: center;
          box-shadow: 0 4px 20px rgba(var(--app-accent-rgb, 124 58 237), 0.5);
          transition: transform .15s, box-shadow .15s;
        }
        .ai-bubble:hover { transform: scale(1.08); box-shadow: 0 6px 26px rgba(var(--app-accent-rgb, 124 58 237), 0.65); }

        .ai-mini {
          position: fixed;
          bottom: 1.5rem;
          right: calc(var(--feed-rail-size, 5.35rem) + 1.25rem);
          z-index: 150;
          width: min(360px, calc(100vw - 2rem));
          height: min(520px, calc(100vh - 3rem));
          background: var(--app-card);
          border: 1px solid var(--app-border);
          border-radius: 16px;
          box-shadow: 0 20px 60px rgba(0,0,0,0.45);
          display: flex;
          flex-direction: column;
          overflow: hidden;
        }
        .ai-mini-header { display: flex; align-items: center; justify-content: space-between; padding: 0.65rem 0.85rem; border-bottom: 1px solid var(--app-border); }
        .ai-mini-title-row { display: flex; align-items: center; gap: 0.55rem; }
        .ai-mini-orb { width: 28px; height: 28px; border-radius: 999px; background: radial-gradient(circle at 30% 30%, rgba(255,255,255,.25), transparent 55%), linear-gradient(135deg, var(--app-accent), var(--app-accent-secondary, #a855f7)); box-shadow: 0 0 14px rgba(var(--app-accent-rgb, 124 58 237), .45); }
        .ai-mini-title { display: block; font-size: 0.88rem; font-weight: 700; color: var(--text); }
        .ai-mini-sub { display: block; font-size: 0.66rem; letter-spacing: 0.1em; text-transform: uppercase; color: var(--muted); }
        .ai-mini-actions { display: flex; gap: 0.25rem; }
        .ai-mini-btn { background: transparent; border: none; color: var(--muted); width: 28px; height: 28px; border-radius: 8px; display: flex; align-items: center; justify-content: center; cursor: pointer; }
        .ai-mini-btn:hover { background: var(--app-card-soft); color: var(--text); }
        .ai-mini-scroll { flex: 1; overflow-y: auto; padding: 0.85rem; display: flex; flex-direction: column; gap: 0.5rem; }
        .ai-mini-empty { color: var(--muted); font-size: 0.85rem; text-align: center; padding: 1rem; }
        .ai-mini-empty p { margin: 0; }
        .ai-mini-bubble { padding: 0.55rem 0.8rem; border-radius: 12px; font-size: 0.85rem; line-height: 1.45; white-space: pre-wrap; max-width: 88%; word-wrap: break-word; }
        .ai-mini-bubble--user { align-self: flex-end; background: var(--app-accent); color: #fff; }
        .ai-mini-bubble--model { align-self: flex-start; background: var(--app-card-soft); color: var(--text); border: 1px solid var(--app-border); }
        .ai-mini-bubble--dots { letter-spacing: 0.2em; opacity: 0.6; }
        .ai-mini-error { margin: 0 0.85rem 0.5rem; padding: 0.45rem 0.65rem; background: rgba(220, 38, 38, 0.1); border: 1px solid rgba(220, 38, 38, 0.35); border-radius: 8px; color: #fca5a5; font-size: 0.75rem; }
        .ai-mini-form { display: flex; gap: 0.4rem; padding: 0.55rem 0.65rem; border-top: 1px solid var(--app-border); }
        .ai-mini-input { flex: 1; background: var(--app-background); border: 1px solid var(--app-border); border-radius: 999px; padding: 0.5rem 0.85rem; color: var(--text); font-family: inherit; font-size: 0.85rem; outline: none; }
        .ai-mini-input:focus { border-color: var(--app-accent); }
        .ai-mini-send { width: 36px; height: 36px; border-radius: 50%; background: var(--app-accent); color: #fff; border: none; cursor: pointer; display: flex; align-items: center; justify-content: center; }
        .ai-mini-send:disabled { opacity: 0.4; cursor: default; }
      `}</style>
    </>
  );
}

function AiMiniPanel({
  turns,
  draft,
  sending,
  error,
  scrollRef,
  onDraftChange,
  onClose,
  onOpenFull,
  onSend,
}: {
  turns: Turn[];
  draft: string;
  sending: boolean;
  error: string | null;
  scrollRef: React.RefObject<HTMLDivElement | null>;
  onDraftChange: (next: string) => void;
  onClose: () => void;
  onOpenFull: () => void;
  onSend: (text: string) => void;
}) {
  return (
    <div className="ai-mini">
      <header className="ai-mini-header">
        <div className="ai-mini-title-row">
          <span className="ai-mini-orb" aria-hidden="true" />
          <div>
            <span className="ai-mini-title">Linksy AI</span>
            <span className="ai-mini-sub">Powered by Gemini</span>
          </div>
        </div>
        <div className="ai-mini-actions">
          <button
            type="button"
            className="ai-mini-btn"
            onClick={onOpenFull}
            aria-label="Open full AI chat"
            title="Open full chat"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" width="18" height="18" aria-hidden="true">
              <path d="M7 17 17 7" />
              <path d="M8 7h9v9" />
            </svg>
          </button>
          <button type="button" className="ai-mini-btn" onClick={onClose} aria-label="Close">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" width="18" height="18" aria-hidden="true">
              <path d="M18 6 6 18M6 6l12 12" />
            </svg>
          </button>
        </div>
      </header>

      <div className="ai-mini-scroll" ref={scrollRef}>
        {turns.length === 0 ? (
          <div className="ai-mini-empty">
            <p>Ask me to draft a caption, summarize the feed, or set up a new post.</p>
          </div>
        ) : (
          turns.map((turn, i) => (
            <div key={i} className={`ai-mini-bubble ai-mini-bubble--${turn.role}`}>
              {turn.text}
            </div>
          ))
        )}
        {sending && <div className="ai-mini-bubble ai-mini-bubble--model ai-mini-bubble--dots">…</div>}
      </div>

      {error && <p className="ai-mini-error" role="alert">{error}</p>}

      <form
        className="ai-mini-form"
        onSubmit={(event) => { event.preventDefault(); onSend(draft); }}
      >
        <input
          className="ai-mini-input"
          placeholder="Message Linksy AI…"
          value={draft}
          onChange={(event) => onDraftChange(event.target.value)}
          disabled={sending}
        />
        <button type="submit" className="ai-mini-send" disabled={!draft.trim() || sending} aria-label="Send">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" width="18" height="18" aria-hidden="true">
            <path d="M22 2 11 13" />
            <path d="M22 2 15 22l-4-9-9-4Z" />
          </svg>
        </button>
      </form>

    </div>
  );
}
