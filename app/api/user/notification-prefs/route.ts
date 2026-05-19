import { NextRequest, NextResponse } from "next/server";
import { getUser } from "@/lib/auth";
import {
  DEFAULT_EMAIL_DIGEST,
  DEFAULT_NOTIFICATION_PREFS,
  isEmailDigestCadence,
  loadDigestPreference,
  loadNotificationPrefs,
  normalizeNotificationPrefs,
  saveDigestPreference,
  saveNotificationPrefs,
} from "@/lib/notifications";
import { parseRequestJson } from "@/lib/request-json";
import { notificationPrefsPutSchema } from "@/lib/schemas/api-bodies";

export async function GET(req: NextRequest) {
  const me = await getUser(req);
  if (!me) return NextResponse.json({ error: "Not authenticated." }, { status: 401 });

  const [prefs, digest] = await Promise.all([
    loadNotificationPrefs(me.userId),
    loadDigestPreference(me.userId),
  ]);

  return NextResponse.json({
    prefs,
    defaults: DEFAULT_NOTIFICATION_PREFS,
    digest: {
      cadence: digest.cadence,
      lastSentAt: digest.lastSentAt ? digest.lastSentAt.toISOString() : null,
      defaultCadence: DEFAULT_EMAIL_DIGEST,
    },
  });
}

export async function PUT(req: NextRequest) {
  const me = await getUser(req);
  if (!me) return NextResponse.json({ error: "Not authenticated." }, { status: 401 });

  const parsed = await parseRequestJson(req, notificationPrefsPutSchema);
  if (!parsed.ok) return parsed.response;
  const body = parsed.data;

  try {
    let savedPrefs = await loadNotificationPrefs(me.userId);
    let savedDigest = await loadDigestPreference(me.userId);

    if (body.prefs && typeof body.prefs === "object") {
      const sanitized = normalizeNotificationPrefs(body.prefs);
      savedPrefs = await saveNotificationPrefs(me.userId, sanitized);
    }

    if (body.digest && typeof body.digest === "object") {
      const cadence = (body.digest as { cadence?: unknown }).cadence;
      if (!isEmailDigestCadence(cadence)) {
        return NextResponse.json(
          { error: "Digest cadence must be 'off', 'daily', or 'weekly'." },
          { status: 400 },
        );
      }
      const saved = await saveDigestPreference(me.userId, cadence);
      savedDigest = { cadence: saved, lastSentAt: savedDigest.lastSentAt };
    }

    return NextResponse.json({
      prefs: savedPrefs,
      digest: {
        cadence: savedDigest.cadence,
        lastSentAt: savedDigest.lastSentAt ? savedDigest.lastSentAt.toISOString() : null,
        defaultCadence: DEFAULT_EMAIL_DIGEST,
      },
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Could not save preferences." },
      { status: 503 },
    );
  }
}
