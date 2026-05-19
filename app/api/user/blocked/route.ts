import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getUser } from "@/lib/auth";

// GET /api/user/blocked - list users I blocked
export async function GET(req: NextRequest) {
  const me = await getUser(req);
  if (!me) return NextResponse.json({ error: "Not authenticated." }, { status: 401 });

  const rows = await prisma.$queryRaw<Array<{
    id: string;
    username: string;
    displayName: string;
    avatarUrl: string | null;
    bio: string | null;
    isVerified: boolean;
    blockedAt: Date;
  }>>`
    SELECT
      u."id",
      u."username",
      u."displayName",
      u."avatarUrl",
      u."bio",
      u."isVerified",
      b."createdAt" AS "blockedAt"
    FROM "UserBlock" b
    INNER JOIN "User" u ON u."id" = b."blockedId"
    WHERE b."blockerId" = ${me.userId}
    ORDER BY b."createdAt" DESC
  `;

  return NextResponse.json({
    users: rows,
  });
}
