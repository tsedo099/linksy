import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getUser } from "@/lib/auth";

// GET /api/user/muted - list users I have muted
export async function GET(req: NextRequest) {
  const me = await getUser(req);
  if (!me) return NextResponse.json({ error: "Not authenticated." }, { status: 401 });

  const rows = await prisma.mute.findMany({
    where: { muterId: me.userId },
    orderBy: { createdAt: "desc" },
    select: {
      mutePosts: true,
      muteStories: true,
      muteNotifications: true,
      createdAt: true,
      muted: {
        select: {
          id: true,
          username: true,
          displayName: true,
          avatarUrl: true,
          bio: true,
          isVerified: true,
        },
      },
    },
  });

  return NextResponse.json({
    users: rows.map((row) => ({
      ...row.muted,
      mutePosts: row.mutePosts,
      muteStories: row.muteStories,
      muteNotifications: row.muteNotifications,
      mutedAt: row.createdAt,
    })),
  });
}
