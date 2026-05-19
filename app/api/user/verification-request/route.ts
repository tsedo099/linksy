import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getUser } from "@/lib/auth";
import { writeAuditLog } from "@/lib/audit-log";
import { logBackgroundError } from "@/lib/logger";
import { parseRequestJson } from "@/lib/request-json";
import { sanitizePlainText } from "@/lib/sanitize-html";
import { verificationRequestSchema } from "@/lib/schemas/api-bodies";

const REJECTION_COOLDOWN_DAYS = 30;

function serialize(req: {
  id: string;
  category: string;
  reason: string;
  supportingUrls: string[];
  status: string;
  submittedAt: Date;
  decidedAt: Date | null;
  decisionNote: string | null;
}) {
  return {
    id: req.id,
    category: req.category,
    reason: req.reason,
    supportingUrls: req.supportingUrls,
    status: req.status,
    submittedAt: req.submittedAt.toISOString(),
    decidedAt: req.decidedAt?.toISOString() ?? null,
    decisionNote: req.decisionNote,
  };
}

/** GET — current request (PENDING) plus the most recent decided one. */
export async function GET(req: NextRequest) {
  const user = await getUser(req);
  if (!user) return NextResponse.json({ error: "Not authenticated." }, { status: 401 });

  const [pending, latest, isVerified] = await Promise.all([
    prisma.verificationRequest.findFirst({
      where: { userId: user.userId, status: "PENDING" },
      orderBy: { submittedAt: "desc" },
    }),
    prisma.verificationRequest.findFirst({
      where: { userId: user.userId, status: { in: ["APPROVED", "REJECTED"] } },
      orderBy: { submittedAt: "desc" },
    }),
    prisma.user.findUnique({
      where: { id: user.userId },
      select: { isVerified: true },
    }),
  ]);

  return NextResponse.json({
    isVerified: Boolean(isVerified?.isVerified),
    pending: pending ? serialize(pending) : null,
    latestDecision: latest ? serialize(latest) : null,
  });
}

/**
 * POST — submit a "blue check" verification request.
 *
 * Gates:
 *   - email must be verified (anti-spam baseline)
 *   - user must not already be verified
 *   - one PENDING request at a time
 *   - 30-day cooldown after a REJECTED request to discourage spam
 */
export async function POST(req: NextRequest) {
  const user = await getUser(req);
  if (!user) return NextResponse.json({ error: "Not authenticated." }, { status: 401 });

  const me = await prisma.user.findUnique({
    where: { id: user.userId },
    select: { id: true, emailVerified: true, isVerified: true },
  });
  if (!me) return NextResponse.json({ error: "User not found." }, { status: 404 });
  if (me.isVerified) {
    return NextResponse.json({ error: "Account is already verified." }, { status: 409 });
  }
  if (!me.emailVerified) {
    return NextResponse.json({ error: "Verify your email before requesting verification." }, { status: 403 });
  }

  const pending = await prisma.verificationRequest.findFirst({
    where: { userId: me.id, status: "PENDING" },
    select: { id: true },
  });
  if (pending) {
    return NextResponse.json(
      { error: "You already have a pending verification request." },
      { status: 409 },
    );
  }

  const lastRejected = await prisma.verificationRequest.findFirst({
    where: { userId: me.id, status: "REJECTED" },
    orderBy: { decidedAt: "desc" },
    select: { decidedAt: true },
  });
  if (lastRejected?.decidedAt) {
    const cooldownMs = REJECTION_COOLDOWN_DAYS * 24 * 60 * 60 * 1000;
    const elapsedMs = Date.now() - lastRejected.decidedAt.getTime();
    if (elapsedMs < cooldownMs) {
      const daysLeft = Math.ceil((cooldownMs - elapsedMs) / (24 * 60 * 60 * 1000));
      return NextResponse.json(
        { error: `Please wait ${daysLeft} more day(s) before re-applying.` },
        { status: 429 },
      );
    }
  }

  const parsed = await parseRequestJson(req, verificationRequestSchema);
  if (!parsed.ok) return parsed.response;

  const reason = sanitizePlainText(parsed.data.reason).trim();
  if (reason.length < 20) {
    return NextResponse.json({ error: "Reason must be at least 20 characters." }, { status: 400 });
  }

  const created = await prisma.verificationRequest.create({
    data: {
      userId: me.id,
      category: parsed.data.category,
      reason,
      supportingUrls: parsed.data.supportingUrls ?? [],
    },
  });

  await writeAuditLog({
    action: "VERIFICATION_REQUEST_SUBMITTED",
    actorUserId: me.id,
    targetType: "USER",
    targetId: me.id,
    request: req,
    metadata: { category: parsed.data.category, requestId: created.id },
  }).catch(logBackgroundError("verification.request.audit"));

  return NextResponse.json({ request: serialize(created) }, { status: 201 });
}
