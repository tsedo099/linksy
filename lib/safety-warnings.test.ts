import { beforeEach, describe, expect, it, vi } from "vitest";

const { prismaMock } = vi.hoisted(() => {
  return {
    prismaMock: {
      commentSafetyWarning: {
        create: vi.fn(),
        count: vi.fn(),
        findMany: vi.fn(),
        delete: vi.fn(),
      },
      user: {
        findUnique: vi.fn(),
        update: vi.fn(),
      },
      auditLog: {
        create: vi.fn().mockResolvedValue({ id: "audit-1" }),
      },
    },
  };
});

vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }));
vi.mock("@/lib/audit-log", () => ({
  writeAuditLog: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("@/lib/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
  logBackgroundError: () => () => undefined,
}));

import {
  isUserCommentBanned,
  recordCommentWarning,
  clearUserCommentBan,
  getSafetyStatus,
  WARNING_THRESHOLD,
  BAN_DURATION_MS,
} from "@/lib/safety-warnings";
import type { ModerationResult } from "@/lib/safety-moderation";

function fakeResult(): ModerationResult {
  return {
    allowed: true,
    action: "warn",
    severity: "MEDIUM",
    score: 0.6,
    userMessage: "Comment may violate community guidelines.",
    findings: [
      { kind: "toxicity", severity: "MEDIUM", score: 0.6, message: "test", matchedTerms: ["stupid"] },
    ],
  };
}

describe("safety-warnings", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    prismaMock.user.update.mockResolvedValue({ id: "u1" });
    prismaMock.commentSafetyWarning.create.mockResolvedValue({ id: "w1" });
    prismaMock.commentSafetyWarning.delete.mockResolvedValue({ id: "w1", userId: "u1", kind: "toxicity", severity: "MEDIUM" });
  });

  it("isUserCommentBanned returns true when commentBanUntil is in the future", async () => {
    const future = new Date(Date.now() + 1000 * 60 * 60);
    prismaMock.user.findUnique.mockResolvedValue({ commentBanUntil: future });
    const result = await isUserCommentBanned("u1");
    expect(result.banned).toBe(true);
    expect(result.until?.getTime()).toBe(future.getTime());
  });

  it("isUserCommentBanned returns false when commentBanUntil is in the past", async () => {
    prismaMock.user.findUnique.mockResolvedValue({ commentBanUntil: new Date(Date.now() - 1000) });
    const result = await isUserCommentBanned("u1");
    expect(result.banned).toBe(false);
  });

  it("records a warning and increments counter below threshold", async () => {
    prismaMock.commentSafetyWarning.count.mockResolvedValue(1);
    const r = await recordCommentWarning({ userId: "u1", result: fakeResult(), commentText: "you are stupid" });
    expect(r.banApplied).toBe(false);
    expect(r.warningsInWindow).toBe(1);
    expect(prismaMock.user.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ commentWarnings: { increment: 1 } }),
      }),
    );
  });

  it("applies a ban at threshold and resets counter", async () => {
    prismaMock.commentSafetyWarning.count.mockResolvedValue(WARNING_THRESHOLD);
    const r = await recordCommentWarning({ userId: "u1", result: fakeResult(), commentText: "x" });
    expect(r.banApplied).toBe(true);
    expect(r.banUntil).toBeInstanceOf(Date);
    const expected = Date.now() + BAN_DURATION_MS;
    expect(Math.abs(r.banUntil!.getTime() - expected)).toBeLessThan(2000);
    const updateCall = prismaMock.user.update.mock.calls[0]![0];
    expect(updateCall.data.commentBanUntil).toBeInstanceOf(Date);
    expect(updateCall.data.commentWarnings).toBe(0);
  });

  it("truncates excerpt to 500 characters", async () => {
    prismaMock.commentSafetyWarning.count.mockResolvedValue(1);
    const long = "a".repeat(900);
    await recordCommentWarning({ userId: "u1", result: fakeResult(), commentText: long });
    const createCall = prismaMock.commentSafetyWarning.create.mock.calls[0]![0];
    expect(createCall.data.excerpt.length).toBe(500);
  });

  it("clearUserCommentBan resets ban and counter", async () => {
    await clearUserCommentBan({ targetUserId: "u1", actorUserId: "admin", reason: "appeal upheld" });
    expect(prismaMock.user.update).toHaveBeenCalledWith({
      where: { id: "u1" },
      data: { commentBanUntil: null, commentWarnings: 0 },
    });
  });

  it("getSafetyStatus returns banActive=false when commentBanUntil is in the past", async () => {
    prismaMock.user.findUnique.mockResolvedValue({
      commentBanUntil: new Date(Date.now() - 1000),
      lastCommentWarningAt: null,
    });
    prismaMock.commentSafetyWarning.findMany.mockResolvedValue([]);
    prismaMock.commentSafetyWarning.count.mockResolvedValue(0);
    const status = await getSafetyStatus("u1");
    expect(status.banActive).toBe(false);
    expect(status.warnings).toBe(0);
  });

  it("getSafetyStatus returns banActive=true with remaining time when ban is active", async () => {
    const banUntil = new Date(Date.now() + 60_000);
    prismaMock.user.findUnique.mockResolvedValue({ commentBanUntil: banUntil, lastCommentWarningAt: null });
    prismaMock.commentSafetyWarning.findMany.mockResolvedValue([]);
    prismaMock.commentSafetyWarning.count.mockResolvedValue(0);
    const status = await getSafetyStatus("u1");
    expect(status.banActive).toBe(true);
    expect(status.banRemainingMs).toBeGreaterThan(0);
    expect(status.banUntil).toBe(banUntil.toISOString());
  });
});
