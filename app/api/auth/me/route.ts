import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@/lib/generated/prisma/client";
import { getUser } from "@/lib/auth";
import { CSRF_COOKIE_NAME, csrfCookieOptions, newCsrfTokenValue } from "@/lib/csrf";
import { clearAuthCookies } from "@/lib/auth-cookies";
import { prisma } from "@/lib/prisma";
import { visibleActiveStoryWhere } from "@/lib/story-visibility";
import { writeAuditLog } from "@/lib/audit-log";
import { logBackgroundError } from "@/lib/logger";
import { parseRequestJson } from "@/lib/request-json";
import { parseAppLanguage } from "@/lib/language";
import { meDeleteBodySchema, mePatchSchema } from "@/lib/schemas/api-bodies";
import { sanitizePlainText } from "@/lib/sanitize-html";
import { isTrustedUserUploadUrl } from "@/lib/upload-url";
import { gdprHardDeleteGraceDays } from "@/lib/gdpr-hard-delete";
import { isSafetyAdmin } from "@/lib/admin-auth";
import { withMetrics } from "@/lib/with-metrics";

const AVATAR_UPLOAD_IMAGE_PATTERN = /^\/uploads\/[^/]+\.(?:jpe?g|png|webp|gif)$/i;

function isValidAvatarUploadReference(url: string): boolean {
  if (AVATAR_UPLOAD_IMAGE_PATTERN.test(url)) return true;
  if (!url.startsWith("https://")) return false;
  if (!isTrustedUserUploadUrl(url)) return false;
  try {
    return /\.(?:jpe?g|png|webp|gif)$/i.test(new URL(url).pathname);
  } catch {
    return false;
  }
}

function isMissingColumnError(error: unknown) {
  if (!(error instanceof Prisma.PrismaClientKnownRequestError)) {
    return false;
  }

  return error.code === "P2022";
}

function isMissingAccountDeletionColumn(error: unknown) {
  if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2022") {
    return String(error.meta?.column ?? error.message ?? "").includes("accountDeletionRequestedAt");
  }
  const message = error instanceof Error ? error.message : "";
  return message.includes("accountDeletionRequestedAt");
}

