import { NextRequest, NextResponse } from "next/server";
import { rotateRefreshGrantAccess } from "@/lib/refresh-session";
import { applyAuthCookies, clearAuthCookies, LINKSY_REFRESH_COOKIE } from "@/lib/auth-cookies";

// POST /api/auth/refresh — rotate refresh token and issue a new access JWT (sliding session).

export async function POST(req: NextRequest) {
  const raw = req.cookies.get(LINKSY_REFRESH_COOKIE)?.value;
  if (!raw) {
    return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
  }

  const rotated = await rotateRefreshGrantAccess(raw);
  if (!rotated) {
    const res = NextResponse.json({ error: "Session expired." }, { status: 401 });
    clearAuthCookies(res);
    return res;
  }

  const res = NextResponse.json({ ok: true });
  applyAuthCookies(res, rotated.accessJwt, rotated.refreshRaw);
  return res;
}
