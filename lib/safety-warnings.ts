import { prisma } from "@/lib/prisma";
import type { ModerationResult } from "@/lib/safety-moderation";
import { writeAuditLog } from "@/lib/audit-log";
import { logBackgroundError, logger } from "@/lib/logger";

function intFromEnv(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw) return fallback;
  const n = Number.parseInt(raw, 10);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

/** Warnings within {@link WARNING_WINDOW_MS} before a ban kicks in. Override with `SAFETY_WARNING_THRESHOLD`. */
export const WARNING_THRESHOLD: number = intFromEnv("SAFETY_WARNING_THRESHOLD", 3);

/** Comment ban duration once the threshold is crossed. Override with `SAFETY_BAN_DAYS`. */
export const BAN_DURATION_MS: number = intFromEnv("SAFETY_BAN_DAYS", 7) * 24 * 60 * 60 * 1000;

/** Rolling window in which warnings count toward the threshold. Override with `SAFETY_WARNING_WINDOW_DAYS`. */
export const WARNING_WINDOW_MS: number = intFromEnv("SAFETY_WARNING_WINDOW_DAYS", 30) * 24 * 60 * 60 * 1000;

/** Maximum excerpt length stored alongside the warning. */
const EXCERPT_MAX = 500;

export type SafetyStatus = {
  warnings: number;
  banUntil: string | null;
  banActive: boolean;
  banRemainingMs: number;
  threshold: number;
  windowDays: number;
  banDurationDays: number;
  lastWarningAt: string | null;
  recentWarnings: Array<{
    id: string;
    kind: string;
    severity: string;
    score: number;
    reason: string;
    excerpt: string | null;
    createdAt: string;
  }>;
};

/** True when the user is currently barred from new comments by the safety system. */
export async function isUserCommentBanned(userId: string): Promise<{ banned: boolean; until: Date | null }> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { commentBanUntil: true },
  });
  const until = user?.commentBanUntil ?? null;
  if (until && until.getTime() > Date.now()) return { banned: true, until };
  return { banned: false, until };
}

/**
 * Records a safety warning for an "warn" or "quarantine" action. If the rolling-window
 * count crosses {@link WARNING_THRESHOLD}, applies a {@link BAN_DURATION_MS} ban.
 *
 * Returns the updated counters so the caller can surface them to the client.
 */
export async function recordCommentWarning(params: {
  userId: string;
  result: ModerationResult;
  commentText: string;
}): Promise<{
  warningsInWindow: number;
  banApplied: boolean;
  banUntil: Date | null;
}> {
  const { userId, result, commentText } = params;
  const primary =
    result.findings.find((f) => f.kind === "threat" || f.kind === "toxicity")
    ?? result.findings.find((f) => f.kind === "spam" || f.kind === "harassment")
    ?? result.findings[0];

  await prisma.commentSafetyWarning.create({
    data: {
      userId,
      kind: primary?.kind ?? "unknown",
      severity: primary?.severity ?? result.severity,
      score: primary?.score ?? result.score,
      reason: primary?.message ?? "Comment may violate community guidelines.",
      excerpt: commentText.slice(0, EXCERPT_MAX),
    },
  });

  const since = new Date(Date.now() - WARNING_WINDOW_MS);
  const warningsInWindow = await prisma.commentSafetyWarning.count({
    where: { userId, createdAt: { gte: since } },
  });

  let banApplied = false;
  let banUntil: Date | null = null;

  if (warningsInWindow >= WARNING_THRESHOLD) {
    banUntil = new Date(Date.now() + BAN_DURATION_MS);
    await prisma.user.update({
      where: { id: userId },
      data: {
        commentBanUntil: banUntil,
        commentWarnings: 0,
        lastCommentWarningAt: new Date(),
      },
    });
    banApplied = true;
  } else {
    await prisma.user.update({
      where: { id: userId },
      data: {
        commentWarnings: { increment: 1 },
        lastCommentWarningAt: new Date(),
      },
    });
  }

  writeAuditLog({
    action: banApplied ? "safety.comment.ban" : "safety.comment.warning",
    actorUserId: userId,
    targetType: "User",
    targetId: userId,
    metadata: {
      kind: primary?.kind ?? "unknown",
      severity: primary?.severity ?? result.severity,
      score: primary?.score ?? result.score,
      warningsInWindow,
      banUntil: banUntil ? banUntil.toISOString() : null,
    },
  }).catch(logBackgroundError("safety.audit.warning"));

  logger.info(
    {
      scope: "safety.warning",
      userId,
      kind: primary?.kind,
      severity: primary?.severity ?? result.severity,
      score: primary?.score ?? result.score,
      warningsInWindow,
      banApplied,
    },
    banApplied ? "comment ban applied" : "comment warning recorded",
  );

  return { warningsInWindow, banApplied, banUntil };
}

