import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getUser } from "@/lib/auth";
import { formatPollForViewer } from "@/lib/polls";
import { parseRequestJson } from "@/lib/request-json";
import { pollVoteSchema } from "@/lib/schemas/api-bodies";

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const me = await getUser(req);
  if (!me) return NextResponse.json({ error: "Not authenticated." }, { status: 401 });

  const { id } = await params;
  const parsed = await parseRequestJson(req, pollVoteSchema);
  if (!parsed.ok) return parsed.response;
  const optionIndex = parsed.data.optionIndex;

  const poll = await prisma.poll.findUnique({
    where: { id },
    include: {
      votes: { select: { userId: true, optionIndex: true } },
      post: { select: { id: true, audience: true, authorId: true } },
      story: { select: { id: true, audience: true, authorId: true } },
    },
  });
  if (!poll) return NextResponse.json({ error: "Poll not found." }, { status: 404 });
  if (optionIndex >= poll.options.length) {
    return NextResponse.json({ error: "Invalid poll option." }, { status: 400 });
  }
  if (poll.expiresAt && poll.expiresAt.getTime() <= Date.now()) {
    return NextResponse.json({ error: "Poll has ended." }, { status: 400 });
  }

  // Minimal visibility guard for private polls.
  if (poll.post?.audience === "CLOSE_CIRCLE" && poll.post.authorId !== me.userId) {
    const inCloseCircle = await prisma.closeCircle.findUnique({
      where: {
        userId_targetId: {
          userId: poll.post.authorId,
          targetId: me.userId,
        },
      },
      select: { userId: true },
    });
    if (!inCloseCircle) return NextResponse.json({ error: "You cannot vote on this poll." }, { status: 403 });
  }
  if (poll.post?.audience === "FRIENDS" && poll.post.authorId !== me.userId) {
    const follows = await prisma.follow.findUnique({
      where: {
        followerId_followingId: {
          followerId: me.userId,
          followingId: poll.post.authorId,
        },
      },
      select: { followerId: true },
    });
    if (!follows) return NextResponse.json({ error: "You cannot vote on this poll." }, { status: 403 });
  }
  if (poll.story?.audience === "CLOSE_CIRCLE" && poll.story.authorId !== me.userId) {
    const inCloseCircle = await prisma.closeCircle.findUnique({
      where: {
        userId_targetId: {
          userId: poll.story.authorId,
          targetId: me.userId,
        },
      },
      select: { userId: true },
    });
    if (!inCloseCircle) return NextResponse.json({ error: "You cannot vote on this poll." }, { status: 403 });
  }
  if (poll.story?.audience === "FOLLOWERS" && poll.story.authorId !== me.userId) {
    const follows = await prisma.follow.findUnique({
      where: {
        followerId_followingId: {
          followerId: me.userId,
          followingId: poll.story.authorId,
        },
      },
      select: { followerId: true },
    });
    if (!follows) return NextResponse.json({ error: "You cannot vote on this poll." }, { status: 403 });
  }

  await prisma.pollVote.upsert({
    where: { pollId_userId: { pollId: poll.id, userId: me.userId } },
    update: { optionIndex, createdAt: new Date() },
    create: { pollId: poll.id, userId: me.userId, optionIndex },
  });

  const refreshed = await prisma.poll.findUnique({
    where: { id: poll.id },
    include: { votes: { select: { userId: true, optionIndex: true } } },
  });

  return NextResponse.json({ poll: formatPollForViewer(refreshed, me.userId) });
}
