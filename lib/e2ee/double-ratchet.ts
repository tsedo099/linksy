/**
 * Signal-style Double Ratchet on top of WebCrypto primitives.
 *
 * Bootstrapped from the X3DH-derived root key (see `lib/e2ee/client.ts`).
 * Once bootstrapped, every outgoing/incoming message advances a symmetric
 * KDF chain so each message gets a unique AES-GCM key (per-message forward
 * secrecy). On every received message whose header carries a *new* peer DH
 * public key, the receiver performs a DH ratchet step — fresh ECDH +
 * HKDF-on-the-root-chain — which gives post-compromise security: an attacker
 * who learns the current root key cannot decrypt future messages once both
 * peers complete one DH round-trip.
 *
 * Compared to the existing static-key flow (`encryptForConversation`):
 *   ✓ Per-message forward secrecy
 *   ✓ Post-compromise security after one round-trip
 *   ✓ Out-of-order delivery via skipped-key cache (bounded by MAX_SKIP)
 *
 * Differences vs the canonical Signal Double Ratchet:
 *   - No "header encryption" step — headers are transmitted plaintext alongside
 *     the AES-GCM ciphertext. Adequate for the threat model (server is honest-
 *     but-curious; metadata routing requires a server anyway).
 *   - Curve is P-256 to match the rest of the WebCrypto-based stack, not X25519.
 *   - Chain-key advance uses HMAC-SHA-256 (same as Signal); message-key uses
 *     a second HMAC tag from the chain key.
 */

import { base64ToBytes, bytesToBase64 } from "@/lib/e2ee/web-crypto";

const ECDH_PARAMS = { name: "ECDH", namedCurve: "P-256" } as const;

/** Suite tag stored on every ratchet message; bump when the algorithm changes. */
export const RATCHET_SUITE = "x3dh-dr-aes-256-gcm-v1" as const;

/** Cap on how many messages can be skipped in a single chain before we refuse. */
export const MAX_SKIP = 1_000;

/** Wire header that travels alongside every ratcheted ciphertext. */
export type RatchetHeader = {
  /** Sender's current DHs public (SPKI base64). Triggers DH ratchet when changed. */
  dh: string;
  /** Message number in the current sending chain (Ns). */
  n: number;
  /** Number of messages in the previous sending chain (PN) — used to compute skip on receive. */
  pn: number;
  /** AES-GCM 96-bit IV, base64. */
  iv: string;
};

/**
 * Serializable ratchet state. All binary fields are base64-encoded so the
 * state can be JSON-cloned into IndexedDB / future storage backends.
 */
export type RatchetState = {
  suite: typeof RATCHET_SUITE;
  /** Current root key (32-byte AES-GCM secret, used only as HKDF salt). */
  rk: string;
  /** Current sending chain key (CKs). Null until first sending DH ratchet completes. */
  ckSend: string | null;
  /** Current receiving chain key (CKr). Null until the first message is received. */
  ckRecv: string | null;
  /** Local DH key pair private key (PKCS8 base64). */
  dhSendPriv: string;
  /** Local DH key pair public key (SPKI base64). Always non-null. */
  dhSendPub: string;
  /** Peer's most recent DH public key (SPKI base64). Null until first message exchanged. */
  dhRecv: string | null;
  /** Counter of messages sent in current sending chain (Ns). */
  ns: number;
  /** Counter of messages received in current receiving chain (Nr). */
  nr: number;
  /** Length of previous sending chain (PN). */
  pn: number;
  /** Skipped message keys: key = `${peerDhSpki}:${n}`, value = base64 MK. */
  skipped: Record<string, string>;
};

// ── KDFs ────────────────────────────────────────────────────────────────────

function te(s: string): Uint8Array<ArrayBuffer> {
  const raw = new TextEncoder().encode(s);
  const out = new Uint8Array(new ArrayBuffer(raw.byteLength));
  out.set(raw);
  return out as Uint8Array<ArrayBuffer>;
}

/**
 * Re-wrap an arbitrary Uint8Array into one backed by a concrete `ArrayBuffer`.
 * Web Crypto's typed `BufferSource` and the project's own helpers all require
 * `Uint8Array<ArrayBuffer>` (not `ArrayBufferLike`) so slice/subarray results
 * have to be copied through this gate before being passed back to subtle APIs.
 */
