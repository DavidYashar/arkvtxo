/**
 * Queue Manager for Round-Based Purchase System
 * 
 * Manages in-memory queue of purchase requests with database persistence.
 * Requests are sorted by timestamp (FCFS) and processed in 15-second rounds.
 */

import { PrismaClient } from '@prisma/client';
import { PurchaseRequest, QueueStats } from './types';
import { logger } from '../utils/logger';

const prisma = new PrismaClient();

class QueueManager {
  // In-memory queue: tokenId → array of requests
  private queues: Map<string, PurchaseRequest[]> = new Map();

  constructor() {
    // Initialize queue from database on startup
    this.initializeFromDatabase();
  }

  /**
   * Initialize in-memory queue from database on startup
   * Loads all pending requests that were queued before restart
   */
  private async initializeFromDatabase(): Promise<void> {
    try {
      logger.info('🔄 Initializing queue from database...');

      const pendingRequests = await prisma.purchaseRequest.findMany({
        where: {
          status: 'pending'
        },
        orderBy: {
          timestamp: 'asc'
        }
      });

      for (const dbRequest of pendingRequests) {
        const request: PurchaseRequest = {
          id: dbRequest.id,
          tokenId: dbRequest.tokenId,
          walletAddress: dbRequest.walletAddress,
          batchesPurchased: dbRequest.batchesPurchased,
          totalPaid: dbRequest.totalPaid,
          txid: dbRequest.txid,
          timestamp: Number(dbRequest.timestamp),
          status: dbRequest.status as 'pending' | 'processing' | 'confirmed' | 'rejected',
          paymentStatus: dbRequest.paymentStatus as 'pending' | 'payment-requested' | 'payment-sent' | 'verified' | undefined,
          paymentRequestedAt: dbRequest.paymentRequestedAt || undefined,
          roundNumber: dbRequest.roundNumber || undefined,
          rejectionReason: dbRequest.rejectionReason || undefined
        };

        const queue = this.queues.get(request.tokenId) || [];
        queue.push(request);
        this.queues.set(request.tokenId, queue);
      }

      const tokenCount = this.queues.size;
      const totalRequests = pendingRequests.length;

      logger.info({ tokenCount, totalRequests }, '✅ Queue initialized from database');

    } catch (error: any) {
      logger.error({ error: error.message }, '❌ Failed to initialize queue from database');
    }
  }

  /**
   * Add new purchase request to queue
   * Payment already sent by user before calling this
   * 
   * @param request - Purchase request with payment already sent
   * @returns Queue position (1-indexed)
   */
  async addRequest(request: PurchaseRequest): Promise<number> {
    try {
      // Add to in-memory queue
      const queue = this.queues.get(request.tokenId) || [];
      queue.push(request);
      this.queues.set(request.tokenId, queue);

      // Persist to database
      await prisma.purchaseRequest.create({
        data: {
          id: request.id,
          tokenId: request.tokenId,
          walletAddress: request.walletAddress,
          batchesPurchased: request.batchesPurchased,
          totalPaid: request.totalPaid,
          txid: request.txid,
          timestamp: BigInt(request.timestamp),
          status: request.status
        }
      });

      const position = this.getQueuePosition(request.tokenId, request.id);

      logger.info({
        requestId: request.id,
        tokenId: request.tokenId,
        walletAddress: request.walletAddress.slice(0, 20) + '...',
        position,
        batchesPurchased: request.batchesPurchased
      }, '📥 Request added to queue');

      return position;

    } catch (error: any) {
      logger.error({
        requestId: request.id,
        error: error.message
      }, '❌ Failed to add request to queue');
      throw error;
    }
  }

  /**
   * Get all pending requests for a token (sorted by timestamp - FCFS)
   * 
   * @param tokenId - Token ID to get requests for
   * @returns Array of pending requests sorted by timestamp (oldest first)
   */
  getPendingRequests(tokenId: string): PurchaseRequest[] {
    const queue = this.queues.get(tokenId) || [];
    return queue
      .filter(r => r.status === 'pending')
      .sort((a, b) => a.timestamp - b.timestamp); // FCFS: earliest timestamp first
  }

