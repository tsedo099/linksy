import "server-only";

import { prisma } from "@/lib/prisma";
import { hashContactIdentifier } from "@/lib/contact-sync-hash";
import { createNotificationIfAllowed } from "@/lib/notifications";
import { logBackgroundError } from "@/lib/logger";

/**
 * Notify users who previously synced this email as a contact that the account now exists.
 */
export async function notifyContactOwnersOnJoin(newUserId: string, email: string): Promise<void> {
  const identifierHash = hashContactIdentifier(email);
  const rows = await prisma.contactHash.findMany({
    where: { identifierHash },
    select: { ownerUserId: true },
  });

  await Promise.all(
    rows
      .filter((r) => r.ownerUserId !== newUserId)
      .map((r) =>
        createNotificationIfAllowed({
          userId: r.ownerUserId,
          fromId: newUserId,
          type: "friend_joined",
        }).catch(logBackgroundError("notifications.friend_joined")),
      ),
  );
}
