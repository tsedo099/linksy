import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getUser } from "@/lib/auth";

/** Legacy endpoint — interest categories removed; clears stored preferences. */
export async function PATCH(req: NextRequest) {
  const me = await getUser(req);
  if (!me) return NextResponse.json({ error: "Not authenticated." }, { status: 401 });

  await prisma.user.update({
    where: { id: me.userId },
    data: { preferredCategories: [] },
  });

  return NextResponse.json({ categories: [] });
}
