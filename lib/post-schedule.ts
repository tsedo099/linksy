import "server-only";

import { prisma } from "@/lib/prisma";

/**
 * Helpers for scheduled posts.
 *
 * Storage model: `Post.scheduledAt` is a nullable timestamp.
 *   - NULL or `<= now()` → post is live and visible in feeds.
 *   - future timestamp     → post is hidden from public listings until either
 *                             the cron publisher clears the field or a
 *                             feed-time check filters it out.
 *
 * Limits: schedule must be at least 1 minute and at most 90 days into the
 * future. The composer should mirror these limits in the UI.
 */

export const SCHEDULED_POST_MIN_DELAY_MS = 60 * 1000;
export const SCHEDULED_POST_MAX_DELAY_MS = 90 * 24 * 60 * 60 * 1000;

/** Build a Prisma `where` fragment that hides not-yet-published posts. */
export function publishedPostWhere(now: Date = new Date()) {
  return {
    OR: [
      { scheduledAt: null },
      { scheduledAt: { lte: now } },
    ],
  };
}

/**
 * Same as `publishedPostWhere`, but a viewer can always see their own scheduled
 * posts (e.g. on their own profile feed).
 */
export function visibleToViewerPostWhere(viewerId: string, now: Date = new Date()) {
  return {
    OR: [
      { authorId: viewerId },
      ...publishedPostWhere(now).OR,
    ],
  };
}

export type ValidatedSchedule =
  | { ok: true; value: Date | null }
  | { ok: false; error: string };

export function validateScheduledAt(input: unknown, now: Date = new Date()): ValidatedSchedule {
  if (input == null) return { ok: true, value: null };
  if (typeof input !== "string") {
    return { ok: false, error: "Scheduled time must be an ISO date string." };
  }
  const trimmed = input.trim();
  if (!trimmed) return { ok: true, value: null };

  const parsed = new Date(trimmed);
  if (Number.isNaN(parsed.getTime())) {
    return { ok: false, error: "Scheduled time is not a valid date." };
  }

  const delta = parsed.getTime() - now.getTime();
  if (delta < SCHEDULED_POST_MIN_DELAY_MS) {
    return { ok: false, error: "Scheduled time must be at least 1 minute in the future." };
  }
  if (delta > SCHEDULED_POST_MAX_DELAY_MS) {
    return { ok: false, error: "Scheduled time must be within the next 90 days." };
  }
  return { ok: true, value: parsed };
}

export type PublishedScheduledPost = {
  id: string;
  authorId: string;
  scheduledAt: Date | null;
};

/**
 * Mark all due scheduled posts as published. Returns the rows that flipped so
 * the caller can grant XP, send notifications, etc. Idempotent.
 */
export async function publishDueScheduledPosts(now: Date = new Date()): Promise<PublishedScheduledPost[]> {
  const due = await prisma.post.findMany({
    where: {
      scheduledAt: { lte: now },
      NOT: { scheduledAt: null },
    },
    select: { id: true, authorId: true, scheduledAt: true },
  });

  if (due.length === 0) return [];

  await prisma.post.updateMany({
    where: { id: { in: due.map((row) => row.id) } },
    data: { scheduledAt: null },
  });

  return due;
}
