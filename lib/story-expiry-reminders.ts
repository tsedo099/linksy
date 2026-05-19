import "server-only";

import { prisma } from "@/lib/prisma";
import { createNotificationIfAllowed } from "@/lib/notifications";
import { logBackgroundError } from "@/lib/logger";

const WINDOW_MIN = 50;
const WINDOW_MAX = 70;

/**
 * One shot per story: ~1 hour before expiry, send author a reminder.
 */
export async function sendStoryExpiryReminders(now: Date): Promise<{ reminded: number }> {
  const lower = new Date(now.getTime() + WINDOW_MIN * 60 * 1000);
  const upper = new Date(now.getTime() + WINDOW_MAX * 60 * 1000);

  const due = await prisma.story.findMany({
    where: {
      expiryReminderSentAt: null,
      expiresAt: { gt: now, gte: lower, lte: upper },
      author: { deactivatedAt: null },
    },
    select: { id: true, authorId: true },
    take: 500,
  });

  let reminded = 0;
  for (const row of due) {
    let created = null as Awaited<ReturnType<typeof createNotificationIfAllowed>>;
    try {
      created = await createNotificationIfAllowed({
        userId: row.authorId,
        fromId: row.authorId,
        type: "story_expiring",
        storyId: row.id,
      });
    } catch (error) {
      logBackgroundError("notifications.story_expiring")(error);
    }

    await prisma.story.update({
      where: { id: row.id },
      data: { expiryReminderSentAt: now },
    });

    if (created) reminded += 1;
  }

  return { reminded };
}
