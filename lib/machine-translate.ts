import type { AppLanguage } from "@/lib/language";

const FETCH_TIMEOUT_MS = 14_000;

async function fetchWithTimeout(url: string, init: RequestInit): Promise<Response> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT_MS);
  try {
    return await fetch(url, { ...init, signal: ctrl.signal });
  } finally {
    clearTimeout(t);
  }
}

/** Self-hosted LibreTranslate-compatible API (POST /translate). */
async function translateLibre(
  baseUrl: string,
  q: string,
  from: string,
  to: AppLanguage,
): Promise<string | null> {
  const root = baseUrl.replace(/\/$/, "");
  const res = await fetchWithTimeout(`${root}/translate`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({ q, source: from, target: to, format: "text" }),
  });
  if (!res.ok) return null;
  const data = (await res.json().catch(() => null)) as { translatedText?: string } | null;
  const out = data?.translatedText?.trim();
  return out && out !== q ? out : null;
}

/** MyMemory public API (quota-limited; dev / fallback). */
async function translateMyMemory(q: string, from: string, to: AppLanguage): Promise<{ text: string | null; status: number }> {
  const url = `https://api.mymemory.translated.net/get?q=${encodeURIComponent(q)}&langpair=${encodeURIComponent(`${from}|${to}`)}`;
  const res = await fetchWithTimeout(url, { headers: { Accept: "application/json" } });
  const data = (await res.json().catch(() => null)) as {
    responseData?: { translatedText?: string };
    responseStatus?: number;
  } | null;

  const apiStatus = typeof data?.responseStatus === "number" ? data.responseStatus : res.ok ? 200 : res.status;
  const translated = data?.responseData?.translatedText?.trim();
  if (apiStatus === 429 || apiStatus === 403) {
    return { text: null, status: apiStatus };
  }
  if (!translated || translated === q) {
    return { text: null, status: apiStatus };
  }
  return { text: translated, status: 200 };
}

export type MachineTranslateResult =
  | { ok: true; translated: string }
  | { ok: false; error: "unavailable" | "rate_limited" | "same_as_source" };

export async function machineTranslate(q: string, from: string, to: AppLanguage): Promise<MachineTranslateResult> {
  if (from === to) {
    return { ok: true, translated: q };
  }

  const libreUrl = process.env.LIBRETRANSLATE_URL?.trim();
  if (libreUrl) {
    const lib = await translateLibre(libreUrl, q, from, to);
    if (lib) return { ok: true, translated: lib };
    return { ok: false, error: "unavailable" };
  }

  const mm = await translateMyMemory(q, from, to);
  if (mm.status === 429 || mm.status === 403) {
    return { ok: false, error: "rate_limited" };
  }
  if (mm.text) {
    return { ok: true, translated: mm.text };
  }
  return { ok: false, error: "same_as_source" };
}
