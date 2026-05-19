import { beforeEach, describe, expect, it, vi } from "vitest";
import { NotificationType } from "@/lib/generated/prisma/client";

const mockAreUsersBlocked = vi.fn();
vi.mock("@/lib/user-blocks", () => ({
  areUsersBlocked: (a: string, b: string) => mockAreUsersBlocked(a, b),
}));

const findUnique = vi.fn();
const findMany = vi.fn();
vi.mock("@/lib/prisma", () => ({
  prisma: {
    mute: { findUnique, findMany },
  },
}));

describe("notification-rules", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockAreUsersBlocked.mockResolvedValue(false);
    findMany.mockResolvedValue([]);
  });

  describe("shouldDeliverNotification", () => {
    it("allows story_expiring even for self", async () => {
      const { shouldDeliverNotification } = await import("@/lib/notification-rules");
      const ok = await shouldDeliverNotification("u1", "u1", NotificationType.story_expiring);
      expect(ok).toBe(true);
      expect(findUnique).not.toHaveBeenCalled();
    });

    it("blocks self for other types", async () => {
      const { shouldDeliverNotification } = await import("@/lib/notification-rules");
      const ok = await shouldDeliverNotification("u1", "u1", NotificationType.like);
      expect(ok).toBe(false);
    });

    it("blocks when users block each other", async () => {
      mockAreUsersBlocked.mockResolvedValueOnce(true);
      const { shouldDeliverNotification } = await import("@/lib/notification-rules");
      const ok = await shouldDeliverNotification("u1", "u2", NotificationType.like);
      expect(ok).toBe(false);
    });

    it("allows when no mute row", async () => {
      findUnique.mockResolvedValueOnce(null);
      const { shouldDeliverNotification } = await import("@/lib/notification-rules");
      const ok = await shouldDeliverNotification("u1", "u2", NotificationType.like);
      expect(ok).toBe(true);
    });

    it("muteNotifications blocks like but allows message", async () => {
      findUnique.mockResolvedValueOnce({
        mutePosts: false,
        muteStories: false,
        muteNotifications: true,
      });
      const { shouldDeliverNotification } = await import("@/lib/notification-rules");
      expect(await shouldDeliverNotification("u1", "u2", NotificationType.like)).toBe(false);
      expect(await shouldDeliverNotification("u1", "u2", NotificationType.message)).toBe(true);
      expect(await shouldDeliverNotification("u1", "u2", NotificationType.message_request)).toBe(
        true,
      );
    });

    it("mutePosts blocks like, comment, post mention", async () => {
      findUnique.mockResolvedValue({
        mutePosts: true,
        muteStories: false,
        muteNotifications: false,
      });
      const { shouldDeliverNotification } = await import("@/lib/notification-rules");
      expect(await shouldDeliverNotification("u1", "u2", NotificationType.like)).toBe(false);
      expect(await shouldDeliverNotification("u1", "u2", NotificationType.comment)).toBe(false);
      expect(await shouldDeliverNotification("u1", "u2", NotificationType.post_mention, "p1")).toBe(
        false,
      );
      expect(await shouldDeliverNotification("u1", "u2", NotificationType.mention, "p1")).toBe(
        false,
      );
    });

    it("mutePosts does not block generic mention without post (story path)", async () => {
      findUnique.mockResolvedValue({
        mutePosts: true,
        muteStories: false,
        muteNotifications: false,
      });
      const { shouldDeliverNotification } = await import("@/lib/notification-rules");
      expect(await shouldDeliverNotification("u1", "u2", NotificationType.mention, null)).toBe(
        true,
      );
    });

    it("muteStories blocks story types and story-style mention", async () => {
      findUnique.mockResolvedValue({
        mutePosts: false,
        muteStories: true,
        muteNotifications: false,
      });
      const { shouldDeliverNotification } = await import("@/lib/notification-rules");
      expect(await shouldDeliverNotification("u1", "u2", NotificationType.story)).toBe(false);
      expect(await shouldDeliverNotification("u1", "u2", NotificationType.story_reaction)).toBe(
        false,
      );
      expect(await shouldDeliverNotification("u1", "u2", NotificationType.story_mention)).toBe(
        false,
      );
      expect(await shouldDeliverNotification("u1", "u2", NotificationType.mention, null)).toBe(
        false,
      );
    });

    it("muteStories does not block like", async () => {
      findUnique.mockResolvedValue({
        mutePosts: false,
        muteStories: true,
        muteNotifications: false,
      });
      const { shouldDeliverNotification } = await import("@/lib/notification-rules");
      expect(await shouldDeliverNotification("u1", "u2", NotificationType.like)).toBe(true);
    });
  });

  describe("notificationFeedWhere", () => {
    it("builds filter with mute deny rules", async () => {
      findMany.mockResolvedValueOnce([
        {
          mutedId: "b1",
          muteNotifications: true,
          mutePosts: true,
          muteStories: false,
        },
      ]);
      const { notificationFeedWhere } = await import("@/lib/notification-rules");
      const where = await notificationFeedWhere("recipient", ["blocked"]);
      const andClause = where.AND;
      expect(Array.isArray(andClause)).toBe(true);
      if (!Array.isArray(andClause)) throw new Error("expected AND array");
      expect(andClause[0]).toMatchObject({ userId: "recipient" });
      expect(andClause[1]).toMatchObject({ fromId: { notIn: ["blocked"] } });
      expect(andClause.length).toBeGreaterThan(3);
    });

    it("empty mutes yields only base AND parts", async () => {
      findMany.mockResolvedValueOnce([]);
      const { notificationFeedWhere } = await import("@/lib/notification-rules");
      const where = await notificationFeedWhere("r2", []);
      const andClause = where.AND;
      expect(Array.isArray(andClause)).toBe(true);
      if (!Array.isArray(andClause)) throw new Error("expected AND array");
      expect(andClause[0]).toMatchObject({ userId: "r2" });
    });
  });
});
