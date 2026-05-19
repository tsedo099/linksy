import { randomBytes } from "crypto";

const BACKUP_CODE_LENGTH = 10;
const BACKUP_CODE_COUNT = 8;
const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

function randomBackupCode() {
  const bytes = randomBytes(BACKUP_CODE_LENGTH);
  let value = "";
  for (let index = 0; index < BACKUP_CODE_LENGTH; index++) {
    value += CODE_ALPHABET[(bytes[index] ?? 0) % CODE_ALPHABET.length] ?? "";
  }
  return `${value.slice(0, 5)}-${value.slice(5)}`;
}

export function generateBackupCodes() {
  const set = new Set<string>();
  while (set.size < BACKUP_CODE_COUNT) {
    set.add(randomBackupCode());
  }
  return Array.from(set);
}

export function normalizeBackupCode(value: string) {
  return value.trim().replace(/\s+/g, "").replace(/-/g, "").toUpperCase();
}

export function isBackupCode(value: string) {
  return /^[A-Z2-9]{10}$/.test(normalizeBackupCode(value));
}
