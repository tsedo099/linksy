import { NextRequest, NextResponse } from "next/server";
import { getUser } from "@/lib/auth";
import { isSafetyAdmin } from "@/lib/admin-auth";
import { clearUserCommentBan } from "@/lib/safety-warnings";
import { parseRequestJsonAllowEmpty } from "@/lib/request-json";
import { z } from "zod";

const bodySchema = z.object({ reason: z.string().max(280).optional() });

/** POST /api/admin/safety/users/[id]/unban — clear comment ban + reset warning counter. */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getUser(req);
  if (!user) return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
  if (!(await isSafetyAdmin(user.userId))) {
    return NextResponse.json({ error: "Forbidden." }, { status: 403 });
  }

  const { id } = await params;
  const parsed = await parseRequestJsonAllowEmpty(req, bodySchema);
  const reason = parsed.ok ? parsed.data.reason : undefined;

  await clearUserCommentBan({ targetUserId: id, actorUserId: user.userId, reason });
  return NextResponse.json({ ok: true });
}
