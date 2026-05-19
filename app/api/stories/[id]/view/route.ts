import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getUser } from "@/lib/auth";
import { activeStoryWhere, visibleActiveStoryWhere } from "@/lib/story-visibility";
import { areUsersBlocked } from "@/lib/user-blocks";
import { storyViewsTotal } from "@/lib/metrics";
import { trackActiveUser } from "@/lib/active-users";
import { withMetrics } from "@/lib/with-metrics";

// POST /api/stories/[id]/view - mark a story as viewed
export const POST = withMetrics("/api/stories/[id]/view", async (req: NextRequest, { params }: { params: Promise<{ id: string }> }) => {
  const me = await getUser(req);
  if (!me) return NextResponse.json({ error: "Not authenticated." }, { status: 401 });

  const { id: storyId } = await params;
  const now = new Date();

  const story = await prisma.story.findFirst({
    where: {
      id: storyId,
      ...visibleActiveStoryWhere(me.userId, now),
    },
    select: { id: true, authorId: true },
  });

  if (!story) {
    const activeStory = await prisma.story.findFirst({
      where: {
        id: storyId,
        ...activeStoryWhere(now),
      },
      select: { id: true },
    });

    if (!activeStory) {
      return NextResponse.json({ viewed: false, error: "Story expired." }, { status: 410 });
    }

    return NextResponse.json({ viewed: false, error: "You cannot view this story." }, { status: 403 });
  }

  if (story.authorId !== me.userId && await areUsersBlocked(me.userId, story.authorId)) {
    return NextResponse.json({ viewed: false, error: "You cannot view this story." }, { status: 403 });
  }

  if (story.authorId === me.userId) {
    return NextResponse.json({ viewed: true, owner: true });
  }

  await prisma.storyView.upsert({
    where: { userId_storyId: { userId: me.userId, storyId } },
    create: { userId: me.userId, storyId },
    update: { viewedAt: new Date() },
  });

  storyViewsTotal.inc();
  void trackActiveUser(me.userId);

  return NextResponse.json({ viewed: true });
});
