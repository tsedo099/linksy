import { NextRequest, NextResponse } from "next/server";
import { flattenError, z, type ZodType } from "zod";

export type ParsedJson<T> = { ok: true; data: T } | { ok: false; response: NextResponse };

export async function parseRequestJson<T>(req: NextRequest, schema: ZodType<T>): Promise<ParsedJson<T>> {
  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return {
      ok: false,
      response: NextResponse.json({ error: "Invalid JSON body." }, { status: 400 }),
    };
  }

  const parsed = schema.safeParse(raw);
  if (!parsed.success) {
    return {
      ok: false,
      response: NextResponse.json(
        { error: "Validation failed.", issues: flattenError(parsed.error as z.ZodError<unknown>) },
        { status: 400 },
      ),
    };
  }

  return { ok: true, data: parsed.data };
}

/** Use when an empty/absent JSON body should be treated as `{}` (legacy clients omitting bodies). */
export async function parseRequestJsonAllowEmpty<T>(req: NextRequest, schema: ZodType<T>): Promise<ParsedJson<T>> {
  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    raw = {};
  }
  if (raw === null || raw === undefined) {
    raw = {};
  }

  const parsed = schema.safeParse(raw);
  if (!parsed.success) {
    return {
      ok: false,
      response: NextResponse.json(
        { error: "Validation failed.", issues: flattenError(parsed.error as z.ZodError<unknown>) },
        { status: 400 },
      ),
    };
  }

  return { ok: true, data: parsed.data };
}
