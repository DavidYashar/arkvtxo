-- AlterTable
ALTER TABLE "purchase_requests" ADD COLUMN     "paymentRequestedAt" TIMESTAMP(3),
ADD COLUMN     "paymentStatus" TEXT NOT NULL DEFAULT 'pending',
ALTER COLUMN "txid" DROP NOT NULL;

-- CreateIndex
CREATE INDEX "purchase_requests_paymentStatus_idx" ON "purchase_requests"("paymentStatus");

-- CreateIndex
CREATE INDEX "purchase_requests_tokenId_paymentStatus_idx" ON "purchase_requests"("tokenId", "paymentStatus");
