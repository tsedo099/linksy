import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getUser } from "@/lib/auth";

// GET /api/stories/[id]/viewers - owner-only viewers list
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const me = await getUser(req);
  if (!me) return NextResponse.json({ error: "Not authenticated." }, { status: 401 });

  const { id } = await params;
  const limitParam = req.nextUrl.searchParams.get("limit");
  const orderParam = req.nextUrl.searchParams.get("order");
  const limit = limitParam ? Math.max(0, Math.min(200, Number.parseInt(limitParam, 10) || 0)) : undefined;
  const order = orderParam === "asc" ? "asc" : "desc";

  const story = await prisma.story.findUnique({
    where: { id },
    select: {
      id: true,
      authorId: true,
      audience: true,
      expiresAt: true,
      createdAt: true,
    },
  });

  if (!story) return NextResponse.json({ error: "Story not found." }, { status: 404 });
  if (story.authorId !== me.userId) {
    return NextResponse.json({ error: "You cannot view this story's viewers." }, { status: 403 });
  }

  const views = await prisma.storyView.findMany({
    where: {
      storyId: id,
      userId: { not: story.authorId },
    },
    orderBy: { viewedAt: order },
    ...(limit ? { take: limit } : {}),
    include: {
      user: { select: { id: true, username: true, displayName: true, avatarUrl: true } },
    },
  });

  return NextResponse.json({
    story,
    viewers: views.map((view) => ({
      viewedAt: view.viewedAt,
      user: view.user,
    })),
  });
}
