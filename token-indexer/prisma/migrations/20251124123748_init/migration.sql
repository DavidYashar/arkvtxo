-- CreateTable
CREATE TABLE "tokens" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "symbol" TEXT NOT NULL,
    "totalSupply" TEXT NOT NULL,
    "decimals" INTEGER NOT NULL DEFAULT 0,
    "creator" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdInTx" TEXT NOT NULL,

    CONSTRAINT "tokens_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "token_balances" (
    "id" TEXT NOT NULL,
    "address" TEXT NOT NULL,
    "tokenId" TEXT NOT NULL,
    "balance" TEXT NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "token_balances_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "token_transfers" (
    "id" TEXT NOT NULL,
    "txid" TEXT NOT NULL,
    "tokenId" TEXT NOT NULL,
    "fromAddress" TEXT NOT NULL,
    "toAddress" TEXT NOT NULL,
    "amount" TEXT NOT NULL,
    "timestamp" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "blockHeight" INTEGER,

    CONSTRAINT "token_transfers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "vtxo_usage" (
    "id" TEXT NOT NULL,
    "outpoint" TEXT NOT NULL,
    "tokenId" TEXT NOT NULL,
    "usedInTx" TEXT NOT NULL,
    "usedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "vtxo_usage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "processed_transactions" (
    "txid" TEXT NOT NULL,
    "processedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "success" BOOLEAN NOT NULL,
    "errorMsg" TEXT,

    CONSTRAINT "processed_transactions_pkey" PRIMARY KEY ("txid")
);

-- CreateIndex
CREATE INDEX "tokens_symbol_idx" ON "tokens"("symbol");

-- CreateIndex
CREATE INDEX "tokens_creator_idx" ON "tokens"("creator");

-- CreateIndex
CREATE INDEX "token_balances_address_idx" ON "token_balances"("address");

-- CreateIndex
CREATE INDEX "token_balances_tokenId_idx" ON "token_balances"("tokenId");

-- CreateIndex
CREATE UNIQUE INDEX "token_balances_address_tokenId_key" ON "token_balances"("address", "tokenId");

-- CreateIndex
CREATE INDEX "token_transfers_txid_idx" ON "token_transfers"("txid");

-- CreateIndex
CREATE INDEX "token_transfers_tokenId_idx" ON "token_transfers"("tokenId");

-- CreateIndex
CREATE INDEX "token_transfers_fromAddress_idx" ON "token_transfers"("fromAddress");

-- CreateIndex
CREATE INDEX "token_transfers_toAddress_idx" ON "token_transfers"("toAddress");

-- CreateIndex
CREATE INDEX "token_transfers_timestamp_idx" ON "token_transfers"("timestamp");

-- CreateIndex
CREATE UNIQUE INDEX "vtxo_usage_outpoint_key" ON "vtxo_usage"("outpoint");

-- CreateIndex
CREATE INDEX "vtxo_usage_tokenId_idx" ON "vtxo_usage"("tokenId");

-- CreateIndex
CREATE INDEX "processed_transactions_processedAt_idx" ON "processed_transactions"("processedAt");

-- AddForeignKey
ALTER TABLE "token_balances" ADD CONSTRAINT "token_balances_tokenId_fkey" FOREIGN KEY ("tokenId") REFERENCES "tokens"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "token_transfers" ADD CONSTRAINT "token_transfers_tokenId_fkey" FOREIGN KEY ("tokenId") REFERENCES "tokens"("id") ON DELETE CASCADE ON UPDATE CASCADE;
