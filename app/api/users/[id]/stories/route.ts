import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getUser } from "@/lib/auth";
import { visibleActiveStoryWhere } from "@/lib/story-visibility";
import { areUsersBlocked } from "@/lib/user-blocks";

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const me = await getUser(req);
  if (!me) return NextResponse.json({ error: "Not authenticated." }, { status: 401 });

  const { id } = await params;
  const now = new Date();
  if (id !== me.userId && await areUsersBlocked(me.userId, id)) {
    return NextResponse.json({ error: "Stories unavailable." }, { status: 403 });
  }

  const stories = await prisma.story.findMany({
    where: {
      authorId: id,
      ...visibleActiveStoryWhere(me.userId, now),
    },
    orderBy: { createdAt: "desc" },
    include: {
      author: { select: { id: true, username: true, displayName: true, avatarUrl: true } },
      views: { where: { userId: me.userId }, select: { userId: true } },
      _count: { select: { views: true } },
    },
  });

  const headStory = stories[0];
  if (!headStory) return NextResponse.json({ group: null });

  const group = {
    authorId: id,
    author: headStory.author,
    isCloseCircle: stories.some(s => s.audience === "CLOSE_CIRCLE"),
    allViewed: id === me.userId || stories.every(s => s.views.length > 0),
    stories: stories.map(s => ({
      id: s.id,
      mediaUrl: s.mediaUrl,
      caption: s.caption,
      audience: s.audience,
      createdAt: s.createdAt,
      expiresAt: s.expiresAt,
      viewedByMe: s.authorId === me.userId || s.views.length > 0,
      viewCount: s._count.views,
    })),
  };

  return NextResponse.json({ group });
}
