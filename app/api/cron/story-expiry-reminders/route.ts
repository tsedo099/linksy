import { NextRequest, NextResponse } from "next/server";
import { sendStoryExpiryReminders } from "@/lib/story-expiry-reminders";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function authorized(req: NextRequest): boolean {
  const expected = process.env.CRON_SECRET?.trim();
  if (!expected) return false;

  const header = req.headers.get("authorization") ?? "";
  if (header === `Bearer ${expected}`) return true;

  const queryToken = req.nextUrl.searchParams.get("token");
  if (queryToken && queryToken === expected) return true;

  return false;
}

async function handle(req: NextRequest) {
  if (!authorized(req)) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const { reminded } = await sendStoryExpiryReminders(new Date());
  return NextResponse.json({ ok: true, reminded });
}

export async function GET(req: NextRequest) {
  return handle(req);
}

export async function POST(req: NextRequest) {
  return handle(req);
}
