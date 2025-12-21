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
import { advisoryLockKeysFromTokenId } from '../utils/advisoryLock';
import { queryHistoryViaSdk } from '../services/arkSdk';
import { PRESALE_POOL_WALLETS } from '../config/presale-pool';
import { TxType } from '@arkade-os/sdk';

const prisma = new PrismaClient();
const MAX_REQUESTS_PER_ROUND = 10;
// Cloud deployments are slower (network + DB + ASP history propagation). Keep this generous.
const PAYMENT_TIMEOUT_MS = 60 * 1000; // 60 seconds

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

  /**
   * PHASE 1: Process supply check and emit payment requests
   * Runs every 15 seconds for each token with pending requests
   * 
   * @param tokenId - Token ID to process
   * @param io - Socket.IO instance for WebSocket notifications
   */
  async processSupplyCheckRound(tokenId: string, io?: any): Promise<void> {
    this.roundNumber++;
    
    const startTime = Date.now();
    logger.info({ tokenId, roundNumber: this.roundNumber }, '🎯 Supply check round started');

    try {
      const { key1: lockKey1, key2: lockKey2 } = advisoryLockKeysFromTokenId(tokenId);

      const { acceptedToNotify, rejectedToNotify, creatorAddress } = await prisma.$transaction(
        async (tx) => {
          // Prevent concurrent supply-check rounds for this token across instances
          await tx.$executeRaw`SELECT pg_advisory_xact_lock(${lockKey1}::int, ${lockKey2}::int)`;

          // Fetch pending requests WITHOUT payment (txid=null) and awaiting payment request
          const dbRequests = await tx.purchaseRequest.findMany({
            where: {
              tokenId,
              status: 'pending',
              txid: null,
              paymentStatus: 'pending'
            },
            orderBy: [{ timestamp: 'asc' }, { id: 'asc' }],
            take: MAX_REQUESTS_PER_ROUND
          });

          if (dbRequests.length === 0) {
            return { acceptedToNotify: [], rejectedToNotify: [], creatorAddress: undefined as string | undefined };
          }

          const requests: PurchaseRequest[] = dbRequests.map((req) => ({
            id: req.id,
            tokenId: req.tokenId,
            walletAddress: req.walletAddress,
            batchesPurchased: req.batchesPurchased,
            totalPaid: req.totalPaid,
            txid: req.txid,
            timestamp: Number(req.timestamp),
            status: req.status as any,
            paymentStatus: req.paymentStatus as any,
            paymentRequestedAt: req.paymentRequestedAt || undefined,
            roundNumber: req.roundNumber || undefined,
            rejectionReason: req.rejectionReason || undefined
          }));

          logger.info({
            tokenId,
            roundNumber: this.roundNumber,
            requestCount: requests.length
          }, `📥 Checking supply for ${requests.length} request(s)`);

          const { accepted, rejected } = await this.checkSupplyForBatch(tokenId, requests, tx);

          // Mark accepted requests as payment-requested
          if (accepted.length > 0) {
            await tx.purchaseRequest.updateMany({
              where: {
                id: { in: accepted.map((r) => r.id) },
                status: 'pending',
                txid: null,
                paymentStatus: 'pending'
              },
              data: {
                paymentStatus: 'payment-requested',
                paymentRequestedAt: new Date(),
                roundNumber: this.roundNumber
              }
            });
          }

          // Reject only when supply is permanently exhausted (i.e., already sold out)
          // or request is invalid. Do NOT reject just because current supply is reserved.
          for (const r of rejected) {
            await tx.purchaseRequest.update({
              where: { id: r.id },
              data: {
                status: 'rejected',
                rejectionReason: r.rejectionReason,
                paymentStatus: 'rejected',
                roundNumber: this.roundNumber,
                processedAt: new Date()
              }
            });
          }

          const token = await tx.token.findUnique({ where: { id: tokenId }, select: { creator: true } });

          return {
            acceptedToNotify: accepted.map((r) => ({
              id: r.id,
              walletAddress: r.walletAddress,
              totalPaid: r.totalPaid,
              batchesPurchased: r.batchesPurchased
            })),
            rejectedToNotify: rejected.map((r) => ({
              id: r.id,
              walletAddress: r.walletAddress,
              rejectionReason: r.rejectionReason,
              batchesPurchased: r.batchesPurchased
            })),
            creatorAddress: token?.creator
          };
        },
        { timeout: 15000 }
      );

      if (acceptedToNotify.length === 0 && rejectedToNotify.length === 0) {
        logger.debug({ tokenId, roundNumber: this.roundNumber }, '📭 No requests awaiting payment');
        return;
      }

      // Emit payment-requested events for accepted requests
      if (acceptedToNotify.length > 0 && io) {
        for (const req of acceptedToNotify) {
          io.to(`wallet:${req.walletAddress}`).emit('payment-requested', {
            requestId: req.id,
            tokenId,
            amount: req.totalPaid,
            creatorAddress,
            timeoutSeconds: Math.floor(PAYMENT_TIMEOUT_MS / 1000),
            roundNumber: this.roundNumber
          });

          logger.info({
            requestId: req.id,
            walletAddress: req.walletAddress.slice(0, 20) + '...',
            amount: req.totalPaid
          }, '💳 Payment requested from user');
        }
      }

      // Notify rejections
      if (rejectedToNotify.length > 0 && io) {
        for (const req of rejectedToNotify) {
          io.to(`wallet:${req.walletAddress}`).emit('purchase-rejected', {
            requestId: req.id,
            tokenId,
            reason: req.rejectionReason,
            batchesRequested: req.batchesPurchased,
            roundNumber: this.roundNumber
          });
        }
      }

      const duration = Date.now() - startTime;
      logger.info({ 
        tokenId, 
        roundNumber: this.roundNumber,
        duration,
        paymentRequested: acceptedToNotify.length,
        rejected: rejectedToNotify.length
      }, '🎉 Supply check round completed');

    } catch (error: any) {
      logger.error({ 
        tokenId, 
        roundNumber: this.roundNumber, 
        error: error.message,
        stack: error.stack
      }, '❌ Supply check round failed');
    } finally {
      // No global in-memory processing flags; concurrency safety is handled by DB locks.
    }
  }

  /**
   * Record payment txid for a request (idempotent).
   * Does NOT reject if verification is slow.
   */
  async submitPaymentTxid(requestId: string, txid: string): Promise<boolean> {
    try {
      const req = await prisma.purchaseRequest.findUnique({ where: { id: requestId } });
      if (!req) return false;

      // Allow idempotent re-submissions
      if (req.txid && req.txid === txid && req.paymentStatus === 'payment-sent') {
        return true;
      }

      if (req.paymentStatus !== 'payment-requested' && req.paymentStatus !== 'payment-sent') {
        logger.warn({ requestId, currentStatus: req.paymentStatus }, 'Request not in payable state');
        return false;
      }

      if (req.paymentStatus === 'payment-requested' && req.paymentRequestedAt) {
        const elapsedMs = Date.now() - req.paymentRequestedAt.getTime();
        if (elapsedMs > PAYMENT_TIMEOUT_MS) {
          logger.warn({ requestId, elapsedSeconds: elapsedMs / 1000 }, '⏰ Payment window expired');
          return false;
        }
      }

      await prisma.purchaseRequest.update({
        where: { id: requestId },
        data: {
          txid,
          paymentStatus: 'payment-sent',
          paymentSubmittedAt: new Date()
        }
      });

      return true;
    } catch (error: any) {
      logger.error({ requestId, error: error.message }, 'Failed to record payment txid');
      return false;
    }
  }

  /**
   * Verify a single paid request and finalize it if verified.
   * Returns confirmed if the txid is visible; otherwise returns pending.
   */
  async verifyAndFinalizeSingleRequest(
    requestId: string,
    io?: any
  ): Promise<{ status: 'confirmed' | 'pending' | 'rejected' }>
  {
    const req = await prisma.purchaseRequest.findUnique({ where: { id: requestId } });
    if (!req) return { status: 'rejected' };

    if (req.status !== 'pending') {
      return req.status === 'confirmed' ? { status: 'confirmed' } : { status: 'rejected' };
    }

    if (req.paymentStatus !== 'payment-sent' || !req.txid) {
      return { status: 'pending' };
    }

    // If verification is slow, do NOT reject; client can retry later.
    const verified = await this.verifyVtxos([
      {
        id: req.id,
        tokenId: req.tokenId,
        walletAddress: req.walletAddress,
        batchesPurchased: req.batchesPurchased,
        totalPaid: req.totalPaid,
        txid: req.txid,
        timestamp: Number(req.timestamp),
        status: req.status as any,
        paymentStatus: req.paymentStatus as any,
        roundNumber: req.roundNumber || undefined,
        rejectionReason: req.rejectionReason || undefined
      }
    ], req.tokenId);

    if (verified.length === 0) {
      return { status: 'pending' };
    }

    // Finalize atomically under lock
    await this.executeAtomicBatch(req.tokenId, verified);

    if (io) {
      io.to(`wallet:${req.walletAddress}`).emit('purchase-confirmed', {
        requestId: req.id,
        tokenId: req.tokenId,
        batchesPurchased: req.batchesPurchased,
        totalPaid: req.totalPaid,
        roundNumber: this.roundNumber
      });
    }

    return { status: 'confirmed' };
  }

  /**
   * PHASE 2: Process paid requests (verify VTXOs and execute batch)
   * Runs every 5 seconds to process requests with paymentStatus='payment-sent'
   * 
   * @param io - Socket.IO instance for WebSocket notifications
   */
  async processPaidRequests(io?: any): Promise<void> {
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
            await this.executeAtomicBatch(tokenId, verified);
            await this.notifyConfirmedUsers(verified, tokenId, io);
          }

          // IMPORTANT: Do not reject paid requests just because history is delayed.
          // Leave them as payment-sent; they can be retried via submit-payment.

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
      // no-op
    }
  }

  /**
   * PHASE 3: Handle payment timeouts
   * Runs every 5 seconds to reject requests where payment window expired
   */
  async processPaymentTimeouts(io?: any, tokenId?: string): Promise<void> {

    try {
      const now = new Date();
      const cutoff = new Date(now.getTime() - PAYMENT_TIMEOUT_MS);

      // Find requests where payment was requested >30s ago
      const timedOut = await prisma.purchaseRequest.findMany({
        where: {
          paymentStatus: 'payment-requested',
          status: 'pending',
          ...(tokenId ? { tokenId } : {}),
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
        await prisma.purchaseRequest.update({
          where: { id: request.id },
          data: {
            status: 'rejected',
            rejectionReason: `Payment timeout (${Math.floor(PAYMENT_TIMEOUT_MS / 1000)} seconds)`,
              paymentStatus: 'rejected',
            roundNumber: this.roundNumber,
            processedAt: new Date()
          }
        });

        // Notify user
        if (io) {
          io.to(`wallet:${request.walletAddress}`).emit('purchase-rejected', {
            requestId: request.id,
            tokenId: request.tokenId,
            reason: `Payment window expired (${Math.floor(PAYMENT_TIMEOUT_MS / 1000)} seconds)`,
            batchesRequested: request.batchesPurchased,
            roundNumber: this.roundNumber
          });
        }

        logger.info({
          requestId: request.id,
          walletAddress: request.walletAddress.slice(0, 20) + '...',
          elapsedSeconds: (now.getTime() - (request.paymentRequestedAt?.getTime() || 0)) / 1000
        }, '⏰ Request timed out (payment window)');
      }

    } catch (error: any) {
      logger.error({ 
        error: error.message,
        stack: error.stack
      }, '❌ Timeout processing failed');
    } finally {
      // no-op
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
  , db: PrismaClient | any = prisma): Promise<{ accepted: PurchaseRequest[], rejected: PurchaseRequest[] }> {
    
    const token = await db.token.findUnique({ where: { id: tokenId } });
    if (!token) {
      throw new Error(`Token ${tokenId} not found`);
    }

    // Calculate available supply
    const totalSupply = BigInt(token.totalSupply);
    const batchAmount = BigInt(token.presaleBatchAmount || '0');
    const maxBatches = Number(totalSupply / batchAmount);

    // Get total batches already sold
    const soldAgg = await db.presalePurchase.aggregate({
      where: { tokenId },
      _sum: { batchesPurchased: true }
    });
    const batchesSold = soldAgg._sum.batchesPurchased || 0;

    // Reserve supply for in-flight requests (payment requested or payment sent)
    const reservedAgg = await db.purchaseRequest.aggregate({
      where: {
        tokenId,
        status: 'pending',
        paymentStatus: { in: ['payment-requested', 'payment-sent'] }
      },
      _sum: { batchesPurchased: true }
    });
    const batchesReserved = reservedAgg._sum.batchesPurchased || 0;

    const batchesRemaining = maxBatches - batchesSold - batchesReserved;
    const permanentlySoldOut = batchesSold >= maxBatches;

    logger.info({
      tokenId,
      roundNumber: this.roundNumber,
      maxBatches,
      batchesSold,
      batchesReserved,
      batchesRemaining,
      percentSold: ((batchesSold / maxBatches) * 100).toFixed(2) + '%'
    }, '📊 Supply status');

    // Sort requests by timestamp (FCFS)
    const sorted = [...requests].sort((a, b) => a.timestamp - b.timestamp);

    const accepted: PurchaseRequest[] = [];
    const rejected: PurchaseRequest[] = [];
    let cumulativeBatches = 0;

    for (const request of sorted) {
      // Reject invalid asks (cannot ever fit)
      if (request.batchesPurchased > maxBatches) {
        rejected.push({
          ...request,
          rejectionReason: `Invalid request. Max purchasable is ${maxBatches} batch(es).`
        });
        continue;
      }

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
        // This request doesn't fit right now.
        // If supply is permanently sold out (all batches confirmed sold), reject.
        // Otherwise keep it pending in the queue to be promoted if a reservation frees up.
        if (permanentlySoldOut) {
          const rejectionReason = 'Supply exhausted. All batches sold out.';
          rejected.push({
            ...request,
            rejectionReason
          });

          logger.warn({
            requestId: request.id,
            walletAddress: request.walletAddress.slice(0, 20) + '...',
            batchesRequested: request.batchesPurchased,
            reason: rejectionReason
          }, '❌ Request rejected (sold out)');
        } else {
          logger.info({
            requestId: request.id,
            walletAddress: request.walletAddress.slice(0, 20) + '...',
            batchesRequested: request.batchesPurchased,
            batchesRemaining
          }, '⏳ Request deferred (waiting for supply)');
        }
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

          const expectedAmount = parseInt(request.totalPaid);

          logger.info({
            requestId: request.id,
            txid: request.txid,
            expectedAmount
          }, '🔍 Verifying payment received (txid-based)...');

          const maxAttempts = 8;
          const sleepMs = 3000;
          let paymentFound = false;

          for (let attempt = 1; attempt <= maxAttempts; attempt++) {
            if (attempt > 1) {
              await new Promise((resolve) => setTimeout(resolve, sleepMs));
            }

            // First try: verify by exact txid match across pool wallets
            for (const w of PRESALE_POOL_WALLETS) {
              const history = await queryHistoryViaSdk(w.privateKey);
              if (!history.success || !history.transactions) continue;

              const matched = history.transactions.find(
                (tx) => tx.type === TxType.TxReceived && tx.arkTxid === request.txid
              );

              if (matched) {
                paymentFound = true;
                logger.info({
                  requestId: request.id,
                  txid: request.txid,
                  poolWalletAddress: w.address,
                  amount: matched.amount
                }, '✅ Payment verified by txid in pool wallet history');
                break;
              }
            }

            if (paymentFound) break;

            logger.info({ requestId: request.id, attempt, maxAttempts }, '⏳ Payment not yet visible, retrying...');
          }

          if (!paymentFound) {
            logger.warn({
              requestId: request.id,
              txid: request.txid,
              expectedAmount,
              totalWaitTimeSeconds: Math.round(((maxAttempts - 1) * sleepMs) / 1000)
            }, '❌ Payment verification failed - txid not found in any pool wallet history');
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
    const { key1: lockKey1, key2: lockKey2 } = advisoryLockKeysFromTokenId(tokenId);

    await prisma.$transaction(async (tx) => {
      // Acquire lock
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(${lockKey1}::int, ${lockKey2}::int)`;
      logger.info({ tokenId, lockKey1, lockKey2, roundNumber: this.roundNumber }, '🔒 Lock acquired');

      // Safety: ensure sold+reserved does not exceed supply (defensive)
      const token = await tx.token.findUnique({ where: { id: tokenId } });
      if (!token) {
        throw new Error(`Token ${tokenId} not found`);
      }
      const totalSupply = BigInt(token.totalSupply);
      const batchAmount = BigInt(token.presaleBatchAmount || '0');
      const maxBatches = Number(totalSupply / batchAmount);

      const soldAgg = await tx.presalePurchase.aggregate({ where: { tokenId }, _sum: { batchesPurchased: true } });
      const batchesSold = soldAgg._sum.batchesPurchased || 0;

      const reservedAgg = await tx.purchaseRequest.aggregate({
        where: {
          tokenId,
          status: 'pending',
          paymentStatus: { in: ['payment-requested', 'payment-sent'] }
        },
        _sum: { batchesPurchased: true }
      });
      const batchesReserved = reservedAgg._sum.batchesPurchased || 0;

      if (batchesSold + batchesReserved > maxBatches) {
        logger.error({ tokenId, maxBatches, batchesSold, batchesReserved }, '🚨 Oversubscribed supply detected; refusing to finalize');
        throw new Error('Supply oversubscribed');
      }

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

        // Update request status in the SAME transaction (atomic)
        await tx.purchaseRequest.update({
          where: { id: request.id },
          data: {
            status: 'confirmed',
            paymentStatus: 'verified',
            roundNumber: this.roundNumber,
            processedAt: new Date()
          }
        });

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
    return false;
  }
}

// Singleton instance
export const roundProcessor = new RoundProcessor();
