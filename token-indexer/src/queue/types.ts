/**
 * Type definitions for round-based purchase queue system
 */

export interface PurchaseRequest {
  id: string;
  tokenId: string;
  walletAddress: string;
  batchesPurchased: number;
  totalPaid: string;
  txid: string | null;  // Payment txid (null until user pays after payment-requested event)
  timestamp: number;  // Date.now() in milliseconds for FCFS ordering
  status: 'pending' | 'processing' | 'confirmed' | 'rejected';
  paymentStatus?: 'pending' | 'payment-requested' | 'payment-sent' | 'verified';
  paymentRequestedAt?: Date;
  roundNumber?: number;
  rejectionReason?: string;
}

export interface QueueStats {
  tokenId: string;
  totalPending: number;
  totalProcessing: number;
  oldestRequestTimestamp: number | null;
  newestRequestTimestamp: number | null;
}
