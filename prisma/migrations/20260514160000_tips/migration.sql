-- CreateTable
CREATE TABLE "Tip" (
    "id" TEXT NOT NULL,
    "fromId" TEXT NOT NULL,
    "toId" TEXT NOT NULL,
    "amount" INTEGER NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "message" TEXT,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "stripePaymentIntentId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "settledAt" TIMESTAMP(3),

    CONSTRAINT "Tip_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Tip_stripePaymentIntentId_key" ON "Tip"("stripePaymentIntentId");
CREATE INDEX "Tip_toId_createdAt_idx" ON "Tip"("toId", "createdAt");
CREATE INDEX "Tip_fromId_createdAt_idx" ON "Tip"("fromId", "createdAt");
CREATE INDEX "Tip_status_idx" ON "Tip"("status");

-- AddForeignKey
ALTER TABLE "Tip" ADD CONSTRAINT "Tip_fromId_fkey" FOREIGN KEY ("fromId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Tip" ADD CONSTRAINT "Tip_toId_fkey" FOREIGN KEY ("toId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
