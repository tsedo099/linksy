import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getUser } from "@/lib/auth";
import { REPORT_REASONS, type ReportReason } from "@/lib/moderation";
import { parseRequestJsonAllowEmpty } from "@/lib/request-json";
import { reportBodySchema } from "@/lib/schemas/api-bodies";

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const me = await getUser(req);
  if (!me) return NextResponse.json({ error: "Not authenticated." }, { status: 401 });

  const { id: postId } = await params;
  if (!postId) return NextResponse.json({ error: "Post id is required." }, { status: 400 });

  const post = await prisma.post.findUnique({
    where: { id: postId },
    select: { id: true },
  });
  if (!post) return NextResponse.json({ error: "Post not found." }, { status: 404 });

  const parsed = await parseRequestJsonAllowEmpty(req, reportBodySchema);
  if (!parsed.ok) return parsed.response;
  const reason = (parsed.data.reason ?? "OTHER").toUpperCase() as ReportReason;
  const details = parsed.data.details?.trim() || null;

  if (!REPORT_REASONS.includes(reason)) {
    return NextResponse.json({ error: "Invalid report reason." }, { status: 400 });
  }
  if (details && details.length > 1000) {
    return NextResponse.json({ error: "Report details must be 1000 characters or less." }, { status: 400 });
  }

  await prisma.report.upsert({
    where: {
      reporterId_targetType_targetId: {
        reporterId: me.userId,
        targetType: "post",
        targetId: postId,
      },
    },
    create: {
      reporterId: me.userId,
      targetType: "post",
      targetId: postId,
      reason,
      details,
    },
    update: { reason, details },
  });

  return NextResponse.json({ reported: true, targetType: "post", targetId: postId, reason });
}
