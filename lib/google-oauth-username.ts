import { randomBytes } from "crypto";
import { prisma } from "@/lib/prisma";

const USERNAME_MAX = 20;
const USERNAME_MIN = 3;

function sanitizeUsernamePart(raw: string): string {
  const s = raw
    .toLowerCase()
    .replace(/[^a-z0-9_]/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_|_$/g, "");
  return s.slice(0, USERNAME_MAX);
}

function randomSuffix(len: number): string {
  const alphabet = "abcdefghijklmnopqrstuvwxyz0123456789";
  const bytes = randomBytes(len);
  let out = "";
  for (let i = 0; i < len; i++) {
    out += alphabet[bytes[i]! % alphabet.length];
  }
  return out;
}

/** Builds a valid `username` (3–20 chars, [a-z0-9_]) unique in DB. */
export async function allocateUsernameFromEmail(email: string): Promise<string> {
  const local = email.split("@")[0]?.trim() || "user";
  let base = sanitizeUsernamePart(local);
  if (base.length < USERNAME_MIN) {
    base = (base + "user").slice(0, USERNAME_MAX);
  }
  if (base.length < USERNAME_MIN) {
    base = `user_${randomSuffix(6)}`.slice(0, USERNAME_MAX);
  }

  for (let attempt = 0; attempt < 40; attempt++) {
    const candidate =
      attempt === 0
        ? base.slice(0, USERNAME_MAX)
        : `${base.slice(0, Math.max(USERNAME_MIN, USERNAME_MAX - 5))}_${randomSuffix(5)}`.slice(
            0,
            USERNAME_MAX,
          );

    const taken = await prisma.user.findUnique({
      where: { username: candidate },
      select: { id: true },
    });
    if (!taken) return candidate;
  }

  return `u_${randomSuffix(12)}`.slice(0, USERNAME_MAX);
}
