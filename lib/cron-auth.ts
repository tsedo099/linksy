import "server-only";
import type { NextRequest } from "next/server";

/**
 * Shared `Authorization: Bearer ${CRON_SECRET}` (or `?token=`) check used by
 * every `/api/cron/*` route. Returns `false` when the secret is unset so an
 * accidentally-deployed cron route can't run without explicit configuration.
 */
export function isAuthorizedCron(req: NextRequest): boolean {
  const expected = process.env.CRON_SECRET?.trim();
  if (!expected) return false;

  const header = req.headers.get("authorization") ?? "";
  if (header === `Bearer ${expected}`) return true;

  const queryToken = req.nextUrl.searchParams.get("token");
  return Boolean(queryToken && queryToken === expected);
}
