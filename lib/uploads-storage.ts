import "server-only";
import { mkdir, writeFile } from "fs/promises";
import { join } from "path";

export type PersistUploadMode = "local" | "vercel_blob" | "s3";

function storageMode(): PersistUploadMode {
  const raw = (process.env.UPLOAD_STORAGE ?? "local").trim().toLowerCase();
  if (raw === "vercel_blob" || raw === "blob") return "vercel_blob";
  if (raw === "s3" || raw === "r2" || raw === "s3_compatible") return "s3";
  return "local";
}

const MIME_BY_EXT: Record<string, string> = {
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
  gif: "image/gif",
  mp4: "video/mp4",
  webm: "video/webm",
  mov: "video/quicktime",
  mp3: "audio/mpeg",
  m4a: "audio/mp4",
  ogg: "audio/ogg",
  wav: "audio/wav",
};

function mimeForFilename(filename: string): string | undefined {
  const ext = filename.split(".").pop()?.toLowerCase();
  return ext ? MIME_BY_EXT[ext] : undefined;
}

/**
 * Persist a processed upload (`uuid.ext`). Returns URLs stored in rows:
 * - Local: `/uploads/{filename}`
 * - Blob / S3: absolute HTTPS URL (`NEXT_PUBLIC_ALLOWED_UPLOAD_ORIGINS` must include that origin).
 */
export async function persistUserUpload(outBuffer: Buffer, filename: string): Promise<{ url: string }> {
  if (!/^[\da-f]{8}-[\da-f]{4}-[\da-f]{4}-[\da-f]{4}-[\da-f]{12}\.[a-z0-9]{1,10}$/i.test(filename)) {
    throw new Error("Invalid upload filename shape.");
  }

  const key = `uploads/${filename}`;
  const mode = storageMode();

  if (mode === "local") {
    const uploadsDir = join(process.cwd(), "public", "uploads");
    await mkdir(uploadsDir, { recursive: true });
    await writeFile(join(uploadsDir, filename), outBuffer);
    return { url: `/uploads/${filename}` };
  }

  if (mode === "vercel_blob") {
    const { put } = await import("@vercel/blob");
    const ct = mimeForFilename(filename);
    const res = await put(key, outBuffer, {
      access: "public",
      addRandomSuffix: false,
      ...(ct ? { contentType: ct } : {}),
    });
    return { url: res.url };
  }

  const bucket = process.env.S3_UPLOAD_BUCKET?.trim();
  const prefix = process.env.S3_UPLOAD_KEY_PREFIX?.trim().replace(/\/$/, "") ?? "";
  const objectKey = prefix ? `${prefix}/${key}` : key;
  const publicBase = process.env.S3_PUBLIC_BASE_URL?.trim().replace(/\/$/, "");
  const accessKey = process.env.S3_ACCESS_KEY_ID?.trim();
  const secretKey = process.env.S3_SECRET_ACCESS_KEY?.trim();

  if (!bucket || !publicBase) {
    throw new Error("UPLOAD_STORAGE=s3 requires S3_UPLOAD_BUCKET and S3_PUBLIC_BASE_URL.");
  }
  if (!accessKey || !secretKey) {
    throw new Error("UPLOAD_STORAGE=s3 requires S3_ACCESS_KEY_ID and S3_SECRET_ACCESS_KEY.");
  }

  const endpoint = process.env.S3_UPLOAD_ENDPOINT?.trim();
  const region = (process.env.S3_UPLOAD_REGION ?? (endpoint ? "auto" : "us-east-1")).trim();

  const { PutObjectCommand, S3Client } = await import("@aws-sdk/client-s3");
  const client = endpoint
    ? new S3Client({
        region,
        endpoint,
        credentials: { accessKeyId: accessKey, secretAccessKey: secretKey },
      })
    : new S3Client({ region, credentials: { accessKeyId: accessKey, secretAccessKey: secretKey } });

  await client.send(
    new PutObjectCommand({
      Bucket: bucket,
      Key: objectKey,
      Body: outBuffer,
      ContentType: mimeForFilename(filename) ?? "application/octet-stream",
      CacheControl: "public, max-age=31536000, immutable",
    }),
  );

  const pathSegs = objectKey.split("/").map((s) => encodeURIComponent(s));
  const url = `${publicBase}/${pathSegs.join("/")}`;
  return { url };
}

export function persistUploadStorageMode(): PersistUploadMode {
  return storageMode();
}
