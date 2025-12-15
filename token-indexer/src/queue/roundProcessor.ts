/**
 * Round Processor for Round-Based Purchase System
 * 
 * TWO-PHASE PAYMENT ARCHITECTURE:
 * 
 * Phase 1 - Supply Check & Payment Request (every 15s):
 *   1. Fetch pending requests with paymentStatus='pending' (no txid yet)
 *   2. Check supply availability (FCFS order)
 *   3. Emit 'payment-requested' WebSocket events for accepted requests
 *   4. Reject requests that exceed supply (no money lost!)
 * 
 * Phase 2 - Payment Verification & Execution (every 5s):
 *   1. Find requests with paymentStatus='payment-sent' (user has paid)
 *   2. Verify VTXOs for paid requests
 *   3. Execute atomic batch and confirm purchases
 * 
 * Phase 3 - Timeout Handling (every 5s):
 *   1. Find requests where payment requested >30s ago
 *   2. Reject expired requests and free supply
 */

import { PrismaClient } from '@prisma/client';
import { queueManager } from './queueManager';
import { PurchaseRequest } from './types';
import { logger } from '../utils/logger';
import { queryHistoryViaSdk } from '../services/arkSdk';
import { PRESALE_POOL_WALLETS } from '../config/presale-pool';
import { TxType } from '@arkade-os/sdk';

const prisma = new PrismaClient();
const MAX_REQUESTS_PER_ROUND = 10;
const PAYMENT_TIMEOUT_MS = 20 * 1000; // 20 seconds (enough time for 16s VTXO verification)

interface RoundResult {
  roundNumber: number;
  tokenId: string;
  requestsProcessed: number;
  requestsConfirmed: number;
  requestsRejected: number;
  processingTimeMs: number;
}

class RoundProcessor {
  private roundNumber: number = 0;
  private isProcessingSupplyCheck: boolean = false;
  private isProcessingPayments: boolean = false;
  private isProcessingTimeouts: boolean = false;

  /**
   * PHASE 1: Process supply check and emit payment requests
   * Runs every 15 seconds for each token with pending requests
   * 
   * @param tokenId - Token ID to process
   * @param io - Socket.IO instance for WebSocket notifications
   */
  async processSupplyCheckRound(tokenId: string, io?: any): Promise<void> {
    if (this.isProcessingSupplyCheck) {
      logger.warn({ tokenId }, 'Supply check already processing, skipping');
      return;
    }

    this.isProcessingSupplyCheck = true;
    this.roundNumber++;
    
    const startTime = Date.now();
    logger.info({ tokenId, roundNumber: this.roundNumber }, '🎯 Supply check round started');

    try {
      // Get pending requests WITHOUT payment (paymentStatus='pending', txid=null)
      // Skip requests already in 'payment-requested' state (waiting for payment)
      const allPending = queueManager.getPendingRequests(tokenId);
      const pendingPayment = allPending.filter(r => 
        !r.txid && 
        (!r.paymentStatus || r.paymentStatus === 'pending')
      );
      const requests = pendingPayment.slice(0, MAX_REQUESTS_PER_ROUND);

      if (requests.length === 0) {
        logger.debug({ tokenId, roundNumber: this.roundNumber }, '📭 No requests awaiting payment');
        return;
      }

      logger.info({ 
        tokenId, 
        roundNumber: this.roundNumber, 
        requestCount: requests.length,
        totalPending: pendingPayment.length
      }, `📥 Checking supply for ${requests.length} request(s)`);

      // Check supply for all requests
      const { accepted, rejected } = await this.checkSupplyForBatch(tokenId, requests);

      logger.info({
        tokenId,
        roundNumber: this.roundNumber,
        accepted: accepted.length,
        rejected: rejected.length
      }, '✅ Supply check complete');

      // Emit payment-requested events for accepted requests (only once per request)
      if (accepted.length > 0 && io) {
        const token = await prisma.token.findUnique({ where: { id: tokenId } });
        
        for (const request of accepted) {
          // Only emit if not already in payment-requested state
          // This prevents duplicate emissions that reset the countdown
          if (request.paymentStatus === 'payment-requested') {
            logger.debug({
              requestId: request.id
            }, '⏭️  Payment already requested, skipping duplicate emission');
            continue;
          }

          // Emit WebSocket event
          io.to(`wallet:${request.walletAddress}`).emit('payment-requested', {
            requestId: request.id,
            tokenId,
            amount: request.totalPaid,
            creatorAddress: token?.creator,
            timeoutSeconds: 20,
            roundNumber: this.roundNumber
          });

          // Update payment status
          await queueManager.updatePaymentStatus(request.id, 'payment-requested');

          logger.info({
            requestId: request.id,
            walletAddress: request.walletAddress.slice(0, 20) + '...',
            amount: request.totalPaid
          }, '💳 Payment requested from user');
        }
      }

      // Reject requests that exceed supply (notify immediately)
      if (rejected.length > 0) {
        await this.notifyRejectedUsers(rejected, tokenId, io);
        
        // Clean up rejected requests from queue
        rejected.forEach(r => queueManager.removeRequest(tokenId, r.id));
      }

      const duration = Date.now() - startTime;
      logger.info({ 
        tokenId, 
        roundNumber: this.roundNumber,
        duration,
        paymentRequested: accepted.length,
        rejected: rejected.length
      }, '🎉 Supply check round completed');

    } catch (error: any) {
      logger.error({ 
        tokenId, 
        roundNumber: this.roundNumber, 
        error: error.message,
        stack: error.stack
      }, '❌ Supply check round failed');
    } finally {
      this.isProcessingSupplyCheck = false;
    }
  }

