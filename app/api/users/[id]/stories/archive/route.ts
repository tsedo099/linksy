import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getUser } from "@/lib/auth";

// GET /api/users/[id]/stories/archive - owner-only full story history
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const me = await getUser(req);
  if (!me) return NextResponse.json({ error: "Not authenticated." }, { status: 401 });

  const { id } = await params;
  if (id !== me.userId) {
    return NextResponse.json({ error: "Forbidden." }, { status: 403 });
  }

  const stories = await prisma.story.findMany({
    where: { authorId: id },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      mediaUrl: true,
      caption: true,
      audience: true,
      createdAt: true,
      expiresAt: true,
    },
  });

  return NextResponse.json({
    stories: stories.map((story) => ({
      ...story,
      isExpired: new Date(story.expiresAt).getTime() <= Date.now(),
    })),
  });
}
