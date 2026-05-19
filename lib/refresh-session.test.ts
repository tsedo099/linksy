import { createHash } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const findUnique = vi.fn();
const refreshUpdate = vi.fn();
const sessionUpdate = vi.fn();
const userFindUnique = vi.fn();
const transaction = vi.fn();

vi.mock("@/lib/prisma", () => ({
  prisma: {
    refreshToken: { findUnique, update: refreshUpdate },
    session: { update: sessionUpdate },
    user: { findUnique: userFindUnique },
    $transaction: transaction,
  },
}));

vi.mock("@/lib/jwt", () => ({
  signAccessToken: (payload: unknown) => `access:${JSON.stringify(payload)}`,
}));

describe("refresh-session crypto helpers", () => {
  it("hashRefreshToken is stable sha256 hex", async () => {
    const { hashRefreshToken } = await import("@/lib/refresh-session");
    const raw = "token-value";
    expect(hashRefreshToken(raw)).toBe(createHash("sha256").update(raw, "utf8").digest("hex"));
  });

  it("generateRefreshTokenRaw yields url-safe base64 of 32 bytes", async () => {
    const { generateRefreshTokenRaw } = await import("@/lib/refresh-session");
    const a = generateRefreshTokenRaw();
    const b = generateRefreshTokenRaw();
    expect(a.length).toBeGreaterThan(40);
    expect(a).not.toBe(b);
    const buf = Buffer.from(a, "base64url");
    expect(buf.length).toBe(32);
  });

  it("hashRefreshToken differs for different inputs", async () => {
    const { hashRefreshToken } = await import("@/lib/refresh-session");
    expect(hashRefreshToken("a")).not.toBe(hashRefreshToken("b"));
  });
});

describe("rotateRefreshGrantAccess single-flight", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.resetModules();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("concurrent rotations for the same cookie share one DB roundtrip", async () => {
    const future = new Date(Date.now() + 60_000);
    findUnique.mockResolvedValue({
      id: "rt-1",
      tokenHash: "hash",
      revokedAt: null,
      expiresAt: future,
      session: {
        id: "sess-1",
        userId: "user-1",
        revokedAt: null,
        expiresAt: future,
      },
    });
    userFindUnique.mockResolvedValue({
      id: "user-1",
      username: "yuri",
      email: "yuri@example.com",
      accountDeletionRequestedAt: null,
    });
    transaction.mockResolvedValue([{}, {}]);

    const { rotateRefreshGrantAccess } = await import("@/lib/refresh-session");

    const [a, b, c] = await Promise.all([
      rotateRefreshGrantAccess("same-refresh-token"),
      rotateRefreshGrantAccess("same-refresh-token"),
      rotateRefreshGrantAccess("same-refresh-token"),
    ]);

    // All three callers receive the SAME issued tokens, so each can write
    // valid cookies on its response.
    expect(a).toBeTruthy();
    expect(a).toBe(b);
    expect(b).toBe(c);

    // The DB rotation only happened once, even though three callers raced.
    expect(findUnique).toHaveBeenCalledTimes(1);
    expect(transaction).toHaveBeenCalledTimes(1);
  });

  it("a fresh call after rotation completes still returns null for a replayed (now-rotated) cookie", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-05-14T12:00:00Z"));

    const future = new Date(Date.now() + 60_000);
    findUnique.mockResolvedValueOnce({
      id: "rt-1",
      tokenHash: "hash",
      revokedAt: null,
      expiresAt: future,
      session: {
        id: "sess-1",
        userId: "user-1",
        revokedAt: null,
        expiresAt: future,
      },
    });
    userFindUnique.mockResolvedValue({
      id: "user-1",
      username: "yuri",
      email: "yuri@example.com",
      accountDeletionRequestedAt: null,
    });
    transaction.mockResolvedValue([{}, {}]);

    const { rotateRefreshGrantAccess } = await import("@/lib/refresh-session");
    const first = await rotateRefreshGrantAccess("replayed-cookie");
    expect(first).toBeTruthy();

    // Advance past the 30s grace window. The cache entry should expire and a
    // fresh DB lookup runs — which now returns null because the row's hash
    // has been rotated to something else (we model that by returning null).
    vi.setSystemTime(new Date("2026-05-14T12:00:31Z"));
    findUnique.mockResolvedValueOnce(null);

    const replayed = await rotateRefreshGrantAccess("replayed-cookie");
    expect(replayed).toBeNull();
  });
});
