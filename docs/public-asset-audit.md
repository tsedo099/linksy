# `public/` Asset Audit + CDN Migration

Snapshot taken 2026-05-17. `public/` is **19MB**, of which:

| Bucket | Size | Action |
|---|---|---|
| `public/uploads/*` (dev test artifacts) | 6.4MB | **Gitignore + delete locally.** Already added to [.gitignore](../.gitignore). User uploads in production go to S3/R2/Blob via [lib/uploads-storage.ts](../lib/uploads-storage.ts). |
| `public/psda.png` (logo, ~2MB PNG) | 2.0MB | **Optimize.** 2MB for a logo is excessive — convert to optimized PNG / WebP. Target: ≤50KB. Used on every page (favicon + header + nav + PWA icon + share image). |
| Landing demo images (referenced) | ~8MB | **CDN candidate.** 22 landing/story demo images each referenced once from [components/landing/](../components/landing/) / [components/feed/feed-story-viewer.tsx](../components/feed/feed-story-viewer.tsx). Move to CDN, update src paths. |
| Orphan files (0 references) | ~2.5MB | **Delete candidates** (see list below). |
| PWA + meta (`sw.js`, `manifest.json`) | <100KB | **Keep.** Must be at root. |

## Orphan files (0 grep references)

Audited with `grep -r "<filename>" components/ app/ lib/ --include="*.tsx" --include="*.ts" --include="*.css"`:

```
Guide to the North Carolina State Fair (with Kids) _ Glitter, Inc_ _ Fair rides, Carnival rides, Amusement park rides.jpg
Lifestyle ✨️.jpg
Screenshot_1.png
Untitled-2.txt
download (8).jpg
download (9).jpg
download (10).jpg
download (11).jpg
new york street.jpg
post2.jpg
post3.jpg
sl.jpg
Звёзды _ небо _ Млечный Путь.jpg
```

Safe to delete after a final manual verification (these names contain spaces /
non-ASCII so the grep is fuzzy; double-check before bulk delete).

```sh
# After verifying:
cd public
rm "Guide to the North Carolina State Fair (with Kids) _ Glitter, Inc_ _ Fair rides, Carnival rides, Amusement park rides.jpg"
rm "Lifestyle ✨️.jpg" Screenshot_1.png Untitled-2.txt
rm "download (8).jpg" "download (9).jpg" "download (10).jpg" "download (11).jpg"
rm "new york street.jpg" post2.jpg post3.jpg sl.jpg
rm "Звёзды _ небо _ Млечный Путь.jpg"
```

Estimated saving: **~2.5MB** off the bundle / image fetch path.

## `psda.png` — optimization

Currently 2.0MB. Used in 7+ places (logo, favicon, OG image, PWA icon, nav header).
Browser fetches it on every page load (cached after first hit, but cold load is
2MB on the critical path).

Options (in increasing engineering cost):

1. **Optimize the existing PNG** with `pngquant` or `imagemin`. Typical PNG logo
   → 30-100KB depending on color palette. Drop-in replacement:
   ```sh
   pngquant --quality=70-90 --output public/psda.png public/psda.png
   ```
2. **Convert to WebP** at smaller size. Update Image/img `src` calls (or rely on
   `next/image` to do it transparently — already the case for the `<Image>`
   call sites; the raw `<img src="/psda.png">` sites in [app-shell.tsx](../components/app-shell.tsx)
   would need updating).
3. **Switch to SVG.** A logo at this size is almost certainly tracing to a
   single-path-ish glyph that would be <5KB as SVG. Highest effort but smallest
   asset.

Recommendation: option 1 as the first PR (no code changes), option 3 as a
follow-up when there's time to re-trace the glyph.

## CDN migration — already-coded path

The upload pipeline already supports CDN out of the box via
[lib/uploads-storage.ts](../lib/uploads-storage.ts):

```ts
export type PersistUploadMode = "local" | "vercel_blob" | "s3";
```

To migrate **user uploads** (the only thing that grows over time):

1. Choose a provider — Vercel Blob, AWS S3, or Cloudflare R2 (S3-compatible).
2. Set env vars in production. See `.env.example`:
   - `UPLOAD_STORAGE=s3` (or `vercel_blob`)
   - `S3_UPLOAD_BUCKET`, `S3_PUBLIC_BASE_URL`, `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY`, `S3_UPLOAD_REGION`
   - Plus `NEXT_PUBLIC_ALLOWED_UPLOAD_ORIGINS` (the public hostname for the
     CDN — used by `shouldUnoptimizeNextImageSrc` and next/image
     `remotePatterns`).
3. New uploads go to CDN immediately.
4. (Optional) one-shot migration of existing rows: walk `Post.mediaUrls`,
   `Story.mediaUrl`, `User.avatarUrl`, fetch each `/uploads/<file>`, re-upload
   via the same `persistUserUpload` helper with `UPLOAD_STORAGE=s3`, update
   the row. Tracked separately as a `scripts/migrate-uploads.ts` task.

## Landing demo images — CDN move

The 22 landing / story demo images (`landing-bg.jpg`, `post1.jpg`, `HAVAR.jpg`,
`milky-way.jpg`, etc.) are **static product copy**, not user uploads. They get
shipped once to a CDN bucket and the code references the CDN URL:

1. Upload all 22 to a `static/` bucket (separate from `uploads/` for cache /
   purge isolation).
2. Update [components/landing/shared.tsx](../components/landing/shared.tsx) +
   [components/landing/hero.tsx](../components/landing/hero.tsx) to read from
   `process.env.NEXT_PUBLIC_STATIC_CDN_BASE` + the filename.
3. Add the new origin to `NEXT_PUBLIC_ALLOWED_UPLOAD_ORIGINS` so next/image
   trusts it.

Estimated saving: **~8MB** off the build artifact `public/` (the images
themselves are still served, just not from the app's own filesystem).

## Final state target

After all phases:

| Stays in repo `public/` | Why |
|---|---|
| `psda.png` (optimized to <100KB) | Logo / favicon — root-served, framework-managed metadata. |
| `manifest.json`, `sw.js`, `icon`, `robots.txt`, `sitemap.xml` | Must be at root. |
| `uploads/.gitkeep` | Holds the dir for local dev (`UPLOAD_STORAGE=local`). |

Everything else → CDN. Final `public/` size target: **<200KB**.
