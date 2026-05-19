import { STORY_CAPTION_MAX_LENGTH } from "@/lib/story-limits";

export const BG_GRADS = [
  "linear-gradient(160deg,#0f0c29,#302b63)",
  "linear-gradient(160deg,#200122,#6f0000)",
  "linear-gradient(160deg,#134e5e,#71b280)",
  "linear-gradient(160deg,#1a1a2e,#16213e)",
  "linear-gradient(160deg,#0a0a0a,#1a1a1a)",
  "linear-gradient(160deg,#2c3e50,#fd746c)",
  "linear-gradient(160deg,#1a1040,#6d28d9)",
  "linear-gradient(160deg,#0d1b0a,#14532d)",
];

export const STORY_EMOJIS = ["😂", "😍", "🔥", "❤️", "🥰", "😭", "✨", "😎", "🤍", "💜", "👏", "🙌", "🥳", "😮", "🤯", "😇", "😈", "👀", "💯", "⭐", "🌙", "☀️", "🌈", "🦋"];
export const STORY_STICKERS_MAX = 20;
export const STORY_STICKER_DRAG_THRESHOLD = 3;
export const STORY_TEXT_COLORS = ["#ffffff", "#111827", "#ef4444", "#f97316", "#facc15", "#22c55e", "#38bdf8", "#6366f1", "#a855f7", "#ec4899"] as const;
export const STORY_TEXT_COLOR_DEFAULT: string = STORY_TEXT_COLORS[0];
export const STORY_DRAW_MAX_STROKES = 80;
export const STORY_DRAW_MAX_POINTS = 180;
const STORY_CAPTION_META_PREFIX = "[[linksy-story-caption:";
const STORY_CAPTION_META_SUFFIX = "]]";

export type Step = "type" | "story";

export const STORY_COLLABORATORS_MAX = 5;

export type CollaboratorOption = {
  id: string;
  username: string;
  displayName: string;
  avatarUrl: string | null;
};

export type StoryTextSticker = {
  id: string;
  text: string;
  x: number;
  y: number;
  width: number;
  scale: number;
  background: boolean;
  z: number;
  color: string;
  mentionUserId?: string;
};

export type StoryDrawPoint = { x: number; y: number };
export type StoryDrawStroke = { id: string; color: string; width: number; points: StoryDrawPoint[] };

export function newStickerId() {
  return `sticker-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

export function clampNumber(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

export function normalizeStoryTextColor(value: unknown): string {
  return typeof value === "string" && (STORY_TEXT_COLORS as readonly string[]).includes(value) ? value : STORY_TEXT_COLOR_DEFAULT;
}

export function estimateStickerWidth(text: string, isMention = false) {
  const length = text.trim().length;
  if (!length) return 26;
  return clampNumber((isMention ? 14 : 12) + length * (isMention ? 1.05 : 0.9), 16, 56);
}

export function newDrawStrokeId() {
  return `draw-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

export function encodeStoryCaption(stickers: StoryTextSticker[], drawStrokes: StoryDrawStroke[]) {
  const meta = JSON.stringify({
    stickers: stickers.map((sticker) => ({
      t: sticker.text,
      x: Math.round(sticker.x),
      y: Math.round(sticker.y),
      w: Math.round(sticker.width),
      s: Math.round(sticker.scale * 100) / 100,
      bg: sticker.background ? 1 : 0,
      z: sticker.z,
      c: sticker.color,
      m: sticker.mentionUserId,
    })),
    draw: drawStrokes.map((stroke) => ({
      c: stroke.color,
      w: stroke.width,
      p: stroke.points.map((point) => [Math.round(point.x * 10) / 10, Math.round(point.y * 10) / 10]),
    })),
  });
  return `${STORY_CAPTION_META_PREFIX}${meta}${STORY_CAPTION_META_SUFFIX}\n${stickers.map((sticker) => sticker.text).join("\n")}`;
}

export { STORY_CAPTION_MAX_LENGTH };
