import { describe, expect, it } from "vitest";
import {
  initializeSender,
  initializeReceiver,
  ratchetEncryptString,
  ratchetDecryptString,
  RATCHET_SUITE,
  type RatchetState,
} from "@/lib/e2ee/double-ratchet";
import { bytesToBase64 } from "@/lib/e2ee/web-crypto";

const ECDH_PARAMS = { name: "ECDH", namedCurve: "P-256" } as const;

async function freshDhPair() {
  const pair = (await crypto.subtle.generateKey(ECDH_PARAMS, true, ["deriveBits"])) as CryptoKeyPair;
  const priv = bytesToBase64(await crypto.subtle.exportKey("pkcs8", pair.privateKey));
  const pub = bytesToBase64(await crypto.subtle.exportKey("spki", pair.publicKey));
  return { priv, pub };
}

async function bootstrap() {
  // Pretend Alice and Bob completed X3DH and derived a shared 32-byte root key.
  const rk = new Uint8Array(32);
  crypto.getRandomValues(rk);
  // Bob publishes his signed-pre-key as the receiver's initial dhSend.
  const bobDh = await freshDhPair();
  const alice = await initializeSender({
    initialRootKey: rk,
    peerDhPublicSpkiBase64: bobDh.pub,
  });
  const bob = await initializeReceiver({
    initialRootKey: rk,
    ourDhPrivatePkcs8Base64: bobDh.priv,
    ourDhPublicSpkiBase64: bobDh.pub,
  });
  return { alice, bob };
}

describe("double-ratchet", () => {
  it("uses the documented suite tag", () => {
    expect(RATCHET_SUITE).toBe("x3dh-dr-aes-256-gcm-v1");
  });

  it("Alice→Bob roundtrips a single message", async () => {
    let { alice, bob } = await bootstrap();
    const enc = await ratchetEncryptString(alice, "hello bob");
    alice = enc.state;
    const dec = await ratchetDecryptString(bob, enc.header, enc.ciphertext);
    bob = dec.state;
    expect(dec.plaintext).toBe("hello bob");
  });

  it("each outgoing message advances the sending chain (per-message FS)", async () => {
    let { alice, bob } = await bootstrap();
    const chainStart = alice.ckSend;
    const e1 = await ratchetEncryptString(alice, "msg-1");
    alice = e1.state;
    const e2 = await ratchetEncryptString(alice, "msg-2");
    alice = e2.state;
    expect(alice.ckSend).not.toBe(chainStart);
    expect(e1.header.n).toBe(0);
    expect(e2.header.n).toBe(1);

    // Bob decrypts both in-order — state recovers the same chain.
    const d1 = await ratchetDecryptString(bob, e1.header, e1.ciphertext);
    bob = d1.state;
    expect(d1.plaintext).toBe("msg-1");
    const d2 = await ratchetDecryptString(bob, e2.header, e2.ciphertext);
    bob = d2.state;
    expect(d2.plaintext).toBe("msg-2");
  });

  it("performs a DH ratchet on Bob's first reply", async () => {
    let { alice, bob } = await bootstrap();
    // Alice→Bob first to seed Bob's receiving chain.
    const a1 = await ratchetEncryptString(alice, "ping");
    alice = a1.state;
    const d1 = await ratchetDecryptString(bob, a1.header, a1.ciphertext);
    bob = d1.state;

    // Bob now reaches into his receive chain to send. He must have a sending
    // chain after the DH ratchet on receive.
    expect(bob.ckSend).not.toBeNull();
    const oldRkAlice = alice.rk;
    const oldDhRecvAlice = alice.dhRecv;
    const b1 = await ratchetEncryptString(bob, "pong");
    bob = b1.state;
    // Bob's outgoing header advertises a fresh DHs different from alice.dhRecv.
    expect(b1.header.dh).not.toBe(oldDhRecvAlice);

    const da1 = await ratchetDecryptString(alice, b1.header, b1.ciphertext);
    alice = da1.state;
    expect(da1.plaintext).toBe("pong");
    // Alice's root key changed after the DH ratchet step.
    expect(alice.rk).not.toBe(oldRkAlice);
    expect(alice.dhRecv).toBe(b1.header.dh);
  });

  it("recovers out-of-order delivery via skipped keys", async () => {
    let { alice, bob } = await bootstrap();
    const e1 = await ratchetEncryptString(alice, "one");
    alice = e1.state;
    const e2 = await ratchetEncryptString(alice, "two");
    alice = e2.state;
    const e3 = await ratchetEncryptString(alice, "three");
    alice = e3.state;

    // Deliver out of order: three → one → two.
    const d3 = await ratchetDecryptString(bob, e3.header, e3.ciphertext);
    bob = d3.state;
    expect(d3.plaintext).toBe("three");
    // After decrypting #3, Bob has cached MKs for #0 and #1.
    expect(Object.keys(bob.skipped).length).toBe(2);

    const d1 = await ratchetDecryptString(bob, e1.header, e1.ciphertext);
    bob = d1.state;
    expect(d1.plaintext).toBe("one");
    expect(Object.keys(bob.skipped).length).toBe(1);

    const d2 = await ratchetDecryptString(bob, e2.header, e2.ciphertext);
    bob = d2.state;
    expect(d2.plaintext).toBe("two");
    expect(Object.keys(bob.skipped).length).toBe(0);
  });

  it("rejects ciphertext when the header has been tampered with", async () => {
    let { alice, bob } = await bootstrap();
    const e1 = await ratchetEncryptString(alice, "secret");
    alice = e1.state;
    const tampered = { ...e1.header, n: e1.header.n + 1 };
    await expect(ratchetDecryptString(bob, tampered, e1.ciphertext)).rejects.toBeDefined();
  });

  it("a roundtrip rotates the root key (post-compromise property after one DH round)", async () => {
    let { alice, bob } = await bootstrap();
    const rkAtStart = alice.rk;

    // Alice→Bob, then Bob→Alice. After this round-trip Alice's RK must change.
    const a1 = await ratchetEncryptString(alice, "ping");
    alice = a1.state;
    const da1 = await ratchetDecryptString(bob, a1.header, a1.ciphertext);
    bob = da1.state;

    const b1 = await ratchetEncryptString(bob, "pong");
    bob = b1.state;
    const da2 = await ratchetDecryptString(alice, b1.header, b1.ciphertext);
    alice = da2.state;

    expect(alice.rk).not.toBe(rkAtStart);
    expect(bob.rk).not.toBe(rkAtStart);
    // Both sides also moved their dhRecv onto each other's latest DH pubkey.
    expect(alice.dhRecv).toBe(b1.header.dh);
    expect(bob.dhRecv).toBe(a1.header.dh);
  });

  it("state shape is JSON-serializable", async () => {
    const { alice } = await bootstrap();
    const json = JSON.stringify(alice);
    const round: RatchetState = JSON.parse(json);
    expect(round.suite).toBe(alice.suite);
    expect(round.dhSendPub).toBe(alice.dhSendPub);
    expect(round.rk).toBe(alice.rk);
  });
});