  /**
   * PHASE 2: Process paid requests (verify VTXOs and execute batch)
   * Runs every 5 seconds to process requests with paymentStatus='payment-sent'
   * 
   * @param io - Socket.IO instance for WebSocket notifications
   */
  async processPaidRequests(io?: any): Promise<void> {
    if (this.isProcessingPayments) {
      logger.debug('Payment processing already running, skipping');
      return;
    }

    this.isProcessingPayments = true;

    try {
      // Find all requests with payment sent (txid provided, awaiting verification)
      const paidRequests = await prisma.purchaseRequest.findMany({
        where: {
          paymentStatus: 'payment-sent',
          status: 'pending'
        },
        orderBy: {
          timestamp: 'asc'
        }
      });

      if (paidRequests.length === 0) {
        logger.debug('No paid requests to process');
        return;
      }

      logger.info({ count: paidRequests.length }, '💰 Processing paid requests');

      // Group by tokenId
      const byToken = paidRequests.reduce((acc, req) => {
        if (!acc[req.tokenId]) acc[req.tokenId] = [];
        acc[req.tokenId].push({
          id: req.id,
          tokenId: req.tokenId,
          walletAddress: req.walletAddress,
          batchesPurchased: req.batchesPurchased,
          totalPaid: req.totalPaid,
          txid: req.txid,
          timestamp: Number(req.timestamp),
          status: req.status as 'pending' | 'processing' | 'confirmed' | 'rejected',
          paymentStatus: req.paymentStatus as any,
          roundNumber: req.roundNumber || undefined,
          rejectionReason: req.rejectionReason || undefined
        });
        return acc;
      }, {} as Record<string, PurchaseRequest[]>);

      // Process each token's paid requests
      for (const [tokenId, requests] of Object.entries(byToken)) {
        try {
          logger.info({ tokenId, count: requests.length }, '🔍 Verifying VTXOs for token');

          // Verify VTXOs
          const verified = await this.verifyVtxos(requests, tokenId);

          if (verified.length > 0) {
            // Execute atomic batch
            await this.executeAtomicBatch(tokenId, verified);

            // Update payment status to verified
            for (const request of verified) {
              await queueManager.updatePaymentStatus(request.id, 'verified');
            }

            // Notify confirmed users
            await this.notifyConfirmedUsers(verified, tokenId, io);

            // Clean up from queue
            verified.forEach(r => queueManager.removeRequest(tokenId, r.id));
          }

          // Handle verification failures
          const failed = requests.filter(r => !verified.find(v => v.id === r.id));
          
          for (const request of failed) {
            await queueManager.updateRequestStatus(
              request.id,
              'rejected',
              this.roundNumber,
              'VTXO verification failed'
            );

            if (io) {
              io.to(`wallet:${request.walletAddress}`).emit('purchase-rejected', {
                requestId: request.id,
                tokenId,
                reason: 'Payment verification failed',
                batchesRequested: request.batchesPurchased,
                roundNumber: this.roundNumber
              });
            }

            queueManager.removeRequest(tokenId, request.id);

            logger.warn({
              requestId: request.id,
              walletAddress: request.walletAddress.slice(0, 20) + '...'
            }, '❌ VTXO verification failed');
          }

        } catch (error: any) {
          logger.error({ 
            tokenId, 
            error: error.message 
          }, '❌ Failed to process paid requests for token');
        }
      }

    } catch (error: any) {
      logger.error({ 
        error: error.message,
        stack: error.stack
      }, '❌ Payment processing failed');
    } finally {
      this.isProcessingPayments = false;
    }
  }

