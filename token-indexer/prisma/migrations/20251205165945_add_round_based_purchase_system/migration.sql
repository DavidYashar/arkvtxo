-- CreateTable
CREATE TABLE "purchase_requests" (
    "id" TEXT NOT NULL,
    "tokenId" TEXT NOT NULL,
    "walletAddress" TEXT NOT NULL,
    "batchesPurchased" INTEGER NOT NULL,
    "totalPaid" TEXT NOT NULL,
    "txid" TEXT NOT NULL,
    "timestamp" BIGINT NOT NULL,
    "status" TEXT NOT NULL,
    "roundNumber" INTEGER,
    "rejectionReason" TEXT,
    "submittedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "processedAt" TIMESTAMP(3),

    CONSTRAINT "purchase_requests_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "purchase_requests_tokenId_idx" ON "purchase_requests"("tokenId");

-- CreateIndex
CREATE INDEX "purchase_requests_walletAddress_idx" ON "purchase_requests"("walletAddress");

-- CreateIndex
CREATE INDEX "purchase_requests_status_idx" ON "purchase_requests"("status");

-- CreateIndex
CREATE INDEX "purchase_requests_timestamp_idx" ON "purchase_requests"("timestamp");

-- CreateIndex
CREATE INDEX "purchase_requests_roundNumber_idx" ON "purchase_requests"("roundNumber");

-- CreateIndex
CREATE INDEX "purchase_requests_tokenId_status_idx" ON "purchase_requests"("tokenId", "status");

-- AddForeignKey
ALTER TABLE "purchase_requests" ADD CONSTRAINT "purchase_requests_tokenId_fkey" FOREIGN KEY ("tokenId") REFERENCES "tokens"("id") ON DELETE CASCADE ON UPDATE CASCADE;
