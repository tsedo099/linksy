import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getUser } from "@/lib/auth";
import { parseRequestJson } from "@/lib/request-json";
import { postDraftUpsertSchema } from "@/lib/schemas/api-bodies";
import { sanitizePlainText } from "@/lib/sanitize-html";

function serializeDraft(d: {
  id: string;
  caption: string | null;
  mediaUrls: string[];
  mediaAltTexts: string[];
  audience: string;
  createdAt: Date;
  updatedAt: Date;
}) {
  return {
    id: d.id,
    caption: d.caption,
    mediaUrls: d.mediaUrls,
    mediaAltTexts: d.mediaAltTexts,
    audience: d.audience,
    createdAt: d.createdAt.toISOString(),
    updatedAt: d.updatedAt.toISOString(),
    thumbUrl: d.mediaUrls[0] ?? null,
  };
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getUser(req);
  if (!user) return NextResponse.json({ error: "Not authenticated." }, { status: 401 });

  const { id } = await params;
  const draft = await prisma.draft.findFirst({
    where: { id, authorId: user.userId },
  });
  if (!draft) return NextResponse.json({ error: "Draft not found." }, { status: 404 });

  return NextResponse.json({ draft: serializeDraft(draft) });
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getUser(req);
  if (!user) return NextResponse.json({ error: "Not authenticated." }, { status: 401 });

  const { id } = await params;
  const existing = await prisma.draft.findFirst({
    where: { id, authorId: user.userId },
  });
  if (!existing) return NextResponse.json({ error: "Draft not found." }, { status: 404 });

  const parsed = await parseRequestJson(req, postDraftUpsertSchema);
  if (!parsed.ok) return parsed.response;

  const mediaUrls =
    parsed.data.mediaUrls === undefined ? existing.mediaUrls : parsed.data.mediaUrls;
  const captionRaw = parsed.data.caption;
  const caption =
    captionRaw === undefined
      ? existing.caption
      : captionRaw === null || captionRaw === ""
        ? null
        : sanitizePlainText(captionRaw) || null;

  const mediaAltTexts =
    parsed.data.mediaAltTexts === undefined
      ? (() => {
          const next = existing.mediaAltTexts.slice(0, mediaUrls.length);
          while (next.length < mediaUrls.length) next.push("");
          return next;
        })()
      : (() => {
          const altIn = parsed.data.mediaAltTexts ?? [];
          const next: string[] = [];
          for (let i = 0; i < mediaUrls.length; i++) {
            const v = altIn[i];
            next.push(typeof v === "string" ? v : "");
          }
          return next;
        })();

  if (!caption?.trim() && mediaUrls.length === 0) {
    return NextResponse.json({ error: "Add a caption or at least one media URL." }, { status: 400 });
  }

  const audience = parsed.data.audience ?? existing.audience;

  const draft = await prisma.draft.update({
    where: { id },
    data: { caption, mediaUrls, mediaAltTexts, audience },
  });

  return NextResponse.json({ draft: serializeDraft(draft) });
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getUser(req);
  if (!user) return NextResponse.json({ error: "Not authenticated." }, { status: 401 });

  const { id } = await params;
  const result = await prisma.draft.deleteMany({
    where: { id, authorId: user.userId },
  });
  if (result.count === 0) return NextResponse.json({ error: "Draft not found." }, { status: 404 });

  return NextResponse.json({ ok: true });
}
