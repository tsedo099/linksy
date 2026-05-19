import { describe, expect, it } from "vitest";
import { decryptMediaBytes, encryptMediaBlob } from "@/lib/e2ee/media";

const TE = new TextEncoder();
const TD = new TextDecoder();

describe("e2ee media", () => {
  it("encrypt → decrypt roundtrips a small payload", async () => {
    const plaintext = "hello pictures";
    const blob = new Blob([TE.encode(plaintext)], { type: "text/plain" });
    const enc = await encryptMediaBlob(blob);

    expect(enc.keyBase64).toMatch(/^[A-Za-z0-9+/=]+$/);
    expect(enc.ivBase64).toMatch(/^[A-Za-z0-9+/=]+$/);

    const ct = new Uint8Array(await enc.ciphertext.arrayBuffer());
    const dec = await decryptMediaBytes({
      ciphertext: ct,
      keyBase64: enc.keyBase64,
      ivBase64: enc.ivBase64,
      outputMime: "text/plain",
    });
    const text = TD.decode(new Uint8Array(await dec.arrayBuffer()));
    expect(text).toBe(plaintext);
  });

  it("ciphertext is non-identifiable to the server", async () => {
    const blob = new Blob([TE.encode("same plaintext")], { type: "text/plain" });
    const a = await encryptMediaBlob(blob);
    const b = await encryptMediaBlob(blob);
    const bytesA = new Uint8Array(await a.ciphertext.arrayBuffer());
    const bytesB = new Uint8Array(await b.ciphertext.arrayBuffer());
    // Fresh IV per call ⇒ identical plaintext, different ciphertexts.
    expect(bytesToHex(bytesA)).not.toBe(bytesToHex(bytesB));
  });

  it("rejects ciphertext tampered with by even one byte", async () => {
    const blob = new Blob([TE.encode("integrity-protected")], { type: "text/plain" });
    const enc = await encryptMediaBlob(blob);
    const ct = new Uint8Array(await enc.ciphertext.arrayBuffer());
    ct[0] = ((ct[0] ?? 0) ^ 0x01);
    await expect(
      decryptMediaBytes({ ciphertext: ct, keyBase64: enc.keyBase64, ivBase64: enc.ivBase64 }),
    ).rejects.toBeDefined();
  });

  it("rejects mismatched key length", async () => {
    const blob = new Blob([TE.encode("x")]);
    const enc = await encryptMediaBlob(blob);
    const ct = new Uint8Array(await enc.ciphertext.arrayBuffer());
    await expect(
      decryptMediaBytes({ ciphertext: ct, keyBase64: "AAAA", ivBase64: enc.ivBase64 }),
    ).rejects.toThrow(/32 bytes/);
  });
});

function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}
