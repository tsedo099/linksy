import { NextRequest, NextResponse } from "next/server";
import { hasScopes, resolveApiActor } from "@/lib/api-actor";
import { prisma } from "@/lib/prisma";

export async function GET(req: NextRequest) {
  const actor = await resolveApiActor(req);
  if (!actor) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  if (!hasScopes(actor, ["profile:read"])) {
    return NextResponse.json({ error: "Missing scope: profile:read." }, { status: 403 });
  }

  const user = await prisma.user.findUnique({
    where: { id: actor.userId },
    select: {
      id: true,
      username: true,
      displayName: true,
      avatarUrl: true,
      bio: true,
      isVerified: true,
      createdAt: true,
    },
  });
  if (!user) return NextResponse.json({ error: "User not found." }, { status: 404 });
  return NextResponse.json({ user });
}