export const GET = withMetrics("/api/auth/me", async (req: NextRequest) => {
  const payload = await getUser(req);

  if (!payload) {
    return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
  }

  const fullSelect = {
    id: true,
    username: true,
    email: true,
    displayName: true,
    bio: true,
    avatarUrl: true,
    preferredCategories: true,
    showFollowers: true,
    showFollowing: true,
    allowMessageRequests: true,
    allowGroupInvites: true,
    allowStoryReplies: true,
    defaultAllowComments: true,
    defaultHideLikes: true,
    preferredLanguage: true,
    quietHoursStart: true,
    quietHoursEnd: true,
    quietHoursTimezone: true,
    birthDate: true,
    autoRevealAdultContent: true,
    isVerified: true,
    emailVerified: true,
    twoFactorEnabled: true,
    createdAt: true,
    subscriptionTier: true,
    passwordHash: true,
    subscription: {
      select: {
        expiresAt: true,
        status: true,
        cancelAtPeriodEnd: true,
        trialEnd: true,
        stripePriceId: true,
        currentPeriodEnd: true,
      },
    },
    _count: { select: { posts: true, followers: true, following: true } },
  } as const;

  const fallbackSelect = {
    id: true,
    username: true,
    email: true,
    displayName: true,
    bio: true,
    avatarUrl: true,
    preferredCategories: true,
    showFollowers: true,
    showFollowing: true,
    defaultAllowComments: true,
    defaultHideLikes: true,
    isVerified: true,
    createdAt: true,
    passwordHash: true,
    _count: { select: { posts: true, followers: true, following: true } },
  } as const;

  /** Oldest-compatible shape when newer User columns or relations are missing. */
  const legacySelect = {
    id: true,
    username: true,
    email: true,
    displayName: true,
    bio: true,
    avatarUrl: true,
    showFollowers: true,
    showFollowing: true,
    isVerified: true,
    createdAt: true,
    _count: { select: { posts: true, followers: true, following: true } },
  } as const;

  let user:
    | (Prisma.UserGetPayload<{ select: typeof fullSelect }> & {
        _count: { followers: number; following: number; posts: number };
      })
    | (Prisma.UserGetPayload<{ select: typeof fallbackSelect }> & {
        _count: { followers: number; following: number; posts: number };
      })
    | (Prisma.UserGetPayload<{ select: typeof legacySelect }> & {
        _count: { followers: number; following: number; posts: number };
      })
    | null = null;

  try {
    user = await prisma.user.findUnique({
      where: { id: payload.userId },
      select: fullSelect,
    });
  } catch (error) {
    if (!isMissingColumnError(error)) {
      throw error;
    }

    try {
      user = await prisma.user.findUnique({
        where: { id: payload.userId },
        select: fallbackSelect,
      });
    } catch (error2) {
      if (!isMissingColumnError(error2)) {
        throw error2;
      }

      user = await prisma.user.findUnique({
        where: { id: payload.userId },
        select: legacySelect,
      });
    }
  }

  if (!user) {
    return NextResponse.json({ error: "User not found." }, { status: 404 });
  }

  const subscriptionRow = "subscription" in user ? user.subscription : undefined;
  const {
    subscription: _omitSub,
    passwordHash: _passwordHash,
    ...userFields
  } = user as typeof user & {
    subscription?: {
      expiresAt: Date | null;
      status?: string | null;
      cancelAtPeriodEnd?: boolean | null;
      trialEnd?: Date | null;
      stripePriceId?: string | null;
      currentPeriodEnd?: Date | null;
    } | null;
    passwordHash?: string | null;
  };
  void _omitSub;
  const hasPassword =
    "passwordHash" in user ? Boolean(_passwordHash) : true;

  const now = new Date();
  const activeStoryWhere = {
    authorId: user.id,
    ...visibleActiveStoryWhere(user.id, now),
  };
  const storyCount = await prisma.story.count({ where: activeStoryWhere });

  const response = NextResponse.json({
    user: {
      ...userFields,
      allowGroupInvites: "allowGroupInvites" in user ? user.allowGroupInvites : true,
      allowMessageRequests: "allowMessageRequests" in user ? user.allowMessageRequests : true,
      allowStoryReplies: "allowStoryReplies" in user ? user.allowStoryReplies : true,
      defaultAllowComments:
        "defaultAllowComments" in user ? user.defaultAllowComments : true,
      defaultHideLikes: "defaultHideLikes" in user ? user.defaultHideLikes : false,
      emailVerified: "emailVerified" in user ? user.emailVerified : false,
      twoFactorEnabled: "twoFactorEnabled" in user ? user.twoFactorEnabled : false,
      preferredLanguage: parseAppLanguage(
        "preferredLanguage" in user
          ? (user as { preferredLanguage?: string | null }).preferredLanguage
          : null,
      ),
      subscriptionExpiresAt: subscriptionRow?.expiresAt?.toISOString() ?? null,
      subscriptionStatus: subscriptionRow?.status ?? null,
      subscriptionCancelAtPeriodEnd: subscriptionRow?.cancelAtPeriodEnd ?? false,
      subscriptionTrialEnd: subscriptionRow?.trialEnd?.toISOString() ?? null,
      subscriptionPriceId: subscriptionRow?.stripePriceId ?? null,
      hasActiveStory: storyCount > 0,
      hasUnviewedStory: false,
      hasPassword,
      isAdmin: await isSafetyAdmin(user.id),
    },
  });
  if (!req.cookies.get(CSRF_COOKIE_NAME)?.value) {
    response.cookies.set(CSRF_COOKIE_NAME, newCsrfTokenValue(), csrfCookieOptions());
  }
  return response;
});

