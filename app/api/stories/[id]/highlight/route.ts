import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getUser } from "@/lib/auth";
import { parseRequestJsonAllowEmpty } from "@/lib/request-json";
import { storyHighlightSchema } from "@/lib/schemas/api-bodies";

const MAX_TITLE_LENGTH = 40;

function normalizeHighlightTitle(value: unknown) {
  if (value == null) return null;
  if (typeof value !== "string") return { error: "Highlight title is invalid." } as const;
  const title = value.trim();
  if (!title) return { error: "Highlight title cannot be empty." } as const;
  if (title.length > MAX_TITLE_LENGTH) {
    return { error: `Highlight title must be ${MAX_TITLE_LENGTH} characters or less.` } as const;
  }
  return { title } as const;
}

// POST /api/stories/[id]/highlight - create highlight and add this story
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const me = await getUser(req);
  if (!me) return NextResponse.json({ error: "Not authenticated." }, { status: 401 });

  const { id: storyId } = await params;
  const story = await prisma.story.findUnique({
    where: { id: storyId },
    select: { id: true, authorId: true },
  });

  if (!story) return NextResponse.json({ error: "Story not found." }, { status: 404 });
  if (story.authorId !== me.userId) {
    return NextResponse.json({ error: "You can only highlight your own story." }, { status: 403 });
  }

  const parsed = await parseRequestJsonAllowEmpty(req, storyHighlightSchema);
  if (!parsed.ok) return parsed.response;
  const reqBody = parsed.data;

  const highlightId = typeof reqBody.highlightId === "string" && reqBody.highlightId.trim()
    ? reqBody.highlightId.trim()
    : null;
  const setAsCover = reqBody.setAsCover !== false;
  const titleCheck = normalizeHighlightTitle(reqBody.title);
  if (titleCheck && "error" in titleCheck) {
    return NextResponse.json({ error: titleCheck.error }, { status: 400 });
  }

  let highlight: {
    id: string;
    userId: string;
    title: string;
    coverStoryId: string | null;
    createdAt: Date;
    updatedAt: Date;
  };

  if (highlightId) {
    const existing = await prisma.storyHighlight.findUnique({
      where: { id: highlightId },
    });
    if (!existing) return NextResponse.json({ error: "Highlight not found." }, { status: 404 });
    if (existing.userId !== me.userId) {
      return NextResponse.json({ error: "You cannot edit this highlight." }, { status: 403 });
    }
    highlight = existing;
  } else {
    const count = await prisma.storyHighlight.count({ where: { userId: me.userId } });
    const defaultTitle = `Highlights ${count + 1}`;
    highlight = await prisma.storyHighlight.create({
      data: {
        userId: me.userId,
        title: titleCheck && "title" in titleCheck ? titleCheck.title : defaultTitle,
        coverStoryId: setAsCover ? storyId : null,
      },
    });
  }

  const existingItem = await prisma.storyHighlightItem.findUnique({
    where: {
      highlightId_storyId: {
        highlightId: highlight.id,
        storyId,
      },
    },
    select: { storyId: true },
  });

  if (!existingItem) {
    await prisma.storyHighlightItem.create({
      data: {
        highlightId: highlight.id,
        storyId,
      },
    });
  }

  const nextHighlight = setAsCover && highlight.coverStoryId !== storyId
    ? await prisma.storyHighlight.update({
        where: { id: highlight.id },
        data: { coverStoryId: storyId },
      })
    : highlight;

  return NextResponse.json(
    {
      highlight: nextHighlight,
      added: !existingItem,
    },
    { status: highlightId ? 200 : 201 },
  );
}
