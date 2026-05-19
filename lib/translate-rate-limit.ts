/** In-memory sliding window per user (best-effort; use Redis in multi-instance prod). */

const buckets = new Map<string, number[]>();

function windowMs(): number {
  const raw = Number.parseInt(process.env.TRANSLATE_RATE_WINDOW_MS ?? `${60_000}`, 10);
  return Number.isFinite(raw) && raw >= 5000 ? raw : 60_000;
}

function maxPerWindow(): number {
  const raw = Number.parseInt(process.env.TRANSLATE_RATE_MAX ?? `${24}`, 10);
  return Number.isFinite(raw) && raw >= 1 ? Math.min(raw, 120) : 24;
}

export function allowTranslateForUser(userId: string): boolean {
  const now = Date.now();
  const win = windowMs();
  const max = maxPerWindow();
  const arr = buckets.get(userId) ?? [];
  const recent = arr.filter((t) => now - t < win);
  if (recent.length >= max) {
    buckets.set(userId, recent);
    return false;
  }
  recent.push(now);
  buckets.set(userId, recent);

  if (buckets.size > 20_000) {
    for (const [id, times] of buckets) {
      const pruned = times.filter((t) => now - t < win);
      if (pruned.length === 0) buckets.delete(id);
      else buckets.set(id, pruned);
    }
  }
  return true;
}
