import { NextRequest, NextResponse } from "next/server";
import { computeTrendingSounds } from "@/lib/trending-sounds";
import { withMetrics } from "@/lib/with-metrics";

export const runtime = "nodejs";

/**
 * GET /api/trending/sounds
 *
 * Returns up to 50 most-used sounds across PUBLIC stories created in the last
 * `?hours=` (default 168 = 7 days, max 720 = 30 days). Sorted by unique-author
 * count primarily — resists a single spammer dominating the list.
 *
 * Query params:
 *   - `hours`: lookback window in hours (1..720). Default 168.
 *   - `limit`: page size (1..100). Default 50.
 *
 * Response:
 *   { sounds: TrendingSound[] }
 *
 * Auth: public. The list is derived solely from PUBLIC-audience stories so
 * unauthenticated visitors (search bots, web preview) can see the same view
 * as a logged-out home page.
 */
export const GET = withMetrics("/api/trending/sounds", async (req: NextRequest) => {
  const url = req.nextUrl;
  const hours = parseInt(url.searchParams.get("hours") ?? "", 10);
  const limit = parseInt(url.searchParams.get("limit") ?? "", 10);

  const sounds = await computeTrendingSounds({
    lookbackHours: Number.isFinite(hours) ? hours : undefined,
    limit: Number.isFinite(limit) ? limit : undefined,
  });

  return NextResponse.json(
    { sounds },
    {
      // Cache-fresh for one minute at the edge; trending data is OK to
      // serve slightly stale and the scan is the expensive part.
      headers: {
        "cache-control": "public, s-maxage=60, stale-while-revalidate=300",
      },
    },
  );
});
