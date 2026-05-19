"use client";

import { AppShell } from "@/components/app-shell";
import { useAiAgentBridge, type PostAudience } from "@/lib/stores/ai-agent-bridge";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";

type Turn = { role: "user" | "model"; text: string };

type Quota = {
  used: number;
  quota: number;
  tier: "FREE" | "PRO";
  allowed: boolean;
};

type AgentAction =
  | { name: "navigate"; args: { path: string } }
  | { name: "set_post_caption"; args: { caption: string } }
  | { name: "set_post_location"; args: { location: string } }
  | { name: "set_post_audience"; args: { audience: PostAudience } }
  | { name: "open_image_picker"; args: Record<string, never> }
  | { name: "open_story_editor"; args: Record<string, never> };

const QUICK_PROMPTS = [
  { label: "Caption ideas", text: "Help me write 3 captions for a sunset photo from my weekend trip." },
  { label: "New post with image", text: "Go to create, write a caption about my coffee morning, and prompt me to upload an image." },
  { label: "Reply suggestion", text: "How should I reply to a follower who said \"love your style!\" on my latest post?" },
];

const HISTORY_STORAGE_KEY = "linksy:ai-chat-history";
const HISTORY_MAX_TURNS = 80;

/**
 * Human copy for "time until UTC midnight" — the AI quota resets at the
 * start of the next UTC day. Returns a short label like "4h" / "32m" /
 * "<1m". `null` means we're past the reset boundary already (the next
 * fetch will pick up the cleared count).
 */