  /**
   * PHASE 3: Handle payment timeouts
   * Runs every 5 seconds to reject requests where payment window expired
   */
  async processPaymentTimeouts(io?: any): Promise<void> {
    if (this.isProcessingTimeouts) {
      logger.debug('Timeout processing already running, skipping');
      return;
    }

    this.isProcessingTimeouts = true;

    try {
      const now = new Date();
      const cutoff = new Date(now.getTime() - PAYMENT_TIMEOUT_MS);

      // Find requests where payment was requested >30s ago
      const timedOut = await prisma.purchaseRequest.findMany({
        where: {
          paymentStatus: 'payment-requested',
          status: 'pending',
          paymentRequestedAt: {
            lt: cutoff
          }
        }
      });

      if (timedOut.length === 0) {
        return;
      }

      logger.info({ count: timedOut.length }, '⏰ Processing payment timeouts');

      for (const request of timedOut) {
        // Reject the request
        await queueManager.updateRequestStatus(
          request.id,
          'rejected',
          this.roundNumber,
          'Payment timeout (15 seconds)'
        );

        // Remove from queue
        queueManager.removeRequest(request.tokenId, request.id);

        // Notify user
        if (io) {
          io.to(`wallet:${request.walletAddress}`).emit('purchase-rejected', {
            requestId: request.id,
            tokenId: request.tokenId,
            reason: 'Payment window expired (15 seconds)',
            batchesRequested: request.batchesPurchased,
            roundNumber: this.roundNumber
          });
        }

        logger.info({
          requestId: request.id,
          walletAddress: request.walletAddress.slice(0, 20) + '...',
          elapsedSeconds: (now.getTime() - (request.paymentRequestedAt?.getTime() || 0)) / 1000
        }, '⏰ Request timed out (15s payment window)');
      }

    } catch (error: any) {
      logger.error({ 
        error: error.message,
        stack: error.stack
      }, '❌ Timeout processing failed');
    } finally {
      this.isProcessingTimeouts = false;
    }
  }

  /**
   * STEP 2: Check if all requests can be fulfilled with available supply
   * Returns accepted (FCFS) and rejected arrays
   * 
   * @param tokenId - Token ID
   * @param requests - Purchase requests to check
   * @returns Object with accepted and rejected arrays
   */
  private async checkSupplyForBatch(
    tokenId: string, 
    requests: PurchaseRequest[]
  ): Promise<{ accepted: PurchaseRequest[], rejected: PurchaseRequest[] }> {
    
    const token = await prisma.token.findUnique({ where: { id: tokenId } });
    if (!token) {
      throw new Error(`Token ${tokenId} not found`);
    }

    // Calculate available supply
    const totalSupply = BigInt(token.totalSupply);
    const batchAmount = BigInt(token.presaleBatchAmount || '0');
    const maxBatches = Number(totalSupply / batchAmount);

    // Get total batches already sold
    const soldAgg = await prisma.presalePurchase.aggregate({
      where: { tokenId },
      _sum: { batchesPurchased: true }
    });
    const batchesSold = soldAgg._sum.batchesPurchased || 0;
    const batchesRemaining = maxBatches - batchesSold;

    logger.info({
      tokenId,
      roundNumber: this.roundNumber,
      maxBatches,
      batchesSold,
      batchesRemaining,
      percentSold: ((batchesSold / maxBatches) * 100).toFixed(2) + '%'
    }, '📊 Supply status');

    // Sort requests by timestamp (FCFS)
    const sorted = [...requests].sort((a, b) => a.timestamp - b.timestamp);

    const accepted: PurchaseRequest[] = [];
    const rejected: PurchaseRequest[] = [];
    let cumulativeBatches = 0;

    for (const request of sorted) {
      if (cumulativeBatches + request.batchesPurchased <= batchesRemaining) {
        // This request fits!
        accepted.push(request);
        cumulativeBatches += request.batchesPurchased;
        
        logger.info({
          requestId: request.id,
          walletAddress: request.walletAddress.slice(0, 20) + '...',
          batchesPurchased: request.batchesPurchased,
          cumulativeBatches,
          batchesRemaining
        }, '✅ Request accepted');
      } else {
        // This request would exceed supply
        const canPurchase = batchesRemaining - cumulativeBatches;
        const rejectionReason = canPurchase > 0
          ? `Insufficient supply. Only ${canPurchase} batch(es) remaining. You requested ${request.batchesPurchased}.`
          : 'Supply exhausted. All batches sold out.';
        
        rejected.push({
          ...request,
          rejectionReason
        });
        
        await queueManager.updateRequestStatus(
          request.id,
          'rejected',
          this.roundNumber,
          rejectionReason
        );
        
        logger.warn({
          requestId: request.id,
          walletAddress: request.walletAddress.slice(0, 20) + '...',
          batchesRequested: request.batchesPurchased,
          batchesAvailable: canPurchase,
          reason: rejectionReason
        }, '❌ Request rejected');
      }
    }

    return { accepted, rejected };
  }

