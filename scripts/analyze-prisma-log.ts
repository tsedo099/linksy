/**
 * N+1 query audit — reads pino JSON log lines from stdin (or a file passed as
 * the first arg) and flags suspected N+1 patterns: ≥ THRESHOLD identical
 * `model.op` queries within a WINDOW_MS sliding window.
 *
 * Usage:
 *   PRISMA_LOG_QUERIES=true npm run dev > dev.log 2>&1
 *   # exercise the suspected pages, then:
 *   npx tsx scripts/analyze-prisma-log.ts dev.log
 *
 * Env knobs:
 *   N1_WINDOW_MS=1000        sliding window width
 *   N1_THRESHOLD=5           min repeats inside the window to flag
 */

import { createReadStream } from "node:fs";
import { createInterface } from "node:readline";

type LogLine = {
  scope?: string;
  model?: string;
  op?: string;
  ms?: number;
  time?: string;
};

type WindowHit = {
  key: string;
  count: number;
  totalMs: number;
  firstTs: number;
  lastTs: number;
};

const WINDOW_MS = Number(process.env.N1_WINDOW_MS ?? 1000);
const THRESHOLD = Number(process.env.N1_THRESHOLD ?? 5);

async function main(): Promise<void> {
  const path = process.argv[2];
  const input = path ? createReadStream(path, { encoding: "utf8" }) : process.stdin;
  const rl = createInterface({ input, crlfDelay: Infinity });

  // Per-key sliding window of timestamps + ms.
  const windows = new Map<string, { ts: number; ms: number }[]>();
  const flagged: WindowHit[] = [];

  for await (const line of rl) {
    const trimmed = line.trim();
    if (!trimmed.startsWith("{")) continue;

    let parsed: LogLine;
    try {
      parsed = JSON.parse(trimmed) as LogLine;
    } catch {
      continue;
    }
    if (parsed.scope !== "prisma.query" || !parsed.model || !parsed.op) continue;

    const ts = parsed.time ? Date.parse(parsed.time) : Date.now();
    if (!Number.isFinite(ts)) continue;

    const key = `${parsed.model}.${parsed.op}`;
    const ms = typeof parsed.ms === "number" ? parsed.ms : 0;

    const bucket = windows.get(key) ?? [];
    const cutoff = ts - WINDOW_MS;
    while (bucket.length > 0 && (bucket[0]?.ts ?? Infinity) < cutoff) bucket.shift();
    bucket.push({ ts, ms });
    windows.set(key, bucket);

    if (bucket.length >= THRESHOLD) {
      const firstEntry = bucket[0];
      const lastEntry = bucket[bucket.length - 1];
      if (!firstEntry || !lastEntry) continue;
      flagged.push({
        key,
        count: bucket.length,
        totalMs: bucket.reduce((sum, item) => sum + item.ms, 0),
        firstTs: firstEntry.ts,
        lastTs: lastEntry.ts,
      });
      windows.set(key, []); // reset so each burst is reported once
    }
  }

  if (flagged.length === 0) {
    process.stdout.write(`No N+1 hot spots (≥${THRESHOLD} of the same model.op within ${WINDOW_MS}ms).\n`);
    return;
  }

  process.stdout.write(`Suspected N+1 patterns (${flagged.length}):\n\n`);
  flagged.sort((a, b) => b.count - a.count);
  for (const hit of flagged) {
    const window = hit.lastTs - hit.firstTs;
    process.stdout.write(
      `  ${hit.key.padEnd(40)} ×${hit.count}  total=${hit.totalMs.toFixed(1)}ms  span=${window}ms\n`,
    );
  }
  process.stdout.write(
    `\nFix: replace the loop with a single \`findMany\` + \`include\`/\`select\`,\n` +
      `or batch the keys with \`where: { id: { in: [...] } }\` and group in JS.\n`,
  );

  process.exitCode = 1;
}

main().catch((err) => {
  process.stderr.write(`analyze-prisma-log failed: ${(err as Error).message}\n`);
  process.exit(2);
});
