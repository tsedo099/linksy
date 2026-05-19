import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getUser } from "@/lib/auth";
import { writeAuditLog } from "@/lib/audit-log";
import { logBackgroundError } from "@/lib/logger";
import { consumeRateLimit } from "@/lib/rate-limit";
import { parseRequestJson } from "@/lib/request-json";
import { sanitizePlainText } from "@/lib/sanitize-html";
import { feedbackSchema } from "@/lib/schemas/api-bodies";

const FEEDBACK_RATE_LIMIT = { windowMs: 60 * 60 * 1000, max: 10 } as const;

/** POST /api/user/feedback — in-app feedback collection. */
export async function POST(req: NextRequest) {
  const user = await getUser(req);
  if (!user) return NextResponse.json({ error: "Not authenticated." }, { status: 401 });

  const limit = await consumeRateLimit("feedback:user", user.userId, FEEDBACK_RATE_LIMIT);
  if (!limit.ok) {
    return NextResponse.json(
      { error: "You're sending feedback too frequently. Try again later." },
      { status: 429, headers: { "Retry-After": String(limit.retryAfterSeconds) } },
    );
  }

  const parsed = await parseRequestJson(req, feedbackSchema);
  if (!parsed.ok) return parsed.response;

  const message = sanitizePlainText(parsed.data.message).trim();
  if (message.length < 10) {
    return NextResponse.json({ error: "Message must be at least 10 characters." }, { status: 400 });
  }

  const contextUrl = parsed.data.contextUrl?.trim().slice(0, 500) || null;
  const appVersion = parsed.data.appVersion?.trim().slice(0, 64) || null;
  const userAgent = req.headers.get("user-agent")?.slice(0, 512) ?? null;

  const created = await prisma.feedback.create({
    data: {
      userId: user.userId,
      category: parsed.data.category,
      message,
      contextUrl,
      appVersion,
      userAgent,
    },
  });

  await writeAuditLog({
    action: "FEEDBACK_SUBMITTED",
    actorUserId: user.userId,
    targetType: "FEEDBACK",
    targetId: created.id,
    request: req,
    metadata: { category: parsed.data.category, contextUrl },
  }).catch(logBackgroundError("feedback.audit"));

  return NextResponse.json(
    {
      feedback: {
        id: created.id,
        category: created.category,
        status: created.status,
        createdAt: created.createdAt.toISOString(),
      },
    },
    { status: 201 },
  );
}

/** GET /api/user/feedback — list the caller's submissions (most recent first). */
export async function GET(req: NextRequest) {
  const user = await getUser(req);
  if (!user) return NextResponse.json({ error: "Not authenticated." }, { status: 401 });

  const items = await prisma.feedback.findMany({
    where: { userId: user.userId },
    orderBy: { createdAt: "desc" },
    take: 50,
    select: {
      id: true,
      category: true,
      message: true,
      contextUrl: true,
      status: true,
      createdAt: true,
    },
  });

  return NextResponse.json({
    feedback: items.map((item) => ({
      ...item,
      createdAt: item.createdAt.toISOString(),
    })),
  });
}
