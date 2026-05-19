const TWENTY_FOUR_H_MS = 24 * 60 * 60 * 1000;

/**
 * Feed / post header: first 24h → short relative ("36 s", "5 m", "2 h");
 * after 24h → locale date like "October 24, 2023".
 */
export function formatPostFeedTimestamp(iso: string, locale: string): string {
  const t = new Date(iso).getTime();
  if (!Number.isFinite(t)) return "";
  const age = Date.now() - t;
  const dateOpts: Intl.DateTimeFormatOptions = {
    month: "long",
    day: "numeric",
    year: "numeric",
  };

  if (age < 0) {
    return new Date(iso).toLocaleDateString(locale || undefined, dateOpts);
  }

  if (age < TWENTY_FOUR_H_MS) {
    const sec = Math.floor(age / 1000);
    if (sec < 60) return `${Math.max(0, sec)} s`;
    const min = Math.floor(age / 60000);
    if (min < 60) return `${min} m`;
    const hr = Math.floor(age / 3600000);
    return `${hr} h`;
  }

  return new Date(iso).toLocaleDateString(locale || undefined, dateOpts);
}
