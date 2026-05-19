import { z } from "zod";
import { createHash } from "node:crypto";

/** Min length for new passwords (register, reset, change). */
export const NEW_PASSWORD_MIN_LENGTH = 8;
export const NEW_PASSWORD_MAX_LENGTH = 128;

/**
 * At least: one lowercase, one uppercase, one digit, one non-alphanumeric.
 * Length enforced separately (min 8).
 */
const HAS_MIXED_CLASSES =
  /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[^A-Za-z0-9]).+$/;

/** Curated high-frequency / breach lists (lowercase), plus generated weak patterns. */
function buildCommonPasswordLowerSet(): ReadonlySet<string> {
  const s = new Set<string>();

  const inline = `
password 123456 12345678 qwerty 123456789 12345 1234 111111 1234567 dragon
123123 baseball iloveyou trustno1 1234567890 sunshine master 123321 welcome
shadow ashley football jesus michael ninja mustang password1 123qwe admin
monkey letmein abc123 654321 password123 qwerty123 solo princess welcome1
zaq1zaq1 starwars passw0rd hello login access master1 qazwsx 1q2w3e4r
superman harley batman andrew tigger shadow1 jordan jennifer hunter 2000
thomas robert daniel matthew anthony donald charles james william richard
linksy linky diploom diploma summer winter spring football1 baseball1
liverpool chelsea arsenal barcelona ronaldo messi letmein1 trustno1!
monkey1 dragon1 master123 pass123 test123 admin123 root123 user123
guest welcome123 password12 Passw0rd P@ssw0rd Password1 Qwerty1
iloveyou1 sunshine1 princess1 football123 baseball123
abc12345 password! Pa$$w0rd admin1234 root toor pass 1234abcd
qwertyuiop asdfgh zxcvbn 1qaz2wsx 1q2w3e4r5t !@#$%^&*() naver google
facebook instagram twitter snapchat discord reddit amazon netflix
`;

  for (const line of inline.split(/\s+/)) {
    const t = line.trim().toLowerCase();
    if (t.length >= 2) s.add(t);
  }

  const years = [
    2000, 2001, 2002, 2003, 2004, 2005, 2006, 2007, 2008, 2009, 2010, 2011, 2012,
    2013, 2014, 2015, 2016, 2017, 2018, 2019, 2020, 2021, 2022, 2023, 2024, 2025,
    2026,
  ];
  const bases = [
    "password",
    "pass",
    "passwort",
    "admin",
    "root",
    "user",
    "guest",
    "welcome",
    "login",
    "qwerty",
    "letmein",
    "summer",
    "winter",
    "spring",
    "monkey",
    "dragon",
    "master",
    "shadow",
    "football",
    "baseball",
    "linkedin",
    "linksy",
  ];
  for (const y of years) {
    for (const b of bases) {
      s.add(`${b}${y}`.toLowerCase());
      s.add(`${b}!${y}`.toLowerCase());
      s.add(`${b}@${y}`.toLowerCase());
    }
  }

  /** 8-digit-only strings ( birthdays / PIN-style ). */
  for (let i = 0; i <= 9_999_999; i += 137_137) {
    const p = String(i).padStart(8, "0");
    if (p.length >= 8) s.add(p);
  }
  /** Sequential digits length 8–10 starting at low offsets */
  for (let start = 0; start < 300; start++) {
    let acc = "";
    for (let d = start; d < start + 10; d++) acc += String(d % 10);
    s.add(acc);
  }

  return s;
}

const COMMON_LOWER = buildCommonPasswordLowerSet();

export function isCommonPlainPassword(password: string): boolean {
  const p = password.trim().toLowerCase();
  if (p.length === 0) return true;
  if (COMMON_LOWER.has(p)) return true;
  if (/^(.)\1+$/.test(password)) return true;
  return false;
}

export const newPasswordSchema = z
  .string()
  .min(NEW_PASSWORD_MIN_LENGTH, `Use at least ${NEW_PASSWORD_MIN_LENGTH} characters.`)
  .max(NEW_PASSWORD_MAX_LENGTH)
  .regex(
    HAS_MIXED_CLASSES,
    "Use upper & lower case letters, a number, and a symbol (e.g. !@#$%).",
  )
  .refine((pwd) => !isCommonPlainPassword(pwd), {
    message: "This password is too common. Pick a stronger unique password.",
  });

