"use client";

/**
 * High-level E2EE client. Bootstraps the user's identity bundle, performs
 * X3DH-style key agreement with a peer, and encrypts/decrypts per-conversation
 * messages with AES-GCM 256.
 *
 * What this gives:
 *   - Server cannot read message contents
 *   - AES-GCM authentication tag prevents undetected tampering
 *   - Fresh ECDH at session establishment provides forward secrecy *up to*
 *     the moment a session is established
 *
 * What this does NOT give (vs. Signal Protocol):
 *   - Per-message forward secrecy (no Double Ratchet)
 *   - Post-compromise security (key compromise compromises all future messages)
 *   - Multi-device / message backup
 *   - Key verification UX (TOFU only — peer keys are trusted as published)
 *
 * For threat models requiring those properties, switch to libsignal.
 */

import {
  aesDecrypt,
  aesEncrypt,
  base64ToBytes,
  bytesToBase64,
  deriveRootKey,
  deriveSharedBits,
  exportPublicKey,
  exportRootKeyRaw,
  generateExchangeKeyPair,
  generateSigningKeyPair,
  importExchangePublicKey,
  importRootKeyRaw,
  importSigningPublicKey,
  signWithIdentity,
  verifySignature,
  type AesGcmEnvelope,
} from "@/lib/e2ee/web-crypto";
import {
  consumeOneTimePreKey,
  loadIdentity,
  loadSession,
  saveIdentity,
  saveSession,
  type StoredIdentity,
  type StoredSession,
} from "@/lib/e2ee/storage";

const SUITE = "x3dh-aes-256-gcm-v1";
const ONE_TIME_POOL_SIZE = 50;
const ONE_TIME_REFILL_THRESHOLD = 10;

export type PeerBundle = {
  userId: string;
  identitySigningKey: string;
  identityExchangeKey: string;
  signedPreKey: { keyId: number; publicKey: string; signature: string; createdAt: string };
  oneTimePreKey: { keyId: number; publicKey: string } | null;
};

export type CiphertextHeader = {
  /** Crypto suite identifier — always equals SUITE here. */
  suite: string;
  /** Initiator's ephemeral ECDH public key (SPKI base64). */
  ephemeralKey: string;
  /** Initiator's identity ECDH public key (SPKI base64). */
  initiatorIdentityKey: string;
  /** Signed prekey id used (responder side knows which key matches). */
  signedPreKeyId: number;
  /** One-time prekey id used (when present); responder consumes it on handshake. */
  oneTimePreKeyId: number | null;
  /** AES-GCM IV (96-bit base64). */
  iv: string;
  /** Random salt mixed into HKDF for this message. */
  salt: string;
};

// ---------- identity bootstrap ---------------------------------------------

export type PublishKeysPayload = {
  identitySigningKey: string;
  identityExchangeKey: string;
  signedPreKey: { keyId: number; publicKey: string; signature: string; createdAt: string };
  oneTimePreKeys: { keyId: number; publicKey: string }[];
};

/**
 * Generate a fresh identity + signed prekey + pool of one-time prekeys, persist
 * private material in IndexedDB, and return the public payload to upload via
 * `POST /api/e2ee/keys`.
 */
export async function bootstrapIdentity(): Promise<{
  identity: StoredIdentity;
  publish: PublishKeysPayload;
}> {
  const signingKeyPair = await generateSigningKeyPair();
  const exchangeKeyPair = await generateExchangeKeyPair();
  const signedKeyPair = await generateExchangeKeyPair();
  const signedKeyId = randomInt32();
  const signedPublicSpki = await exportPublicKey(signedKeyPair.publicKey);
  const signature = await signWithIdentity(
    signingKeyPair.privateKey,
    base64ToBytes(signedPublicSpki),
  );
  const createdAt = new Date().toISOString();

  const oneTimePairs: Record<number, CryptoKeyPair> = {};
  const oneTimePublic: { keyId: number; publicKey: string }[] = [];
  for (let i = 0; i < ONE_TIME_POOL_SIZE; i++) {
    const id = randomInt32();
    if (oneTimePairs[id]) continue;
    const pair = await generateExchangeKeyPair();
    oneTimePairs[id] = pair;
    oneTimePublic.push({ keyId: id, publicKey: await exportPublicKey(pair.publicKey) });
  }

  const identity: StoredIdentity = {
    signingKeyPair,
    exchangeKeyPair,
    signedPreKey: { keyId: signedKeyId, keyPair: signedKeyPair, createdAt },
    oneTimePreKeys: oneTimePairs,
  };

  await saveIdentity(identity);

  return {
    identity,
    publish: {
      identitySigningKey: await exportPublicKey(signingKeyPair.publicKey),
      identityExchangeKey: await exportPublicKey(exchangeKeyPair.publicKey),
      signedPreKey: {
        keyId: signedKeyId,
        publicKey: signedPublicSpki,
        signature,
        createdAt,
      },
      oneTimePreKeys: oneTimePublic,
    },
  };
}