  /**
   * STEP 4: Verify VTXOs for all accepted requests (payment already sent)
   * Runs in parallel for efficiency
   * 
   * @param requests - Accepted purchase requests
   * @param tokenId - Token ID
   * @returns Array of verified requests
   */
  private async verifyVtxos(requests: PurchaseRequest[], tokenId: string): Promise<PurchaseRequest[]> {
    logger.info({ 
      count: requests.length,
      roundNumber: this.roundNumber 
    }, '🔍 Verifying VTXOs in parallel...');

    const verifications = await Promise.all(
      requests.map(async (request) => {
        try {
          // Safety check: request must have txid (payment sent)
          if (!request.txid) {
            logger.error({ 
              requestId: request.id 
            }, '❌ Cannot verify VTXO - no txid provided');
            return null;
          }

          // Get token to find current rotation wallet
          const token = await prisma.token.findUnique({ 
            where: { id: tokenId } 
          });
          
          if (!token) {
            logger.error({ 
              requestId: request.id,
              tokenId 
            }, 'Token not found during VTXO verification');
            return null;
          }

          // Find pool wallet private key
          const poolWallet = PRESALE_POOL_WALLETS.find(w => w.address === token.creator);
          if (!poolWallet) {
            logger.error({ 
              requestId: request.id,
              tokenId,
              creatorAddress: token.creator 
            }, 'Pool wallet not found for token creator');
            return null;
          }

          // Simple verification: Check if we received a new transaction with matching amount
          // Wait for payment to settle in pool wallet (give ASP time to process)
          const expectedAmount = parseInt(request.totalPaid);
          
          logger.info({
            requestId: request.id,
            txid: request.txid,
            expectedAmount,
            poolWalletAddress: poolWallet.address
          }, '🔍 Verifying payment received...');

          // Check wallet transaction history for recent incoming transaction with matching amount
          let paymentFound = false;
          const maxAttempts = 4;
          
          for (let attempt = 1; attempt <= maxAttempts; attempt++) {
            // Wait 3 seconds before checking (give ASP time to process)
            if (attempt > 1) {
              await new Promise(resolve => setTimeout(resolve, 3000));
            }
            
            const history = await queryHistoryViaSdk(poolWallet.privateKey);
            
            if (history.success && history.transactions) {
              // Look for incoming transaction with matching amount in recent history (last 5 transactions)
              const recentIncoming = history.transactions
                .filter(tx => tx.type === TxType.TxReceived && tx.amount === expectedAmount)
                .slice(0, 5);
              
              logger.info({
                requestId: request.id,
                attempt,
                maxAttempts,
                historyCount: history.total,
                recentIncoming: recentIncoming.map(tx => ({
                  amount: tx.amount,
                  arkTxid: tx.arkTxid,
                  createdAt: tx.createdAt
                }))
              }, `💰 Checking wallet history (attempt ${attempt}/${maxAttempts})`);
              
              if (recentIncoming.length > 0) {
                paymentFound = true;
                logger.info({
                  requestId: request.id,
                  amount: expectedAmount,
                  txid: request.txid
                }, '✅ Payment verified in wallet history');
                break;
              }
            }
            
            if (attempt < maxAttempts) {
              logger.info({
                requestId: request.id,
                attempt,
                maxAttempts
              }, '⏳ Payment not yet visible, waiting 3s...');
            }
          }
          
          if (!paymentFound) {
            logger.warn({
              requestId: request.id,
              txid: request.txid,
              expectedAmount,
              poolWalletAddress: poolWallet.address,
              totalWaitTime: '12 seconds'
            }, '❌ Payment verification failed - no matching incoming transaction found after 4 attempts');
            return null;
          }
          
          return request;
        } catch (error: any) {
          logger.error({ 
            requestId: request.id, 
            txid: request.txid,
            error: error.message 
          }, 'VTXO verification error');
          return null;
        }
      })
    );

    const verified = verifications.filter((r): r is PurchaseRequest => r !== null);
    
    logger.info({ 
      verified: verified.length, 
      total: requests.length,
      roundNumber: this.roundNumber 
    }, 'VTXO verification complete');
    
    return verified;
  }

