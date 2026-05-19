/**
 * Lightweight script-based guess for post caption language (BCP-47 short tags).
 * Not a substitute for server-side ML; good enough for UI dir + translate source.
 */
export function detectCaptionLanguage(caption: string): string | null {
  const t = caption.trim();
  if (!t) return null;

  const sample = t.slice(0, 800);
  let hangul = 0;
  let hirakana = 0;
  let cjkHan = 0;
  let cyrillic = 0;
  let latin = 0;

  for (const ch of sample) {
    const c = ch.codePointAt(0)!;
    if (c >= 0xac00 && c <= 0xd7af) hangul++;
    else if (c >= 0x3040 && c <= 0x30ff) hirakana++;
    else if ((c >= 0x3400 && c <= 0x4dbf) || (c >= 0x4e00 && c <= 0x9fff) || (c >= 0xf900 && c <= 0xfaff))
      cjkHan++;
    else if (c >= 0x0400 && c <= 0x052f) cyrillic++;
    else if (/[a-zA-Z]/.test(ch)) latin++;
  }

  const n = sample.replace(/\s/g, "").length || 1;
  const ratio = (x: number) => x / n;

  if (ratio(hangul) >= 0.15) return "ko";
  if (ratio(hirakana) >= 0.08) return "ja";
  if (ratio(cjkHan) >= 0.15) return "zh";
  /** Cyrillic: default to Mongolian (MN uses Cyrillic; RU shares the script). */
  if (ratio(cyrillic) >= 0.2) return "mn";
  if (ratio(latin) >= 0.5 || latin > 0) return "en";

  return "en";
}