  /**
   * Get all requests for a token (all statuses)
   * 
   * @param tokenId - Token ID
   * @returns Array of all requests
   */
  getAllRequests(tokenId: string): PurchaseRequest[] {
    return this.queues.get(tokenId) || [];
  }

  /**
   * Get queue position for a specific request
   * 
   * @param tokenId - Token ID
   * @param requestId - Request ID
   * @returns Position in queue (1-indexed), 0 if not found
   */
  getQueuePosition(tokenId: string, requestId: string): number {
    const pending = this.getPendingRequests(tokenId);
    const index = pending.findIndex(r => r.id === requestId);
    return index >= 0 ? index + 1 : 0;
  }

  /**
   * Get requests for a specific wallet
   * 
   * @param tokenId - Token ID
   * @param walletAddress - Wallet address
   * @returns Array of requests from this wallet
   */
  getWalletRequests(tokenId: string, walletAddress: string): PurchaseRequest[] {
    const queue = this.queues.get(tokenId) || [];
    return queue.filter(r => r.walletAddress === walletAddress);
  }

  /**
   * Remove request from queue after processing
   * Only removes from in-memory queue, database record remains for history
   * 
   * @param tokenId - Token ID
   * @param requestId - Request ID to remove
   */
  removeRequest(tokenId: string, requestId: string): void {
    const queue = this.queues.get(tokenId) || [];
    const filtered = queue.filter(r => r.id !== requestId);
    
    if (filtered.length === queue.length) {
      logger.warn({ tokenId, requestId }, 'Request not found in queue');
      return;
    }

    this.queues.set(tokenId, filtered);

    logger.debug({
      tokenId,
      requestId,
      remainingInQueue: filtered.length
    }, '🗑️ Request removed from queue');
  }

  /**
   * Update request status in database
   * Does NOT update in-memory queue (request will be removed after processing)
   * 
   * @param requestId - Request ID
   * @param status - New status
   * @param roundNumber - Round number that processed this request
   * @param rejectionReason - Reason if rejected
   */
  async updateRequestStatus(
    requestId: string,
    status: 'processing' | 'confirmed' | 'rejected',
    roundNumber?: number,
    rejectionReason?: string
  ): Promise<void> {
    try {
      await prisma.purchaseRequest.update({
        where: { id: requestId },
        data: {
          status,
          roundNumber,
          rejectionReason,
          processedAt: new Date()
        }
      });

      logger.debug({
        requestId,
        status,
        roundNumber,
        rejectionReason
      }, '📝 Request status updated');

    } catch (error: any) {
      logger.error({
        requestId,
        status,
        error: error.message
      }, '❌ Failed to update request status');
      throw error;
    }
  }

  /**
   * Update payment status for a request
   * Used when payment is requested or received
   * 
   * @param requestId - Request ID
   * @param paymentStatus - New payment status
   * @returns true if updated, false if not found
   */
  async updatePaymentStatus(
    requestId: string,
    paymentStatus: 'pending' | 'payment-requested' | 'payment-sent' | 'verified'
  ): Promise<boolean> {
    try {
      // Find request in memory
      let foundRequest: PurchaseRequest | undefined;
      let foundTokenId: string | undefined;

      for (const [tokenId, queue] of this.queues) {
        const request = queue.find(r => r.id === requestId);
        if (request) {
          foundRequest = request;
          foundTokenId = tokenId;
          break;
        }
      }

      if (!foundRequest) {
        logger.warn({ requestId }, 'Request not found for payment status update');
        return false;
      }

      // Update database
      const updateData: any = { paymentStatus };
      
      if (paymentStatus === 'payment-requested') {
        updateData.paymentRequestedAt = new Date();
      }

      await prisma.purchaseRequest.update({
        where: { id: requestId },
        data: updateData
      });

      logger.info({
        requestId,
        paymentStatus
      }, '💳 Payment status updated');

      return true;

    } catch (error: any) {
      logger.error({
        requestId,
        paymentStatus,
        error: error.message
      }, '❌ Failed to update payment status');
      return false;
    }
  }

