import { NextRequest, NextResponse } from "next/server";
import { getUser } from "@/lib/auth";
import { parseRequestJson } from "@/lib/request-json";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { normalizeEmailForContactSync, hashContactIdentifier } from "@/lib/contact-sync-hash";

const contactSyncSchema = z.object({
  emails: z.array(z.string().email()).max(500),
});

// POST /api/user/contact-sync — store hashed emails to get "friend joined" when they register
export async function POST(req: NextRequest) {
  const me = await getUser(req);
  if (!me) return NextResponse.json({ error: "Not authenticated." }, { status: 401 });

  const parsed = await parseRequestJson(req, contactSyncSchema);
  if (!parsed.ok) return parsed.response;
  const emails = parsed.data.emails;

  const seen = new Set<string>();
  const rows: { ownerUserId: string; identifierHash: string }[] = [];
  for (const raw of emails) {
    const normalized = normalizeEmailForContactSync(raw);
    const hash = hashContactIdentifier(normalized);
    if (seen.has(hash)) continue;
    seen.add(hash);
    rows.push({ ownerUserId: me.userId, identifierHash: hash });
  }

  if (rows.length === 0) {
    return NextResponse.json({ synced: 0 });
  }

  await prisma.contactHash.createMany({
    data: rows,
    skipDuplicates: true,
  });

  return NextResponse.json({ synced: rows.length });
}
