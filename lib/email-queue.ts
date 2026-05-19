import { Queue, Worker, type ConnectionOptions, type Job } from "bullmq";
import { sendTransactionalEmail } from "@/lib/email";
import { logBackgroundError, logger } from "@/lib/logger";
import { queueJobDurationSeconds } from "@/lib/metrics";

/**
 * BullMQ-backed transactional email queue. The web request path calls
 * `enqueueEmailJob`; the actual SMTP delivery happens inside `processEmailJob`,
 * either inline (when no Redis is configured / worker disabled) or in a
 * separate worker process via `scripts/email-worker.ts`.
 *
 * Behavior is gated by env:
 *   - `REDIS_URL`              required for the queue/worker (BullMQ needs Redis)
 *   - `EMAIL_QUEUE_ENABLED=1`  opt-in: route requests through the queue
 *   - `EMAIL_QUEUE_NAME`       optional override (default `linksy-email`)
 *
 * Without Redis or with the flag off, `enqueueEmailJob` returns false and
 * callers fall back to the inline `sendTransactionalEmail`.
 */

export const EMAIL_QUEUE_NAME = process.env.EMAIL_QUEUE_NAME?.trim() || "linksy-email";

export type EmailJobPayload = {
  to: string;
  subject: string;
  text: string;
  html: string;
};

let queueInstance: Queue<EmailJobPayload> | null = null;
let queueInitFailed = false;

function isQueueEnabled(): boolean {
  if (process.env.EMAIL_QUEUE_ENABLED !== "1" && process.env.EMAIL_QUEUE_ENABLED !== "true") {
    return false;
  }
  return Boolean(process.env.REDIS_URL?.trim());
}

function bullConnection(): ConnectionOptions | null {
  const url = process.env.REDIS_URL?.trim();
  if (!url) return null;
  return { url } as unknown as ConnectionOptions;
}

function getQueue(): Queue<EmailJobPayload> | null {
  if (queueInstance) return queueInstance;
  if (queueInitFailed) return null;
  if (!isQueueEnabled()) return null;
  const connection = bullConnection();
  if (!connection) return null;
  try {
    queueInstance = new Queue<EmailJobPayload>(EMAIL_QUEUE_NAME, {
      connection,
      defaultJobOptions: {
        attempts: 5,
        backoff: { type: "exponential", delay: 30_000 },
        removeOnComplete: { count: 200, age: 60 * 60 * 24 },
        removeOnFail: { count: 1000, age: 60 * 60 * 24 * 7 },
      },
    });
    queueInstance.on("error", (error) => {
      logger.warn({ err: error }, "email queue error");
    });
    return queueInstance;
  } catch (error) {
    queueInitFailed = true;
    logBackgroundError("email-queue.init")(error);
    return null;
  }
}

/**
 * Push a transactional email onto the queue. Returns `true` when the job is
 * accepted by Redis; `false` when the queue is disabled or unavailable so the
 * caller can fall back to inline delivery.
 */
export async function enqueueEmailJob(payload: EmailJobPayload): Promise<boolean> {
  const queue = getQueue();
  if (!queue) return false;
  try {
    await queue.add("send", payload, { jobId: undefined });
    return true;
  } catch (error) {
    logBackgroundError("email-queue.enqueue")(error);
    return false;
  }
}

/**
 * Worker job handler. Exported so `scripts/email-worker.ts` can wire the same
 * processing function used by inline retries / tests.
 */
export async function processEmailJob(job: Job<EmailJobPayload>): Promise<void> {
  await sendTransactionalEmail({
    to: job.data.to,
    subject: job.data.subject,
    text: job.data.text,
    html: job.data.html,
  });
}

/**
 * Spin up a Worker that drains the queue. Intended to be called from a
 * dedicated long-lived process (`scripts/email-worker.ts`), not from a request
 * handler. Returns the Worker so callers can attach lifecycle handlers.
 */
export function startEmailWorker(options: { concurrency?: number } = {}): Worker<EmailJobPayload> {
  const connection = bullConnection();
  if (!connection) {
    throw new Error("Cannot start email worker: REDIS_URL is not set.");
  }
  const startTimes = new Map<string, number>();
  const worker = new Worker<EmailJobPayload>(
    EMAIL_QUEUE_NAME,
    async (job) => {
      if (job.id) startTimes.set(job.id, Date.now());
      return processEmailJob(job);
    },
    {
      connection,
      concurrency: options.concurrency ?? 5,
    },
  );

  const observe = (job: Job<EmailJobPayload> | undefined, result: "ok" | "error") => {
    if (!job?.id) return;
    const startedAt = startTimes.get(job.id);
    startTimes.delete(job.id);
    if (startedAt) {
      queueJobDurationSeconds.observe(
        { queue: EMAIL_QUEUE_NAME, result },
        (Date.now() - startedAt) / 1000,
      );
    }
  };

  worker.on("failed", (job, error) => {
    observe(job, "error");
    logger.warn({ jobId: job?.id, err: error }, "email job failed");
  });
  worker.on("completed", (job) => {
    observe(job, "ok");
    logger.info({ jobId: job.id, to: job.data.to }, "email job completed");
  });
  return worker;
}
