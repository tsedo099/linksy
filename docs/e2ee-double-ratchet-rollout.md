# E2EE rollout: Double Ratchet + multi-device

This is the migration plan from the current static-AES E2EE
([lib/e2ee/client.ts](../lib/e2ee/client.ts)) to a Signal-style Double Ratchet
with multi-device support. Schema scaffolding is in place
([prisma/migrations/20260514140000_e2ee_multi_device](../prisma/migrations/20260514140000_e2ee_multi_device/migration.sql))
and the ratchet primitive is implemented at
[lib/e2ee/double-ratchet.ts](../lib/e2ee/double-ratchet.ts). What remains is
the integration work below.

## Phase 1 — Double Ratchet on existing single-device sessions

**Goal**: replace the static AES-GCM root-key flow with per-message keys, so
compromising a session at time T cannot decrypt messages sent before T (FS) or
after one DH round-trip (PCS).

1. Extend `StoredSession` in [lib/e2ee/storage.ts](../lib/e2ee/storage.ts) to
   hold a `RatchetState` alongside (or instead of) the legacy `rootKey`.
2. After `initiateSession()`/`acceptSession()` complete X3DH and derive the
   initial root key, call `initializeSender({ initialRootKey, peerDhPublicSpkiBase64 })`
   or `initializeReceiver({ initialRootKey, ourDhPrivatePkcs8Base64, ourDhPublicSpkiBase64 })`
   to seed the ratchet.
3. Replace `encryptForConversation` / `decryptFromConversation` with calls to
   `ratchetEncryptString` / `ratchetDecryptString`. Persist the returned
   `state` *before* yielding plaintext to the UI — otherwise a crash between
   decrypt and persist replays the message key.
4. The `Message.ciphertextHeader` column already stores JSON; widen the
   client-side type to a discriminated union (`{ kind: "x3dh-static" | "x3dh-dr" }`)
   so old messages still decrypt with the legacy code path.

**Migration**: existing live sessions keep using the static key until the next
DH ratchet trigger. To opt every session into Double Ratchet immediately,
delete the session and re-run X3DH (UI: "Refresh encryption keys").

## Phase 2 — Multi-device

**Goal**: a user can have multiple devices reading the same conversation
without compromising forward secrecy. Sender encrypts once per recipient
device. Recipient's other devices receive a sender-side copy.

1. **Device bootstrap** — on first launch, a device:
   - Generates its own identity (signing + exchange) and signed pre-key.
   - POSTs to `/api/e2ee/devices` (to be added) which creates an `E2EEDevice`
     row.
   - Publishes its one-time prekey pool (rows in `E2EEOneTimePreKey` with the
     new `deviceId` column).
2. **Key fetch** — `GET /api/e2ee/keys/[userId]` returns a `devices: []` array
   with each device's bundle. Clients fan out N times per send.
3. **Self-sync** — when User A sends to User B, A also encrypts to her *own*
   other devices (`A.devices.filter(d => d.id !== thisDevice.id)`). Each of
   B's devices and A's other devices decrypts independently. Read receipts
   from B include a `deviceId` so the sender only updates state when the
   target device confirms.
4. **Device management UI** — Settings → Devices lists every active
   `E2EEDevice` for the current user with an "Sign out" action that flips
   `revokedAt`. Server filters revoked devices out of key bundles.

## Phase 3 — Safety number verification ✅ (math + API + schema landed)

**Goal**: detect server-side key substitution (the classic MITM threat).

Status:
- ✅ `lib/e2ee/safety-number.ts` — derives the 60-digit number from both
  parties' identity signing keys + user IDs. Symmetric: both peers compute
  the same value.
- ✅ `prisma.E2EEVerification` model + migration
  `20260514150000_e2ee_verification`.
- ✅ `GET/POST/DELETE /api/e2ee/verification/[peerUserId]` —
  - GET returns peer's current identity fingerprint + stored verification (if any) + `stale` flag if the fingerprint drifted since last verification.
  - POST stores the verification, **only when** the caller's claimed fingerprint matches the peer's current identity key (no TOCTOU during key rotation).
  - DELETE revokes the verification.

UI work remaining:
- Read flow: Settings → Chat → "Verify identity" panel that GETs the
  endpoint, computes the safety number with `computeSafetyNumber()`, displays
  the 12 groups of 5 digits + "These match" / "Re-verify" actions.
- A small badge in the chat header (`✓ Verified` / `⚠ Identity changed`)
  driven by the same endpoint.
- QR codes are a nice-to-have on top of the digit comparison and can land in
  a follow-up once a QR rendering library (e.g. `qrcode`) is added.

## Phase 4 — E2EE media ✅ (primitive + upload route landed)

**Goal**: image/video sent in E2EE chats is encrypted at rest, not just in
transit.

Status:
- ✅ `lib/e2ee/media.ts` — `encryptMediaBlob(blob)` generates a fresh AES-GCM
  256 key + 12-byte IV, encrypts the bytes client-side, and returns a Blob
  ready to upload + the key/iv to embed in the encrypted message body.
- ✅ `decryptMediaFromUrl({ url, keyBase64, ivBase64 })` fetches the
  ciphertext, validates the GCM auth tag (any server-side tamper is rejected),
  and returns a decrypted Blob.
- ✅ `/api/upload` accepts `purpose: "e2ee-media"` — skips magic-byte
  validation, image re-encoding, video transcoding, and moderation (the
  payload is opaque ciphertext). Stores the bytes under `<uuid>.bin`.

UI work remaining:
- Compose pipeline: when the active conversation has `e2eeEnabled = true`,
  swap the existing `/api/upload?purpose=story` call for the e2ee variant +
  embed `{ url, keyBase64, ivBase64, mime, name }` inside the encrypted
  message body.
- Render pipeline: when reading a message whose body contains an e2ee-media
  block, fetch + decrypt + render via object URL.

## What this delivers, what it doesn't

| Property                              | Current static AES | + Phase 1 (Double Ratchet) | + Phase 2 (Multi-device) | + Phase 3 (Verification) | + Phase 4 (Media)   |
| ------------------------------------- | ------------------ | -------------------------- | ------------------------ | ------------------------ | ------------------- |
| Server cannot read plaintext          | ✓                  | ✓                          | ✓                        | ✓                        | ✓                   |
| Tampered ciphertext rejected (AES-GCM)| ✓                  | ✓                          | ✓                        | ✓                        | ✓                   |
| Per-message forward secrecy           | ✗                  | ✓                          | ✓                        | ✓                        | ✓                   |
| Post-compromise security (after RTT)  | ✗                  | ✓                          | ✓                        | ✓                        | ✓                   |
| Out-of-order delivery                 | n/a                | ✓ (capped at 1000)         | ✓                        | ✓                        | ✓                   |
| Multiple devices per user             | ✗                  | ✗                          | ✓                        | ✓                        | ✓                   |
| Safety number verification (math+API) | ✗                  | ✗                          | ✗                        | ✓                        | ✓                   |
| Encrypted media (primitive + upload)  | ✗                  | ✗                          | ✗                        | ✗                        | ✓                   |

## Threat model gaps that the rollout still leaves open

- **Server-stored ciphertext history**: a server retains ciphertext forever
  unless explicitly purged. Long-term key compromise leaks decrypt the
  history that was captured pre-compromise.
- **Group conversations**: this plan handles 1:1. Group E2EE needs sender-key
  trees (see Signal's "Sender Key" protocol or MLS).
- **Backups**: there is no encrypted backup mechanism. Sign-out wipes the
  client and history is unrecoverable until the recipient still has it.
