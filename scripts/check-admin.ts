/**
 * Diagnostic: confirm the env-based admin gate is wired correctly.
 *
 *   npx tsx --env-file=.env scripts/check-admin.ts [username]
 *
 * Defaults to `tsedo` if no username given.
 */
import { prisma } from "../lib/prisma";

/** Inline copy of lib/admin-auth.ts (which can't be imported here because it
 *  uses `server-only`). Keep identical to the runtime helper. */
function isSafetyAdmin(userId: string): boolean {
  const raw = process.env.SAFETY_ADMIN_USER_IDS?.trim();
  if (!raw) return false;
  const allowed = raw.split(",").map((s) => s.trim()).filter(Boolean);
  return allowed.includes(userId);
}

async function main() {
  const username = (process.argv[2] ?? "tsedo").trim();

  const user = await prisma.user.findFirst({
    where: { username },
    select: { id: true, username: true, email: true },
  });

  console.log("---- ENV ----");
  console.log("SAFETY_ADMIN_USER_IDS:", process.env.SAFETY_ADMIN_USER_IDS ?? "(unset)");
  console.log("");
  console.log("---- User ----");
  console.log(user ?? "(NOT FOUND in DB)");
  console.log("");
  if (user) {
    console.log("---- Verdict ----");
    console.log(`isSafetyAdmin("${user.id}") =>`, isSafetyAdmin(user.id));
  }
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => {
    void prisma.$disconnect();
  });
