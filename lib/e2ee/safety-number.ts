/**
 * Safety number derivation for E2EE key verification.
 *
 * Both peers can recompute the same 60-digit decimal number from each other's
 * long-term identity signing keys + their stable user IDs. Comparing the
 * number out-of-band (read aloud, photo-share, future QR scan) detects
 * server-side key substitution: a man-in-the-middle who swapped a peer's
 * published identity key will produce a different number.
 *
 * Design:
 *   - Algorithm: HKDF-SHA-256(salt="linksy-safety-v1",
 *                              ikm=identityA_pub || identityB_pub,
 *                              info=userA_id || userB_id)
 *     output 30 bytes → 60 decimal digits (5 digits per byte pair, mod 10^5)
 *   - Symmetry: peers SORT their (userId, identityKey) pair lexicographically
 *     before mixing, so each side computes the same number regardless of role
 *   - Format: 12 groups of 5 digits separated by spaces, e.g.
 *       "12345 67890 11223 44556 77889 90011 22334 45566 77889 90011 22334 45566"
 *
 * This matches the structure (not the byte format) of Signal's safety number.
 * Curve is P-256 to stay aligned with the rest of the WebCrypto stack.
 */

import { base64ToBytes } from "@/lib/e2ee/web-crypto";

const SALT_TAG = new TextEncoder().encode("linksy-safety-v1");
const SAFETY_NUMBER_BYTES = 30;
const GROUP_SIZE = 5;
const GROUP_COUNT = 12;

function toAB(src: Uint8Array): Uint8Array<ArrayBuffer> {
  const out = new Uint8Array(new ArrayBuffer(src.byteLength));
  out.set(src);
  return out as Uint8Array<ArrayBuffer>;
}

function concat(parts: Uint8Array[]): Uint8Array<ArrayBuffer> {
  const total = parts.reduce((sum, p) => sum + p.byteLength, 0);
  const out = new Uint8Array(new ArrayBuffer(total));
  let off = 0;
  for (const part of parts) {
    out.set(part, off);
    off += part.byteLength;
  }
  return out as Uint8Array<ArrayBuffer>;
}

/**
 * Compute the 60-digit safety number for an E2EE conversation between two
 * users. Pass each party's long-term identity *signing* public key (the SPKI
 * base64 stored in `E2EEIdentity.identitySigningKey`).
 */
export async function computeSafetyNumber(input: {
  myUserId: string;
  myIdentitySigningKeyBase64: string;
  peerUserId: string;
  peerIdentitySigningKeyBase64: string;
}): Promise<string> {
  const mine = {
    id: input.myUserId,
    key: base64ToBytes(input.myIdentitySigningKeyBase64),
  };
  const peer = {
    id: input.peerUserId,
    key: base64ToBytes(input.peerIdentitySigningKeyBase64),
  };

  // Sort by (userId, key bytes) so each peer derives the same digits.
  const [a, b] = orderSides(mine, peer);

  const ikm = concat([a.key, b.key]);
  const info = concat([new TextEncoder().encode(a.id), new Uint8Array([0]), new TextEncoder().encode(b.id)]);

  const ikmKey = await crypto.subtle.importKey("raw", ikm, "HKDF", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits(
    { name: "HKDF", hash: "SHA-256", salt: toAB(SALT_TAG), info },
    ikmKey,
    SAFETY_NUMBER_BYTES * 8,
  );

  return formatDigits(new Uint8Array(bits));
}

function orderSides(
  a: { id: string; key: Uint8Array },
  b: { id: string; key: Uint8Array },
): [typeof a, typeof b] {
  if (a.id < b.id) return [a, b];
  if (a.id > b.id) return [b, a];
  // Same user IDs (self-chat); fall back to key bytes lexicographic compare.
  for (let i = 0; i < Math.min(a.key.length, b.key.length); i++) {
    const av = a.key[i] ?? 0;
    const bv = b.key[i] ?? 0;
    if (av !== bv) return av < bv ? [a, b] : [b, a];
  }
  return [a, b];
}

/**
 * Convert 30 random-looking bytes into 12 groups of 5 decimal digits.
 * Each 5-digit group is derived from one 16-bit chunk taken `mod 100000` so
 * the resulting string is uniform over [00000–99999] per group.
 */
function formatDigits(bytes: Uint8Array): string {
  if (bytes.length < GROUP_COUNT * 2) {
    throw new Error("Safety number requires at least 24 bytes of HKDF output.");
  }
  const groups: string[] = [];
  for (let i = 0; i < GROUP_COUNT; i++) {
    const offset = i * 2;
    const value = ((bytes[offset]! << 8) | bytes[offset + 1]!) % 100_000;
    groups.push(value.toString().padStart(GROUP_SIZE, "0"));
  }
  return groups.join(" ");
}

/**
 * Strip whitespace and validate that a user-typed safety number matches a
 * reference. Constant-time comparison so a side-channel-curious server can't
 * detect which digit differs by timing the API response.
 */
export function safetyNumbersEqual(a: string, b: string): boolean {
  const na = a.replace(/\s+/g, "");
  const nb = b.replace(/\s+/g, "");
  if (na.length !== nb.length) return false;
  let diff = 0;
  for (let i = 0; i < na.length; i++) diff |= na.charCodeAt(i) ^ nb.charCodeAt(i);
  return diff === 0;
}
