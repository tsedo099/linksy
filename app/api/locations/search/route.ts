import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getUser } from "@/lib/auth";
import { getBlockedUserIds } from "@/lib/user-blocks";

export async function GET(req: NextRequest) {
  const me = await getUser(req);
  if (!me) return NextResponse.json({ error: "Not authenticated." }, { status: 401 });

  const q = req.nextUrl.searchParams.get("q")?.trim() ?? "";
  if (!q) return NextResponse.json({ locations: [] });

  const blockedIds = await getBlockedUserIds(me.userId);
  const groups = await prisma.post.groupBy({
    by: ["location"],
    where: {
      authorId: { notIn: blockedIds },
      location: { contains: q, mode: "insensitive" },
    },
    _count: { _all: true },
    orderBy: { _count: { location: "desc" } },
    take: 20,
  });

  const locations = groups
    .filter((g) => typeof g.location === "string" && g.location.trim() !== "")
    .map((g) => ({ location: g.location as string, postCount: g._count._all }));

  return NextResponse.json({ locations });
}
