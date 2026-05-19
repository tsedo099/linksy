/**
 * One-shot helper: promote every user listed in `SAFETY_ADMIN_USER_IDS` to
 * `role = ADMIN`. Run AFTER applying the `user_role` migration. Idempotent —
 * already-ADMIN rows are left alone.
 *
 *   npx tsx --env-file=.env scripts/backfill-admin-role.ts
 *
 * The env-based check stays as a fallback in `lib/admin-auth.ts` until you
 * remove `SAFETY_ADMIN_USER_IDS` from production env vars.
 */
import { prisma } from "../lib/prisma";

async function main() {
  const raw = process.env.SAFETY_ADMIN_USER_IDS?.trim() ?? "";
  if (!raw) {
    console.error("SAFETY_ADMIN_USER_IDS is empty — nothing to backfill.");
    process.exit(1);
  }
  const ids = raw.split(",").map((s) => s.trim()).filter(Boolean);
  if (ids.length === 0) {
    console.error("SAFETY_ADMIN_USER_IDS parsed to zero IDs.");
    process.exit(1);
  }

  const before = await prisma.user.findMany({
    where: { id: { in: ids } },
    select: { id: true, username: true, role: true },
  });
  console.log("Before:");
  for (const u of before) console.log(`  @${u.username} (${u.id}) → role=${u.role}`);

  const result = await prisma.user.updateMany({
    where: { id: { in: ids }, NOT: { role: "ADMIN" } },
    data: { role: "ADMIN" },
  });
  console.log(`\nPromoted ${result.count} user(s) to ADMIN.`);

  const after = await prisma.user.findMany({
    where: { id: { in: ids } },
    select: { id: true, username: true, role: true },
  });
  console.log("\nAfter:");
  for (const u of after) console.log(`  @${u.username} (${u.id}) → role=${u.role}`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => {
    void prisma.$disconnect();
  });
