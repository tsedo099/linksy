import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getUser } from "@/lib/auth";
import { SEARCH_HISTORY_FETCH } from "@/lib/search-history";

// GET /api/search/history — recent queries (DB, newest first)
export async function GET(req: NextRequest) {
  const me = await getUser(req);
  if (!me) return NextResponse.json({ error: "Not authenticated." }, { status: 401 });

  const items = await prisma.searchHistory.findMany({
    where: { userId: me.userId },
    orderBy: { searchedAt: "desc" },
    take: SEARCH_HISTORY_FETCH,
    select: { id: true, query: true, searchedAt: true },
  });

  return NextResponse.json({
    history: items.map((row) => ({
      id: row.id,
      query: row.query,
      searchedAt: row.searchedAt.toISOString(),
    })),
  });
}

// DELETE /api/search/history — ?id= clears one row; no id clears all for this user
export async function DELETE(req: NextRequest) {
  const me = await getUser(req);
  if (!me) return NextResponse.json({ error: "Not authenticated." }, { status: 401 });

  const id = req.nextUrl.searchParams.get("id")?.trim();
  if (id) {
    await prisma.searchHistory.deleteMany({ where: { userId: me.userId, id } });
  } else {
    await prisma.searchHistory.deleteMany({ where: { userId: me.userId } });
  }

  return NextResponse.json({ ok: true });
}
