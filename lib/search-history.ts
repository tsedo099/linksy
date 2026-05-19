import { prisma } from "@/lib/prisma";

export const SEARCH_HISTORY_LIMIT = 50;
export const SEARCH_HISTORY_FETCH = 20;

/** Collapse whitespace and cap length so unique key stays stable across clients. */
export function normalizeHistoryQuery(raw: string): string {
  return raw.trim().replace(/\s+/g, " ").slice(0, 500);
}

export async function upsertSearchHistory(userId: string, rawQuery: string) {
  const query = normalizeHistoryQuery(rawQuery);
  if (query.length < 1 || query.length > 512) return;

  await prisma.searchHistory.upsert({
    where: {
      userId_query: { userId, query },
    },
    create: { userId, query },
    update: { searchedAt: new Date() },
  });

  const surplus = await prisma.searchHistory.findMany({
    where: { userId },
    orderBy: { searchedAt: "desc" },
    skip: SEARCH_HISTORY_LIMIT,
    select: { id: true },
  });
  const ids = surplus.map((row) => row.id);
  if (ids.length) {
    await prisma.searchHistory.deleteMany({ where: { id: { in: ids } } });
  }
}
