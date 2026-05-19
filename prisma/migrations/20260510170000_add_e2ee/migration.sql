-- AlterTable Conversation: per-conversation E2EE flag
ALTER TABLE "Conversation"
  ADD COLUMN "e2eeEnabled" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable Message: ciphertext columns (NULL when conversation is plaintext)
ALTER TABLE "Message"
  ADD COLUMN "ciphertext"       TEXT,
  ADD COLUMN "ciphertextHeader" TEXT,
  ADD COLUMN "encryptedKind"    TEXT;

-- CreateTable: per-user identity (public material only)
CREATE TABLE "E2EEIdentity" (
    "userId"                  TEXT NOT NULL,
    "identitySigningKey"      TEXT NOT NULL,
    "identityExchangeKey"     TEXT NOT NULL,
    "signedPreKeyId"          INTEGER NOT NULL,
    "signedPreKeyPublic"      TEXT NOT NULL,
    "signedPreKeySignature"   TEXT NOT NULL,
    "signedPreKeyCreatedAt"   TIMESTAMP(3) NOT NULL,
    "updatedAt"               TIMESTAMP(3) NOT NULL,

    CONSTRAINT "E2EEIdentity_pkey" PRIMARY KEY ("userId")
);

-- CreateTable: one-time prekeys (single-use, server marks consumed)
CREATE TABLE "E2EEOneTimePreKey" (
    "id"         TEXT NOT NULL,
    "userId"     TEXT NOT NULL,
    "preKeyId"   INTEGER NOT NULL,
    "publicKey"  TEXT NOT NULL,
    "consumedAt" TIMESTAMP(3),
    "createdAt"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "E2EEOneTimePreKey_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "E2EEOneTimePreKey_userId_preKeyId_key"
  ON "E2EEOneTimePreKey"("userId", "preKeyId");

CREATE INDEX "E2EEOneTimePreKey_userId_consumedAt_idx"
  ON "E2EEOneTimePreKey"("userId", "consumedAt");

-- ForeignKeys
ALTER TABLE "E2EEIdentity"
  ADD CONSTRAINT "E2EEIdentity_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "E2EEOneTimePreKey"
  ADD CONSTRAINT "E2EEOneTimePreKey_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "E2EEIdentity"("userId") ON DELETE CASCADE ON UPDATE CASCADE;