/** Client-side hint (register / reset / change password). */
export function newPasswordIssue(password: string): string | undefined {
  const r = newPasswordSchema.safeParse(password);
  if (r.success) return undefined;
  return r.error.issues[0]?.message;
}

export type PwnedPasswordCheck =
  | { ok: true; pwned: false }
  | { ok: true; pwned: true; count: number }
  | { ok: false; error: string };

const HIBP_RANGE_ENDPOINT = "https://api.pwnedpasswords.com/range";
const HIBP_TIMEOUT_MS = 2500;

function sha1Upper(value: string) {
  return createHash("sha1").update(value, "utf8").digest("hex").toUpperCase();
}

/**
 * HIBP k-anonymity check. Only the first 5 SHA-1 chars leave the server; the
 * raw password and full hash are never sent to HIBP.
 */
export async function checkPwnedPassword(password: string): Promise<PwnedPasswordCheck> {
  const hash = sha1Upper(password);
  const prefix = hash.slice(0, 5);
  const suffix = hash.slice(5);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), HIBP_TIMEOUT_MS);

  try {
    const res = await fetch(`${HIBP_RANGE_ENDPOINT}/${prefix}`, {
      headers: {
        "Add-Padding": "true",
        "User-Agent": "linksy-password-policy",
      },
      signal: controller.signal,
      cache: "no-store",
    });
    if (!res.ok) {
      return { ok: false, error: `HIBP range API returned ${res.status}.` };
    }

    const body = await res.text();
    for (const line of body.split(/\r?\n/)) {
      const [candidateSuffix, rawCount] = line.trim().split(":");
      if (candidateSuffix?.toUpperCase() !== suffix) continue;
      const count = Number.parseInt(rawCount ?? "0", 10);
      return { ok: true, pwned: true, count: Number.isFinite(count) ? count : 1 };
    }

    return { ok: true, pwned: false };
  } catch (error) {
    const message = error instanceof Error ? error.message : "HIBP range API unavailable.";
    return { ok: false, error: message };
  } finally {
    clearTimeout(timeout);
  }
}

export async function pwnedPasswordIssue(password: string): Promise<string | undefined> {
  const result = await checkPwnedPassword(password);
  if (result.ok && result.pwned) {
    return "This password has appeared in a data breach. Pick a different password.";
  }

  // Default fail-open keeps signup/reset available during HIBP downtime. Set
  // HIBP_PASSWORD_CHECK=strict to fail closed in high-security deployments.
  if (!result.ok && process.env.HIBP_PASSWORD_CHECK === "strict") {
    return "Could not verify password safety. Please try again.";
  }

  return undefined;
}

/**
 * Severity buckets for legacy-password health checks run on a successful
 * login. Used by the login route to flag accounts that signed up before
 * the current password policy was enforced (e.g. the seed accounts using
 * `password123`).
 *
 *   - `ok`       — meets current policy and not in HIBP
 *   - `weak`     — fails policy (too short, missing classes, in common list)
 *   - `pwned`    — appears in HIBP breach data (urgent — credential stuffing risk)
 *
 * The login response surfaces the result via `passwordHealth` so the client
 * can render an in-app rotate-password banner without blocking sign-in.
 */
export type PasswordHealth =
  | { severity: "ok" }
  | { severity: "weak"; reason: "too_short" | "missing_classes" | "common" }
  | { severity: "pwned"; count: number };

/**
 * Best-effort assessment of a *plaintext* password against the current policy
 * + HIBP. Only ever called after `bcrypt.compare` succeeded — i.e. the user
 * proved knowledge of this password — so leaking it to HIBP via k-anonymity
 * is fine. Never blocks login.
 */
export async function assessPasswordHealth(password: string): Promise<PasswordHealth> {
  if (password.length < NEW_PASSWORD_MIN_LENGTH) {
    return { severity: "weak", reason: "too_short" };
  }
  if (!HAS_MIXED_CLASSES.test(password)) {
    return { severity: "weak", reason: "missing_classes" };
  }
  if (isCommonPlainPassword(password)) {
    return { severity: "weak", reason: "common" };
  }

  // HIBP is best-effort. If the network probe times out we don't pretend the
  // password is bad — login already succeeded; the rotate banner is a
  // soft nudge, not a security gate.
  const hibp = await checkPwnedPassword(password);
  if (hibp.ok && hibp.pwned) {
    return { severity: "pwned", count: hibp.count };
  }

  return { severity: "ok" };
}
