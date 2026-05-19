import { NextRequest, NextResponse } from "next/server";
import { hasScopes, resolveApiActor } from "@/lib/api-actor";
import { prisma } from "@/lib/prisma";
import { postCreateSchema } from "@/lib/schemas/api-bodies";

export async function GET(req: NextRequest) {
  const actor = await resolveApiActor(req);
  if (!actor) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  if (!hasScopes(actor, ["posts:read"])) {
    return NextResponse.json({ error: "Missing scope: posts:read." }, { status: 403 });
  }

  const posts = await prisma.post.findMany({
    where: { authorId: actor.userId },
    orderBy: { createdAt: "desc" },
    take: 50,
    select: {
      id: true,
      caption: true,
      mediaUrls: true,
      mediaAltTexts: true,
      audience: true,
      createdAt: true,
      updatedAt: true,
    },
  });
  return NextResponse.json({ posts });
}

export async function POST(req: NextRequest) {
  const actor = await resolveApiActor(req);
  if (!actor) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  if (!hasScopes(actor, ["posts:write"])) {
    return NextResponse.json({ error: "Missing scope: posts:write." }, { status: 403 });
  }

  const body = await req.json().catch(() => null);
  const parsed = postCreateSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Invalid post payload." }, { status: 400 });

  const mediaUrls = (parsed.data.mediaUrls ?? []).filter((url) => url.trim());
  const caption = parsed.data.caption?.trim() || null;
  if (mediaUrls.length === 0 && !caption) {
    return NextResponse.json({ error: "Provide caption or media." }, { status: 400 });
  }

  const post = await prisma.post.create({
    data: {
      authorId: actor.userId,
      caption,
      captionLang: parsed.data.captionLang ?? null,
      mediaUrls,
      mediaAltTexts: parsed.data.mediaAltTexts ?? [],
      audience: parsed.data.audience ?? "PUBLIC",
      allowComments: parsed.data.allowComments ?? true,
      hideLikes: parsed.data.hideLikes ?? false,
    },
    select: { id: true, createdAt: true },
  });

  return NextResponse.json({ post }, { status: 201 });
}
