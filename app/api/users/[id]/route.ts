import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getUser } from "@/lib/auth";
import { visibleActiveStoryWhere } from "@/lib/story-visibility";
import { areUsersBlocked } from "@/lib/user-blocks";
import {
  cacheGetJson,
  cacheSetJson,
  ENTITY_CACHE_TTL,
  userProfileCacheKey,
} from "@/lib/entity-cache";
import { userNotPendingHardDelete } from "@/lib/user-not-pending-deletion";

// GET /api/users/[id] - public profile
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const me = await getUser(req);
  if (!me) return NextResponse.json({ error: "Not authenticated." }, { status: 401 });

  const { id } = await params;
  const cacheKey = userProfileCacheKey(me.userId, id);
  type ProfileBody = { user: Record<string, unknown> };

  const now = new Date();

  const user = await prisma.user.findFirst({
    where: { id, ...userNotPendingHardDelete },
    select: {
      id: true,
      username: true,
      displayName: true,
      bio: true,
      avatarUrl: true,
      preferredCategories: true,
      isVerified: true,
      creatorMode: true,
      createdAt: true,
      _count: { select: { posts: true, followers: true, following: true } },
      followers: { where: { followerId: me.userId }, select: { followerId: true } },
    },
  });

  if (!user) return NextResponse.json({ error: "User not found." }, { status: 404 });
  if (id !== me.userId && await areUsersBlocked(me.userId, id)) {
    return NextResponse.json({ error: "Profile unavailable." }, { status: 403 });
  }

  const cached = await cacheGetJson<ProfileBody>(cacheKey);
  if (cached?.user) return NextResponse.json(cached);

  const activeStoryWhere = {
    authorId: id,
    ...visibleActiveStoryWhere(me.userId, now),
  };

  const storyCount = await prisma.story.count({
    where: activeStoryWhere,
  });
  const unviewedStoryCount = id === me.userId
    ? 0
    : await prisma.story.count({
      where: {
        ...activeStoryWhere,
        views: { none: { userId: me.userId } },
      },
    });

  const body = {
    user: {
      ...user,
      followedByMe: user.followers.length > 0,
      followers: undefined,
      hasActiveStory: storyCount > 0,
      hasUnviewedStory: unviewedStoryCount > 0,
    },
  };
  await cacheSetJson(cacheKey, body, ENTITY_CACHE_TTL.userProfile());
  return NextResponse.json(body);
}
