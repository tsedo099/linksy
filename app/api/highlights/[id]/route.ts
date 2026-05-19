import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getUser } from "@/lib/auth";
import { areUsersBlocked } from "@/lib/user-blocks";
import { visibleStoryWhere } from "@/lib/story-visibility";

// GET /api/highlights/[id] - highlight detail with stories
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const me = await getUser(req);
  if (!me) return NextResponse.json({ error: "Not authenticated." }, { status: 401 });

  const { id } = await params;
  const highlight = await prisma.storyHighlight.findUnique({
    where: { id },
    include: {
      user: { select: { id: true, username: true, displayName: true, avatarUrl: true } },
      coverStory: { select: { id: true, mediaUrl: true } },
      items: {
        where: { story: visibleStoryWhere(me.userId) },
        orderBy: { addedAt: "asc" },
        include: {
          story: {
            select: {
              id: true,
              mediaUrl: true,
              mediaAlt: true,
              caption: true,
              createdAt: true,
              expiresAt: true,
              audience: true,
              playbackMode: true,
            },
          },
        },
      },
    },
  });

  if (!highlight) return NextResponse.json({ error: "Highlight not found." }, { status: 404 });
  if (highlight.userId !== me.userId && await areUsersBlocked(me.userId, highlight.userId)) {
    return NextResponse.json({ error: "Highlight unavailable." }, { status: 403 });
  }
  if (highlight.items.length === 0) {
    return NextResponse.json({ error: "Highlight unavailable." }, { status: 404 });
  }

  const customCoverRows = await prisma.$queryRaw<Array<{ coverUrl: string | null }>>`
    SELECT "coverUrl"
    FROM "StoryHighlight"
    WHERE "id" = ${id}
    LIMIT 1
  `;
  const customCoverUrl = customCoverRows[0]?.coverUrl ?? null;

  return NextResponse.json({
    highlight: {
      id: highlight.id,
      title: highlight.title,
      author: highlight.user,
      createdAt: highlight.createdAt,
      coverStoryId: highlight.items.some((item) => item.story.id === highlight.coverStoryId) ? highlight.coverStoryId : highlight.items[0]?.story.id ?? null,
      coverMediaUrl: customCoverUrl ?? (highlight.items.some((item) => item.story.id === highlight.coverStoryId) ? highlight.coverStory?.mediaUrl : null) ?? highlight.items[0]?.story.mediaUrl ?? null,
      storyCount: highlight.items.length,
      stories: highlight.items.map((item) => ({
        id: item.story.id,
        mediaUrl: item.story.mediaUrl,
        mediaAlt: item.story.mediaAlt,
        caption: item.story.caption,
        audience: item.story.audience,
        createdAt: item.story.createdAt,
        expiresAt: item.story.expiresAt,
        playbackMode: item.story.playbackMode,
      })),
    },
  });
}
