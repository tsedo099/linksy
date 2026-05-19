import "server-only";
import type { DisappearingMode } from "@/lib/generated/prisma/client";

/** 1 minute floor — anything shorter is just a UI bug. */
export const MIN_DISAPPEARING_SECONDS = 60;
/** 7 days ceiling — beyond that, "disappearing" loses meaning vs. archive. */
export const MAX_DISAPPEARING_SECONDS = 7 * 24 * 60 * 60;

/** Compute the snapshot fields stamped on a new Message row. */
export function expiryForNewMessage(input: {
  mode: DisappearingMode;
  ttlSeconds: number | null;
  createdAt: Date;
}): { expirePolicy: DisappearingMode | null; expireAfterSeconds: number | null; expiresAt: Date | null } {
  if (input.mode === "OFF" || !input.ttlSeconds) {
    return { expirePolicy: null, expireAfterSeconds: null, expiresAt: null };
  }
  if (input.mode === "TIMED") {
    return {
      expirePolicy: "TIMED",
      expireAfterSeconds: input.ttlSeconds,
      expiresAt: new Date(input.createdAt.getTime() + input.ttlSeconds * 1000),
    };
  }
  // AFTER_READ: expiresAt stays null until first read.
  return {
    expirePolicy: "AFTER_READ",
    expireAfterSeconds: input.ttlSeconds,
    expiresAt: null,
  };
}

export function isValidDisappearingTtl(seconds: number | null | undefined): boolean {
  if (seconds == null) return true;
  return Number.isFinite(seconds) && seconds >= MIN_DISAPPEARING_SECONDS && seconds <= MAX_DISAPPEARING_SECONDS;
}
