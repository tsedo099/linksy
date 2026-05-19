import { describe, expect, it } from "vitest";
import { computeSafetyNumber, safetyNumbersEqual } from "@/lib/e2ee/safety-number";
import { bytesToBase64 } from "@/lib/e2ee/web-crypto";

const ECDSA_PARAMS = { name: "ECDSA", namedCurve: "P-256" } as const;

async function fakeIdentityKey(): Promise<string> {
  const pair = (await crypto.subtle.generateKey(ECDSA_PARAMS, true, ["sign", "verify"])) as CryptoKeyPair;
  const spki = await crypto.subtle.exportKey("spki", pair.publicKey);
  return bytesToBase64(spki);
}

describe("safety-number", () => {
  it("produces 12 groups of 5 digits", async () => {
    const num = await computeSafetyNumber({
      myUserId: "u_alice",
      myIdentitySigningKeyBase64: await fakeIdentityKey(),
      peerUserId: "u_bob",
      peerIdentitySigningKeyBase64: await fakeIdentityKey(),
    });
    const groups = num.split(" ");
    expect(groups).toHaveLength(12);
    for (const g of groups) {
      expect(g).toMatch(/^\d{5}$/);
    }
  });

  it("is identical when peers compute from opposite sides (symmetry)", async () => {
    const aliceId = "u_alice";
    const bobId = "u_bob";
    const aliceKey = await fakeIdentityKey();
    const bobKey = await fakeIdentityKey();

    const fromAlice = await computeSafetyNumber({
      myUserId: aliceId,
      myIdentitySigningKeyBase64: aliceKey,
      peerUserId: bobId,
      peerIdentitySigningKeyBase64: bobKey,
    });
    const fromBob = await computeSafetyNumber({
      myUserId: bobId,
      myIdentitySigningKeyBase64: bobKey,
      peerUserId: aliceId,
      peerIdentitySigningKeyBase64: aliceKey,
    });

    expect(fromAlice).toBe(fromBob);
  });

  it("changes when either identity key changes (MITM detection)", async () => {
    const aliceId = "u_alice";
    const bobId = "u_bob";
    const aliceKey = await fakeIdentityKey();
    const bobKey = await fakeIdentityKey();
    const attackerKey = await fakeIdentityKey();

    const honest = await computeSafetyNumber({
      myUserId: aliceId,
      myIdentitySigningKeyBase64: aliceKey,
      peerUserId: bobId,
      peerIdentitySigningKeyBase64: bobKey,
    });
    const mitm = await computeSafetyNumber({
      myUserId: aliceId,
      myIdentitySigningKeyBase64: aliceKey,
      peerUserId: bobId,
      peerIdentitySigningKeyBase64: attackerKey,
    });
    expect(honest).not.toBe(mitm);
  });

  it("safetyNumbersEqual ignores whitespace and is constant-time-shape", () => {
    expect(safetyNumbersEqual("12345 67890", "12345 67890")).toBe(true);
    expect(safetyNumbersEqual("12345 67890", "1234567890")).toBe(true);
    expect(safetyNumbersEqual(" 12345  67890 ", "1234567890")).toBe(true);
    expect(safetyNumbersEqual("12345 67890", "12345 67891")).toBe(false);
    expect(safetyNumbersEqual("12345 67890", "12345 678901")).toBe(false);
  });
});
