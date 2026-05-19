import "server-only";

import { prisma } from "@/lib/prisma";
import { sanitizePlainText } from "@/lib/sanitize-html";
import { createNotificationIfAllowed } from "@/lib/notifications";
import { logBackgroundError } from "@/lib/logger";

/**
 * Validation + persistence for the four story stickers:
 *   - Location  → `Story.location` (text)
 *   - Mention   → rows in `Mention` (storyId + userId), max 10 per story
 *   - Poll      → already attached via `Story.poll`, see `lib/polls.ts`
 *   - Music     → `Story.musicTrack` JSON ({ title, artist?, mediaUrl?, durationSec? })
 *
 * All public helpers reject invalid input by returning `{ ok: false, error }`
 * so the route can convert them to 400 responses with a clear message.
 */

export const STORY_LOCATION_MAX_LENGTH = 80;
export const STORY_MENTIONS_MAX = 10;
export const STORY_MUSIC_TITLE_MAX = 80;
export const STORY_MUSIC_ARTIST_MAX = 80;
export const STORY_MUSIC_MEDIA_URL_MAX = 300;
export const STORY_COLLABORATORS_MAX = 5;

export const STORY_PLAYBACK_MODES = ["NORMAL", "LOOP", "BOOMERANG"] as const;
export type StoryPlaybackMode = (typeof STORY_PLAYBACK_MODES)[number];

export type ValidatedLocation = { ok: true; value: string | null } | { ok: false; error: string };

export function validateStoryLocation(input: unknown): ValidatedLocation {
  if (input == null) return { ok: true, value: null };
  if (typeof input !== "string") return { ok: false, error: "Location must be text." };
  const cleaned = sanitizePlainText(input).trim();
  if (!cleaned) return { ok: true, value: null };
  if (cleaned.length > STORY_LOCATION_MAX_LENGTH) {
    return { ok: false, error: `Location must be ${STORY_LOCATION_MAX_LENGTH} characters or less.` };
  }
  return { ok: true, value: cleaned };
}

export type StoryMusicTrack = {
  title: string;
  artist: string | null;
  mediaUrl: string | null;
  durationSec: number | null;
};

export type ValidatedMusic = { ok: true; value: StoryMusicTrack | null } | { ok: false; error: string };

export function validateStoryMusic(input: unknown): ValidatedMusic {
  if (input == null) return { ok: true, value: null };
  if (typeof input !== "object" || Array.isArray(input)) {
    return { ok: false, error: "Music must be an object." };
  }
  const raw = input as Record<string, unknown>;

  if (typeof raw.title !== "string") {
    return { ok: false, error: "Music title is required." };
  }
  const title = sanitizePlainText(raw.title).trim();
  if (!title) return { ok: false, error: "Music title cannot be empty." };
  if (title.length > STORY_MUSIC_TITLE_MAX) {
    return { ok: false, error: `Music title must be ${STORY_MUSIC_TITLE_MAX} characters or less.` };
  }

  let artist: string | null = null;
  if (raw.artist != null) {
    if (typeof raw.artist !== "string") return { ok: false, error: "Music artist must be text." };
    const cleaned = sanitizePlainText(raw.artist).trim();
    if (cleaned.length > STORY_MUSIC_ARTIST_MAX) {
      return { ok: false, error: `Music artist must be ${STORY_MUSIC_ARTIST_MAX} characters or less.` };
    }
    artist = cleaned || null;
  }

  let mediaUrl: string | null = null;
  if (raw.mediaUrl != null) {
    if (typeof raw.mediaUrl !== "string") return { ok: false, error: "Music URL must be text." };
    const cleaned = raw.mediaUrl.trim();
    if (cleaned.length > STORY_MUSIC_MEDIA_URL_MAX) {
      return { ok: false, error: "Music URL is too long." };
    }
    if (cleaned && !/^https?:\/\//i.test(cleaned) && !cleaned.startsWith("/uploads/")) {
      return { ok: false, error: "Music URL must use http(s) or be an uploaded asset." };
    }
    mediaUrl = cleaned || null;
  }

  let durationSec: number | null = null;
  if (raw.durationSec != null) {
    const value = Number(raw.durationSec);
    if (!Number.isFinite(value) || value < 0 || value > 600) {
      return { ok: false, error: "Music duration must be between 0 and 600 seconds." };
    }
    durationSec = Math.round(value);
  }

  return { ok: true, value: { title, artist, mediaUrl, durationSec } };
}

export type ValidatedMentions =
  | { ok: true; userIds: string[] }
  | { ok: false; error: string };

/**
 * Normalize and validate the mentioned-user IDs payload, deduplicating and
 * confirming that all referenced users actually exist. Caller is responsible
 * for issuing notifications + creating Mention rows after the story is created.
 */
export async function validateStoryMentions(
  input: unknown,
  authorId: string,
): Promise<ValidatedMentions> {
  if (input == null) return { ok: true, userIds: [] };
  if (!Array.isArray(input)) return { ok: false, error: "Mentions must be a list of user IDs." };

  const ids: string[] = [];
  const seen = new Set<string>();
  for (const value of input) {
    if (typeof value !== "string") {
      return { ok: false, error: "Mention entries must be user IDs." };
    }
    const trimmed = value.trim();
    if (!trimmed) continue;
    if (trimmed === authorId) continue; // ignore self-mention
    if (!seen.has(trimmed)) {
      seen.add(trimmed);
      ids.push(trimmed);
    }
  }

  if (ids.length === 0) return { ok: true, userIds: [] };
  if (ids.length > STORY_MENTIONS_MAX) {
    return { ok: false, error: `You can mention up to ${STORY_MENTIONS_MAX} people in a story.` };
  }

  const found = await prisma.user.findMany({
    where: { id: { in: ids }, accountDeletionRequestedAt: null },
    select: { id: true },
  });
  if (found.length !== ids.length) {
    return { ok: false, error: "One or more mentioned users could not be found." };
  }

  return { ok: true, userIds: ids };
}

