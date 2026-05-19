import { describe, expect, it } from "vitest";
import { consumeMemorySlidingWindow } from "@/lib/rate-limit";

describe("rate-limit consumeMemorySlidingWindow", () => {
  it("allows under max", () => {
    const ns = `t-${Math.random().toString(36).slice(2)}`;
    const opts = { windowMs: 60_000, max: 3 };
    expect(consumeMemorySlidingWindow(ns, "a", opts)).toEqual({ ok: true });
    expect(consumeMemorySlidingWindow(ns, "a", opts)).toEqual({ ok: true });
    expect(consumeMemorySlidingWindow(ns, "a", opts)).toEqual({ ok: true });
  });

  it("blocks at max with retryAfterSeconds", () => {
    const ns = `t-${Math.random().toString(36).slice(2)}`;
    const opts = { windowMs: 10_000, max: 2 };
    expect(consumeMemorySlidingWindow(ns, "b", opts).ok).toBe(true);
    expect(consumeMemorySlidingWindow(ns, "b", opts).ok).toBe(true);
    const third = consumeMemorySlidingWindow(ns, "b", opts);
    expect(third.ok).toBe(false);
    if (!third.ok) {
      expect(third.retryAfterSeconds).toBeGreaterThanOrEqual(1);
      expect(third.retryAfterSeconds).toBeLessThanOrEqual(10);
    }
  });

  it("isolates subjects", () => {
    const ns = `t-${Math.random().toString(36).slice(2)}`;
    const opts = { windowMs: 60_000, max: 1 };
    expect(consumeMemorySlidingWindow(ns, "c1", opts).ok).toBe(true);
    expect(consumeMemorySlidingWindow(ns, "c2", opts).ok).toBe(true);
  });
});
