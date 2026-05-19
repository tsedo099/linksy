import { NextRequest, NextResponse } from "next/server";
import { getUser } from "@/lib/auth";
import { isAppLanguage, LANGUAGE_VALUES, type AppLanguage } from "@/lib/language";
import { machineTranslate } from "@/lib/machine-translate";
import { allowTranslateForUser } from "@/lib/translate-rate-limit";

const MAX_LEN = 1500;
const ALLOW = new Set<string>(LANGUAGE_VALUES);

function parseTranslateInput(req: NextRequest, body: unknown): { q: string; from: string; to: AppLanguage } | NextResponse {
  let q = "";
  let from = "en";
  let toRaw = "en";

  if (body && typeof body === "object" && !Array.isArray(body)) {
    const o = body as Record<string, unknown>;
    if (typeof o.q === "string") q = o.q.trim();
    if (typeof o.from === "string") from = o.from.trim().toLowerCase();
    if (typeof o.to === "string") toRaw = o.to.trim().toLowerCase();
  } else {
    q = (req.nextUrl.searchParams.get("q") ?? "").trim();
    from = (req.nextUrl.searchParams.get("from") ?? "en").trim().toLowerCase();
    toRaw = (req.nextUrl.searchParams.get("to") ?? "en").trim().toLowerCase();
  }

  const to = isAppLanguage(toRaw) ? toRaw : "en";
  if (!ALLOW.has(from)) from = "en";
  if (!ALLOW.has(to)) {
    return NextResponse.json({ error: "Unsupported target language." }, { status: 400 });
  }
  if (!q) return NextResponse.json({ error: "Missing text." }, { status: 400 });
  if (q.length > MAX_LEN) return NextResponse.json({ error: "Text too long." }, { status: 400 });

  return { q, from, to };
}

async function runTranslate(me: { userId: string }, input: { q: string; from: string; to: AppLanguage }) {
  if (!allowTranslateForUser(me.userId)) {
    return NextResponse.json(
      { error: "Too many translation requests. Please wait a moment and try again." },
      { status: 429 },
    );
  }

  const result = await machineTranslate(input.q, input.from, input.to);
  if (result.ok) {
    return NextResponse.json({ translated: result.translated });
  }
  if (result.error === "rate_limited") {
    return NextResponse.json({ error: "Translation service is busy. Try again shortly." }, { status: 429 });
  }
  return NextResponse.json({ error: "Translation service unavailable." }, { status: 502 });
}

/** POST — preferred (JSON body). GET — backward compatible (query string). Auth required. */
export async function POST(req: NextRequest) {
  const me = await getUser(req);
  if (!me) return NextResponse.json({ error: "Not authenticated." }, { status: 401 });

  const body = await req.json().catch(() => null);
  const parsed = parseTranslateInput(req, body);
  if (parsed instanceof NextResponse) return parsed;
  return runTranslate(me, parsed);
}

export async function GET(req: NextRequest) {
  const me = await getUser(req);
  if (!me) return NextResponse.json({ error: "Not authenticated." }, { status: 401 });

  const parsed = parseTranslateInput(req, null);
  if (parsed instanceof NextResponse) return parsed;
  return runTranslate(me, parsed);
}
