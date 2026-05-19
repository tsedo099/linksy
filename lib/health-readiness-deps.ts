import "server-only";

import { probeFcmOAuth } from "@/lib/push/fcm";
import { probeApnsProviderJwt } from "@/lib/push/apns";

export type DependencyCheck = { ok: boolean; detail?: string };

function storageMode(): "local" | "vercel_blob" | "s3" {
  const raw = (process.env.UPLOAD_STORAGE ?? "local").trim().toLowerCase();
  if (raw === "vercel_blob" || raw === "blob") return "vercel_blob";
  if (raw === "s3" || raw === "r2" || raw === "s3_compatible") return "s3";
  return "local";
}

async function checkRedis(): Promise<DependencyCheck> {
  const url = process.env.REDIS_URL?.trim();
  if (!url) return { ok: true, detail: "not_configured" };

  const { default: Redis } = await import("ioredis");
  const client = new Redis(url, {
    connectTimeout: 5000,
    maxRetriesPerRequest: 1,
    enableOfflineQueue: false,
    lazyConnect: true,
  });
  try {
    await client.connect();
    const pong = await client.ping();
    return pong === "PONG" ? { ok: true } : { ok: false, detail: `unexpected: ${pong}` };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return { ok: false, detail: msg.slice(0, 300) };
  } finally {
    try {
      client.disconnect();
    } catch {
      /* ignore */
    }
  }
}

async function checkObjectStorage(): Promise<DependencyCheck & { mode?: string }> {
  const mode = storageMode();
  if (mode === "local") {
    return { ok: true, detail: "local_fs", mode: "local" };
  }

  if (mode === "vercel_blob") {
    const token = process.env.BLOB_READ_WRITE_TOKEN?.trim();
    if (!token) {
      return { ok: false, detail: "UPLOAD_STORAGE=blob but BLOB_READ_WRITE_TOKEN missing", mode: "vercel_blob" };
    }
    try {
      const { list } = await import("@vercel/blob");
      await list({ token, limit: 1 });
      return { ok: true, mode: "vercel_blob" };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return { ok: false, detail: msg.slice(0, 300), mode: "vercel_blob" };
    }
  }

  const bucket = process.env.S3_UPLOAD_BUCKET?.trim();
  const accessKey = process.env.S3_ACCESS_KEY_ID?.trim();
  const secretKey = process.env.S3_SECRET_ACCESS_KEY?.trim();
  if (!bucket || !accessKey || !secretKey) {
    return {
      ok: false,
      detail: "UPLOAD_STORAGE=s3 but S3_UPLOAD_BUCKET or credentials missing",
      mode: "s3",
    };
  }

  const endpoint = process.env.S3_UPLOAD_ENDPOINT?.trim();
  const region = (process.env.S3_UPLOAD_REGION ?? (endpoint ? "auto" : "us-east-1")).trim();

  try {
    const { HeadBucketCommand, S3Client } = await import("@aws-sdk/client-s3");
    const client = endpoint
      ? new S3Client({
          region,
          endpoint,
          credentials: { accessKeyId: accessKey, secretAccessKey: secretKey },
        })
      : new S3Client({ region, credentials: { accessKeyId: accessKey, secretAccessKey: secretKey } });
    await client.send(new HeadBucketCommand({ Bucket: bucket }));
    return { ok: true, mode: "s3" };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return { ok: false, detail: msg.slice(0, 300), mode: "s3" };
  }
}

async function checkEmailProvider(): Promise<DependencyCheck> {
  const resendKey = process.env.RESEND_API_KEY?.trim();
  const sendgridKey = process.env.SENDGRID_API_KEY?.trim();
  const preferred = process.env.EMAIL_PROVIDER?.trim().toLowerCase();

  if (preferred === "resend" || (resendKey && !sendgridKey)) {
    if (!resendKey) return { ok: true, detail: "not_configured" };
    try {
      const res = await fetch("https://api.resend.com/domains", {
        headers: { Authorization: `Bearer ${resendKey}` },
        signal: AbortSignal.timeout(8000),
      });
      if (res.ok) return { ok: true };
      const text = await res.text().catch(() => "");
      return { ok: false, detail: `resend ${res.status}: ${text.slice(0, 200)}` };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return { ok: false, detail: msg.slice(0, 300) };
    }
  }

  if (preferred === "sendgrid" || sendgridKey) {
    if (!sendgridKey) return { ok: true, detail: "not_configured" };
    try {
      const res = await fetch("https://api.sendgrid.com/v3/user/profile", {
        headers: { Authorization: `Bearer ${sendgridKey}` },
        signal: AbortSignal.timeout(8000),
      });
      if (res.ok) return { ok: true };
      const text = await res.text().catch(() => "");
      return { ok: false, detail: `sendgrid ${res.status}: ${text.slice(0, 200)}` };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return { ok: false, detail: msg.slice(0, 300) };
    }
  }

  return { ok: true, detail: "not_configured" };
}

export type ReadinessDependencyReport = {
  redis: DependencyCheck;
  object_storage: DependencyCheck & { mode?: string };
  email: DependencyCheck;
  push_fcm: DependencyCheck;
  push_apns: DependencyCheck;
};

export async function checkReadinessDependencies(): Promise<ReadinessDependencyReport> {
  const [redis, object_storage, email, fcm, apns] = await Promise.all([
    checkRedis(),
    checkObjectStorage(),
    checkEmailProvider(),
    probeFcmOAuth(),
    Promise.resolve(probeApnsProviderJwt()),
  ]);

  return {
    redis,
    object_storage,
    email,
    push_fcm: fcm,
    push_apns: apns,
  };
}

export function dependenciesAllOk(report: ReadinessDependencyReport): boolean {
  return (
    report.redis.ok
    && report.object_storage.ok
    && report.email.ok
    && report.push_fcm.ok
    && report.push_apns.ok
  );
}
