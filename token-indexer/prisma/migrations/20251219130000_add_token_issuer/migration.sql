-- Add Token.issuer to distinguish issuer from presale payment receiver.

ALTER TABLE tokens
ADD COLUMN IF NOT EXISTS "issuer" TEXT NOT NULL DEFAULT '';

-- Backfill existing rows.
UPDATE tokens
SET "issuer" = "creator"
WHERE "issuer" = '' OR "issuer" IS NULL;

CREATE INDEX IF NOT EXISTS "tokens_issuer_idx" ON tokens("issuer");