export const PATCH = withMetrics("/api/auth/me", async (req: NextRequest) => {
  const payload = await getUser(req);

  if (!payload) {
    return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
  }

  const parsed = await parseRequestJson(req, mePatchSchema);
  if (!parsed.ok) return parsed.response;
  const body = parsed.data;

  const updateData: {
    avatarUrl?: string | null;
    bio?: string | null;
    displayName?: string;
    preferredCategories?: string[];
    preferredLanguage?: string;
    showFollowers?: boolean;
    showFollowing?: boolean;
    allowMessageRequests?: boolean;
    allowGroupInvites?: boolean;
    allowStoryReplies?: boolean;
    defaultAllowComments?: boolean;
    defaultHideLikes?: boolean;
    quietHoursStart?: number | null;
    quietHoursEnd?: number | null;
    quietHoursTimezone?: string | null;
    birthDate?: Date | null;
    autoRevealAdultContent?: boolean;
  } = {};

  if (body.displayName !== undefined) {
    const displayName = body.displayName.trim();
    if (!displayName) {
      return NextResponse.json({ error: "Display name is required." }, { status: 400 });
    }

    const safeName = sanitizePlainText(displayName).trim();
    if (!safeName) {
      return NextResponse.json({ error: "Display name is required." }, { status: 400 });
    }
    if (safeName.length > 80) {
      return NextResponse.json({ error: "Display name must be 80 characters or less." }, { status: 400 });
    }

    updateData.displayName = safeName;
  }

  if (body.bio !== undefined) {
    const bio = sanitizePlainText(body.bio?.trim() ?? "");
    if (bio.length > 150) {
      return NextResponse.json({ error: "Bio must be 150 characters or less." }, { status: 400 });
    }
    updateData.bio = bio || null;
  }

  if (body.avatarUrl !== undefined) {
    const avatarUrl = body.avatarUrl?.trim() ?? null;
    if (avatarUrl && !isValidAvatarUploadReference(avatarUrl)) {
      return NextResponse.json({ error: "Avatar must be an uploaded image." }, { status: 400 });
    }
    updateData.avatarUrl = avatarUrl;
  }

  const categoryInput = body?.preferredCategories ?? body?.categories;
  if (categoryInput !== undefined) {
    updateData.preferredCategories = [];
  }

  if (body.showFollowers !== undefined) {
    updateData.showFollowers = Boolean(body.showFollowers);
  }

  if (body.showFollowing !== undefined) {
    updateData.showFollowing = Boolean(body.showFollowing);
  }

  if (body.allowMessageRequests !== undefined) {
    updateData.allowMessageRequests = Boolean(body.allowMessageRequests);
  }

  if (body.allowGroupInvites !== undefined) {
    updateData.allowGroupInvites = Boolean(body.allowGroupInvites);
  }

  if (body.allowStoryReplies !== undefined) {
    updateData.allowStoryReplies = Boolean(body.allowStoryReplies);
  }

  if (body.defaultAllowComments !== undefined) {
    updateData.defaultAllowComments = Boolean(body.defaultAllowComments);
  }

  if (body.defaultHideLikes !== undefined) {
    updateData.defaultHideLikes = Boolean(body.defaultHideLikes);
  }

  if (body.preferredLanguage !== undefined) {
    updateData.preferredLanguage = parseAppLanguage(body.preferredLanguage);
  }

  if (body.quietHoursStart !== undefined) {
    updateData.quietHoursStart = body.quietHoursStart;
  }
  if (body.quietHoursEnd !== undefined) {
    updateData.quietHoursEnd = body.quietHoursEnd;
  }
  if (body.quietHoursTimezone !== undefined) {
    const trimmed = body.quietHoursTimezone?.trim();
    if (trimmed) {
      try {
        new Intl.DateTimeFormat("en-US", { timeZone: trimmed });
      } catch {
        return NextResponse.json({ error: "Invalid timezone." }, { status: 400 });
      }
    }
    updateData.quietHoursTimezone = trimmed ? trimmed : null;
  }

  if (body.birthDate !== undefined) {
    if (body.birthDate === null || body.birthDate === "") {
      updateData.birthDate = null;
    } else {
      updateData.birthDate = new Date(body.birthDate);
    }
  }

  if (body.autoRevealAdultContent !== undefined) {
    updateData.autoRevealAdultContent = Boolean(body.autoRevealAdultContent);
  }

  if (Object.keys(updateData).length === 0) {
    return NextResponse.json({ error: "No changes provided." }, { status: 400 });
  }

  const user = await prisma.user.update({
    where: { id: payload.userId },
    data: updateData,
    select: {
      id: true,
      username: true,
      email: true,
      emailVerified: true,
      displayName: true,
      bio: true,
      avatarUrl: true,
      preferredCategories: true,
      showFollowers: true,
      showFollowing: true,
      allowMessageRequests: true,
      allowGroupInvites: true,
      allowStoryReplies: true,
      defaultAllowComments: true,
      defaultHideLikes: true,
      preferredLanguage: true,
      quietHoursStart: true,
      quietHoursEnd: true,
      quietHoursTimezone: true,
    },
  });

  return NextResponse.json({
    user: {
      ...user,
      preferredLanguage: parseAppLanguage(user.preferredLanguage),
    },
  });
});

