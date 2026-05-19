import { NextRequest, NextResponse } from "next/server";
import { getUser } from "@/lib/auth";
import { isSafetyAdmin } from "@/lib/admin-auth";
import { deleteUserCommentWarning } from "@/lib/safety-warnings";
import { logger } from "@/lib/logger";

/** DELETE /api/admin/safety/warnings/[id] — moderator clears a false-positive warning. */
export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getUser(req);
  if (!user) return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
  if (!(await isSafetyAdmin(user.userId))) {
    return NextResponse.json({ error: "Forbidden." }, { status: 403 });
  }

  const { id } = await params;
  try {
    await deleteUserCommentWarning({ warningId: id, actorUserId: user.userId });
    return NextResponse.json({ ok: true });
  } catch (err) {
    logger.warn({ scope: "safety.admin.warning.delete", warningId: id, err }, "warning delete failed");
    return NextResponse.json({ error: "Warning not found." }, { status: 404 });
  }
}
