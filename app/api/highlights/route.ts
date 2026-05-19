import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getUser } from "@/lib/auth";
import { parseRequestJson } from "@/lib/request-json";
import { highlightCreateSchema } from "@/lib/schemas/api-bodies";
import { isUploadedMediaUrl } from "@/lib/media";

const MAX_TITLE_LENGTH = 40;
const MAX_STORIES = 50;

// POST /api/highlights - create highlight with selected stories and cover
export async function POST(req: NextRequest) {
  const me = await getUser(req);
  if (!me) return NextResponse.json({ error: "Not authenticated." }, { status: 401 });

  const parsed = await parseRequestJson(req, highlightCreateSchema);
  if (!parsed.ok) return parsed.response;

  const payload = parsed.data;
  const title = payload.title.trim();
  if (!title) {
    return NextResponse.json({ error: "Title cannot be empty." }, { status: 400 });
  }
  if (title.length > MAX_TITLE_LENGTH) {
    return NextResponse.json({ error: `Title must be ${MAX_TITLE_LENGTH} characters or less.` }, { status: 400 });
  }

  const storyIds = Array.from(new Set(
    payload.storyIds.filter((id) => id.trim().length > 0).map((id) => id.trim()),
  ));

  const body = {
    ...payload,
    title,
    storyIds,
    coverStoryId: payload.coverStoryId,
    coverUrl: payload.coverUrl,
  };

  if (storyIds.length === 0) {
    return NextResponse.json({ error: "Select at least one story." }, { status: 400 });
  }
  if (storyIds.length > MAX_STORIES) {
    return NextResponse.json({ error: `You can select up to ${MAX_STORIES} stories.` }, { status: 400 });
  }

  const stories = await prisma.story.findMany({
    where: {
      id: { in: storyIds },
      authorId: me.userId,
    },
    select: { id: true, createdAt: true },
    orderBy: { createdAt: "desc" },
  });

  if (stories.length !== storyIds.length) {
    return NextResponse.json({ error: "One or more selected stories are invalid." }, { status: 400 });
  }

  const coverUrl = typeof body.coverUrl === "string" && body.coverUrl.trim()
    ? body.coverUrl.trim()
    : null;
  if (coverUrl && !isUploadedMediaUrl(coverUrl)) {
    return NextResponse.json({ error: "Cover image must be uploaded through Linksy." }, { status: 400 });
  }

  const fallbackCoverStoryId = stories[0]?.id;
  if (!coverUrl && !fallbackCoverStoryId) {
    return NextResponse.json({ error: "No stories selected for highlight cover." }, { status: 400 });
  }
  const coverStoryId = !coverUrl && typeof body.coverStoryId === "string" && body.coverStoryId.trim()
    ? body.coverStoryId.trim()
    : fallbackCoverStoryId;

  if (!coverUrl && !stories.some((story) => story.id === coverStoryId)) {
    return NextResponse.json({ error: "Cover story must be one of selected stories." }, { status: 400 });
  }

  const highlight = await prisma.storyHighlight.create({
    data: {
      userId: me.userId,
      title,
      coverStoryId: coverUrl ? null : coverStoryId,
      items: {
        create: storyIds.map((storyId) => ({ storyId })),
      },
    },
    include: {
      coverStory: { select: { id: true, mediaUrl: true } },
      _count: { select: { items: true } },
    },
  });

  // Keep compatibility when dev server still uses older Prisma runtime shape.
  if (coverUrl) {
    await prisma.$executeRaw`
      UPDATE "StoryHighlight"
      SET "coverUrl" = ${coverUrl}
      WHERE "id" = ${highlight.id}
    `;
  }

  return NextResponse.json({
    highlight: {
      id: highlight.id,
      title: highlight.title,
      createdAt: highlight.createdAt,
      coverStoryId: highlight.coverStoryId,
      coverMediaUrl: coverUrl ?? highlight.coverStory?.mediaUrl ?? null,
      storyCount: highlight._count.items,
    },
  }, { status: 201 });
}
