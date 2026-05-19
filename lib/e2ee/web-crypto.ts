"use client";

/**
 * Thin wrappers around the browser's `crypto.subtle` API for the E2EE stack.
 * Centralises the algorithm parameters so the rest of the lib never spells
 * curves / lengths / hash names twice.
 *
 * Suite:
 *   - Identity signing key:   ECDSA P-256
 *   - Identity exchange key:  ECDH P-256
 *   - Signed prekey:          ECDH P-256
 *   - One-time prekey:        ECDH P-256
 *   - KDF:                    HKDF-SHA-256
 *   - AEAD:                   AES-GCM-256, 96-bit IV (random per message)
 */

const ECDH_PARAMS = { name: "ECDH", namedCurve: "P-256" } as const;
const ECDSA_PARAMS = { name: "ECDSA", namedCurve: "P-256" } as const;
const ECDSA_SIGN = { name: "ECDSA", hash: { name: "SHA-256" } } as const;
const HKDF_PARAMS = { name: "HKDF" } as const;
const AES_GCM_LEN = 256;
const AES_GCM_NAME = "AES-GCM" as const;
const ROOT_KEY_INFO = new TextEncoder().encode("linksy-x3dh-root-v1");

function subtle(): SubtleCrypto {
  if (typeof crypto === "undefined" || !crypto.subtle) {
    throw new Error("Web Crypto API is not available in this environment.");
  }
  return crypto.subtle;
}

/** Always returns an `ArrayBuffer`-backed Uint8Array — the type Web Crypto wants. */
export function randomBytes(byteLength: number): Uint8Array<ArrayBuffer> {
  const buf = new Uint8Array(new ArrayBuffer(byteLength));
  crypto.getRandomValues(buf);
  return buf;
}

// ---------- base64url helpers ----------------------------------------------

export function bytesToBase64(bytes: ArrayBuffer | ArrayBufferView): string {
  const u8 = bytes instanceof ArrayBuffer
    ? new Uint8Array(bytes)
    : new Uint8Array(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let binary = "";
  for (let i = 0; i < u8.length; i++) binary += String.fromCharCode(u8[i] ?? 0);
  return btoa(binary);
}

export function base64ToBytes(base64: string): Uint8Array<ArrayBuffer> {
  const binary = atob(base64);
  const out = new Uint8Array(new ArrayBuffer(binary.length));
  for (let i = 0; i < binary.length; i++) out[i] = binary.charCodeAt(i);
  return out;
}

// ---------- key generation -------------------------------------------------

export function generateExchangeKeyPair(): Promise<CryptoKeyPair> {
  return subtle().generateKey(ECDH_PARAMS, true, ["deriveBits"]) as Promise<CryptoKeyPair>;
}

export function generateSigningKeyPair(): Promise<CryptoKeyPair> {
  return subtle().generateKey(ECDSA_PARAMS, true, ["sign", "verify"]) as Promise<CryptoKeyPair>;
}

// ---------- import / export ------------------------------------------------

export async function exportPublicKey(key: CryptoKey): Promise<string> {
  const spki = await subtle().exportKey("spki", key);
  return bytesToBase64(spki);
}

export async function importExchangePublicKey(base64: string): Promise<CryptoKey> {
  return await subtle().importKey("spki", base64ToBytes(base64), ECDH_PARAMS, true, []);
}

export async function importSigningPublicKey(base64: string): Promise<CryptoKey> {
  return await subtle().importKey("spki", base64ToBytes(base64), ECDSA_PARAMS, true, ["verify"]);
}

// ---------- signing --------------------------------------------------------

export async function signWithIdentity(
  signingPrivate: CryptoKey,
  message: Uint8Array<ArrayBuffer>,
): Promise<string> {
  const sig = await subtle().sign(ECDSA_SIGN, signingPrivate, message);
  return bytesToBase64(sig);
}

export async function verifySignature(
  signingPublic: CryptoKey,
  signature: string,
  message: Uint8Array<ArrayBuffer>,
): Promise<boolean> {
  return await subtle().verify(ECDSA_SIGN, signingPublic, base64ToBytes(signature), message);
}

// ---------- ECDH derive ----------------------------------------------------

/** Raw 256-bit ECDH shared secret (32 bytes). */
export async function deriveSharedBits(
  privateKey: CryptoKey,
  publicKey: CryptoKey,
): Promise<Uint8Array<ArrayBuffer>> {
  const bits = await subtle().deriveBits({ name: "ECDH", public: publicKey }, privateKey, 256);
  return new Uint8Array(bits);
}

// ---------- HKDF -----------------------------------------------------------

/**
 * HKDF-SHA-256 to derive an AES-GCM 256 root key from `inputKeyMaterial`. Salt
 * defaults to a zero-filled 32 bytes (X3DH spec) and `info` is the root-key
 * domain separation tag.
 */
export async function deriveRootKey(
  inputKeyMaterial: Uint8Array<ArrayBuffer>,
  salt: Uint8Array<ArrayBuffer> = new Uint8Array(new ArrayBuffer(32)),
): Promise<CryptoKey> {
  const hkdfKey = await subtle().importKey("raw", inputKeyMaterial, HKDF_PARAMS, false, ["deriveKey"]);
  return await subtle().deriveKey(
    { name: "HKDF", hash: "SHA-256", salt, info: ROOT_KEY_INFO },
    hkdfKey,
    { name: AES_GCM_NAME, length: AES_GCM_LEN },
    /* extractable */ true,
    ["encrypt", "decrypt"],
  );
}

export async function importRootKeyRaw(bytes: Uint8Array<ArrayBuffer>): Promise<CryptoKey> {
  return await subtle().importKey(
    "raw",
    bytes,
    { name: AES_GCM_NAME, length: AES_GCM_LEN },
    true,
    ["encrypt", "decrypt"],
  );
}

export async function exportRootKeyRaw(key: CryptoKey): Promise<Uint8Array<ArrayBuffer>> {
  const raw = await subtle().exportKey("raw", key);
  return new Uint8Array(raw);
}

// ---------- AES-GCM --------------------------------------------------------

const IV_LENGTH = 12; // 96 bits — recommended for AES-GCM

export type AesGcmEnvelope = {
  /** Base64 96-bit IV. */
  iv: string;
  /** Base64 ciphertext+auth-tag. */
  ct: string;
};

export async function aesEncrypt(
  key: CryptoKey,
  plaintext: Uint8Array<ArrayBuffer>,
  associatedData?: Uint8Array<ArrayBuffer>,
): Promise<AesGcmEnvelope> {
  const iv = randomBytes(IV_LENGTH);
  const ct = await subtle().encrypt(
    { name: AES_GCM_NAME, iv, additionalData: associatedData },
    key,
    plaintext,
  );
  return { iv: bytesToBase64(iv), ct: bytesToBase64(ct) };
}

export async function aesDecrypt(
  key: CryptoKey,
  envelope: AesGcmEnvelope,
  associatedData?: Uint8Array<ArrayBuffer>,
): Promise<Uint8Array<ArrayBuffer>> {
  const plaintext = await subtle().decrypt(
    { name: AES_GCM_NAME, iv: base64ToBytes(envelope.iv), additionalData: associatedData },
    key,
    base64ToBytes(envelope.ct),
  );
  return new Uint8Array(plaintext);
}
