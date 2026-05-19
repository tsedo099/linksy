import { NextRequest, NextResponse } from "next/server";
import { getUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { writeAuditLog } from "@/lib/audit-log";
import { logBackgroundError } from "@/lib/logger";

/**
 * DELETE /api/oauth/authorized/[applicationId] — revoke the caller's consent
 * for a specific third-party OAuth app. All non-revoked tokens (access +
 * refresh) belonging to this (user, application) pair are marked revoked
 * atomically so the next API call from that app fails with 401.
 */
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ applicationId: string }> },
) {
  const me = await getUser(req);
  if (!me) return NextResponse.json({ error: "Not authenticated." }, { status: 401 });

  const { applicationId } = await params;
  if (!applicationId) {
    return NextResponse.json({ error: "applicationId is required." }, { status: 400 });
  }

  const now = new Date();
  const [consentUpdate, tokenUpdate] = await prisma.$transaction([
    prisma.oAuthConsent.updateMany({
      where: { userId: me.userId, applicationId, revokedAt: null },
      data: { revokedAt: now },
    }),
    prisma.oAuthToken.updateMany({
      where: { userId: me.userId, applicationId, revokedAt: null },
      data: { revokedAt: now },
    }),
  ]);

  if (consentUpdate.count === 0 && tokenUpdate.count === 0) {
    return NextResponse.json({ error: "No active authorization to revoke." }, { status: 404 });
  }

  writeAuditLog({
    action: "OAUTH_APP_REVOKED",
    actorUserId: me.userId,
    targetType: "OAuthApplication",
    targetId: applicationId,
    request: req,
    metadata: { revokedConsents: consentUpdate.count, revokedTokens: tokenUpdate.count },
  }).catch(logBackgroundError("oauth.audit.revoke"));

  return NextResponse.json({
    ok: true,
    revokedConsents: consentUpdate.count,
    revokedTokens: tokenUpdate.count,
  });
}
