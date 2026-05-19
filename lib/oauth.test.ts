import { describe, expect, it } from "vitest";
import { hashToken, normalizeScopes, verifyHashedToken, verifyPkce } from "@/lib/oauth";

describe("oauth helpers", () => {
  it("normalizes scopes against an allowed set", () => {
    expect(normalizeScopes("profile:read posts:write unknown profile:read", ["profile:read", "posts:write"])).toEqual([
      "profile:read",
      "posts:write",
    ]);
  });

  it("hashes tokens without storing the raw value", () => {
    const hash = hashToken("secret-token");
    expect(hash).not.toBe("secret-token");
    expect(verifyHashedToken("secret-token", hash)).toBe(true);
    expect(verifyHashedToken("wrong-token", hash)).toBe(false);
  });

  it("verifies plain and S256 PKCE challenges", async () => {
    const { createHash } = await import("node:crypto");
    const verifier = "a".repeat(50);
    const challenge = createHash("sha256").update(verifier, "utf8").digest("base64url");

    expect(verifyPkce({ method: "plain", challenge: verifier, verifier })).toBe(true);
    expect(verifyPkce({ method: "S256", challenge, verifier })).toBe(true);
    expect(verifyPkce({ method: "S256", challenge, verifier: "b".repeat(50) })).toBe(false);
  });
});
