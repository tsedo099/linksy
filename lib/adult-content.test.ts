import { describe, expect, it } from "vitest";
import { scoreAdultContent } from "@/lib/adult-content";

describe("scoreAdultContent", () => {
  it("does not flag a normal greeting", () => {
    const r = scoreAdultContent("Hey, how was your weekend?");
    expect(r.flagged).toBe(false);
    expect(r.score).toBe(0);
  });

  it("flags an explicit single high-weight keyword", () => {
    const r = scoreAdultContent("Want to see my nudes?");
    expect(r.flagged).toBe(true);
    expect(r.score).toBeGreaterThanOrEqual(5);
  });

  it("flags when multiple medium-weight terms combine over the threshold", () => {
    const r = scoreAdultContent("sex sex sex"); // 3*3 = 9
    expect(r.flagged).toBe(true);
  });

  it("respects word boundaries — does not flag 'class' for containing 'ass'", () => {
    const r = scoreAdultContent("My math class is great today.");
    expect(r.flagged).toBe(false);
  });

  it("detects Mongolian explicit terms (Cyrillic)", () => {
    const r = scoreAdultContent("порно үзэх дуртай");
    expect(r.flagged).toBe(true);
  });

  it("treats null / empty as not flagged", () => {
    expect(scoreAdultContent(null).flagged).toBe(false);
    expect(scoreAdultContent("").flagged).toBe(false);
    expect(scoreAdultContent(undefined).flagged).toBe(false);
  });

  it("caps regex work at 4000 chars to avoid pathological CPU spend", () => {
    const big = "lorem ".repeat(10_000) + " porn ";
    // Even though "porn" is at the end, the body is sliced to first 4000
    // characters → not flagged. The cap is a perf safety, not a correctness
    // bug: legitimate messages over 4000 chars are vanishingly rare for DMs.
    const r = scoreAdultContent(big);
    expect(r.flagged).toBe(false);
  });

  it("custom threshold lets callers tune sensitivity", () => {
    const strict = scoreAdultContent("Want to sext?", 4);
    expect(strict.flagged).toBe(true);
    const lenient = scoreAdultContent("Want to sext?", 100);
    expect(lenient.flagged).toBe(false);
  });
});