export const DELETE = withMetrics("/api/auth/me", async (req: NextRequest) => {
  const payload = await getUser(req);

  if (!payload) {
    return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
  }

  const parsed = await parseRequestJson(req, meDeleteBodySchema);
  if (!parsed.ok) return parsed.response;
  const confirmation = parsed.data.confirmation.trim();

  let user: {
    id: string;
    username: string;
    accountDeletionRequestedAt: Date | null;
  } | null;
  try {
    user = await prisma.user.findUnique({
      where: { id: payload.userId },
      select: { id: true, username: true, accountDeletionRequestedAt: true },
    });
  } catch (error) {
    if (!isMissingAccountDeletionColumn(error)) throw error;
    const basic = await prisma.user.findUnique({
      where: { id: payload.userId },
      select: { id: true, username: true },
    });
    user = basic ? { ...basic, accountDeletionRequestedAt: null } : null;
  }

  if (!user) {
    return NextResponse.json({ error: "User not found." }, { status: 404 });
  }

  if (confirmation !== user.username) {
    return NextResponse.json({ error: "Username confirmation does not match." }, { status: 400 });
  }

  const graceDays = gdprHardDeleteGraceDays();

  if (!user.accountDeletionRequestedAt) {
    try {
      await prisma.user.update({
        where: { id: user.id },
        data: { accountDeletionRequestedAt: new Date() },
      });
    } catch (error) {
      if (isMissingAccountDeletionColumn(error)) {
        return NextResponse.json(
          {
            error:
              "Account deletion is temporarily unavailable. Please retry once the database migration is applied.",
          },
          { status: 503 },
        );
      }
      throw error;
    }

    await writeAuditLog({
      action: "ACCOUNT_DELETION_SCHEDULED",
      actorUserId: user.id,
      targetType: "USER",
      targetId: user.id,
      metadata: { graceDays },
      request: req,
    }).catch(logBackgroundError("auth.me.accountDeletionScheduledAudit"));
  }

  await prisma.session
    .updateMany({
      where: { userId: user.id, revokedAt: null },
      data: { revokedAt: new Date() },
    })
    .catch(() => { /* legacy DB */ });

  await prisma.refreshToken.updateMany({
    where: {
      session: { userId: user.id },
      revokedAt: null,
    },
    data: { revokedAt: new Date() },
  });

  const response = NextResponse.json({
    message: user.accountDeletionRequestedAt
      ? "Account deletion was already scheduled."
      : `Account scheduled for permanent deletion in ${graceDays} days.`,
    hardDeleteAfterDays: graceDays,
  });
  clearAuthCookies(response);
  return response;
});
