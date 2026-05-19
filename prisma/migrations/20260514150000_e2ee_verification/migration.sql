-- CreateTable
CREATE TABLE "E2EEVerification" (
    "userId" TEXT NOT NULL,
    "peerUserId" TEXT NOT NULL,
    "peerIdentityFingerprint" TEXT NOT NULL,
    "verifiedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "stale" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "E2EEVerification_pkey" PRIMARY KEY ("userId", "peerUserId")
);

-- CreateIndex
CREATE INDEX "E2EEVerification_peerUserId_idx" ON "E2EEVerification"("peerUserId");

-- AddForeignKey
ALTER TABLE "E2EEVerification" ADD CONSTRAINT "E2EEVerification_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "E2EEVerification" ADD CONSTRAINT "E2EEVerification_peerUserId_fkey" FOREIGN KEY ("peerUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
