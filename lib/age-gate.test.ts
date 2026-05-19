import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const userFindUnique = vi.fn();

vi.mock("@/lib/prisma", () => ({
  prisma: {
    user: { findUnique: userFindUnique },
  },
}));

describe("checkUserCanSendAdult", () => {
  beforeEach(() => {
    vi.resetModules();
    userFindUnique.mockReset();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("rejects when the author is under 18", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-05-14T12:00:00Z"));
    userFindUnique.mockResolvedValue({ birthDate: new Date("2015-01-01") });
    const { checkUserCanSendAdult } = await import("@/lib/age-gate");

    const result = await checkUserCanSendAdult("user-1");
    expect(result).toEqual({
      ok: false,
      reason: "under_18",
      message: expect.stringContaining("under 18"),
    });
  });

  it("allows an adult author", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-05-14T12:00:00Z"));
    userFindUnique.mockResolvedValue({ birthDate: new Date("1990-01-01") });
    const { checkUserCanSendAdult } = await import("@/lib/age-gate");

    const result = await checkUserCanSendAdult("user-1");
    expect(result).toEqual({ ok: true });
  });

  it("treats null birthDate as adult (legacy users)", async () => {
    userFindUnique.mockResolvedValue({ birthDate: null });
    const { checkUserCanSendAdult } = await import("@/lib/age-gate");

    const result = await checkUserCanSendAdult("user-1");
    expect(result).toEqual({ ok: true });
  });

  it("falls open if the user table read throws (legacy column missing)", async () => {
    userFindUnique.mockRejectedValue(new Error("P2022: column missing"));
    const { checkUserCanSendAdult } = await import("@/lib/age-gate");

    const result = await checkUserCanSendAdult("user-1");
    expect(result).toEqual({ ok: true });
  });

  it("treats missing user row as adult — don't block when the row vanished mid-flight", async () => {
    userFindUnique.mockResolvedValue(null);
    const { checkUserCanSendAdult } = await import("@/lib/age-gate");

    const result = await checkUserCanSendAdult("user-1");
    expect(result).toEqual({ ok: true });
  });

  it("rejects when author is exactly one day before their 18th birthday", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-05-14T12:00:00Z"));
    // 2008-05-15 → on 2026-05-14, age is 17 (still under 18 by one day).
    userFindUnique.mockResolvedValue({ birthDate: new Date("2008-05-15") });
    const { checkUserCanSendAdult } = await import("@/lib/age-gate");

    const result = await checkUserCanSendAdult("user-1");
    expect(result.ok).toBe(false);
  });

  it("allows exactly on the 18th birthday", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-05-14T12:00:00Z"));
    userFindUnique.mockResolvedValue({ birthDate: new Date("2008-05-14") });
    const { checkUserCanSendAdult } = await import("@/lib/age-gate");

    const result = await checkUserCanSendAdult("user-1");
    expect(result.ok).toBe(true);
  });
});
