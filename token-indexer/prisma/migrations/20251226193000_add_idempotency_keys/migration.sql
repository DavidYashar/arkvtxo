-- Add request idempotency keys table

CREATE TABLE IF NOT EXISTS "idempotency_keys" (
  "id" TEXT NOT NULL,
  "key" TEXT NOT NULL,
  "route" TEXT NOT NULL,
  "scope" TEXT NOT NULL,
  "state" TEXT NOT NULL DEFAULT 'in_progress',
  "statusCode" INTEGER,
  "response" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  "expiresAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "idempotency_keys_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "idempotency_key_route_scope"
ON "idempotency_keys"("key", "route", "scope");

CREATE INDEX IF NOT EXISTS "idempotency_keys_expiresAt_idx"
ON "idempotency_keys"("expiresAt");