/**
 * Persist Mention rows + insert mention notifications for the given story.
 * Notifications are created for users other than the author. Best-effort —
 * failures are logged by the caller.
 */
export async function persistStoryMentions(opts: {
  storyId: string;
  authorId: string;
  userIds: string[];
}): Promise<void> {
  if (opts.userIds.length === 0) return;
  await prisma.mention.createMany({
    data: opts.userIds.map((userId) => ({
      storyId: opts.storyId,
      userId,
    })),
    skipDuplicates: true,
  });
  await Promise.all(
    opts.userIds
      .filter((userId) => userId !== opts.authorId)
      .map((userId) =>
        createNotificationIfAllowed({
          userId,
          fromId: opts.authorId,
          type: "story_mention",
          storyId: opts.storyId,
        }).catch(logBackgroundError("notifications.mention.story")),
      ),
  );
}

export type SerializedMusic = StoryMusicTrack;

/* ---------- Playback mode ---------- */

export type ValidatedPlaybackMode =
  | { ok: true; value: StoryPlaybackMode }
  | { ok: false; error: string };

export function validateStoryPlaybackMode(input: unknown): ValidatedPlaybackMode {
  if (input == null) return { ok: true, value: "NORMAL" };
  if (typeof input !== "string") return { ok: false, error: "Playback mode must be a string." };
  const upper = input.toUpperCase();
  if (!STORY_PLAYBACK_MODES.includes(upper as StoryPlaybackMode)) {
    return { ok: false, error: `Playback mode must be one of: ${STORY_PLAYBACK_MODES.join(", ")}.` };
  }
  return { ok: true, value: upper as StoryPlaybackMode };
}

/* ---------- Collaborators ---------- */

export type ValidatedCollaborators =
  | { ok: true; userIds: string[] }
  | { ok: false; error: string };

/**
 * Normalize and validate the collaborator user IDs payload — confirming users
 * exist, are not the author, and are not blocked in either direction.
 */
export async function validateStoryCollaborators(
  input: unknown,
  authorId: string,
): Promise<ValidatedCollaborators> {
  if (input == null) return { ok: true, userIds: [] };
  if (!Array.isArray(input)) return { ok: false, error: "Collaborators must be a list of user IDs." };

  const ids: string[] = [];
  const seen = new Set<string>();
  for (const value of input) {
    if (typeof value !== "string") {
      return { ok: false, error: "Collaborator entries must be user IDs." };
    }
    const trimmed = value.trim();
    if (!trimmed || trimmed === authorId) continue;
    if (!seen.has(trimmed)) {
      seen.add(trimmed);
      ids.push(trimmed);
    }
  }

  if (ids.length === 0) return { ok: true, userIds: [] };
  if (ids.length > STORY_COLLABORATORS_MAX) {
    return {
      ok: false,
      error: `You can collaborate with up to ${STORY_COLLABORATORS_MAX} people on a story.`,
    };
  }

  const [found, blocks] = await Promise.all([
    prisma.user.findMany({
      where: { id: { in: ids }, accountDeletionRequestedAt: null },
      select: { id: true },
    }),
    prisma.userBlock.findMany({
      where: {
        OR: [
          { blockerId: authorId, blockedId: { in: ids } },
          { blockedId: authorId, blockerId: { in: ids } },
        ],
      },
      select: { blockerId: true, blockedId: true },
    }),
  ]);

  if (found.length !== ids.length) {
    return { ok: false, error: "One or more collaborators could not be found." };
  }
  if (blocks.length > 0) {
    return {
      ok: false,
      error: "You cannot collaborate with a blocked user.",
    };
  }

  return { ok: true, userIds: ids };
}

export async function persistStoryCollaborators(opts: {
  storyId: string;
  authorId: string;
  userIds: string[];
}): Promise<void> {
  if (opts.userIds.length === 0) return;
  await prisma.storyCollaborator.createMany({
    data: opts.userIds.map((userId) => ({
      storyId: opts.storyId,
      userId,
    })),
    skipDuplicates: true,
  });
  await Promise.all(
    opts.userIds
      .filter((userId) => userId !== opts.authorId)
      .map((userId) =>
        createNotificationIfAllowed({
          userId,
          fromId: opts.authorId,
          type: "story_collab",
          storyId: opts.storyId,
        }).catch(logBackgroundError("notifications.story_collab")),
      ),
  );
}

/** Coerce a JSON column read back into the `StoryMusicTrack` shape, or null. */
export function readStoryMusic(value: unknown): SerializedMusic | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const raw = value as Record<string, unknown>;
  if (typeof raw.title !== "string" || !raw.title.trim()) return null;
  return {
    title: raw.title,
    artist: typeof raw.artist === "string" ? raw.artist : null,
    mediaUrl: typeof raw.mediaUrl === "string" ? raw.mediaUrl : null,
    durationSec:
      typeof raw.durationSec === "number" && Number.isFinite(raw.durationSec)
        ? raw.durationSec
        : null,
  };
}
