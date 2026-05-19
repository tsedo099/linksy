import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getUser } from "@/lib/auth";
import { parseRequestJson } from "@/lib/request-json";
import { postSeriesReorderSchema } from "@/lib/schemas/api-bodies";

// PATCH /api/post-series/[id]/reorder — set seriesPosition by index of orderedPostIds
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getUser(req);
  if (!user) return NextResponse.json({ error: "Not authenticated." }, { status: 401 });

  const { id: seriesId } = await params;

  const series = await prisma.postSeries.findUnique({
    where: { id: seriesId },
    select: { userId: true },
  });

  if (!series) return NextResponse.json({ error: "Series not found." }, { status: 404 });
  if (series.userId !== user.userId) {
    return NextResponse.json({ error: "Forbidden." }, { status: 403 });
  }

  const parsed = await parseRequestJson(req, postSeriesReorderSchema);
  if (!parsed.ok) return parsed.response;

  const ids = Array.from(new Set(parsed.data.orderedPostIds));
  if (ids.length !== parsed.data.orderedPostIds.length) {
    return NextResponse.json({ error: "Duplicate post IDs in order." }, { status: 400 });
  }

  const existing = await prisma.post.findMany({
    where: { seriesId, id: { in: ids } },
    select: { id: true },
  });
  const existingSet = new Set(existing.map((r) => r.id));
  const allBelong = ids.every((id) => existingSet.has(id));
  if (!allBelong) {
    return NextResponse.json(
      { error: "All posts must belong to this series." },
      { status: 400 }
    );
  }

  await prisma.$transaction(
    ids.map((postId, index) =>
      prisma.post.update({
        where: { id: postId },
        data: { seriesPosition: index },
      })
    )
  );

  await prisma.postSeries.update({
    where: { id: seriesId },
    data: { updatedAt: new Date() },
  });

  return NextResponse.json({ ok: true, count: ids.length });
}
