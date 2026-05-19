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

// GET /api/users/by-username/[username] - public profile by username
export async function GET(req: NextRequest, { params }: { params: Promise<{ username: string }> }) {
  const me = await getUser(req);
  if (!me) return NextResponse.json({ error: "Not authenticated." }, { status: 401 });

  const { username } = await params;
  const now = new Date();

  const user = await prisma.user.findFirst({
    where: { username, ...userNotPendingHardDelete },
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
      // followers = rows where viewer is the follower of this user → tells us
      // "I follow them" (followedByMe).
      followers: { where: { followerId: me.userId }, select: { followerId: true } },
      // following = rows where this user is the follower of the viewer →
      // tells us "they follow me" (followsMe). Drives the "Follow back" CTA.
      following: { where: { followingId: me.userId }, select: { followingId: true } },
    },
  });

  if (!user) return NextResponse.json({ error: "User not found." }, { status: 404 });
  if (user.id !== me.userId && await areUsersBlocked(me.userId, user.id)) {
    return NextResponse.json({ error: "Profile unavailable." }, { status: 403 });
  }

  const cacheKey = userProfileCacheKey(me.userId, user.id);
  type ProfileBody = { user: Record<string, unknown> };
  const cached = await cacheGetJson<ProfileBody>(cacheKey);
  if (cached?.user) return NextResponse.json(cached);

  const activeStoryWhere = {
    authorId: user.id,
    ...visibleActiveStoryWhere(me.userId, now),
  };

  const storyCount = await prisma.story.count({ where: activeStoryWhere });
  const unviewedStoryCount = user.id === me.userId
    ? 0
    : await prisma.story.count({
      where: { ...activeStoryWhere, views: { none: { userId: me.userId } } },
    });

  const body = {
    user: {
      ...user,
      followedByMe: user.followers.length > 0,
      followsMe: user.following.length > 0,
      followers: undefined,
      following: undefined,
      hasActiveStory: storyCount > 0,
      hasUnviewedStory: unviewedStoryCount > 0,
    },
  };
  await cacheSetJson(cacheKey, body, ENTITY_CACHE_TTL.userProfile());
  return NextResponse.json(body);
}