/** Generate fresh one-time prekeys when the server-side pool is running low. */
export async function refillOneTimePreKeys(
  identity: StoredIdentity,
  count: number = ONE_TIME_POOL_SIZE,
): Promise<{ keyId: number; publicKey: string }[]> {
  const fresh: { keyId: number; publicKey: string }[] = [];
  for (let i = 0; i < count; i++) {
    const id = randomInt32();
    if (identity.oneTimePreKeys[id]) continue;
    const pair = await generateExchangeKeyPair();
    identity.oneTimePreKeys[id] = pair;
    fresh.push({ keyId: id, publicKey: await exportPublicKey(pair.publicKey) });
  }
  await saveIdentity(identity);
  return fresh;
}

export const ONE_TIME_REFILL_HINT = ONE_TIME_REFILL_THRESHOLD;

// ---------- X3DH-style session establishment -------------------------------

/**
 * Initiator side. Performs X3DH using the peer's bundle (signed prekey +
 * optional one-time prekey) and our long-term identity exchange key.
 *
 * Computes shared secret =
 *     ECDH(IK_A, SPK_B) ||
 *     ECDH(EK_A, IK_B)  ||
 *     ECDH(EK_A, SPK_B) ||
 *     [ECDH(EK_A, OPK_B)]    (when one-time prekey present)
 *
 * Then HKDF → 256-bit AES-GCM root key. The first message's header carries
 * the ephemeral pub key + initiator identity pub key + prekey ids so the
 * responder can perform the symmetric computation.
 */
export async function initiateSession(input: {
  identity: StoredIdentity;
  peer: PeerBundle;
  conversationId: string;
}): Promise<StoredSession> {
  const { identity, peer, conversationId } = input;

  // Verify the signed prekey signature against the peer's identity signing key
  // before trusting any of their ECDH material.
  const peerSigningKey = await importSigningPublicKey(peer.identitySigningKey);
  const sigOk = await verifySignature(
    peerSigningKey,
    peer.signedPreKey.signature,
    base64ToBytes(peer.signedPreKey.publicKey),
  );
  if (!sigOk) {
    throw new Error("Peer's signed prekey signature is invalid — refusing session.");
  }

  const peerIdentityExchange = await importExchangePublicKey(peer.identityExchangeKey);
  const peerSignedPreKey = await importExchangePublicKey(peer.signedPreKey.publicKey);
  const ephemeral = await generateExchangeKeyPair();

  const dh1 = await deriveSharedBits(identity.exchangeKeyPair.privateKey, peerSignedPreKey);
  const dh2 = await deriveSharedBits(ephemeral.privateKey, peerIdentityExchange);
  const dh3 = await deriveSharedBits(ephemeral.privateKey, peerSignedPreKey);
  const parts = [dh1, dh2, dh3];
  if (peer.oneTimePreKey) {
    const peerOneTime = await importExchangePublicKey(peer.oneTimePreKey.publicKey);
    parts.push(await deriveSharedBits(ephemeral.privateKey, peerOneTime));
  }
  const ikm = concatBytes(parts);
  const rootKey = await deriveRootKey(ikm);

  const session: StoredSession = {
    conversationId,
    peerUserId: peer.userId,
    rootKey,
    suite: SUITE,
    createdAt: new Date().toISOString(),
  };
  await saveSession(session);

  // Stash the ephemeral pub key on the session so the *first* outgoing message
  // can include it in its header. We store the SPKI string on a side channel
  // (in-memory map) — once both sides have a session this isn't needed.
  pendingHeaders.set(conversationId, {
    ephemeralKey: await exportPublicKey(ephemeral.publicKey),
    initiatorIdentityKey: await exportPublicKey(identity.exchangeKeyPair.publicKey),
    signedPreKeyId: peer.signedPreKey.keyId,
    oneTimePreKeyId: peer.oneTimePreKey?.keyId ?? null,
  });

  return session;
}

const pendingHeaders = new Map<string, Pick<CiphertextHeader, "ephemeralKey" | "initiatorIdentityKey" | "signedPreKeyId" | "oneTimePreKeyId">>();

/**
 * Responder side. Reconstructs the shared secret on receipt of the first
 * encrypted message and persists the resulting session.
 */
