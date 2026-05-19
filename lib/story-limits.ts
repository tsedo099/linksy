export const STORY_CAPTION_MAX_LENGTH = 500;
export const STORY_MEDIA_MAX_SIZE = 20 * 1024 * 1024;

export const STORY_CREATE_LIMITS = {
  cooldownMs: 15 * 1000,
  hourlyWindowMs: 60 * 60 * 1000,
  dailyWindowMs: 24 * 60 * 60 * 1000,
  maxPerHour: 10,
  maxPerDay: 30,
  maxActive: 20,
} as const;

export const STORY_ALLOWED_MEDIA_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
  "video/mp4",
  "video/quicktime",
  "video/webm",
] as const;

export const STORY_MEDIA_TYPE_EXTENSIONS: Record<(typeof STORY_ALLOWED_MEDIA_TYPES)[number], string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/gif": "gif",
  "video/mp4": "mp4",
  "video/quicktime": "mov",
  "video/webm": "webm",
};

const STORY_ALLOWED_MEDIA_EXTENSIONS = new Set(Object.values(STORY_MEDIA_TYPE_EXTENSIONS));

export function formatBytes(bytes: number) {
  const mb = bytes / (1024 * 1024);
  return `${Number.isInteger(mb) ? mb.toFixed(0) : mb.toFixed(1)}MB`;
}

export function normalizeStoryCaption(value: unknown) {
  if (typeof value !== "string") return null;
  const caption = value.trim();
  return caption.length > 0 ? caption : null;
}

export function validateStoryCaption(value: unknown) {
  const caption = normalizeStoryCaption(value);
  if (caption && caption.length > STORY_CAPTION_MAX_LENGTH) {
    return {
      ok: false as const,
      error: `Caption must be ${STORY_CAPTION_MAX_LENGTH} characters or less.`,
    };
  }
  return { ok: true as const, caption };
}

export function isAllowedStoryMediaType(value?: string | null) {
  return STORY_ALLOWED_MEDIA_TYPES.includes(value as (typeof STORY_ALLOWED_MEDIA_TYPES)[number]);
}

export function extensionForStoryMediaType(value?: string | null) {
  if (!isAllowedStoryMediaType(value)) return null;
  return STORY_MEDIA_TYPE_EXTENSIONS[value as (typeof STORY_ALLOWED_MEDIA_TYPES)[number]];
}

export function isAllowedStoryMediaExtension(filename: string) {
  const ext = filename.split(".").pop()?.toLowerCase();
  return Boolean(ext && STORY_ALLOWED_MEDIA_EXTENSIONS.has(ext));
}
