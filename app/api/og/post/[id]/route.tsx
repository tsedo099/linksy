import { ImageResponse } from "next/og";
import { prisma } from "@/lib/prisma";
import { absoluteUrl } from "@/lib/site-url";
import { getMediaUrl, isImageMediaUrl } from "@/lib/media";

/**
 * Dynamic Open Graph image for `/post/[id]`. Returns a 1200×630 PNG that
 * Twitter / Facebook / Discord / LinkedIn / Slack will render as the share
 * card thumbnail. Composes:
 *   - Background: first post image (if any), darkened
 *   - Foreground: caption snippet (4 lines max) + author handle + Linksy mark
 *
 * Falls back to a gradient + branded mark when the post has no image
 * (text-only posts, or the row is private / scheduled / missing).
 *
 * Cached by Next at the route layer; consumers re-validate via Open Graph
 * crawlers' own cache (24h typical).
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const CARD_WIDTH = 1200;
const CARD_HEIGHT = 630;
const CAPTION_MAX = 240;

async function loadPost(id: string) {
  try {
    return await prisma.post.findFirst({
      where: { id, audience: "PUBLIC", scheduledAt: null },
      select: {
        id: true,
        caption: true,
        mediaUrls: true,
        author: { select: { username: true, displayName: true } },
        _count: { select: { likes: true, comments: true } },
      },
    });
  } catch {
    return null;
  }
}

function clip(value: string | null | undefined, max: number): string {
  const trimmed = (value ?? "").replace(/\s+/g, " ").trim();
  if (trimmed.length <= max) return trimmed;
  return trimmed.slice(0, max - 1).trimEnd() + "…";
}

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const post = await loadPost(id);

  const caption = clip(post?.caption ?? "", CAPTION_MAX);
  const author = post
    ? `@${post.author.username}`
    : "@linksy";
  const heading = post ? (post.author.displayName || post.author.username) : "Linksy";
  const stats = post
    ? `${post._count.likes.toLocaleString()} likes · ${post._count.comments.toLocaleString()} comments`
    : "Connect on Linksy";

  const firstImage = post?.mediaUrls.find((url) => isImageMediaUrl(url));
  const bgImageAbs = firstImage ? absoluteUrl(getMediaUrl(firstImage) ?? firstImage) : null;

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          background: "linear-gradient(135deg, #1e1b4b 0%, #4c1d95 55%, #7c3aed 100%)",
          color: "#f5edff",
          fontFamily: "system-ui, -apple-system, Segoe UI, sans-serif",
          position: "relative",
        }}
      >
        {bgImageAbs ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={bgImageAbs}
            alt=""
            style={{
              position: "absolute",
              inset: 0,
              width: "100%",
              height: "100%",
              objectFit: "cover",
              opacity: 0.42,
              filter: "blur(2px) saturate(110%)",
            }}
          />
        ) : null}
        {/* Gradient overlay to keep text legible regardless of media. */}
        <div
          style={{
            position: "absolute",
            inset: 0,
            background:
              "linear-gradient(180deg, rgba(5,3,11,0.40) 0%, rgba(5,3,11,0.78) 75%, rgba(5,3,11,0.94) 100%)",
            display: "flex",
          }}
        />

        <div
          style={{
            position: "relative",
            display: "flex",
            flexDirection: "column",
            justifyContent: "space-between",
            padding: 64,
            width: "100%",
            height: "100%",
          }}
        >
          {/* Top row: branding */}
          <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
            <div
              style={{
                width: 44,
                height: 44,
                borderRadius: 12,
                background: "linear-gradient(135deg, #a855f7, #06b6d4)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontWeight: 800,
                fontSize: 22,
                color: "#0b0418",
              }}
            >
              L
            </div>
            <div style={{ fontSize: 28, fontWeight: 700, letterSpacing: 0.5 }}>Linksy</div>
          </div>

          {/* Caption */}
          <div style={{ display: "flex", flexDirection: "column", gap: 18, maxWidth: 1040 }}>
            <div
              style={{
                fontSize: caption.length > 140 ? 36 : 44,
                lineHeight: 1.22,
                fontWeight: 700,
                textShadow: "0 2px 24px rgba(0,0,0,0.45)",
                display: "flex",
              }}
            >
              {caption || `${heading} shared a post`}
            </div>
            <div style={{ fontSize: 24, color: "rgba(245,237,255,0.78)", display: "flex" }}>
              {stats}
            </div>
          </div>

          {/* Bottom row: author handle */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              fontSize: 24,
              color: "rgba(245,237,255,0.85)",
            }}
          >
            <div style={{ fontWeight: 600 }}>{heading}</div>
            <div style={{ color: "#a855f7", fontWeight: 700 }}>{author}</div>
          </div>
        </div>
      </div>
    ),
    {
      width: CARD_WIDTH,
      height: CARD_HEIGHT,
      headers: {
        // CDN can cache for an hour; crawlers respect this so we don't burn
        // bandwidth re-rendering identical cards for every share scrape.
        "Cache-Control": "public, max-age=300, s-maxage=3600, stale-while-revalidate=86400",
      },
    },
  );
}