function toAB(src: Uint8Array): Uint8Array<ArrayBuffer> {
  const out = new Uint8Array(new ArrayBuffer(src.byteLength));
  out.set(src);
  return out as Uint8Array<ArrayBuffer>;
}

/**
 * Advance the root chain by one DH output. Returns a new root key and a new
 * chain key (both 32 bytes) derived by HKDF-SHA-256 with the current root key
 * as salt and the DH output as input keying material.
 */
async function kdfRk(rk: Uint8Array, dhOut: Uint8Array): Promise<{ rk: Uint8Array<ArrayBuffer>; ck: Uint8Array<ArrayBuffer> }> {
  const ikm = await crypto.subtle.importKey("raw", toAB(dhOut), "HKDF", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits(
    { name: "HKDF", hash: "SHA-256", salt: toAB(rk), info: te("DR-rk-ck-v1") },
    ikm,
    64 * 8,
  );
  const out = new Uint8Array(bits);
  return { rk: toAB(out.subarray(0, 32)), ck: toAB(out.subarray(32, 64)) };
}

/**
 * Advance the symmetric chain by one step. Returns the next chain key and the
 * message key derived from the current chain key. Matches Signal's
 *   CK' = HMAC(CK, 0x02)
 *   MK  = HMAC(CK, 0x01)
 */
async function kdfCk(ck: Uint8Array): Promise<{ ck: Uint8Array<ArrayBuffer>; mk: Uint8Array<ArrayBuffer> }> {
  const hmacKey = await crypto.subtle.importKey(
    "raw",
    toAB(ck),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const tag1 = new Uint8Array(new ArrayBuffer(1));
  tag1[0] = 0x02;
  const tag2 = new Uint8Array(new ArrayBuffer(1));
  tag2[0] = 0x01;
  const [ckBuf, mkBuf] = await Promise.all([
    crypto.subtle.sign("HMAC", hmacKey, tag1),
    crypto.subtle.sign("HMAC", hmacKey, tag2),
  ]);
  return { ck: toAB(new Uint8Array(ckBuf)), mk: toAB(new Uint8Array(mkBuf)) };
}

// ── DH key helpers ─────────────────────────────────────────────────────────

async function generateDhPair(): Promise<{ priv: CryptoKey; pub: CryptoKey }> {
  const pair = (await crypto.subtle.generateKey(ECDH_PARAMS, true, ["deriveBits"])) as CryptoKeyPair;
  return { priv: pair.privateKey, pub: pair.publicKey };
}

async function exportPrivateKey(key: CryptoKey): Promise<string> {
  const buf = await crypto.subtle.exportKey("pkcs8", key);
  return bytesToBase64(buf);
}

async function exportPublicKey(key: CryptoKey): Promise<string> {
  const buf = await crypto.subtle.exportKey("spki", key);
  return bytesToBase64(buf);
}

async function importPrivateKey(b64: string): Promise<CryptoKey> {
  return crypto.subtle.importKey("pkcs8", base64ToBytes(b64), ECDH_PARAMS, true, ["deriveBits"]);
}

async function importPublicKey(b64: string): Promise<CryptoKey> {
  return crypto.subtle.importKey("spki", base64ToBytes(b64), ECDH_PARAMS, true, []);
}

async function dh(privB64: string, pubB64: string): Promise<Uint8Array<ArrayBuffer>> {
  const priv = await importPrivateKey(privB64);
  const pub = await importPublicKey(pubB64);
  const bits = await crypto.subtle.deriveBits({ name: "ECDH", public: pub }, priv, 256);
  return toAB(new Uint8Array(bits));
}

// ── AES-GCM helpers ────────────────────────────────────────────────────────

async function aesEncryptWithMk(mk: Uint8Array, plaintext: Uint8Array, ad: Uint8Array): Promise<{ iv: Uint8Array<ArrayBuffer>; ct: Uint8Array<ArrayBuffer> }> {
  const aes = await crypto.subtle.importKey("raw", toAB(mk), { name: "AES-GCM" }, false, ["encrypt"]);
  const iv = new Uint8Array(new ArrayBuffer(12));
  crypto.getRandomValues(iv);
  const ct = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv: iv as Uint8Array<ArrayBuffer>, additionalData: toAB(ad) },
    aes,
    toAB(plaintext),
  );
  return { iv: iv as Uint8Array<ArrayBuffer>, ct: toAB(new Uint8Array(ct)) };
}

