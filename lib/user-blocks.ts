import { prisma } from "@/lib/prisma";

export async function areUsersBlocked(userId: string, targetId: string) {
  if (userId === targetId) return false;

  const rows = await prisma.$queryRaw<{ exists: boolean }[]>`
    SELECT EXISTS (
      SELECT 1
      FROM "UserBlock"
      WHERE ("blockerId" = ${userId} AND "blockedId" = ${targetId})
         OR ("blockerId" = ${targetId} AND "blockedId" = ${userId})
    ) AS "exists"
  `;

  return Boolean(rows[0]?.exists);
}

export async function getBlockedUserIds(userId: string) {
  const rows = await prisma.$queryRaw<{ id: string }[]>`
    SELECT "blockedId" AS "id"
    FROM "UserBlock"
    WHERE "blockerId" = ${userId}
    UNION
    SELECT "blockerId" AS "id"
    FROM "UserBlock"
    WHERE "blockedId" = ${userId}
  `;

  return rows.map((row) => row.id);
}