  /**
   * Submit payment for a request
   * Called when user sends payment after receiving payment-requested event
   * 
   * @param requestId - Request ID
   * @param txid - Payment transaction ID
   * @returns true if updated, false if not found or expired
   */
  async submitPayment(requestId: string, txid: string): Promise<boolean> {
    try {
      // Find request in memory
      let foundRequest: PurchaseRequest | undefined;

      for (const [_, queue] of this.queues) {
        const request = queue.find(r => r.id === requestId);
        if (request) {
          foundRequest = request;
          break;
        }
      }

      if (!foundRequest) {
        logger.warn({ requestId }, 'Request not found for payment submission');
        return false;
      }

      // Check if request is in correct state (payment-requested)
      const dbRequest = await prisma.purchaseRequest.findUnique({
        where: { id: requestId }
      });

      if (!dbRequest) {
        return false;
      }

      if (dbRequest.paymentStatus !== 'payment-requested') {
        logger.warn({ 
          requestId, 
          currentStatus: dbRequest.paymentStatus 
        }, 'Request not awaiting payment');
        return false;
      }

      // Check if payment window expired (30 seconds)
      const now = new Date();
      const paymentRequestedAt = dbRequest.paymentRequestedAt;
      
      if (paymentRequestedAt) {
        const elapsedMs = now.getTime() - paymentRequestedAt.getTime();
        const timeoutMs = 30 * 1000; // 30 seconds

        if (elapsedMs > timeoutMs) {
          logger.warn({ 
            requestId, 
            elapsedSeconds: elapsedMs / 1000 
          }, '⏰ Payment window expired');
          return false;
        }
      }

      // Update request with payment
      foundRequest.txid = txid;

      await prisma.purchaseRequest.update({
        where: { id: requestId },
        data: {
          txid,
          paymentStatus: 'payment-sent'
        }
      });

      logger.info({
        requestId,
        txid: txid.slice(0, 20) + '...'
      }, '✅ Payment txid recorded');

      return true;

    } catch (error: any) {
      logger.error({
        requestId,
        error: error.message
      }, '❌ Failed to submit payment');
      return false;
    }
  }

  /**
   * Get queue statistics for a token
   * 
   * @param tokenId - Token ID
   * @returns Queue statistics
   */
  getQueueStats(tokenId: string): QueueStats {
    const queue = this.queues.get(tokenId) || [];
    const pending = queue.filter(r => r.status === 'pending');
    const processing = queue.filter(r => r.status === 'processing');

    const timestamps = pending.map(r => r.timestamp);
    const oldestTimestamp = timestamps.length > 0 ? Math.min(...timestamps) : null;
    const newestTimestamp = timestamps.length > 0 ? Math.max(...timestamps) : null;

    return {
      tokenId,
      totalPending: pending.length,
      totalProcessing: processing.length,
      oldestRequestTimestamp: oldestTimestamp,
      newestRequestTimestamp: newestTimestamp
    };
  }

  /**
   * Get total number of pending requests across all tokens
   * 
   * @returns Total pending requests
   */
  getTotalPendingCount(): number {
    let total = 0;
    for (const [_, queue] of this.queues) {
      total += queue.filter(r => r.status === 'pending').length;
    }
    return total;
  }

  /**
   * Get all tokens that have pending requests
   * 
   * @returns Array of token IDs with pending requests
   */
  getTokensWithPendingRequests(): string[] {
    const tokens: string[] = [];
    for (const [tokenId, queue] of this.queues) {
      const hasPending = queue.some(r => r.status === 'pending');
      if (hasPending) {
        tokens.push(tokenId);
      }
    }
    return tokens;
  }

  /**
   * Clear all requests for a token from in-memory queue
   * Used for testing or maintenance
   * 
   * @param tokenId - Token ID to clear
   */
  clearQueue(tokenId: string): void {
    this.queues.delete(tokenId);
    logger.info({ tokenId }, '🧹 Queue cleared');
  }

  /**
   * Get all queues (for debugging)
   * 
   * @returns Map of all queues
   */
  getAllQueues(): Map<string, PurchaseRequest[]> {
    return this.queues;
  }
}

// Singleton instance
export const queueManager = new QueueManager();
