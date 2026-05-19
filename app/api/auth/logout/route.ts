import { NextRequest, NextResponse } from "next/server";
import { verifyAccessToken } from "@/lib/jwt";
import { LINKSY_ACCESS_COOKIE, LINKSY_REFRESH_COOKIE, clearAuthCookies } from "@/lib/auth-cookies";
import { findSessionFromRefreshRaw, revokeSessionForUser } from "@/lib/refresh-session";
import { writeAuditLog } from "@/lib/audit-log";
import { logBackgroundError } from "@/lib/logger";

export async function POST(req: NextRequest) {
  const token = req.cookies.get(LINKSY_ACCESS_COOKIE)?.value;
  const payload = token ? verifyAccessToken(token) : null;

  if (payload?.sessionId) {
    await revokeSessionForUser(payload.sessionId, payload.userId).catch(
      logBackgroundError("auth.logout.revokeSession"),
    );
    await writeAuditLog({
      action: "LOGOUT",
      actorUserId: payload.userId,
      targetType: "SESSION",
      targetId: payload.sessionId,
      request: req,
    }).catch(logBackgroundError("auth.logout.audit"));
  } else {
    const raw = req.cookies.get(LINKSY_REFRESH_COOKIE)?.value;
    const fromRefresh = raw ? await findSessionFromRefreshRaw(raw) : null;
    if (fromRefresh) {
      await revokeSessionForUser(fromRefresh.sessionId, fromRefresh.userId).catch(
        logBackgroundError("auth.logout.revokeSessionViaRefresh"),
      );
      await writeAuditLog({
        action: "LOGOUT",
        actorUserId: fromRefresh.userId,
        targetType: "SESSION",
        targetId: fromRefresh.sessionId,
        request: req,
      }).catch(logBackgroundError("auth.logout.auditViaRefresh"));
    }
  }

  const response = NextResponse.json({ message: "Signed out." });
  clearAuthCookies(response);
  return response;
}
