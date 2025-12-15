-- AlterTable
ALTER TABLE "tokens" ADD COLUMN     "isPresale" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "maxPurchasesPerWallet" INTEGER,
ADD COLUMN     "presaleBatchAmount" TEXT,
ADD COLUMN     "priceInSats" TEXT;

-- CreateTable
CREATE TABLE "presale_purchases" (
    "id" TEXT NOT NULL,
    "tokenId" TEXT NOT NULL,
    "walletAddress" TEXT NOT NULL,
    "batchesPurchased" INTEGER NOT NULL,
    "totalPaid" TEXT NOT NULL,
    "txid" TEXT NOT NULL,
    "purchasedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "presale_purchases_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "presale_purchases_tokenId_idx" ON "presale_purchases"("tokenId");

-- CreateIndex
CREATE INDEX "presale_purchases_walletAddress_idx" ON "presale_purchases"("walletAddress");

-- CreateIndex
CREATE INDEX "presale_purchases_txid_idx" ON "presale_purchases"("txid");

-- CreateIndex
CREATE INDEX "presale_purchases_purchasedAt_idx" ON "presale_purchases"("purchasedAt");

-- CreateIndex
CREATE INDEX "tokens_isPresale_idx" ON "tokens"("isPresale");

-- AddForeignKey
ALTER TABLE "presale_purchases" ADD CONSTRAINT "presale_purchases_tokenId_fkey" FOREIGN KEY ("tokenId") REFERENCES "tokens"("id") ON DELETE CASCADE ON UPDATE CASCADE;
