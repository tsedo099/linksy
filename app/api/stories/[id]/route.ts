import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getUser } from "@/lib/auth";
import { activeStoryWhere } from "@/lib/story-visibility";
import { areUsersBlocked } from "@/lib/user-blocks";
import { formatPollForViewer } from "@/lib/polls";
import { readStoryMusic } from "@/lib/story-stickers";

// GET /api/stories/[id] - fetch single story for deep-link pages
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const me = await getUser(req);
  if (!me) return NextResponse.json({ error: "Not authenticated." }, { status: 401 });

  const { id } = await params;
  const now = new Date();

  const story = await prisma.story.findFirst({
    where: {
      id,
      ...activeStoryWhere(now),
    },
    include: {
      author: {
        select: {
          id: true,
          username: true,
          displayName: true,
          avatarUrl: true,
        },
      },
      views: {
        where: { userId: me.userId },
        select: { userId: true },
      },
      _count: {
        select: { views: true, reactions: true },
      },
      reactions: { where: { userId: me.userId }, select: { emoji: true } },
      poll: {
        include: {
          votes: { select: { userId: true, optionIndex: true } },
        },
      },
      mentions: {
        include: {
          user: { select: { id: true, username: true, displayName: true, avatarUrl: true } },
        },
      },
      collaborators: {
        include: {
          user: { select: { id: true, username: true, displayName: true, avatarUrl: true } },
        },
      },
    },
  });

  if (!story) return NextResponse.json({ error: "Story not found or expired." }, { status: 404 });
  if (story.authorId !== me.userId && await areUsersBlocked(me.userId, story.authorId)) {
    return NextResponse.json({ error: "You cannot view this story." }, { status: 403 });
  }

  if (story.authorId !== me.userId) {
    if (story.audience === "FOLLOWERS") {
      const follows = await prisma.follow.findUnique({
        where: {
          followerId_followingId: {
            followerId: me.userId,
            followingId: story.authorId,
          },
        },
      });
      if (!follows) return NextResponse.json({ error: "You cannot view this story." }, { status: 403 });
    }

    if (story.audience === "CLOSE_CIRCLE") {
      const inCloseCircle = await prisma.closeCircle.findUnique({
        where: {
          userId_targetId: {
            userId: story.authorId,
            targetId: me.userId,
          },
        },
      });
      if (!inCloseCircle) return NextResponse.json({ error: "You cannot view this story." }, { status: 403 });
    }

    await prisma.storyView.upsert({
      where: { userId_storyId: { userId: me.userId, storyId: story.id } },
      create: { userId: me.userId, storyId: story.id },
      update: { viewedAt: new Date() },
    });
  }

  return NextResponse.json({
    story: {
      id: story.id,
      mediaUrl: story.mediaUrl,
      mediaAlt: story.mediaAlt,
      caption: story.caption,
      location: story.location ?? null,
      music: readStoryMusic(story.musicTrack),
      playbackMode: story.playbackMode,
      mentions: story.mentions.map((mention) => ({
        userId: mention.userId,
        username: mention.user.username,
        displayName: mention.user.displayName,
        avatarUrl: mention.user.avatarUrl,
      })),
      collaborators: story.collaborators.map((collab) => ({
        userId: collab.userId,
        username: collab.user.username,
        displayName: collab.user.displayName,
        avatarUrl: collab.user.avatarUrl,
      })),
      audience: story.audience,
      createdAt: story.createdAt,
      expiresAt: story.expiresAt,
      author: story.author,
      viewedByMe: story.views.length > 0 || story.authorId === me.userId,
      viewCount: story._count.views,
      reactionCount: story._count.reactions,
      myReaction: story.reactions[0]?.emoji ?? null,
      poll: formatPollForViewer(story.poll, me.userId),
    },
  });
}

// DELETE /api/stories/[id] - delete my story
export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const me = await getUser(req);
  if (!me) return NextResponse.json({ error: "Not authenticated." }, { status: 401 });

  const { id } = await params;
  const story = await prisma.story.findUnique({
    where: { id },
    select: { id: true, authorId: true },
  });

  if (!story) return NextResponse.json({ error: "Story not found." }, { status: 404 });
  if (story.authorId !== me.userId) {
    return NextResponse.json({ error: "You cannot delete this story." }, { status: 403 });
  }

  await prisma.story.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
