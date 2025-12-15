-- AlterTable
ALTER TABLE "tokens" ADD COLUMN     "bitcoinAddress" TEXT,
ADD COLUMN     "bitcoinBlock" INTEGER,
ADD COLUMN     "bitcoinProof" TEXT,
ADD COLUMN     "confirmations" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "opReturnData" TEXT;

-- CreateIndex
CREATE INDEX "tokens_bitcoinProof_idx" ON "tokens"("bitcoinProof");
