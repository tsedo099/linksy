import { NextRequest, NextResponse } from "next/server";
import { getUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

/**
 * GET /api/oauth/authorized — list third-party apps the caller has
 * authorized. Includes consent metadata + an indicator for whether any
 * non-revoked access/refresh tokens remain on the app.
 */
export async function GET(req: NextRequest) {
  const me = await getUser(req);
  if (!me) return NextResponse.json({ error: "Not authenticated." }, { status: 401 });

  const consents = await prisma.oAuthConsent.findMany({
    where: { userId: me.userId, revokedAt: null },
    orderBy: { updatedAt: "desc" },
    include: {
      application: {
        select: {
          id: true,
          name: true,
          description: true,
          homepageUrl: true,
          ownerId: true,
          revokedAt: true,
          owner: { select: { username: true, displayName: true } },
        },
      },
    },
  });

  const consentRows = await Promise.all(
    consents.map(async (consent) => {
      const liveTokens = await prisma.oAuthToken.count({
        where: {
          userId: me.userId,
          applicationId: consent.applicationId,
          revokedAt: null,
          expiresAt: { gt: new Date() },
        },
      });
      return {
        applicationId: consent.applicationId,
        scopes: consent.scopes,
        authorizedAt: consent.createdAt.toISOString(),
        updatedAt: consent.updatedAt.toISOString(),
        liveTokens,
        application: {
          id: consent.application.id,
          name: consent.application.name,
          description: consent.application.description,
          homepageUrl: consent.application.homepageUrl,
          revokedByOwner: Boolean(consent.application.revokedAt),
          owner: consent.application.owner
            ? {
                username: consent.application.owner.username,
                displayName: consent.application.owner.displayName,
              }
            : null,
        },
      };
    }),
  );

  return NextResponse.json({ apps: consentRows });
}
