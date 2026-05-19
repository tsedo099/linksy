import { NextRequest, NextResponse } from "next/server";
import { getUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { isApnsConfigured, isFcmConfigured, isWebPushConfigured } from "@/lib/push-notifications";
import { parseRequestJson } from "@/lib/request-json";
import { pushSubscribeSchema, pushUnsubscribeSchema } from "@/lib/schemas/api-bodies";

/** Register or refresh a push subscription (Web Push, FCM v1, or APNs HTTP/2). */
export async function POST(req: NextRequest) {
  const me = await getUser(req);
  if (!me) return NextResponse.json({ error: "Not authenticated." }, { status: 401 });

  const parsed = await parseRequestJson(req, pushSubscribeSchema);
  if (!parsed.ok) return parsed.response;

  const data = parsed.data;
  const agent = req.headers.get("user-agent")?.slice(0, 512) ?? null;

  if (data.platform === "WEB_PUSH") {
    if (!isWebPushConfigured()) {
      return NextResponse.json({ error: "Web Push is not configured on this server." }, { status: 503 });
    }
    await prisma.pushSubscription.upsert({
      where: { userId_endpoint: { userId: me.userId, endpoint: data.endpoint } },
      create: {
        userId: me.userId,
        platform: "WEB_PUSH",
        endpoint: data.endpoint,
        p256dh: data.keys.p256dh,
        auth: data.keys.auth,
        userAgent: agent,
      },
      update: {
        p256dh: data.keys.p256dh,
        auth: data.keys.auth,
        userAgent: agent,
      },
    });
    return NextResponse.json({ ok: true });
  }

  // Native: FCM (Android) / APNS (iOS)
  if (data.platform === "FCM" && !isFcmConfigured()) {
    return NextResponse.json({ error: "FCM is not configured on this server." }, { status: 503 });
  }
  if (data.platform === "APNS" && !isApnsConfigured()) {
    return NextResponse.json({ error: "APNs is not configured on this server." }, { status: 503 });
  }

  await prisma.pushSubscription.upsert({
    where: {
      userId_platform_deviceToken: {
        userId: me.userId,
        platform: data.platform,
        deviceToken: data.deviceToken,
      },
    },
    create: {
      userId: me.userId,
      platform: data.platform,
      deviceToken: data.deviceToken,
      userAgent: agent,
    },
    update: {
      userAgent: agent,
    },
  });

  return NextResponse.json({ ok: true });
}

export async function DELETE(req: NextRequest) {
  const me = await getUser(req);
  if (!me) return NextResponse.json({ error: "Not authenticated." }, { status: 401 });

  const parsed = await parseRequestJson(req, pushUnsubscribeSchema);
  if (!parsed.ok) return parsed.response;

  const { endpoint, platform, deviceToken } = parsed.data;

  if (endpoint) {
    await prisma.pushSubscription.deleteMany({
      where: { userId: me.userId, endpoint },
    });
  } else if (platform && platform !== "WEB_PUSH" && deviceToken) {
    await prisma.pushSubscription.deleteMany({
      where: { userId: me.userId, platform, deviceToken },
    });
  }

  return NextResponse.json({ ok: true });
}
