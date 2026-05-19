import { afterEach, describe, expect, it, vi } from "vitest";
import {
  __resetShutdownStateForTests,
  getShutdownState,
  isShuttingDown,
  registerShutdownCloser,
  triggerShutdown,
} from "@/lib/shutdown";

afterEach(() => {
  __resetShutdownStateForTests();
});

describe("shutdown registry", () => {
  it("starts in not-shutting-down state", () => {
    expect(isShuttingDown()).toBe(false);
    expect(getShutdownState().reason).toBeNull();
  });

  it("flips state when triggered", async () => {
    await triggerShutdown("manual");
    expect(isShuttingDown()).toBe(true);
    expect(getShutdownState().reason).toBe("manual");
    expect(getShutdownState().triggeredAt).toBeGreaterThan(0);
  });

  it("runs all registered closers", async () => {
    const calls: string[] = [];
    registerShutdownCloser(() => {
      calls.push("a");
    });
    registerShutdownCloser(async () => {
      calls.push("b");
    });
    await triggerShutdown("manual");
    expect(calls.sort()).toEqual(["a", "b"]);
  });

  it("passes the reason to closers", async () => {
    const reasons: string[] = [];
    registerShutdownCloser((reason) => {
      reasons.push(reason);
    });
    await triggerShutdown("SIGTERM");
    expect(reasons).toEqual(["SIGTERM"]);
  });

  it("does not throw when a closer throws", async () => {
    registerShutdownCloser(() => {
      throw new Error("boom");
    });
    registerShutdownCloser(() => {
      throw new Error("also boom");
    });
    await expect(triggerShutdown("manual")).resolves.toBeUndefined();
  });

  it("unregister callback removes the closer", async () => {
    const called = vi.fn();
    const unregister = registerShutdownCloser(called);
    unregister();
    await triggerShutdown("manual");
    expect(called).not.toHaveBeenCalled();
  });

  it("is idempotent — repeated triggers return the same promise", async () => {
    const called = vi.fn();
    registerShutdownCloser(called);
    const first = triggerShutdown("manual");
    const second = triggerShutdown("SIGTERM");
    expect(first).toBe(second);
    await first;
    // Original reason wins — second call should NOT have overwritten state.
    expect(getShutdownState().reason).toBe("manual");
    expect(called).toHaveBeenCalledTimes(1);
  });

  it("clears the closer set after draining (no double-fire on re-trigger)", async () => {
    const called = vi.fn();
    registerShutdownCloser(called);
    await triggerShutdown("manual");
    expect(called).toHaveBeenCalledTimes(1);
    // Closer was cleared during drain — a fresh trigger is a no-op for it.
    await triggerShutdown("manual");
    expect(called).toHaveBeenCalledTimes(1);
  });
});
