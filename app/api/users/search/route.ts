import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getUser } from "@/lib/auth";
import { visibleActiveStoryWhere } from "@/lib/story-visibility";
import { getBlockedUserIds } from "@/lib/user-blocks";
import { userNotPendingHardDelete } from "@/lib/user-not-pending-deletion";

export async function GET(req: NextRequest) {
  const me = await getUser(req);
  if (!me) return NextResponse.json({ error: "Not authenticated." }, { status: 401 });

  const q = req.nextUrl.searchParams.get("q")?.trim() ?? "";
  if (!q) return NextResponse.json({ users: [] });

  const now = new Date();
  const blockedIds = await getBlockedUserIds(me.userId);
  const users = await prisma.user.findMany({
    where: {
      AND: [
        userNotPendingHardDelete,
        { id: { notIn: [me.userId, ...blockedIds] } },
        {
          OR: [
            { username: { contains: q, mode: "insensitive" } },
            { displayName: { contains: q, mode: "insensitive" } },
          ],
        },
      ],
    },
    select: {
      id: true,
      username: true,
      displayName: true,
      avatarUrl: true,
      stories: {
        where: visibleActiveStoryWhere(me.userId, now),
        select: {
          id: true,
          views: { where: { userId: me.userId }, select: { userId: true } },
        },
        take: 20,
      },
    },
    take: 10,
  });

  return NextResponse.json({
    users: users.map(u => ({
      ...u,
      hasActiveStory: u.stories.length > 0,
      hasUnviewedStory: u.stories.some(story => story.views.length === 0),
      stories: undefined,
    })),
  });
}
