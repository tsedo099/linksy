/**
 * Long-lived process that drains the BullMQ email queue.
 *
 * Run alongside the Next.js server:
 *   REDIS_URL=redis://... EMAIL_QUEUE_ENABLED=1 \
 *   EMAIL_PROVIDER=resend RESEND_API_KEY=... \
 *     npm run worker:email
 *
 * Picks up the same env that the web process uses for delivery
 * (`lib/email.ts`), so provider configuration only needs to live in one place.
 *
 * The worker runs outside Next.js, so the `server-only` package (used by
 * `lib/logger.ts`) would throw on import. Stub it out via require.cache before
 * importing the rest of the app code.
 */

import { createRequire } from "node:module";

const requireFromHere = createRequire(__filename);
try {
  const serverOnlyPath = requireFromHere.resolve("server-only");
  requireFromHere.cache[serverOnlyPath] = {
    id: serverOnlyPath,
    filename: serverOnlyPath,
    loaded: true,
    exports: {},
    paths: [],
    children: [],
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any;
} catch {
  /* server-only not installed — nothing to stub */
}

void (async () => {
  if (!process.env.REDIS_URL?.trim()) {
    console.error("[email-worker] REDIS_URL is not set — cannot start worker.");
    process.exit(1);
  }

  const [{ startEmailWorker, EMAIL_QUEUE_NAME }, { logger }] = await Promise.all([
    import("@/lib/email-queue"),
    import("@/lib/logger"),
  ]);

  const concurrency = Number(process.env.EMAIL_WORKER_CONCURRENCY ?? "5") || 5;
  const worker = startEmailWorker({ concurrency });
  logger.info({ queue: EMAIL_QUEUE_NAME, concurrency }, "email worker started");

  const shutdown = async (signal: string) => {
    logger.info({ signal }, "email worker shutting down");
    try {
      await worker.close();
    } finally {
      process.exit(0);
    }
  };

  process.on("SIGINT", () => void shutdown("SIGINT"));
  process.on("SIGTERM", () => void shutdown("SIGTERM"));
})();
