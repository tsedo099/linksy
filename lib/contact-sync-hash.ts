import { createHash } from "crypto";

/**
 * Normalized email before hashing (lowercase, trimmed).
 */
export function normalizeEmailForContactSync(email: string): string {
  return email.trim().toLowerCase();
}

/**
 * Stable hash for contact-matching. Uses CONTACT_SYNC_PEPPER when set.
 */
export function hashContactIdentifier(email: string): string {
  const normalized = normalizeEmailForContactSync(email);
  const pepper = process.env.CONTACT_SYNC_PEPPER?.trim() || "linksy-contact-sync";
  return createHash("sha256").update(`${normalized}:${pepper}`, "utf8").digest("hex");
}
