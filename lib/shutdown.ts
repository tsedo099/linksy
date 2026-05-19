/**
 * Process-wide graceful shutdown coordinator.
 *
 * On SIGTERM (k8s rolling restart, container stop, SIGINT in dev):
 *   1. Flip `shuttingDown` so `/api/health/ready` starts returning 503.
 *      k8s pulls the pod out of the Service's endpoints within one probe
 *      interval (~10s), so no new traffic lands here.
 *   2. Run every registered closer in parallel. SSE routes use this to
 *      flush a final `shutdown` event and close their stream cleanly,
 *      which lets the browser reconnect to a healthy pod instead of
 *      sitting on a half-closed socket.
 *   3. Wait up to `SHUTDOWN_DRAIN_MS` for closers to settle, then exit.
 *
 * The handlers install exactly once. Calling `installProcessSignalHandlers()`
 * from multiple places (instrumentation.register on hot-reload, worker
 * scripts, tests) is safe — subsequent calls are a no-op.
 */

const SHUTDOWN_DRAIN_MS = Number(process.env.SHUTDOWN_DRAIN_MS ?? "20000") || 20_000;
const SHUTDOWN_FINAL_MS = 1_000;

type Closer = (reason: ShutdownReason) => void | Promise<void>;
type ShutdownReason = "SIGTERM" | "SIGINT" | "manual";

const state = {
  shuttingDown: false,
  reason: null as ShutdownReason | null,
  triggeredAt: 0,
  closers: new Set<Closer>(),
  handlersInstalled: false,
  draining: null as Promise<void> | null,
};

/** Snapshot of shutdown state — safe to call from any request handler. */
export function getShutdownState(): {
  shuttingDown: boolean;
  reason: ShutdownReason | null;
  triggeredAt: number;
} {
  return {
    shuttingDown: state.shuttingDown,
    reason: state.reason,
    triggeredAt: state.triggeredAt,
  };
}

/** Convenience for routes — readiness probe + SSE accept checks. */
export function isShuttingDown(): boolean {
  return state.shuttingDown;
}

/**
 * Register a function to run when the process begins shutting down.
 * Returns the unregister callback — call it when the resource closes for
 * any other reason (normal SSE disconnect, request finished).
 *
 * Closers must be idempotent and reasonably fast (target < 1s). They run
 * in parallel — don't rely on ordering.
 */
export function registerShutdownCloser(closer: Closer): () => void {
  state.closers.add(closer);
  return () => {
    state.closers.delete(closer);
  };
}

/**
 * Trigger shutdown from inside the app (e.g., admin API, test harness).
 * Returns a promise that resolves once draining completes — does NOT call
 * `process.exit` so callers can decide whether to crash or finish responding.
 */
export function triggerShutdown(reason: ShutdownReason = "manual"): Promise<void> {
  if (state.draining) return state.draining;

  state.shuttingDown = true;
  state.reason = reason;
  state.triggeredAt = Date.now();

  state.draining = drain(reason);
  return state.draining;
}

async function drain(reason: ShutdownReason): Promise<void> {
  // Snapshot + clear so re-entrant registrations don't run twice.
  const closers = Array.from(state.closers);
  state.closers.clear();

  const drainPromise = Promise.allSettled(
    closers.map(async (c) => {
      try {
        await c(reason);
      } catch {
        // Closer failures are non-fatal — we're already shutting down.
      }
    }),
  );

  const timeout = new Promise<void>((resolve) =>
    setTimeout(resolve, SHUTDOWN_DRAIN_MS).unref(),
  );

  await Promise.race([drainPromise, timeout]);
}

/**
 * Wire SIGTERM / SIGINT to drain and exit. Idempotent — only the first
 * call installs handlers, subsequent calls are a no-op (important because
 * Next.js may call `register()` multiple times during dev hot reload).
 *
 * Pass `exitOnSignal: false` for test harnesses where the runner controls
 * process lifecycle.
 */
export function installProcessSignalHandlers(opts: { exitOnSignal?: boolean } = {}): void {
  if (state.handlersInstalled) return;
  state.handlersInstalled = true;

  const exitOnSignal = opts.exitOnSignal ?? true;

  const handle = (signal: ShutdownReason) => {
    // Logged via console.warn — `lib/logger` depends on `server-only` which
    // misbehaves in some entrypoints. Shutdown logging is rare enough that
    // console.warn is acceptable.
    console.warn(`[shutdown] received ${signal} — draining (max ${SHUTDOWN_DRAIN_MS}ms)`);

    void triggerShutdown(signal).then(() => {
      if (!exitOnSignal) return;
      // Brief final flush — Node's writable streams flush asynchronously
      // and we want stdout to land in the container log before exit.
      setTimeout(() => process.exit(0), SHUTDOWN_FINAL_MS).unref();
    });
  };

  // `once` — a second signal during drain should force-quit instead of
  // re-entering this path. Node's default SIGTERM behaviour will kill us.
  process.once("SIGTERM", () => handle("SIGTERM"));
  process.once("SIGINT", () => handle("SIGINT"));
}

/** Test-only — reset the module state between specs. */
export function __resetShutdownStateForTests(): void {
  state.shuttingDown = false;
  state.reason = null;
  state.triggeredAt = 0;
  state.closers.clear();
  state.handlersInstalled = false;
  state.draining = null;
}
