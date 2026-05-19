import "server-only";

export type QuietHoursPreference = {
  /** Minute-of-day window start (0..1439). */
  start: number;
  /** Minute-of-day window end (0..1439). Wraps midnight when start > end. */
  end: number;
  /** IANA timezone identifier the window is anchored to. */
  timezone: string;
};

const MIN = 0;
const MAX_MINUTE = 1440;

function asMinute(value: unknown): number | null {
  if (typeof value !== "number" || !Number.isFinite(value)) return null;
  const n = Math.floor(value);
  if (n < MIN || n >= MAX_MINUTE) return null;
  return n;
}

/** Cheap IANA validation — `Intl` throws on unknown zones. */
export function isValidIanaTimezone(tz: string): boolean {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

export function parseQuietHours(input: {
  quietHoursStart?: number | null;
  quietHoursEnd?: number | null;
  quietHoursTimezone?: string | null;
}): QuietHoursPreference | null {
  const start = asMinute(input.quietHoursStart);
  const end = asMinute(input.quietHoursEnd);
  if (start === null || end === null) return null;
  if (start === end) return null; // empty window — treat as disabled
  const tz = (input.quietHoursTimezone ?? "").trim();
  if (!tz || !isValidIanaTimezone(tz)) return null;
  return { start, end, timezone: tz };
}

const HOUR_FORMATTER_CACHE = new Map<string, Intl.DateTimeFormat>();

function formatterFor(timezone: string): Intl.DateTimeFormat {
  const cached = HOUR_FORMATTER_CACHE.get(timezone);
  if (cached) return cached;
  const fmt = new Intl.DateTimeFormat("en-GB", {
    timeZone: timezone,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
  HOUR_FORMATTER_CACHE.set(timezone, fmt);
  return fmt;
}

/** Minute-of-day in the user's timezone (0..1439). */
export function localMinuteOfDay(timezone: string, now: Date = new Date()): number {
  const formatted = formatterFor(timezone).format(now);
  // en-GB hour:minute renders as `HH:MM` (or `24:00` at midnight in some ICUs).
  const match = /^(\d{1,2}):(\d{2})/.exec(formatted);
  if (!match) return 0;
  const hour = Number(match[1]) % 24;
  const minute = Number(match[2]) % 60;
  return hour * 60 + minute;
}

/** True when `minute` falls inside the (potentially midnight-wrapping) window. */
export function isInsideWindow(window: QuietHoursPreference, minute: number): boolean {
  if (window.start < window.end) {
    return minute >= window.start && minute < window.end;
  }
  // Wraps midnight, e.g. 22:00 → 07:00
  return minute >= window.start || minute < window.end;
}

export function isInQuietHours(window: QuietHoursPreference, now: Date = new Date()): boolean {
  return isInsideWindow(window, localMinuteOfDay(window.timezone, now));
}
