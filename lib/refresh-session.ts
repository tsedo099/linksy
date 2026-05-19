import { createHash, randomBytes } from "crypto";
import { Prisma } from "@/lib/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import type { JwtPayload } from "@/lib/jwt";
import { signAccessToken } from "@/lib/jwt";
import { REFRESH_MAX_AGE_SEC } from "@/lib/auth-cookies";

export const SESSION_SLIDING_MS = REFRESH_MAX_AGE_SEC * 1000;

export function hashRefreshToken(raw: string): string {
  return createHash("sha256").update(raw, "utf8").digest("hex");
}

export function generateRefreshTokenRaw(): string {
  return randomBytes(32).toString("base64url");
}

function refreshExpiry(): Date {
  return new Date(Date.now() + SESSION_SLIDING_MS);
}

/** Create hashed refresh row for an existing Session (login / register). */
export async function createRefreshTokenForSession(sessionId: string): Promise<string> {
  const raw = generateRefreshTokenRaw();
  await prisma.refreshToken.create({
    data: {
      sessionId,
      tokenHash: hashRefreshToken(raw),
      expiresAt: refreshExpiry(),
    },
  });
  return raw;
}

export type IssuedSessionTokens = {
  sessionId: string;
  refreshRaw: string;
  accessJwt: string;
  payload: JwtPayload;
};

export async function createSessionAndIssueTokens(args: {
  userId: string;
  username: string;
  email: string;
  userAgent?: string | null;
  ipAddress?: string | null;
}): Promise<{ sessionId: string; refreshRaw: string; accessJwt: string }> {
  const sessionExpiresAt = new Date(Date.now() + SESSION_SLIDING_MS);
  const session = await prisma.session.create({
    data: {
      userId: args.userId,
      userAgent: args.userAgent ?? null,
      ipAddress: args.ipAddress ?? null,
      expiresAt: sessionExpiresAt,
    },
    select: { id: true },
  });
  const refreshRaw = await createRefreshTokenForSession(session.id);
  const payload: JwtPayload = {
    userId: args.userId,
    username: args.username,
    email: args.email,
    sessionId: session.id,
  };
  const accessJwt = signAccessToken(payload);
  return { sessionId: session.id, refreshRaw, accessJwt };
}

/**
 * Process-wide single-flight + short-lived result cache for refresh-token
 * rotation. When the access JWT expires (every 15 min for active users),
 * multiple concurrent API calls — `/api/auth/me`, `/api/posts`,
 * `/api/notifications`, `/api/user/xp`, etc. — all reach `getUser` with the
 * same refresh cookie. Without dedup, only the first request finds the row
 * in `RefreshToken` (the rotation flips the hash); every other concurrent
 * caller would see `null` and return 401, logging the user out.
 *
 * Strategy:
 *   - Same hash + concurrent → share the in-flight Promise so all callers
 *     write the SAME new cookies on their responses.
 *   - Same hash + arrives after rotation completed (within 30 s) → return
 *     the cached result. Outside that grace window we fall through to a
 *     normal DB lookup, which will reject (replay protection preserved).
 *
 * Single-process only. Multi-instance deployments without sticky sessions
 * should pair this with session affinity or a `RefreshToken.replacedByHash`
 * column + grace window in a future migration.
 */
const ROTATION_GRACE_MS = 30_000;

type RotationCacheEntry = {
  promise: Promise<IssuedSessionTokens | null>;
  settledAt: number | null;
};

const rotationInFlight = new Map<string, RotationCacheEntry>();

function pruneExpiredRotationEntries(now: number): void {
  for (const [hash, entry] of rotationInFlight) {
    if (entry.settledAt !== null && now - entry.settledAt > ROTATION_GRACE_MS) {
      rotationInFlight.delete(hash);
    }
  }
}

/**
 * Validates refresh cookie, rotates the stored refresh token hash, bumps session activity.
 */
