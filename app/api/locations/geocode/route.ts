import { NextRequest, NextResponse } from "next/server";
import { getUser } from "@/lib/auth";

/** Photon (OpenStreetMap) — no API key; proxied so the client stays same-origin. */
const PHOTON_SEARCH = "https://photon.komoot.io/api/";

type PhotonFeature = {
  properties?: Record<string, string | number | undefined>;
};

function formatPhotonLabel(p: Record<string, string | number | undefined>): string {
  const str = (k: string) => {
    const v = p[k];
    return typeof v === "string" && v.trim() ? v.trim() : "";
  };
  const name = str("name");
  const street = str("street");
  const city = str("city") || str("town") || str("village") || str("district");
  const state = str("state");
  const country = str("country");
  const localityFirst = name || street || city;
  const parts = [
    localityFirst,
    city && city !== localityFirst ? city : "",
    state,
    country,
  ].filter(Boolean);
  const unique = [...new Set(parts.map((x) => x.trim()).filter(Boolean))];
  return unique.join(", ");
}

export async function GET(req: NextRequest) {
  const me = await getUser(req);
  if (!me) return NextResponse.json({ error: "Not authenticated." }, { status: 401 });

  const q = req.nextUrl.searchParams.get("q")?.trim() ?? "";
  if (q.length < 2) {
    return NextResponse.json({ suggestions: [] as { label: string }[] });
  }

  try {
    const url = new URL(PHOTON_SEARCH);
    url.searchParams.set("q", q);
    url.searchParams.set("limit", "12");
    url.searchParams.set("lang", "en");

    const res = await fetch(url.toString(), {
      headers: { Accept: "application/json" },
      signal: AbortSignal.timeout(10_000),
    });

    if (!res.ok) {
      return NextResponse.json({ suggestions: [] });
    }

    const data = (await res.json()) as { features?: PhotonFeature[] };
    const features = data.features ?? [];

    const suggestions = features
      .map((f) => {
        const label = formatPhotonLabel(f.properties ?? {});
        return { label };
      })
      .filter((s) => s.label.length > 0 && s.label.length <= 200);

    return NextResponse.json({ suggestions });
  } catch {
    return NextResponse.json({ suggestions: [] });
  }
}