  /**
   * STEP 5: Execute atomic transaction for all verified purchases
   * Uses PostgreSQL advisory lock to prevent race conditions
   * 
   * @param tokenId - Token ID
   * @param requests - Verified purchase requests
   */
  private async executeAtomicBatch(tokenId: string, requests: PurchaseRequest[]): Promise<void> {
    // Filter out any requests without txid (safety check)
    const validRequests = requests.filter(r => r.txid !== null);
    
    if (validRequests.length !== requests.length) {
      logger.error({ 
        total: requests.length,
        valid: validRequests.length 
      }, '❌ Some requests missing txid in executeAtomicBatch');
    }

    if (validRequests.length === 0) {
      logger.warn('No valid requests to execute (all missing txid)');
      return;
    }

    logger.info({ 
      tokenId, 
      count: validRequests.length,
      roundNumber: this.roundNumber 
    }, '💾 Executing atomic batch transaction');

    // Use PostgreSQL advisory lock
    const lockId = parseInt(tokenId.slice(0, 15), 16);

    await prisma.$transaction(async (tx) => {
      // Acquire lock
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(${lockId}::bigint)`;
      logger.info({ tokenId, lockId, roundNumber: this.roundNumber }, '🔒 Lock acquired');

      // Create all purchases atomically
      for (const request of validRequests) {
        // Create purchase record (txid is guaranteed non-null here)
        await tx.presalePurchase.create({
          data: {
            tokenId: request.tokenId,
            walletAddress: request.walletAddress,
            batchesPurchased: request.batchesPurchased,
            totalPaid: request.totalPaid,
            txid: request.txid!
          }
        });

        // Update request status in database
        await queueManager.updateRequestStatus(
          request.id,
          'confirmed',
          this.roundNumber
        );

        logger.info({
          requestId: request.id,
          walletAddress: request.walletAddress.slice(0, 20) + '...',
          batchesPurchased: request.batchesPurchased,
          totalPaid: request.totalPaid
        }, '✅ Purchase recorded');
      }

      logger.info({ 
        tokenId, 
        count: validRequests.length,
        roundNumber: this.roundNumber 
      }, '✅ All purchases recorded atomically');
    }, {
      timeout: 15000
    });

    logger.info({ tokenId, roundNumber: this.roundNumber }, '🔓 Lock released');
  }

  /**
   * STEP 3: Notify rejected users via WebSocket
   * 
   * @param requests - Rejected purchase requests
   * @param tokenId - Token ID
   * @param io - Socket.IO instance
   */
  private async notifyRejectedUsers(
    requests: PurchaseRequest[], 
    tokenId: string, 
    io?: any
  ): Promise<void> {
    if (!io) {
      logger.debug('No Socket.IO instance provided, skipping rejection notifications');
      return;
    }

    for (const request of requests) {
      io.to(`wallet:${request.walletAddress}`).emit('purchase-rejected', {
        requestId: request.id,
        tokenId,
        reason: request.rejectionReason,
        batchesRequested: request.batchesPurchased,
        roundNumber: this.roundNumber
      });

      logger.info({ 
        requestId: request.id, 
        walletAddress: request.walletAddress.slice(0, 20) + '...',
        reason: request.rejectionReason
      }, '📤 Rejection notification sent');
    }
  }

  /**
   * STEP 6: Notify confirmed users via WebSocket
   * 
   * @param requests - Confirmed purchase requests
   * @param tokenId - Token ID
   * @param io - Socket.IO instance
   */
  private async notifyConfirmedUsers(
    requests: PurchaseRequest[], 
    tokenId: string, 
    io?: any
  ): Promise<void> {
    if (!io) {
      logger.debug('No Socket.IO instance provided, skipping confirmation notifications');
      return;
    }

    for (const request of requests) {
      io.to(`wallet:${request.walletAddress}`).emit('purchase-confirmed', {
        requestId: request.id,
        tokenId,
        batchesPurchased: request.batchesPurchased,
        totalPaid: request.totalPaid,
        roundNumber: this.roundNumber
      });

      logger.info({ 
        requestId: request.id, 
        walletAddress: request.walletAddress.slice(0, 20) + '...',
        batchesPurchased: request.batchesPurchased
      }, '📤 Confirmation notification sent');
    }
  }

  /**
   * Get current round number
   */
  getCurrentRound(): number {
    return this.roundNumber;
  }

  /**
   * Check if any processing is currently running
   */
  isProcessing(): boolean {
    return this.isProcessingSupplyCheck || this.isProcessingPayments || this.isProcessingTimeouts;
  }
}

// Singleton instance
export const roundProcessor = new RoundProcessor();