async function aesDecryptWithMk(mk: Uint8Array, iv: Uint8Array, ct: Uint8Array, ad: Uint8Array): Promise<Uint8Array<ArrayBuffer>> {
  const aes = await crypto.subtle.importKey("raw", toAB(mk), { name: "AES-GCM" }, false, ["decrypt"]);
  const pt = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: toAB(iv), additionalData: toAB(ad) },
    aes,
    toAB(ct),
  );
  return toAB(new Uint8Array(pt));
}

function headerAssociatedData(header: RatchetHeader): Uint8Array<ArrayBuffer> {
  // Bind dh/n/pn into the AES-GCM AD so a tampered header is rejected.
  return te(`${header.dh}|${header.n}|${header.pn}`);
}

// ── Initialization ─────────────────────────────────────────────────────────

/**
 * Initiator side (Alice). Knows Bob's signed-pre-key from the X3DH bundle and
 * has just computed the initial root key. We immediately do a sending-chain
 * DH ratchet so the first message has Ns=0 in a fresh CKs.
 */
export async function initializeSender(input: {
  initialRootKey: Uint8Array;
  peerDhPublicSpkiBase64: string;
}): Promise<RatchetState> {
  const dhPair = await generateDhPair();
  const dhSendPriv = await exportPrivateKey(dhPair.priv);
  const dhSendPub = await exportPublicKey(dhPair.pub);

  // Derive first sending chain: ratchet on (initialRK, DH(ourDhPriv, peerDhPub)).
  const dhOut = await dh(dhSendPriv, input.peerDhPublicSpkiBase64);
  const { rk, ck } = await kdfRk(input.initialRootKey, dhOut);

  return {
    suite: RATCHET_SUITE,
    rk: bytesToBase64(rk),
    ckSend: bytesToBase64(ck),
    ckRecv: null,
    dhSendPriv,
    dhSendPub,
    dhRecv: input.peerDhPublicSpkiBase64,
    ns: 0,
    nr: 0,
    pn: 0,
    skipped: {},
  };
}

/**
 * Responder side (Bob). Holds onto his signed-pre-key pair as his initial
 * `dhSend` so Alice's first message can be decrypted via DH ratchet on receipt.
 */
export async function initializeReceiver(input: {
  initialRootKey: Uint8Array;
  ourDhPrivatePkcs8Base64: string;
  ourDhPublicSpkiBase64: string;
}): Promise<RatchetState> {
  return {
    suite: RATCHET_SUITE,
    rk: bytesToBase64(input.initialRootKey),
    ckSend: null,
    ckRecv: null,
    dhSendPriv: input.ourDhPrivatePkcs8Base64,
    dhSendPub: input.ourDhPublicSpkiBase64,
    dhRecv: null,
    ns: 0,
    nr: 0,
    pn: 0,
    skipped: {},
  };
}

// ── Encrypt / Decrypt ──────────────────────────────────────────────────────

/**
 * Encrypt the next outgoing message in the current sending chain.
 *
 * Throws when called on a receiver-side state that hasn't yet received its
 * first message (no sending chain established).
 */
export async function ratchetEncrypt(
  state: RatchetState,
  plaintext: Uint8Array,
): Promise<{ state: RatchetState; header: RatchetHeader; ciphertext: string }> {
  if (!state.ckSend) {
    throw new Error("Cannot send: no sending chain. The first incoming message must arrive before replying.");
  }

  const ckBytes = base64ToBytes(state.ckSend);
  const { ck, mk } = await kdfCk(ckBytes);
  const header: RatchetHeader = {
    dh: state.dhSendPub,
    n: state.ns,
    pn: state.pn,
    iv: "",
  };
  const ad = headerAssociatedData(header);
  const { iv, ct } = await aesEncryptWithMk(mk, plaintext, ad);
  header.iv = bytesToBase64(iv);

  return {
    state: {
      ...state,
      ckSend: bytesToBase64(ck),
      ns: state.ns + 1,
    },
    header,
    ciphertext: bytesToBase64(ct),
  };
}

/**
 * Decrypt an incoming ratcheted message. Performs DH ratchet if the peer
 * rotated their public key, and caches skipped message keys for out-of-order
 * delivery (capped at {@link MAX_SKIP}).
 *
 * Returns a *new* state — callers should persist it before yielding the
 * plaintext to user code, to avoid replay-by-state-loss attacks.
 */
