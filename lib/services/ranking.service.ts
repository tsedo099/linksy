import { prisma } from "@/lib/prisma";
import { getLeaderboard, getUserRank } from "@/lib/redis";
import { userNotPendingHardDelete } from "@/lib/user-not-pending-deletion";

export type LeaderboardEntry = {
  rank:        number;
  userId:      string;
  username:    string;
  displayName: string;
  avatarUrl:   string | null;
  xp:          number;
  level:       number;
  equippedBadge:  string | null;
  equippedBorder: string | null;
};

export async function getWeeklyLeaderboard(
  category?: string,
  limit = 50,
): Promise<LeaderboardEntry[]> {
  const rows = await getLeaderboard(category, limit);

  if (rows.length === 0) {
    // fallback: pull directly from DB when Redis has no data
    const users = await prisma.user.findMany({
      where:   { creatorMode: true, ...userNotPendingHardDelete },
      orderBy: { creatorXP: "desc" },
      take:    limit,
      select:  {
        id: true, username: true, displayName: true,
        avatarUrl: true, creatorXP: true, level: true,
        equippedBadge: true, equippedBorder: true,
      },
    });
    return users.map((u, i) => ({
      rank:        i + 1,
      userId:      u.id,
      username:    u.username,
      displayName: u.displayName,
      avatarUrl:   u.avatarUrl,
      xp:          u.creatorXP,
      level:       u.level,
      equippedBadge:  u.equippedBadge,
      equippedBorder: u.equippedBorder,
    }));
  }

  const ids = rows.map((r) => r.userId);
  const users = await prisma.user.findMany({
    where:  { id: { in: ids }, ...userNotPendingHardDelete },
    select: {
      id: true, username: true, displayName: true,
      avatarUrl: true, creatorXP: true, level: true,
      equippedBadge: true, equippedBorder: true,
    },
  });

  const userMap = new Map(users.map((u) => [u.id, u]));

  return rows
    .map((row, i) => {
      const u = userMap.get(row.userId);
      if (!u) return null;
      return {
        rank:        i + 1,
        userId:      u.id,
        username:    u.username,
        displayName: u.displayName,
        avatarUrl:   u.avatarUrl,
        xp:          u.creatorXP,
        level:       u.level,
        equippedBadge:  u.equippedBadge,
        equippedBorder: u.equippedBorder,
      };
    })
    .filter((e): e is LeaderboardEntry => e !== null);
}

export { getUserRank };
