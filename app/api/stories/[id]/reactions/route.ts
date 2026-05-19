import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getUser } from "@/lib/auth";
import { activeStoryWhere, visibleActiveStoryWhere } from "@/lib/story-visibility";
import { areUsersBlocked } from "@/lib/user-blocks";
import { parseRequestJson } from "@/lib/request-json";
import { storyReactSchema } from "@/lib/schemas/api-bodies";
import { logBackgroundError } from "@/lib/logger";
import { createNotificationIfAllowed } from "@/lib/notifications";

const MAX_REACTORS_LISTED = 50;

// POST /api/stories/[id]/reactions — react with an emoji (replaces previous reaction)
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const me = await getUser(req);
  if (!me) return NextResponse.json({ error: "Not authenticated." }, { status: 401 });

  const { id: storyId } = await params;
  const parsed = await parseRequestJson(req, storyReactSchema);
  if (!parsed.ok) return parsed.response;
  const emoji = parsed.data.emoji.trim();

  const now = new Date();
  const story = await prisma.story.findFirst({
    where: { id: storyId, ...visibleActiveStoryWhere(me.userId, now) },
    select: { id: true, authorId: true },
  });
  if (!story) {
    const stillActive = await prisma.story.findFirst({
      where: { id: storyId, ...activeStoryWhere(now) },
      select: { id: true },
    });
    return NextResponse.json(
      { error: stillActive ? "You cannot react to this story." : "Story expired." },
      { status: stillActive ? 403 : 410 },
    );
  }

  if (story.authorId === me.userId) {
    return NextResponse.json({ error: "You cannot react to your own story." }, { status: 400 });
  }

  if (await areUsersBlocked(me.userId, story.authorId)) {
    return NextResponse.json({ error: "You cannot react to this story." }, { status: 403 });
  }

  const existing = await prisma.storyReaction.findUnique({
    where: { userId_storyId: { userId: me.userId, storyId } },
    select: { emoji: true },
  });

  await prisma.storyReaction.upsert({
    where: { userId_storyId: { userId: me.userId, storyId } },
    create: { userId: me.userId, storyId, emoji },
    update: { emoji },
  });

  if (!existing) {
    createNotificationIfAllowed({
      userId: story.authorId,
      fromId: me.userId,
      type: "story_reaction",
      storyId,
    }).catch(logBackgroundError("stories.reactions.notify"));
  }

  const count = await prisma.storyReaction.count({ where: { storyId } });
  return NextResponse.json({ ok: true, emoji, count });
}

// DELETE /api/stories/[id]/reactions — remove my reaction
export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const me = await getUser(req);
  if (!me) return NextResponse.json({ error: "Not authenticated." }, { status: 401 });

  const { id: storyId } = await params;
  await prisma.storyReaction.deleteMany({
    where: { userId: me.userId, storyId },
  });
  const count = await prisma.storyReaction.count({ where: { storyId } });
  return NextResponse.json({ ok: true, count });
}

// GET /api/stories/[id]/reactions — owner-only list of reactors
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const me = await getUser(req);
  if (!me) return NextResponse.json({ error: "Not authenticated." }, { status: 401 });

  const { id: storyId } = await params;
  const story = await prisma.story.findUnique({
    where: { id: storyId },
    select: { id: true, authorId: true },
  });
  if (!story) return NextResponse.json({ error: "Story not found." }, { status: 404 });
  if (story.authorId !== me.userId) {
    return NextResponse.json({ error: "Only the author can view reactions." }, { status: 403 });
  }

  const reactions = await prisma.storyReaction.findMany({
    where: { storyId },
    orderBy: { createdAt: "desc" },
    take: MAX_REACTORS_LISTED,
    include: {
      user: { select: { id: true, username: true, displayName: true, avatarUrl: true } },
    },
  });

  const breakdown = reactions.reduce<Record<string, number>>((acc, row) => {
    acc[row.emoji] = (acc[row.emoji] ?? 0) + 1;
    return acc;
  }, {});

  return NextResponse.json({
    storyId,
    total: reactions.length,
    breakdown,
    reactors: reactions.map((row) => ({
      user: row.user,
      emoji: row.emoji,
      reactedAt: row.createdAt,
    })),
  });
}
