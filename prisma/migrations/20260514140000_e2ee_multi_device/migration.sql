-- CreateTable
CREATE TABLE "E2EEDevice" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "platform" TEXT NOT NULL,
    "identitySigningKey" TEXT NOT NULL,
    "identityExchangeKey" TEXT NOT NULL,
    "signedPreKeyId" INTEGER NOT NULL,
    "signedPreKeyPublic" TEXT NOT NULL,
    "signedPreKeySignature" TEXT NOT NULL,
    "signedPreKeyCreatedAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "revokedAt" TIMESTAMP(3),

    CONSTRAINT "E2EEDevice_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "E2EEDevice_userId_revokedAt_idx" ON "E2EEDevice"("userId", "revokedAt");

-- AddForeignKey
ALTER TABLE "E2EEDevice" ADD CONSTRAINT "E2EEDevice_userId_fkey" FOREIGN KEY ("userId") REFERENCES "E2EEIdentity"("userId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AlterTable
ALTER TABLE "E2EEOneTimePreKey" ADD COLUMN "deviceId" TEXT;

-- CreateIndex
CREATE INDEX "E2EEOneTimePreKey_deviceId_consumedAt_idx" ON "E2EEOneTimePreKey"("deviceId", "consumedAt");

-- AddForeignKey
ALTER TABLE "E2EEOneTimePreKey" ADD CONSTRAINT "E2EEOneTimePreKey_deviceId_fkey" FOREIGN KEY ("deviceId") REFERENCES "E2EEDevice"("id") ON DELETE CASCADE ON UPDATE CASCADE;