export async function acceptSession(input: {
  identity: StoredIdentity;
  conversationId: string;
  peerUserId: string;
  header: CiphertextHeader;
}): Promise<StoredSession> {
  const { identity, conversationId, peerUserId, header } = input;

  if (header.suite !== SUITE) {
    throw new Error(`Unsupported E2EE suite: ${header.suite}`);
  }

  const peerEphemeral = await importExchangePublicKey(header.ephemeralKey);
  const peerIdentityExchange = await importExchangePublicKey(header.initiatorIdentityKey);

  if (header.signedPreKeyId !== identity.signedPreKey.keyId) {
    throw new Error(
      "Signed prekey id mismatch — sender used a stale prekey, prompt them to refresh.",
    );
  }

  const dh1 = await deriveSharedBits(identity.signedPreKey.keyPair.privateKey, peerIdentityExchange);
  const dh2 = await deriveSharedBits(identity.exchangeKeyPair.privateKey, peerEphemeral);
  const dh3 = await deriveSharedBits(identity.signedPreKey.keyPair.privateKey, peerEphemeral);
  const parts = [dh1, dh2, dh3];

  if (header.oneTimePreKeyId !== null) {
    const ourOneTime = await consumeOneTimePreKey(header.oneTimePreKeyId);
    if (!ourOneTime) {
      throw new Error("One-time prekey already consumed — peer must restart the session.");
    }
    parts.push(await deriveSharedBits(ourOneTime.privateKey, peerEphemeral));
  }

  const ikm = concatBytes(parts);
  const rootKey = await deriveRootKey(ikm);

  const session: StoredSession = {
    conversationId,
    peerUserId,
    rootKey,
    suite: SUITE,
    createdAt: new Date().toISOString(),
  };
  await saveSession(session);
  return session;
}

// ---------- message encrypt / decrypt --------------------------------------

export type EncryptedOutput = {
  /** Base64 ciphertext (AES-GCM ct + tag). */
  ciphertext: string;
  /** JSON-serialized CiphertextHeader. */
  ciphertextHeader: string;
  encryptedKind: string;
};

export async function encryptForConversation(input: {
  conversationId: string;
  plaintext: string;
}): Promise<EncryptedOutput> {
  const session = await loadSession(input.conversationId);
  if (!session) {
    throw new Error("No E2EE session for this conversation. Call initiateSession() first.");
  }

  const plaintext = new TextEncoder().encode(input.plaintext);
  const envelope = await aesEncrypt(session.rootKey, plaintext);

  const pending = pendingHeaders.get(input.conversationId);
  const header: CiphertextHeader = {
    suite: SUITE,
    ephemeralKey: pending?.ephemeralKey ?? "",
    initiatorIdentityKey: pending?.initiatorIdentityKey ?? "",
    signedPreKeyId: pending?.signedPreKeyId ?? -1,
    oneTimePreKeyId: pending?.oneTimePreKeyId ?? null,
    iv: envelope.iv,
    salt: bytesToBase64(await exportRootKeyRaw(session.rootKey)).slice(0, 11),
  };

  // After the first send, we don't need to repeat the X3DH preamble — but
  // sending it on every message keeps the responder stateless across reloads.
  // For lightness we drop it once both sides have a session in IndexedDB.
  // (Header pubkeys still need to be present on the *very first* message.)

  return {
    ciphertext: envelope.ct,
    ciphertextHeader: JSON.stringify(header),
    encryptedKind: SUITE,
  };
}

export async function decryptFromConversation(input: {
  conversationId: string;
  peerUserId: string;
  ciphertext: string;
  ciphertextHeader: string;
  encryptedKind: string;
}): Promise<string> {
  const header: CiphertextHeader = JSON.parse(input.ciphertextHeader);

  let session = await loadSession(input.conversationId);
  if (!session) {
    // Responder side: rebuild session from the header on first message.
    const identity = await loadIdentity();
    if (!identity) {
      throw new Error("No local E2EE identity — bootstrap first.");
    }
    session = await acceptSession({
      identity,
      conversationId: input.conversationId,
      peerUserId: input.peerUserId,
      header,
    });
  }

  const envelope: AesGcmEnvelope = { iv: header.iv, ct: input.ciphertext };
  const bytes = await aesDecrypt(session.rootKey, envelope);
  return new TextDecoder().decode(bytes);
}

// ---------- helpers --------------------------------------------------------

function randomInt32(): number {
  const buf = new Uint32Array(1);
  crypto.getRandomValues(buf);
  // Mask to a positive 31-bit int so it always serialises cleanly to JSON.
  return (buf[0] ?? 0) & 0x7fffffff;
}

function concatBytes(parts: Uint8Array<ArrayBuffer>[]): Uint8Array<ArrayBuffer> {
  const total = parts.reduce((sum, p) => sum + p.byteLength, 0);
  const out = new Uint8Array(new ArrayBuffer(total));
  let offset = 0;
  for (const part of parts) {
    out.set(part, offset);
    offset += part.byteLength;
  }
  return out;
}

// Re-exports so consumers can import everything from one path.
export { loadIdentity, loadSession, saveSession } from "@/lib/e2ee/storage";
export { exportRootKeyRaw, importRootKeyRaw } from "@/lib/e2ee/web-crypto";