/**
 * Admin / moderator action: clear a user's warnings and lift any active comment ban.
 * Records an audit log entry so unbans are traceable.
 */
export async function clearUserCommentBan(params: {
  targetUserId: string;
  actorUserId: string;
  reason?: string;
}): Promise<void> {
  const { targetUserId, actorUserId, reason } = params;
  await prisma.user.update({
    where: { id: targetUserId },
    data: { commentBanUntil: null, commentWarnings: 0 },
  });
  writeAuditLog({
    action: "safety.comment.unban",
    actorUserId,
    targetType: "User",
    targetId: targetUserId,
    metadata: { reason: reason ?? null },
  }).catch(logBackgroundError("safety.audit.unban"));
  logger.info({ scope: "safety.unban", actorUserId, targetUserId, reason }, "comment ban cleared by admin");
}

/**
 * Admin / moderator action: delete a single warning row (e.g. false positive review).
 * Does not modify counters — re-check counters via {@link getSafetyStatus} after calling.
 */
export async function deleteUserCommentWarning(params: {
  warningId: string;
  actorUserId: string;
}): Promise<void> {
  const { warningId, actorUserId } = params;
  const removed = await prisma.commentSafetyWarning.delete({ where: { id: warningId } });
  writeAuditLog({
    action: "safety.comment.warning.delete",
    actorUserId,
    targetType: "CommentSafetyWarning",
    targetId: warningId,
    metadata: { targetUserId: removed.userId, kind: removed.kind, severity: removed.severity },
  }).catch(logBackgroundError("safety.audit.warning.delete"));
}

/** Snapshot of the user's safety status, used by the Safe Social settings page. */
export async function getSafetyStatus(userId: string): Promise<SafetyStatus> {
  const since = new Date(Date.now() - WARNING_WINDOW_MS);
  const [user, recent, inWindow] = await Promise.all([
    prisma.user.findUnique({
      where: { id: userId },
      select: { commentBanUntil: true, lastCommentWarningAt: true },
    }),
    prisma.commentSafetyWarning.findMany({
      where: { userId },
      orderBy: { createdAt: "desc" },
      take: 10,
    }),
    prisma.commentSafetyWarning.count({ where: { userId, createdAt: { gte: since } } }),
  ]);

  const banUntil = user?.commentBanUntil ?? null;
  const banActive = !!(banUntil && banUntil.getTime() > Date.now());
  const banRemainingMs = banActive ? banUntil!.getTime() - Date.now() : 0;

  return {
    warnings: inWindow,
    banUntil: banUntil ? banUntil.toISOString() : null,
    banActive,
    banRemainingMs,
    threshold: WARNING_THRESHOLD,
    windowDays: Math.round(WARNING_WINDOW_MS / (24 * 60 * 60 * 1000)),
    banDurationDays: Math.round(BAN_DURATION_MS / (24 * 60 * 60 * 1000)),
    lastWarningAt: user?.lastCommentWarningAt ? user.lastCommentWarningAt.toISOString() : null,
    recentWarnings: recent.map((r) => ({
      id: r.id,
      kind: r.kind,
      severity: r.severity,
      score: r.score,
      reason: r.reason,
      excerpt: r.excerpt,
      createdAt: r.createdAt.toISOString(),
    })),
  };
}
