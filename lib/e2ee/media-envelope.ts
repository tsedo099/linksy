"use client";

import { encryptMediaBlob } from "@/lib/e2ee/media";

/**
 * Client helper that handles the dual code-path for sending media:
 *
 *   - In a plain conversation, upload the file as-is via `/api/upload` and
 *     return its URL.
 *   - In an E2EE conversation, encrypt the bytes with a fresh AES-GCM key,
 *     upload the *ciphertext* (the server never sees plaintext), and return
 *     the URL alongside the key/iv that the recipient will need to decrypt.
 *     Caller is responsible for embedding `{ url, key, iv, mime, name }`
 *     inside the E2EE message body — the server stores the URL but never
 *     the decryption key.
 *
 * Always returns an `application/octet-stream` ciphertext for E2EE so the
 * `Content-Type` doesn't leak the original mime to the storage tier. The
 * recipient gets the real mime from the encrypted envelope.
 */

export type UploadedMedia =
  | {
      encrypted: false;
      url: string;
    }
  | {
      encrypted: true;
      url: string;
      keyBase64: string;
      ivBase64: string;
      mime: string;
      filename: string;
    };

export async function uploadMessageMedia(input: {
  file: File;
  conversationE2EE: boolean;
}): Promise<UploadedMedia> {
  if (!input.conversationE2EE) {
    const url = await uploadBlob(input.file, input.file.name);
    return { encrypted: false, url };
  }

  const enc = await encryptMediaBlob(input.file);
  // Strip the original filename + mime from the upload — the server stores
  // opaque ciphertext only. The recipient learns the real mime/name from
  // the encrypted envelope inside the message body.
  const opaqueName = `e2ee-${Date.now()}.bin`;
  const url = await uploadBlob(enc.ciphertext, opaqueName);
  return {
    encrypted: true,
    url,
    keyBase64: enc.keyBase64,
    ivBase64: enc.ivBase64,
    mime: input.file.type || "application/octet-stream",
    filename: input.file.name,
  };
}

async function uploadBlob(blob: Blob, filename: string): Promise<string> {
  const fd = new FormData();
  fd.append("file", blob, filename);
  const res = await fetch("/api/upload", { method: "POST", body: fd, credentials: "include" });
  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as { error?: string } | null;
    throw new Error(body?.error ?? `Upload failed (${res.status}).`);
  }
  const data = (await res.json().catch(() => null)) as { url?: string } | null;
  if (!data?.url) throw new Error("Upload returned no URL.");
  return data.url;
}
