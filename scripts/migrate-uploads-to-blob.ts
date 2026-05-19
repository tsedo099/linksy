/**
 * One-shot migration: walk public/uploads/, push each file into Vercel
 * Blob, then UPDATE the database so existing post/avatar URLs point at
 * the Blob CDN instead of the (broken on Vercel) local /uploads path.
 *
 * Run from the project root with the production env loaded:
 *   $env:DATABASE_URL = "postgres://avnadmin:...@.../defaultdb?sslmode=require"
 *   $env:BLOB_READ_WRITE_TOKEN = "vercel_blob_rw_..."
 *   npx tsx scripts/migrate-uploads-to-blob.ts
 *
 * Idempotent: re-running skips files that already live in Blob, and
 * never overwrites a row whose URL already points to a non-local source.
 */
import { put, list } from "@vercel/blob";
import { readFile, readdir, stat } from "node:fs/promises";
import { join } from "node:path";
import { PrismaClient } from "../lib/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

if (!process.env.DATABASE_URL) {
  console.error("Missing DATABASE_URL. Set it to the Aiven production URL before running.");
  process.exit(1);
}

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });
const UPLOADS_DIR = join(process.cwd(), "public", "uploads");
const BLOB_PREFIX = "uploads/";

async function main(): Promise<void> {
  const token = process.env.BLOB_READ_WRITE_TOKEN;
  if (!token) {
    console.error("Missing BLOB_READ_WRITE_TOKEN. Pull it from Vercel: `npx vercel env pull`");
    process.exit(1);
  }

  // Inventory: existing Blob filenames (so we skip re-uploading on retries).
  const existing = new Set<string>();
  let cursor: string | undefined;
  do {
    const page = await list({ token, cursor, prefix: BLOB_PREFIX, limit: 1000 });
    for (const b of page.blobs) existing.add(b.pathname);
    cursor = page.cursor;
  } while (cursor);
  console.log(`Blob store currently has ${existing.size} file(s) under "${BLOB_PREFIX}".`);

  const localFiles = await readdir(UPLOADS_DIR);
  const realFiles: string[] = [];
  for (const f of localFiles) {
    if (f.startsWith(".")) continue;
    const s = await stat(join(UPLOADS_DIR, f));
    if (s.isFile()) realFiles.push(f);
  }
  console.log(`Local public/uploads has ${realFiles.length} file(s).`);

  // The mapping `oldUrl -> newUrl` so we can sweep the DB in one pass at end.
  const urlMap = new Map<string, string>();

  for (const file of realFiles) {
    const localPath = `/uploads/${file}`;
    const blobPath = `${BLOB_PREFIX}${file}`;

    if (existing.has(blobPath)) {
      // Already uploaded — find its public URL by re-listing (cheap, cached).
      const probe = await list({ token, prefix: blobPath, limit: 1 });
      const hit = probe.blobs.find((b) => b.pathname === blobPath);
      if (hit) {
        urlMap.set(localPath, hit.url);
        console.log(`= skipped ${file} (already in Blob)`);
        continue;
      }
    }

    const data = await readFile(join(UPLOADS_DIR, file));
    const result = await put(blobPath, data, {
      token,
      access: "public",
      addRandomSuffix: false,
      contentType: guessContentType(file),
    });
    urlMap.set(localPath, result.url);
    console.log(`+ uploaded ${file} -> ${result.url}`);
  }

  console.log(`\nMigrated ${urlMap.size} files. Updating database URLs…`);
  let totalRows = 0;

  for (const [oldUrl, newUrl] of urlMap) {
    // User only has avatarUrl in this schema (no bannerUrl column).
    const user = await prisma.user.updateMany({ where: { avatarUrl: oldUrl }, data: { avatarUrl: newUrl } });
    totalRows += user.count;
    const story = await prisma.story.updateMany({ where: { mediaUrl: oldUrl }, data: { mediaUrl: newUrl } });
    totalRows += story.count;
    const msg = await prisma.message.updateMany({ where: { mediaUrl: oldUrl }, data: { mediaUrl: newUrl } });
    totalRows += msg.count;
    // Post media is stored as a String[] mediaUrls. Pull each row whose
    // array contains the old path, then write back the replaced array
    // — updateMany can't transform array elements directly.
    const matchingPosts = await prisma.post.findMany({
      where: { mediaUrls: { has: oldUrl } },
      select: { id: true, mediaUrls: true },
    });
    for (const p of matchingPosts) {
      const updated = p.mediaUrls.map((u) => (u === oldUrl ? newUrl : u));
      await prisma.post.update({ where: { id: p.id }, data: { mediaUrls: updated } });
      totalRows += 1;
    }
  }

  console.log(`\nDone. Updated ${totalRows} database row(s) across User.avatar, Post.mediaUrls, Story.media, Message.media.`);
  await prisma.$disconnect();
}

function guessContentType(filename: string): string | undefined {
  const ext = filename.split(".").pop()?.toLowerCase();
  switch (ext) {
    case "png":  return "image/png";
    case "jpg":
    case "jpeg": return "image/jpeg";
    case "webp": return "image/webp";
    case "gif":  return "image/gif";
    case "mp4":  return "video/mp4";
    case "webm": return "video/webm";
    case "ogg":  return "audio/ogg";
    case "mp3":  return "audio/mpeg";
    default:     return undefined;
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