export async function ratchetDecrypt(
  state: RatchetState,
  header: RatchetHeader,
  ciphertextBase64: string,
): Promise<{ state: RatchetState; plaintext: Uint8Array }> {
  let working = cloneState(state);
  const ct = base64ToBytes(ciphertextBase64);
  const iv = base64ToBytes(header.iv);
  const ad = headerAssociatedData(header);

  // 1) Try a cached skipped key — this is how out-of-order messages decrypt.
  const skippedKey = `${header.dh}:${header.n}`;
  const cached = working.skipped[skippedKey];
  if (cached) {
    const mk = base64ToBytes(cached);
    const pt = await aesDecryptWithMk(mk, iv, ct, ad);
    const nextSkipped = { ...working.skipped };
    delete nextSkipped[skippedKey];
    return { state: { ...working, skipped: nextSkipped }, plaintext: pt };
  }

  // 2) DH ratchet if the peer rotated.
  if (header.dh !== working.dhRecv) {
    working = await skipMessageKeys(working, header.pn);
    working = await performDhRatchet(working, header.dh);
  }

  // 3) Burn through any missed messages in the current receiving chain.
  working = await skipMessageKeys(working, header.n);

  // 4) Derive the message key for this slot.
  if (!working.ckRecv) {
    throw new Error("Receiving chain not initialized — DH ratchet step did not complete.");
  }
  const ckBytes = base64ToBytes(working.ckRecv);
  const { ck, mk } = await kdfCk(ckBytes);
  working = { ...working, ckRecv: bytesToBase64(ck), nr: working.nr + 1 };

  const plaintext = await aesDecryptWithMk(mk, iv, ct, ad);
  return { state: working, plaintext };
}

async function skipMessageKeys(state: RatchetState, until: number): Promise<RatchetState> {
  if (!state.ckRecv) return state;
  if (state.nr + MAX_SKIP < until) {
    throw new Error(`Too many skipped messages (${until - state.nr} > ${MAX_SKIP}).`);
  }
  let ck = base64ToBytes(state.ckRecv);
  let nr = state.nr;
  const skipped: Record<string, string> = { ...state.skipped };
  const dhRecv = state.dhRecv ?? "";
  while (nr < until) {
    const step = await kdfCk(ck);
    skipped[`${dhRecv}:${nr}`] = bytesToBase64(step.mk);
    ck = step.ck;
    nr += 1;
  }
  return { ...state, ckRecv: bytesToBase64(ck), nr, skipped };
}

async function performDhRatchet(state: RatchetState, peerDhPubSpki: string): Promise<RatchetState> {
  // Save current sending chain length, reset counters.
  let next: RatchetState = {
    ...state,
    pn: state.ns,
    ns: 0,
    nr: 0,
    dhRecv: peerDhPubSpki,
  };

  // Receiving chain step: DH(currentSendPriv, peerDhPub) → new RK, CKr.
  const dhOut1 = await dh(next.dhSendPriv, peerDhPubSpki);
  const rkStep1 = await kdfRk(base64ToBytes(next.rk), dhOut1);
  next = { ...next, rk: bytesToBase64(rkStep1.rk), ckRecv: bytesToBase64(rkStep1.ck) };

  // Generate fresh local DH; sending chain step: DH(newSendPriv, peerDhPub) → new RK, CKs.
  const fresh = await generateDhPair();
  const dhSendPriv = await exportPrivateKey(fresh.priv);
  const dhSendPub = await exportPublicKey(fresh.pub);
  const dhOut2 = await dh(dhSendPriv, peerDhPubSpki);
  const rkStep2 = await kdfRk(base64ToBytes(next.rk), dhOut2);
  next = {
    ...next,
    rk: bytesToBase64(rkStep2.rk),
    ckSend: bytesToBase64(rkStep2.ck),
    dhSendPriv,
    dhSendPub,
  };

  return next;
}

function cloneState(state: RatchetState): RatchetState {
  return { ...state, skipped: { ...state.skipped } };
}

// ── Public-facing convenience ──────────────────────────────────────────────

/** Helper for callers that already speak base64 plaintext (e.g. existing client.ts). */
export async function ratchetEncryptString(state: RatchetState, plaintext: string) {
  return ratchetEncrypt(state, te(plaintext));
}

export async function ratchetDecryptString(state: RatchetState, header: RatchetHeader, ciphertext: string) {
  const out = await ratchetDecrypt(state, header, ciphertext);
  return { state: out.state, plaintext: new TextDecoder().decode(out.plaintext) };
}
