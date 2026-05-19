import { afterEach, describe, expect, it, vi } from "vitest";

const secret = "unit-test-jwt-secret-32chars-minimum!!";

describe("jwt", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
    delete process.env.JWT_SECRET;
    vi.unstubAllGlobals();
  });

  it("signAccessToken round-trips payload", async () => {
    process.env.JWT_SECRET = secret;
    const { signAccessToken, verifyAccessToken } = await import("@/lib/jwt");
    const payload = { userId: "u1", username: "alice", email: "a@example.com" };
    const token = signAccessToken(payload);
    expect(verifyAccessToken(token)).toMatchObject(payload);
  });

  it("verifyAccessToken returns null for tampered token", async () => {
    process.env.JWT_SECRET = secret;
    const { signAccessToken, verifyAccessToken } = await import("@/lib/jwt");
    const token = signAccessToken({ userId: "u1", username: "a", email: "a@b.c" });
    const tampered = `${token.slice(0, -4)}xxxx`;
    expect(verifyAccessToken(tampered)).toBeNull();
  });

  it("verifyAccessToken returns null for wrong secret", async () => {
    process.env.JWT_SECRET = secret;
    const { signAccessToken } = await import("@/lib/jwt");
    const token = signAccessToken({ userId: "u1", username: "a", email: "a@b.c" });
    vi.resetModules();
    process.env.JWT_SECRET = `${secret}-other`;
    const { verifyAccessToken: verify2 } = await import("@/lib/jwt");
    expect(verify2(token)).toBeNull();
  });

  it("two-factor challenge round-trip", async () => {
    process.env.JWT_SECRET = secret;
    const { signTwoFactorChallenge, verifyTwoFactorChallenge } = await import("@/lib/jwt");
    const t = signTwoFactorChallenge("user-2fa");
    expect(verifyTwoFactorChallenge(t)).toMatchObject({ userId: "user-2fa", purpose: "2fa" });
  });

  it("verifyTwoFactorChallenge rejects access token shape", async () => {
    process.env.JWT_SECRET = secret;
    const { signAccessToken, verifyTwoFactorChallenge } = await import("@/lib/jwt");
    const access = signAccessToken({ userId: "u1", username: "a", email: "a@b.c" });
    expect(verifyTwoFactorChallenge(access)).toBeNull();
  });

  it("webAuthn challenge only verifies for the expected purpose", async () => {
    process.env.JWT_SECRET = secret;
    const { signWebAuthnChallenge, verifyWebAuthnChallenge } = await import("@/lib/jwt");
    const token = signWebAuthnChallenge({
      purpose: "webauthn-registration",
      userId: "u1",
      challenge: "challenge-1",
    });
    expect(verifyWebAuthnChallenge(token, "webauthn-registration")).toMatchObject({
      userId: "u1",
      challenge: "challenge-1",
    });
    expect(verifyWebAuthnChallenge(token, "webauthn-authentication")).toBeNull();
  });

  it("throws in production when JWT_SECRET missing on sign", async () => {
    vi.resetModules();
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("JWT_SECRET", "");
    const jwt = await import("@/lib/jwt");
    expect(() => jwt.signAccessToken({ userId: "u1", username: "a", email: "a@b.c" })).toThrow(
      /JWT_SECRET/,
    );
  });
});
