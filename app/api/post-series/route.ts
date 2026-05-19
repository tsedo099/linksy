import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getUser } from "@/lib/auth";
import { parseRequestJson } from "@/lib/request-json";
import { postSeriesCreateSchema } from "@/lib/schemas/api-bodies";
import { sanitizePlainText } from "@/lib/sanitize-html";

// GET /api/post-series — current user's albums / series
export async function GET(req: NextRequest) {
  const user = await getUser(req);
  if (!user) return NextResponse.json({ error: "Not authenticated." }, { status: 401 });

  const series = await prisma.postSeries.findMany({
    where: { userId: user.userId },
    orderBy: { updatedAt: "desc" },
    select: {
      id: true,
      title: true,
      createdAt: true,
      updatedAt: true,
      _count: { select: { posts: true } },
    },
  });

  return NextResponse.json({ series });
}

// POST /api/post-series — create an empty series (posts attach via /api/posts)
export async function POST(req: NextRequest) {
  const user = await getUser(req);
  if (!user) return NextResponse.json({ error: "Not authenticated." }, { status: 401 });

  const parsed = await parseRequestJson(req, postSeriesCreateSchema);
  if (!parsed.ok) return parsed.response;

  const titleSafe = sanitizePlainText(parsed.data.title.trim()) || "";
  if (!titleSafe) {
    return NextResponse.json({ error: "Title is required." }, { status: 400 });
  }

  const row = await prisma.postSeries.create({
    data: { userId: user.userId, title: titleSafe.slice(0, 200) },
    select: { id: true, title: true, createdAt: true },
  });

  return NextResponse.json({ series: row }, { status: 201 });
}