function resetsInLabel(now: Date = new Date()): string {
  const tomorrowUtc = Date.UTC(
    now.getUTCFullYear(),
    now.getUTCMonth(),
    now.getUTCDate() + 1,
  );
  const msLeft = tomorrowUtc - now.getTime();
  if (msLeft <= 0) return "<1m";
  const minutes = Math.floor(msLeft / 60_000);
  if (minutes < 60) return minutes < 1 ? "<1m" : `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  return `${hours}h`;
}

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
  } catch { /* quota or denied */ }
}

export function AiScreen() {
  const router = useRouter();
  const seedPostDraft = useAiAgentBridge((s) => s.seedPostDraft);
  const requestImagePicker = useAiAgentBridge((s) => s.requestImagePicker);
  const requestStoryEditor = useAiAgentBridge((s) => s.requestStoryEditor);

  const [turns, setTurns] = useState<Turn[]>([]);
  const [hydrated, setHydrated] = useState(false);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [quota, setQuota] = useState<Quota | null>(null);
  // Re-render tick so the "Resets in Xh" countdown stays fresh without
  // refetching the quota every minute. Cheap: one render per 60s.
  const [, setNowTick] = useState(0);
  const bottomRef = useRef<HTMLDivElement | null>(null);

  // Restore prior chat on mount, persist on every change after.
  // State-based hydration (not a ref) so the save effect's first pass
  // sees `hydrated === false` and SKIPS writing the empty initial array
  // over the localStorage value we're about to load.
  useEffect(() => {
    setTurns(loadStoredHistory());
    setHydrated(true);
  }, []);
  useEffect(() => {
    if (!hydrated) return;
    storeHistory(turns);
  }, [turns, hydrated]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [turns]);

  // Initial quota fetch — uses `peek` so we never burn a slot just to render
  // the badge. Subsequent updates piggy-back on the chat response's `quota`
  // field so a separate refresh interval isn't needed.
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch("/api/ai/quota", { credentials: "include" });
        if (!res.ok) return;
        const data = (await res.json().catch(() => null)) as { quota?: Quota } | null;
        if (!cancelled && data?.quota) setQuota(data.quota);
      } catch { /* ignore */ }
    })();
    return () => { cancelled = true; };
  }, []);

  // Keep the "Resets in Xh" copy current. UTC midnight is the reset point,
  // so the countdown advances ~once an hour — tick every 60s is enough.
  useEffect(() => {
    const id = window.setInterval(() => setNowTick((n) => n + 1), 60_000);
    return () => window.clearInterval(id);
  }, []);

  const executeActions = useCallback((actions: AgentAction[]) => {
    let didNavigate = false;
    for (const action of actions) {
      switch (action.name) {
        case "navigate":
          if (typeof action.args?.path === "string" && action.args.path.startsWith("/")) {
            router.push(action.args.path);
            didNavigate = true;
          }
          break;
        case "set_post_caption":
          if (typeof action.args?.caption === "string") {
            seedPostDraft({ caption: action.args.caption });
          }
          break;
        case "set_post_location":
          if (typeof action.args?.location === "string") {
            seedPostDraft({ location: action.args.location });
          }
          break;
        case "set_post_audience":
          if (["PUBLIC", "FRIENDS", "CLOSE_CIRCLE"].includes(action.args?.audience)) {
            seedPostDraft({ audience: action.args.audience });
          }
          break;
        case "open_image_picker":
          // Delay so the create page has time to mount + register listener.
          window.setTimeout(() => requestImagePicker(), didNavigate ? 400 : 0);
          break;
        case "open_story_editor":
          // Story modal lives in AppShell — available from any route.
          requestStoryEditor();
          break;
      }
    }
  }, [router, seedPostDraft, requestImagePicker, requestStoryEditor]);

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
      // Server returns the updated quota on BOTH success (200) and refusal
      // (429), so the badge updates correctly either way.
      if (data?.quota) setQuota(data.quota as Quota);
      if (!response.ok) {
        throw new Error(data?.error ?? `Request failed (${response.status})`);
      }
      const replyText: string = data?.text ?? "";
      const actions: AgentAction[] = Array.isArray(data?.actions) ? data.actions : [];
      const displayText = replyText.trim() || (actions.length ? "Done." : "(no reply)");
      setTurns([...nextHistory, { role: "model", text: displayText }]);
      if (actions.length) executeActions(actions);
    } catch (err) {
      const message = err instanceof Error ? err.message : "AI request failed";
      setError(message);
    } finally {
      setSending(false);
    }
  }, [sending, turns, executeActions]);

  const clear = useCallback(() => {
    setTurns([]);
    setError(null);
    if (typeof window !== "undefined") {
      try { window.localStorage.removeItem(HISTORY_STORAGE_KEY); } catch {}
    }
  }, []);

  return (
    <AppShell>
      <div className="ai-chat">
        <header className="ai-chat-header">
          <div>
            <p className="ai-chat-kicker">Powered by Gemini</p>
            <h1 className="ai-chat-title">Linksy AI</h1>
          </div>
          <div className="ai-chat-header-right">
            {quota && (
              <span
                className={`ai-chat-quota ai-chat-quota--${quota.tier.toLowerCase()}${quota.used >= quota.quota ? " ai-chat-quota--full" : ""}`}
                title={`Daily ${quota.tier} quota — resets at UTC midnight`}
              >
                <span className="ai-chat-quota-count">{quota.used}/{quota.quota}</span>
                <span className="ai-chat-quota-sep">·</span>
                <span className="ai-chat-quota-reset">Resets in {resetsInLabel()}</span>
              </span>
            )}
            {turns.length > 0 && (
              <button type="button" className="ai-chat-clear" onClick={clear}>
                New chat
              </button>
            )}
          </div>
        </header>

        <div className="ai-chat-scroll">
          {turns.length === 0 ? (
            <div className="ai-chat-empty">
              <div className="ai-chat-empty-orb" aria-hidden="true" />
              <h2>How can I help today?</h2>
              <p>Ask anything, or tell me to take action (e.g. &ldquo;create a new post about ___&rdquo;).</p>
              <div className="ai-chat-quick">
                {QUICK_PROMPTS.map((q) => (
                  <button
                    key={q.label}
                    type="button"
                    className="ai-chat-quick-btn"
                    onClick={() => send(q.text)}
                    disabled={sending}
                  >
                    {q.label}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <div className="ai-chat-list">
              {turns.map((turn, i) => (
                <div key={i} className={`ai-chat-bubble ai-chat-bubble--${turn.role}`}>
                  <span className="ai-chat-bubble-role">{turn.role === "user" ? "You" : "Linksy AI"}</span>
                  <div className="ai-chat-bubble-text">{turn.text}</div>
                </div>
              ))}
              {sending && (
                <div className="ai-chat-bubble ai-chat-bubble--model">
                  <span className="ai-chat-bubble-role">Linksy AI</span>
                  <div className="ai-chat-bubble-text">
                    <span className="ai-chat-bubble-dots">...</span>
                  </div>
                </div>
              )}
              <div ref={bottomRef} />
            </div>
          )}
        </div>

        {error && <p className="ai-chat-error" role="alert">{error}</p>}

        <form
          className="ai-chat-form"
          onSubmit={(event) => {
            event.preventDefault();
            void send(draft);
          }}
        >
          <textarea
            className="ai-chat-input"
            placeholder="Message Linksy AI…"
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter" && !event.shiftKey) {
                event.preventDefault();
                void send(draft);
              }
            }}
            rows={1}
            disabled={sending}
          />
          <button type="submit" className="ai-chat-send" disabled={!draft.trim() || sending}>
            Send
          </button>
        </form>
      </div>

      <style>{`
        .ai-chat { display: flex; flex-direction: column; height: 100vh; max-width: 880px; margin: 0 auto; padding: 1.5rem 1.25rem 1rem; box-sizing: border-box; }
        .ai-chat-header { display: flex; align-items: flex-end; justify-content: space-between; gap: 1rem; padding-bottom: 1rem; border-bottom: 1px solid var(--app-border); }
        .ai-chat-kicker { margin: 0; font-size: 0.72rem; letter-spacing: 0.16em; text-transform: uppercase; color: var(--muted); }
        .ai-chat-title { margin: 0.2rem 0 0; font-size: 1.6rem; font-weight: 700; color: var(--text); }
        .ai-chat-header-right { display: flex; align-items: center; gap: 0.6rem; }
        .ai-chat-clear { background: transparent; border: 1px solid var(--app-border); color: var(--text); padding: 0.45rem 0.85rem; border-radius: 999px; font-size: 0.8rem; cursor: pointer; }
        .ai-chat-clear:hover { background: var(--app-card-soft); }
        .ai-chat-quota { display: inline-flex; align-items: center; gap: 0.4rem; padding: 0.32rem 0.7rem; border-radius: 999px; font-size: 0.72rem; font-weight: 500; background: var(--app-card-soft); border: 1px solid var(--app-border); color: var(--muted); white-space: nowrap; }
        .ai-chat-quota-count { font-weight: 700; color: var(--text); font-variant-numeric: tabular-nums; }
        .ai-chat-quota-sep { opacity: 0.5; }
        .ai-chat-quota-reset { opacity: 0.85; }
        .ai-chat-quota--pro { background: linear-gradient(90deg, rgba(168,85,247,.12), rgba(124,58,237,.12)); border-color: rgba(168,85,247,.35); color: #c084fc; }
        .ai-chat-quota--pro .ai-chat-quota-count { color: #e9d5ff; }
        .ai-chat-quota--full { background: rgba(220,38,38,.1); border-color: rgba(220,38,38,.35); color: #fca5a5; }
        .ai-chat-quota--full .ai-chat-quota-count { color: #fecaca; }
        @media (max-width: 560px) {
          .ai-chat-quota-reset, .ai-chat-quota-sep { display: none; }
        }
        .ai-chat-scroll { flex: 1; overflow-y: auto; padding: 1rem 0; }
        .ai-chat-empty { display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 0.65rem; padding: 3rem 1rem; text-align: center; }
        .ai-chat-empty-orb { width: 72px; height: 72px; border-radius: 999px; background: radial-gradient(circle at 30% 30%, rgba(255,255,255,.22), transparent 55%), linear-gradient(135deg, var(--app-accent), var(--app-accent-secondary, #a855f7)); box-shadow: 0 0 32px rgba(var(--app-accent-rgb, 124 58 237), .35); }
        .ai-chat-empty h2 { margin: 0; font-size: 1.4rem; color: var(--text); }
        .ai-chat-empty p { margin: 0 0 1rem; color: var(--muted); }
        .ai-chat-quick { display: flex; gap: 0.5rem; flex-wrap: wrap; justify-content: center; }
        .ai-chat-quick-btn { background: var(--app-card); border: 1px solid var(--app-border); color: var(--text); padding: 0.55rem 0.95rem; border-radius: 999px; font-size: 0.85rem; cursor: pointer; }
        .ai-chat-quick-btn:hover:not(:disabled) { border-color: var(--app-accent); color: var(--app-accent); }
        .ai-chat-quick-btn:disabled { opacity: 0.5; cursor: default; }
        .ai-chat-list { display: flex; flex-direction: column; gap: 0.9rem; }
        .ai-chat-bubble { display: flex; flex-direction: column; gap: 0.25rem; padding: 0.75rem 1rem; border-radius: 14px; max-width: 92%; word-wrap: break-word; }
        .ai-chat-bubble--user { align-self: flex-end; background: var(--app-accent); color: #fff; }
        .ai-chat-bubble--model { align-self: flex-start; background: var(--app-card); border: 1px solid var(--app-border); color: var(--text); }
        .ai-chat-bubble-role { font-size: 0.7rem; font-weight: 700; letter-spacing: 0.06em; text-transform: uppercase; opacity: 0.7; }
        .ai-chat-bubble-text { white-space: pre-wrap; line-height: 1.55; }
        .ai-chat-bubble-dots { letter-spacing: 0.2em; opacity: 0.5; }
        .ai-chat-error { margin: 0.5rem 0; padding: 0.6rem 0.85rem; background: rgba(220, 38, 38, 0.1); border: 1px solid rgba(220, 38, 38, 0.35); border-radius: 10px; color: #fca5a5; font-size: 0.85rem; }
        .ai-chat-form { display: flex; gap: 0.5rem; padding-top: 0.75rem; border-top: 1px solid var(--app-border); }
        .ai-chat-input { flex: 1; background: var(--app-card); border: 1px solid var(--app-border); border-radius: 12px; padding: 0.75rem 0.9rem; color: var(--text); font-family: inherit; font-size: 0.95rem; resize: none; min-height: 44px; max-height: 200px; outline: none; }
        .ai-chat-input:focus { border-color: var(--app-accent); }
        .ai-chat-input:disabled { opacity: 0.6; }
        .ai-chat-send { padding: 0.65rem 1.2rem; border-radius: 10px; border: none; font-weight: 600; font-size: 0.9rem; cursor: pointer; background: var(--app-accent); color: #fff; }
        .ai-chat-send:disabled { opacity: 0.5; cursor: default; }
      `}</style>
    </AppShell>
  );
}
