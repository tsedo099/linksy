export type ApiUser = { id: string; username: string; displayName: string; avatarUrl: string | null };
export type ApiMessageReaction = { emoji: string; user: ApiUser; createdAt: string };
export type ApiMember = ApiUser & { role?: "MEMBER" | "ADMIN" };
export type ApiConvo = {
  id: string; updatedAt: string; isGroup: boolean; name: string | null;
  otherUser: ApiUser | null; members: ApiMember[];
  lastMessage: { text: string; mediaUrl?: string | null; createdAt: string; senderId: string; read: boolean; deletedAt?: string | null } | null;
  unread: number;
  myRole?: "MEMBER" | "ADMIN" | null;
};
export type ApiMessage = {
  id: string;
  text: string;
  mediaUrl?: string | null;
  senderId: string;
  createdAt: string;
  editedAt?: string | null;
  deletedAt?: string | null;
  sender: ApiUser;
  reactions?: ApiMessageReaction[];
  replyTo?: {
    messageId: string;
    senderName: string;
    preview: string;
  } | null;
  /** Server-flagged: contains adult content. Body is redacted server-side if the viewer is under 18. */
  containsAdultContent?: boolean;
  /** Server set body to empty because viewer is under 18 — render "restricted" placeholder. */
  adultContentRedacted?: boolean;
};

export const MESSAGE_EDIT_WINDOW_MS = 15 * 60 * 1000;

/** 7 brand-accent presets for per-conversation theming. `null` (or missing) → app default. */
export type ConversationTheme = "default" | "purple" | "pink" | "blue" | "green" | "amber" | "violet" | "rose";

export const CONVERSATION_THEME_OPTIONS: { key: ConversationTheme; label: string; gradient: string }[] = [
  { key: "default", label: "Default", gradient: "linear-gradient(135deg, var(--app-accent), var(--app-accent-secondary))" },
  { key: "purple",  label: "Purple",  gradient: "linear-gradient(135deg, #8b5cf6, #6366f1)" },
  { key: "pink",    label: "Pink",    gradient: "linear-gradient(135deg, #ec4899, #be185d)" },
  { key: "blue",    label: "Blue",    gradient: "linear-gradient(135deg, #3b82f6, #1d4ed8)" },
  { key: "green",   label: "Green",   gradient: "linear-gradient(135deg, #10b981, #047857)" },
  { key: "amber",   label: "Amber",   gradient: "linear-gradient(135deg, #f59e0b, #d97706)" },
  { key: "violet",  label: "Violet",  gradient: "linear-gradient(135deg, #a855f7, #7e22ce)" },
  { key: "rose",    label: "Rose",    gradient: "linear-gradient(135deg, #f43f5e, #be123c)" },
];

export type LocalConversationPrefs = Record<
  string,
  { muted?: boolean; nickname?: string; pinnedToTop?: boolean; markUnread?: boolean; theme?: ConversationTheme }
>;

const PALETTE = ["#6366f1","#ec4899","#06b6d4","#10b981","#f59e0b","#8b5cf6","#ef4444"];

export function colorFor(id: string) {
  if (!id) return PALETTE[0];
  return PALETTE[id.charCodeAt(0) % PALETTE.length] ?? PALETTE[0];
}

export function initialsOf(name: string) {
  const initials = name.split(" ").map(w => w[0]).join("").slice(0, 2).toUpperCase();
  return initials || "?";
}

export function clockOf(iso: string, locale: string) {
  return new Date(iso).toLocaleTimeString(locale, { hour: "2-digit", minute: "2-digit" });
}

export function formatDuration(ms: number) {
  const total = Math.max(0, Math.round(ms / 1000));
  const minutes = Math.floor(total / 60);
  const seconds = total % 60;
  return `${minutes}:${seconds.toString().padStart(2, "0")}`;
}

export function downsamplePeaks(peaks: number[], targetCount: number): number[] {
  if (peaks.length === 0 || targetCount <= 0) return [];
  if (peaks.length <= targetCount) return peaks.slice();
  const out: number[] = new Array(targetCount).fill(0);
  const bucketSize = peaks.length / targetCount;
  for (let i = 0; i < targetCount; i++) {
    const start = Math.floor(i * bucketSize);
    const end = Math.min(peaks.length, Math.floor((i + 1) * bucketSize));
    let max = 0;
    for (let j = start; j < end; j++) {
      const v = peaks[j];
      if (v !== undefined && v > max) max = v;
    }
    out[i] = max;
  }
  return out;
}

export async function apiErrorMessage(response: Response | null, fallback: string) {
  if (!response) return fallback;
  const data = (await response.json().catch(() => null)) as { error?: string } | null;
  return data?.error ?? fallback;
}

export function loadConversationPrefs(): LocalConversationPrefs {
  if (typeof window === "undefined") return {};
  try {
    const raw = localStorage.getItem("linksy-conversation-prefs");
    if (!raw) return {};
    const parsed = JSON.parse(raw) as LocalConversationPrefs;
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}
