import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getUser } from "@/lib/auth";
import { areUsersBlocked } from "@/lib/user-blocks";
import { visibleStoryWhere } from "@/lib/story-visibility";

// GET /api/users/[id]/highlights - profile highlights
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const me = await getUser(req);
  if (!me) return NextResponse.json({ error: "Not authenticated." }, { status: 401 });

  const { id } = await params;
  if (id !== me.userId && await areUsersBlocked(me.userId, id)) {
    return NextResponse.json({ error: "Highlights unavailable." }, { status: 403 });
  }

  const highlights = await prisma.storyHighlight.findMany({
    where: { userId: id },
    orderBy: { createdAt: "asc" },
    include: {
      coverStory: {
        select: { id: true, mediaUrl: true },
      },
      items: {
        where: { story: visibleStoryWhere(me.userId) },
        orderBy: { addedAt: "asc" },
        select: {
          story: { select: { id: true, mediaUrl: true } },
        },
      },
    },
  });
  const customCoverRows = await prisma.$queryRaw<Array<{ id: string; coverUrl: string | null }>>`
    SELECT "id", "coverUrl"
    FROM "StoryHighlight"
    WHERE "userId" = ${id}
  `;
  const customCoverById = new Map(customCoverRows.map((row) => [row.id, row.coverUrl]));

  return NextResponse.json({
    highlights: highlights
      .map((highlight) => {
        const visibleCoverStory = highlight.coverStory && highlight.items.some((item) => item.story.id === highlight.coverStory?.id)
          ? highlight.coverStory
          : null;
        return {
          id: highlight.id,
          title: highlight.title,
          createdAt: highlight.createdAt,
          coverStoryId: visibleCoverStory?.id ?? highlight.items[0]?.story.id ?? null,
          coverMediaUrl: customCoverById.get(highlight.id) ?? visibleCoverStory?.mediaUrl ?? highlight.items[0]?.story.mediaUrl ?? null,
          storyCount: highlight.items.length,
        };
      })
      .filter((highlight) => highlight.storyCount > 0),
  });
}
