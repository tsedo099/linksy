import { describe, expect, it } from "vitest";
import { scanText, latinAlias } from "@/lib/safety-moderation";

describe("safety-moderation", () => {
  it("allows ordinary comments", () => {
    const result = scanText("I disagree with this point, but the idea is interesting.");

    expect(result.allowed).toBe(true);
    expect(result.action).toBe("allow");
  });

  it("quarantines toxic personal attacks", () => {
    const result = scanText("You are stupid");

    expect(result.allowed).toBe(true);
    expect(result.action).toBe("quarantine");
    expect(result.findings.some((finding) => finding.kind === "toxicity")).toBe(true);
  });

  it("blocks threat and self-harm language", () => {
    const result = scanText("kys");

    expect(result.allowed).toBe(false);
    expect(result.action).toBe("block");
    expect(result.severity).toBe("CRITICAL");
  });

  it("quarantines repeated link spam", () => {
    const result = scanText("www.example.com https://example.com http://example.org");

    expect(result.allowed).toBe(true);
    expect(result.action).toBe("quarantine");
    expect(result.findings.some((finding) => finding.kind === "spam")).toBe(true);
  });

  it("catches Cyrillic Mongolian toxicity", () => {
    const result = scanText("Чи тэнэг хүн юм");

    expect(result.action).toBe("quarantine");
    expect(result.findings.some((f) => f.kind === "toxicity")).toBe(true);
  });

  it("catches leetspeak obfuscation", () => {
    const result = scanText("you are $tup1d");

    expect(result.action).toBe("quarantine");
    expect(result.findings.some((f) => f.kind === "toxicity")).toBe(true);
  });

  it("catches repeated-letter obfuscation", () => {
    const result = scanText("you are stuuuupid");

    expect(result.action).toBe("quarantine");
    expect(result.findings.some((f) => f.kind === "toxicity")).toBe(true);
  });

  it("does not flag innocent substrings (word boundary)", () => {
    const result = scanText("I had a stupendous time at the gala.");

    expect(result.action).toBe("allow");
    expect(result.findings.some((f) => f.kind === "toxicity")).toBe(false);
  });

  it("blocks Cyrillic threat language", () => {
    const result = scanText("Би чамайг алах болно");

    expect(result.allowed).toBe(false);
    expect(result.action).toBe("block");
  });

  it("warns on excessive caps without escalating to block", () => {
    const result = scanText("WHY ARE YOU SO LOUD ABOUT THIS NOW");

    expect(result.allowed).toBe(true);
    expect(result.findings.some((f) => f.kind === "caps")).toBe(true);
  });

  it("returns healthy-friction finding for benign input", () => {
    const result = scanText("Great post — thanks for sharing!");

    expect(result.findings.some((f) => f.kind === "healthy-friction")).toBe(true);
    expect(result.action).toBe("allow");
  });

  describe("latinAlias normalizer", () => {
    it("transliterates Cyrillic Mongolian", () => {
      expect(latinAlias("Тэнэг")).toBe("teneg");
      expect(latinAlias("Эргүү")).toBe("ergu");
    });

    it("normalizes leetspeak", () => {
      expect(latinAlias("$tup1d")).toBe("stupid");
      expect(latinAlias("5tupid")).toBe("stupid");
    });

    it("collapses repeated letters", () => {
      expect(latinAlias("stuuuupid")).toBe("stupid");
    });
  });
});
