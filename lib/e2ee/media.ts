/**
 * Client-side media encryption for E2EE chats. The server only ever sees
 * AES-GCM ciphertext — both the image/video bytes themselves and any
 * filename / mime hint are encrypted.
 *
 * Wire format (the things the sender embeds inside the E2EE message body):
 *   {
 *     url: "/uploads/abc.bin",   // server-side opaque ciphertext URL
 *     key: "<base64 32 bytes>",  // AES-GCM 256 key (one-time per file)
 *     iv:  "<base64 12 bytes>",  // AES-GCM IV
 *     mime: "image/jpeg",        // original mime (recipient renders accordingly)
 *     name: "sunset.jpg"         // original filename (optional)
 *   }
 *
 * The encrypted bytes uploaded to the server include the AES-GCM auth tag
 * appended to the ciphertext (WebCrypto convention) — recipient verifies the
 * tag automatically on decrypt; any modification by the server is detected.
 */

import { base64ToBytes, bytesToBase64, randomBytes } from "@/lib/e2ee/web-crypto";

const AES_GCM = { name: "AES-GCM" as const, length: 256 };
const IV_LENGTH = 12;
const KEY_LENGTH = 32;

function toAB(src: Uint8Array | ArrayBuffer): Uint8Array<ArrayBuffer> {
  const u8 = src instanceof ArrayBuffer ? new Uint8Array(src) : src;
  const out = new Uint8Array(new ArrayBuffer(u8.byteLength));
  out.set(u8);
  return out as Uint8Array<ArrayBuffer>;
}

export type EncryptedMedia = {
  /** Encrypted bytes ready to upload (ciphertext + GCM auth tag). */
  ciphertext: Blob;
  /** Base64-encoded 32-byte AES key, to ship inside the E2EE message body. */
  keyBase64: string;
  /** Base64-encoded 12-byte AES-GCM IV. */
  ivBase64: string;
};

/**
 * Encrypt a blob with a fresh AES-GCM 256 key + IV. The key never travels
 * over a server connection — it's embedded in the (already-encrypted) E2EE
 * message body so only the conversation peer can recover it.
 */
export async function encryptMediaBlob(input: Blob): Promise<EncryptedMedia> {
  const keyBytes = randomBytes(KEY_LENGTH);
  const iv = randomBytes(IV_LENGTH);
  const key = await crypto.subtle.importKey("raw", keyBytes, AES_GCM, false, ["encrypt"]);

  const plaintext = toAB(new Uint8Array(await input.arrayBuffer()));
  const ct = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, plaintext);

  return {
    ciphertext: new Blob([new Uint8Array(ct)], { type: "application/octet-stream" }),
    keyBase64: bytesToBase64(keyBytes),
    ivBase64: bytesToBase64(iv),
  };
}

/**
 * Fetch and decrypt an E2EE media URL. Throws if the ciphertext was tampered
 * with (AES-GCM auth tag check fails inside `decrypt`).
 */
export async function decryptMediaFromUrl(input: {
  url: string;
  keyBase64: string;
  ivBase64: string;
  outputMime?: string;
}): Promise<Blob> {
  const res = await fetch(input.url, { credentials: "include" });
  if (!res.ok) throw new Error(`Could not fetch encrypted media (${res.status}).`);
  const ct = new Uint8Array(await res.arrayBuffer());
  return decryptMediaBytes({
    ciphertext: ct,
    keyBase64: input.keyBase64,
    ivBase64: input.ivBase64,
    outputMime: input.outputMime,
  });
}

/** Variant for callers who already have the ciphertext in memory (tests, etc.). */
export async function decryptMediaBytes(input: {
  ciphertext: Uint8Array;
  keyBase64: string;
  ivBase64: string;
  outputMime?: string;
}): Promise<Blob> {
  const keyBytes = base64ToBytes(input.keyBase64);
  if (keyBytes.byteLength !== KEY_LENGTH) {
    throw new Error("E2EE media key must be 32 bytes.");
  }
  const iv = base64ToBytes(input.ivBase64);
  if (iv.byteLength !== IV_LENGTH) {
    throw new Error("E2EE media IV must be 12 bytes.");
  }
  const key = await crypto.subtle.importKey("raw", keyBytes, AES_GCM, false, ["decrypt"]);
  const pt = await crypto.subtle.decrypt({ name: "AES-GCM", iv }, key, toAB(input.ciphertext));
  return new Blob([new Uint8Array(pt)], { type: input.outputMime ?? "application/octet-stream" });
}
