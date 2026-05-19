import { describe, expect, it } from "vitest";
import {
  NEW_PASSWORD_MAX_LENGTH,
  NEW_PASSWORD_MIN_LENGTH,
  isCommonPlainPassword,
  newPasswordIssue,
  newPasswordSchema,
} from "@/lib/password-policy";

describe("password-policy", () => {
  it("newPasswordSchema accepts strong password", () => {
    const r = newPasswordSchema.safeParse("Aa1!aaaa");
    expect(r.success).toBe(true);
  });

  it("newPasswordSchema rejects short password", () => {
    const r = newPasswordSchema.safeParse("Aa1!x");
    expect(r.success).toBe(false);
    if (!r.success) {
      expect(r.error.issues.some((i) => i.message.includes(String(NEW_PASSWORD_MIN_LENGTH)))).toBe(
        true,
      );
    }
  });

  it("newPasswordSchema rejects missing symbol", () => {
    const r = newPasswordSchema.safeParse("Password1a");
    expect(r.success).toBe(false);
  });

  it("newPasswordSchema rejects missing upper case", () => {
    const r = newPasswordSchema.safeParse("passw0rd!");
    expect(r.success).toBe(false);
  });

  it("newPasswordSchema rejects common password", () => {
    // Present in inline blocklist as `trustno1!` (mixed-case + symbol still maps to same lower key).
    const r = newPasswordSchema.safeParse("Trustno1!");
    expect(r.success).toBe(false);
    if (!r.success) {
      expect(r.error.issues.some((i) => /common/i.test(i.message))).toBe(true);
    }
  });

  it("newPasswordSchema enforces max length", () => {
    const tooLong = `Aa1!${"x".repeat(NEW_PASSWORD_MAX_LENGTH)}`;
    expect(tooLong.length).toBeGreaterThan(NEW_PASSWORD_MAX_LENGTH);
    const r = newPasswordSchema.safeParse(tooLong);
    expect(r.success).toBe(false);
  });

  it("isCommonPlainPassword flags blocklist and repeated chars", () => {
    expect(isCommonPlainPassword("password123")).toBe(true);
    expect(isCommonPlainPassword("aaaaaaaa")).toBe(true);
    expect(isCommonPlainPassword("")).toBe(true);
    expect(isCommonPlainPassword("Zz9!unique-strength-here")).toBe(false);
  });

  it("newPasswordIssue returns first message or undefined", () => {
    expect(newPasswordIssue("short")).toBeDefined();
    expect(newPasswordIssue("Aa1!unique-value-xyz")).toBeUndefined();
  });
});
