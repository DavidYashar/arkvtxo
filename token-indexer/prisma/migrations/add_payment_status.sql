-- Migration: Make TXID nullable and add payment status
-- This allows requests to be submitted without payment first

-- Add paymentStatus column
ALTER TABLE purchase_requests 
ADD COLUMN IF NOT EXISTS "paymentStatus" TEXT NOT NULL DEFAULT 'pending';

-- Make txid nullable
ALTER TABLE purchase_requests 
ALTER COLUMN txid DROP NOT NULL;

-- Add index for payment status
CREATE INDEX IF NOT EXISTS idx_purchase_requests_payment_status 
ON purchase_requests("paymentStatus");

-- Add payment timeout tracking
ALTER TABLE purchase_requests
ADD COLUMN IF NOT EXISTS "paymentRequestedAt" TIMESTAMP;

-- Update existing records to have payment-sent status if they have txid
UPDATE purchase_requests 
SET "paymentStatus" = 'payment-sent' 
WHERE txid IS NOT NULL;

COMMENT ON COLUMN purchase_requests."paymentStatus" IS 'pending: waiting for round | payment-requested: round accepted, waiting for user payment | payment-sent: user paid, waiting for verification | verified: VTXO confirmed';
COMMENT ON COLUMN purchase_requests."paymentRequestedAt" IS 'When server requested payment from user. Used for timeout (30s window)';
