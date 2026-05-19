import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getUser } from "@/lib/auth";
import { parseRequestJsonAllowEmpty } from "@/lib/request-json";
import { z } from "zod";
import { sanitizePathSegment } from "@/lib/sanitize-filename";

const exportPostBodySchema = z.object({}).strict();

/** POST /api/user/export-data — GDPR JSON archive (POST only: avoids CSRF via top-level GET). */
export async function POST(req: NextRequest) {
  const parsed = await parseRequestJsonAllowEmpty(req, exportPostBodySchema);
  if (!parsed.ok) return parsed.response;

  const me = await getUser(req);
  if (!me) return NextResponse.json({ error: "Not authenticated." }, { status: 401 });

  return buildExportResponse(me.userId);
}

export async function GET() {
  return NextResponse.json(
    { error: "Use POST with empty JSON body to download your data export." },
    { status: 405, headers: { Allow: "POST" } },
  );
}

async function buildExportResponse(userId: string): Promise<NextResponse> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      username: true,
      email: true,
      displayName: true,
      bio: true,
      avatarUrl: true,
      preferredCategories: true,
      showFollowers: true,
      showFollowing: true,
      allowMessageRequests: true,
      allowGroupInvites: true,
      allowStoryReplies: true,
      defaultAllowComments: true,
      defaultHideLikes: true,
      preferredLanguage: true,
      isVerified: true,
      emailVerified: true,
      isPro: true,
      twoFactorEnabled: true,
      creatorMode: true,
      creatorXP: true,
      level: true,
      subscriptionTier: true,
      createdAt: true,
      updatedAt: true,
    },
  });
  if (!user) return NextResponse.json({ error: "User not found." }, { status: 404 });

  const [posts, comments, likes, savedPosts, follows, followers, stories, drafts, conversationMemberships, sentMessages, notifications, blocks, mutes] = await Promise.all([
    prisma.post.findMany({
      where: { authorId: userId },
      select: { id: true, caption: true, mediaUrls: true, location: true, audience: true, category: true, createdAt: true, updatedAt: true },
      orderBy: { createdAt: "desc" },
    }),
    prisma.comment.findMany({
      where: { authorId: userId },
      select: { id: true, postId: true, text: true, createdAt: true },
      orderBy: { createdAt: "desc" },
    }).catch(() => []),
    prisma.like.findMany({
      where: { userId },
      select: { postId: true, createdAt: true },
    }).catch(() => []),
    prisma.savedPost.findMany({
      where: { userId },
      select: { postId: true, createdAt: true },
    }).catch(() => []),
    prisma.follow.findMany({
      where: { followerId: userId },
      select: { followingId: true, createdAt: true },
    }).catch(() => []),
    prisma.follow.findMany({
      where: { followingId: userId },
      select: { followerId: true, createdAt: true },
    }).catch(() => []),
    prisma.story.findMany({
      where: { authorId: userId },
      select: { id: true, mediaUrl: true, caption: true, createdAt: true, expiresAt: true },
      orderBy: { createdAt: "desc" },
    }).catch(() => []),
    prisma.draft.findMany({
      where: { authorId: userId },
      select: { id: true, caption: true, mediaUrls: true, audience: true, createdAt: true, updatedAt: true },
      orderBy: { updatedAt: "desc" },
    }).catch(() => []),
    prisma.conversationMember.findMany({
      where: { userId },
      select: { conversationId: true, isRequest: true },
    }).catch(() => []),
    prisma.message.findMany({
      where: { senderId: userId },
      select: { id: true, conversationId: true, text: true, mediaUrl: true, createdAt: true },
      orderBy: { createdAt: "desc" },
      take: 5000,
    }).catch(() => []),
    prisma.notification.findMany({
      where: { userId },
      select: { id: true, type: true, createdAt: true, read: true, groupCount: true, groupPeerIds: true },
      orderBy: { createdAt: "desc" },
      take: 1000,
    }).catch(() => []),
    prisma.userBlock.findMany({
      where: { blockerId: userId },
      select: { blockedId: true, createdAt: true },
    }).catch(() => []),
    prisma.mute.findMany({
      where: { muterId: userId },
      select: { mutedId: true, mutePosts: true, muteStories: true, muteNotifications: true, createdAt: true },
    }).catch(() => []),
  ]);

  const archive = {
    schemaVersion: 1,
    exportedAt: new Date().toISOString(),
    user,
    counts: {
      posts: posts.length,
      comments: comments.length,
      likes: likes.length,
      savedPosts: savedPosts.length,
      follows: follows.length,
      followers: followers.length,
      stories: stories.length,
      drafts: drafts.length,
      conversations: conversationMemberships.length,
      messages: sentMessages.length,
      notifications: notifications.length,
      blocks: blocks.length,
      mutes: mutes.length,
    },
    posts,
    comments,
    likes,
    savedPosts,
    follows,
    followers,
    stories,
    drafts,
    conversationMemberships,
    sentMessages,
    notifications,
    blocks,
    mutes,
  };

  const filename = `linksy-data-${sanitizePathSegment(user.username, 72)}-${new Date().toISOString().slice(0, 10)}.json`;
  return new NextResponse(JSON.stringify(archive, null, 2), {
    status: 200,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "private, no-store",
    },
  });
}