export async function rotateRefreshGrantAccess(refreshCookieRaw: string): Promise<IssuedSessionTokens | null> {
  const hash = hashRefreshToken(refreshCookieRaw);
  const now = Date.now();

  pruneExpiredRotationEntries(now);
  const cached = rotationInFlight.get(hash);
  if (cached && (cached.settledAt === null || now - cached.settledAt <= ROTATION_GRACE_MS)) {
    return cached.promise;
  }

  const entry: RotationCacheEntry = {
    promise: rotateRefreshGrantAccessInner(hash),
    settledAt: null,
  };
  rotationInFlight.set(hash, entry);

  void entry.promise
    .then(() => {
      entry.settledAt = Date.now();
    })
    .catch(() => {
      // A throw means the inner function blew up before producing a value
      // (e.g. transaction conflict). Drop the entry so the next caller
      // retries fresh rather than re-using a broken promise.
      rotationInFlight.delete(hash);
    });

  return entry.promise;
}

async function rotateRefreshGrantAccessInner(hash: string): Promise<IssuedSessionTokens | null> {
  const now = new Date();

  const rt = await prisma.refreshToken.findUnique({
    where: { tokenHash: hash },
    include: { session: true },
  });

  if (!rt || rt.revokedAt !== null || rt.expiresAt.getTime() <= now.getTime()) {
    return null;
  }

  const session = rt.session;
  if (session.revokedAt !== null || session.expiresAt.getTime() <= now.getTime()) {
    return null;
  }

  type RotatedUser = { id: string; username: string; email: string; accountDeletionRequestedAt: Date | null };
  let user: RotatedUser | null = null;
  try {
    user = await prisma.user.findUnique({
      where: { id: session.userId },
      select: { id: true, username: true, email: true, accountDeletionRequestedAt: true },
    });
  } catch (err) {
    if (!(err instanceof Prisma.PrismaClientKnownRequestError) || err.code !== "P2022") {
      throw err;
    }
    const base = await prisma.user.findUnique({
      where: { id: session.userId },
      select: { id: true, username: true, email: true },
    });
    user = base ? { ...base, accountDeletionRequestedAt: null } : null;
  }
  if (!user || user.accountDeletionRequestedAt != null) return null;

  const newRaw = generateRefreshTokenRaw();
  const newExpires = refreshExpiry();
  const newSessionExpiry = new Date(Date.now() + SESSION_SLIDING_MS);

  await prisma.$transaction([
    prisma.refreshToken.update({
      where: { id: rt.id },
      data: {
        tokenHash: hashRefreshToken(newRaw),
        expiresAt: newExpires,
      },
    }),
    prisma.session.update({
      where: { id: session.id },
      data: {
        lastActiveAt: now,
        expiresAt: newSessionExpiry,
      },
    }),
  ]);

  const payload: JwtPayload = {
    userId: user.id,
    username: user.username,
    email: user.email,
    sessionId: session.id,
  };
  const accessJwt = signAccessToken(payload);

  return { sessionId: session.id, refreshRaw: newRaw, accessJwt, payload };
}

/** Revoke login session row and refresh tokens (logout or remote revoke). */
export async function revokeSessionForUser(sessionId: string, userId: string): Promise<void> {
  await prisma.$transaction([
    prisma.session.updateMany({
      where: { id: sessionId, userId, revokedAt: null },
      data: { revokedAt: new Date() },
    }),
    prisma.refreshToken.updateMany({
      where: { sessionId, revokedAt: null },
      data: { revokedAt: new Date() },
    }),
  ]);
}

/** Resolve session from a valid refresh cookie without rotating (e.g. logout when access JWT expired). */
export async function findSessionFromRefreshRaw(refreshCookieRaw: string) {
  const hash = hashRefreshToken(refreshCookieRaw);
  const now = new Date();
  const rt = await prisma.refreshToken.findUnique({
    where: { tokenHash: hash },
    include: { session: true },
  });
  if (!rt || rt.revokedAt !== null || rt.expiresAt.getTime() <= now.getTime()) {
    return null;
  }
  const session = rt.session;
  if (session.revokedAt !== null || session.expiresAt.getTime() <= now.getTime()) {
    return null;
  }
  return { sessionId: session.id, userId: session.userId };
}
