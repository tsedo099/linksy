import { describe, expect, it } from "vitest";
import { adultContentVisibility, ADULT_AGE_THRESHOLD, computeAgeYears, isUnder18 } from "@/lib/age";

const NOW = new Date("2026-05-14T12:00:00Z");

describe("computeAgeYears", () => {
  it("returns whole years at the comparison date", () => {
    expect(computeAgeYears(new Date("2000-05-13T00:00:00Z"), NOW)).toBe(26);
    expect(computeAgeYears(new Date("2000-05-15T00:00:00Z"), NOW)).toBe(25);
  });

  it("handles ISO string input", () => {
    expect(computeAgeYears("2008-05-13", NOW)).toBe(18);
  });

  it("returns null for unset / malformed input", () => {
    expect(computeAgeYears(null, NOW)).toBeNull();
    expect(computeAgeYears(undefined, NOW)).toBeNull();
    expect(computeAgeYears("not-a-date", NOW)).toBeNull();
  });

  it("returns null when birthDate is in the future", () => {
    expect(computeAgeYears(new Date("2030-01-01T00:00:00Z"), NOW)).toBeNull();
  });
});

describe("isUnder18", () => {
  it("true for birthDate < 18 years before now", () => {
    expect(isUnder18(new Date("2010-05-13T00:00:00Z"), NOW)).toBe(true);
  });

  it("false for exactly 18 today", () => {
    expect(isUnder18(new Date("2008-05-14T00:00:00Z"), NOW)).toBe(false);
  });

  it("false for adult", () => {
    expect(isUnder18(new Date("1990-01-01T00:00:00Z"), NOW)).toBe(false);
  });

  it("false when birthDate is unknown — fallback to confirm-then-reveal", () => {
    expect(isUnder18(null, NOW)).toBe(false);
    expect(isUnder18(undefined, NOW)).toBe(false);
  });

  it("threshold constant matches the documented age", () => {
    expect(ADULT_AGE_THRESHOLD).toBe(18);
  });
});

describe("adultContentVisibility", () => {
  it("blocked when under 18 regardless of autoReveal", () => {
    expect(
      adultContentVisibility({ birthDate: "2015-01-01", autoReveal: false, at: NOW }),
    ).toBe("blocked");
    expect(
      adultContentVisibility({ birthDate: "2015-01-01", autoReveal: true, at: NOW }),
    ).toBe("blocked");
  });

  it("reveal when adult + autoReveal opt-in", () => {
    expect(
      adultContentVisibility({ birthDate: "1990-01-01", autoReveal: true, at: NOW }),
    ).toBe("reveal");
  });

  it("confirm when adult + autoReveal off", () => {
    expect(
      adultContentVisibility({ birthDate: "1990-01-01", autoReveal: false, at: NOW }),
    ).toBe("confirm");
  });

  it("confirm when birthDate is unset (treats as adult who hasn't opted out)", () => {
    expect(adultContentVisibility({ birthDate: null, autoReveal: false, at: NOW })).toBe("confirm");
    expect(adultContentVisibility({ birthDate: undefined, autoReveal: false, at: NOW })).toBe("confirm");
  });

  it("reveal when birthDate is unset but user opted in to auto-reveal", () => {
    expect(adultContentVisibility({ birthDate: null, autoReveal: true, at: NOW })).toBe("reveal");
  });
});
