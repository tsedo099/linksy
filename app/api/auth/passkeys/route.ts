import { NextRequest, NextResponse } from "next/server";
import { getUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET(req: NextRequest) {
  const me = await getUser(req);
  if (!me) return NextResponse.json({ error: "Not authenticated." }, { status: 401 });

  const credentials = await prisma.webAuthnCredential.findMany({
    where: { userId: me.userId, revokedAt: null },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      name: true,
      transports: true,
      backedUp: true,
      lastUsedAt: true,
      createdAt: true,
    },
  });

  return NextResponse.json({ credentials });
}
