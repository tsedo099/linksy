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

export async function GET(req: NextRequest) {
  const user = await getUser(req);
  if (!user) return NextResponse.json({ error: "Not authenticated." }, { status: 401 });

  const drafts = await prisma.draft.findMany({
    where: { authorId: user.userId },
    orderBy: { updatedAt: "desc" },
  });

  return NextResponse.json({ drafts: drafts.map(serializeDraft) });
}

export async function POST(req: NextRequest) {
  const user = await getUser(req);
  if (!user) return NextResponse.json({ error: "Not authenticated." }, { status: 401 });

  const parsed = await parseRequestJson(req, postDraftUpsertSchema);
  if (!parsed.ok) return parsed.response;

  const mediaUrls = parsed.data.mediaUrls ?? [];
  const captionRaw = parsed.data.caption;
  const caption =
    captionRaw === null || captionRaw === undefined
      ? null
      : sanitizePlainText(captionRaw) || null;

  const altIn = parsed.data.mediaAltTexts ?? [];
  const mediaAltTexts: string[] = [];
  for (let i = 0; i < mediaUrls.length; i++) {
    const v = altIn[i];
    mediaAltTexts.push(typeof v === "string" ? v : "");
  }

  if (!caption?.trim() && mediaUrls.length === 0) {
    return NextResponse.json({ error: "Add a caption or at least one media URL." }, { status: 400 });
  }

  const audience = parsed.data.audience ?? "PUBLIC";

  const draft = await prisma.draft.create({
    data: {
      authorId: user.userId,
      caption,
      mediaUrls,
      mediaAltTexts,
      audience,
    },
  });

  return NextResponse.json({ draft: serializeDraft(draft) });
}
