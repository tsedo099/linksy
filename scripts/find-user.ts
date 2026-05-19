/**
 * One-shot helper: print the user record for a given username or email so the
 * operator can copy the ID into env vars (e.g. `SAFETY_ADMIN_USER_IDS`).
 *
 *   npx tsx scripts/find-user.ts tsedo
 *   npx tsx scripts/find-user.ts admin@example.com
 */
import { prisma } from "../lib/prisma";

async function main() {
  const query = process.argv[2]?.trim();
  if (!query) {
    console.error("Usage: npx tsx scripts/find-user.ts <username-or-email>");
    process.exit(1);
  }

  const user = await prisma.user.findFirst({
    where: {
      OR: [
        { username: query },
        { email: query.toLowerCase() },
      ],
    },
    select: {
      id: true,
      username: true,
      email: true,
      displayName: true,
      createdAt: true,
      emailVerified: true,
      twoFactorEnabled: true,
    },
  });

  if (!user) {
    console.error(`No user found for "${query}".`);
    process.exit(2);
  }

  console.log(JSON.stringify(user, null, 2));
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => {
    void prisma.$disconnect();
  });
