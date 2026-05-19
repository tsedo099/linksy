import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getUser } from "@/lib/auth";
import { parseRequestJsonAllowEmpty } from "@/lib/request-json";
import { muteUserSchema } from "@/lib/schemas/api-bodies";

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const me = await getUser(req);
  if (!me) return NextResponse.json({ error: "Not authenticated." }, { status: 401 });

  const { id: targetUserId } = await params;
  if (!targetUserId || targetUserId === me.userId) {
    return NextResponse.json({ error: "Invalid user." }, { status: 400 });
  }

  const target = await prisma.user.findUnique({
    where: { id: targetUserId },
    select: { id: true },
  });
  if (!target) return NextResponse.json({ error: "User not found." }, { status: 404 });

  const parsed = await parseRequestJsonAllowEmpty(req, muteUserSchema);
  if (!parsed.ok) return parsed.response;

  const muted = parsed.data.muted !== false;
  const mutePosts = parsed.data.mutePosts !== false;
  const muteStories = parsed.data.muteStories !== false;

  if (!muted) {
    await prisma.mute.deleteMany({
      where: { muterId: me.userId, mutedId: targetUserId },
    });
    return NextResponse.json({
      muted: false,
      mutePosts: false,
      muteStories: false,
      muteNotifications: false,
    });
  }

  await prisma.mute.upsert({
    where: { muterId_mutedId: { muterId: me.userId, mutedId: targetUserId } },
    create: {
      muterId: me.userId,
      mutedId: targetUserId,
      mutePosts,
      muteStories,
      muteNotifications: parsed.data.muteNotifications === true,
    },
    update: {
      mutePosts,
      muteStories,
      ...(parsed.data.muteNotifications !== undefined
        ? { muteNotifications: parsed.data.muteNotifications === true }
        : {}),
    },
  });

  const row = await prisma.mute.findUnique({
    where: { muterId_mutedId: { muterId: me.userId, mutedId: targetUserId } },
    select: { mutePosts: true, muteStories: true, muteNotifications: true },
  });

  return NextResponse.json({
    muted: true,
    mutePosts: row?.mutePosts ?? mutePosts,
    muteStories: row?.muteStories ?? muteStories,
    muteNotifications: Boolean(row?.muteNotifications),
  });
}
