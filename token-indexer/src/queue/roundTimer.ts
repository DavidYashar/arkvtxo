/**
 * Round Timer for Round-Based Purchase System
 * 
 * TWO-PHASE PAYMENT ARCHITECTURE:
 * 
 * 1. Supply Check Rounds (every 15 seconds per token):
 *    - Check supply for pending requests
 *    - Emit payment-requested events
 * 
 * 2. Payment Processing (every 5 seconds globally):
 *    - Verify VTXOs for paid requests
 *    - Execute batch purchases
 * 
 * 3. Timeout Handling (every 5 seconds globally):
 *    - Reject requests with expired payment windows
 */

import { Server as SocketIOServer } from 'socket.io';
import { queueManager } from './queueManager';
import { roundProcessor } from './roundProcessor';
import { logger } from '../utils/logger';

const ROUND_DURATION_MS = 15000; // 15 seconds (supply check)
const COUNTDOWN_INTERVAL_MS = 1000; // 1 second
const PAYMENT_PROCESSING_INTERVAL_MS = 5000; // 5 seconds
const TIMEOUT_CHECKING_INTERVAL_MS = 5000; // 5 seconds

interface ActiveRound {
  tokenId: string;
  startTime: number;
  countdownInterval: NodeJS.Timeout | null;
}

class RoundTimer {
  private io: SocketIOServer | null = null;
  private activeRounds: Map<string, ActiveRound> = new Map();
  private monitorInterval: NodeJS.Timeout | null = null;
  private paymentProcessingInterval: NodeJS.Timeout | null = null;
  private timeoutCheckingInterval: NodeJS.Timeout | null = null;

  /**
   * Initialize the round timer with Socket.IO instance
   */
  initialize(io: SocketIOServer): void {
    this.io = io;
    logger.info('🎯 Round Timer initialized');
    
    // Start monitoring for tokens with pending requests (supply checks)
    this.startMonitoring();
    
    // Start payment processing (every 5 seconds)
    this.startPaymentProcessing();
    
    // Start timeout checking (every 5 seconds)
    this.startTimeoutChecking();
  }

  /**
   * Start monitoring for tokens that need round processing
   * Checks every second for new tokens with pending requests
   */
  private startMonitoring(): void {
    if (this.monitorInterval) {
      clearInterval(this.monitorInterval);
    }

    this.monitorInterval = setInterval(() => {
      const tokensWithPending = queueManager.getTokensWithPendingRequests();
      
      for (const tokenId of tokensWithPending) {
        if (!this.activeRounds.has(tokenId)) {
          // Start a new round for this token
          this.startRound(tokenId);
        }
      }

      // Clean up rounds for tokens with no more pending requests
      for (const [tokenId, round] of this.activeRounds.entries()) {
        const stats = queueManager.getQueueStats(tokenId);
        if (stats.totalPending === 0) {
          this.stopRound(tokenId);
        }
      }
    }, 1000);

    logger.info('📊 Round monitoring started (checking every 1s)');
  }

  /**
   * Start a new round for a token
   */
  private startRound(tokenId: string): void {
    if (this.activeRounds.has(tokenId)) {
      logger.warn({ tokenId }, 'Round already active for token');
      return;
    }

    const startTime = Date.now();
    
    logger.info({ tokenId }, '🎬 Starting new round');

    // Create round object
    const round: ActiveRound = {
      tokenId,
      startTime,
      countdownInterval: null
    };

    this.activeRounds.set(tokenId, round);

    // Start countdown updates (emit every second)
    round.countdownInterval = setInterval(() => {
      this.updateCountdown(tokenId);
    }, COUNTDOWN_INTERVAL_MS);

    // Schedule round processing at the end
    setTimeout(async () => {
      await this.executeRound(tokenId);
    }, ROUND_DURATION_MS);

    // Emit initial countdown
    this.emitCountdown(tokenId, 15);
  }

  /**
   * Stop a round for a token
   */
  private stopRound(tokenId: string): void {
    const round = this.activeRounds.get(tokenId);
    
    if (!round) {
      return;
    }

    if (round.countdownInterval) {
      clearInterval(round.countdownInterval);
    }

    this.activeRounds.delete(tokenId);
    
    logger.info({ tokenId }, '⏹️  Round stopped (no more pending requests)');
  }

  /**
   * Update countdown and emit to clients
   */
  private updateCountdown(tokenId: string): void {
    const round = this.activeRounds.get(tokenId);
    
    if (!round) {
      return;
    }

    const elapsed = Date.now() - round.startTime;
    const remaining = Math.max(0, Math.ceil((ROUND_DURATION_MS - elapsed) / 1000));

    this.emitCountdown(tokenId, remaining);

    if (remaining === 0) {
      // Stop countdown updates (round will execute)
      if (round.countdownInterval) {
        clearInterval(round.countdownInterval);
        round.countdownInterval = null;
      }
    }
  }

  /**
   * Emit countdown to all clients watching this token
   */
  private emitCountdown(tokenId: string, seconds: number): void {
    if (!this.io) {
      return;
    }

    const stats = queueManager.getQueueStats(tokenId);

    this.io.to(`token:${tokenId}`).emit('round-countdown', {
      tokenId,
      secondsRemaining: seconds,
      totalPending: stats.totalPending,
      nextRoundSize: Math.min(stats.totalPending, 10)
    });
  }

  /**
   * Execute supply check round for a token (Phase 1: check supply & request payment)
   */
  private async executeRound(tokenId: string): Promise<void> {
    const round = this.activeRounds.get(tokenId);
    
    if (!round) {
      return;
    }

    try {
      logger.info({ tokenId }, '⚡ Executing supply check round');

      // Process supply check and emit payment requests
      await roundProcessor.processSupplyCheckRound(tokenId, this.io || undefined);

      logger.info({ tokenId }, '✅ Supply check round completed');

      // Check if there are more pending requests
      const stats = queueManager.getQueueStats(tokenId);
      
      if (stats.totalPending > 0) {
        // Start next round immediately
        this.activeRounds.delete(tokenId);
        this.startRound(tokenId);
      } else {
        // No more requests, stop round
        this.stopRound(tokenId);
      }

    } catch (error: any) {
      logger.error({ 
        tokenId, 
        error: error.message,
        stack: error.stack
      }, '❌ Round execution failed');

      // Try to continue with next round
      const stats = queueManager.getQueueStats(tokenId);
      if (stats.totalPending > 0) {
        this.activeRounds.delete(tokenId);
        this.startRound(tokenId);
      } else {
        this.stopRound(tokenId);
      }
    }
  }

  /**
   * Get active round info for a token
   */
  getRoundInfo(tokenId: string): { active: boolean; secondsRemaining?: number } {
    const round = this.activeRounds.get(tokenId);
    
    if (!round) {
      return { active: false };
    }

    const elapsed = Date.now() - round.startTime;
    const remaining = Math.max(0, Math.ceil((ROUND_DURATION_MS - elapsed) / 1000));

    return {
      active: true,
      secondsRemaining: remaining
    };
  }

  /**
   * Start payment processing (Phase 2: verify VTXOs and execute batches)
   * Runs every 5 seconds globally for all tokens
   */
  private startPaymentProcessing(): void {
    if (this.paymentProcessingInterval) {
      clearInterval(this.paymentProcessingInterval);
    }

    this.paymentProcessingInterval = setInterval(async () => {
      try {
        await roundProcessor.processPaidRequests(this.io || undefined);
      } catch (error: any) {
        logger.error({ 
          error: error.message 
        }, '❌ Payment processing interval error');
      }
    }, PAYMENT_PROCESSING_INTERVAL_MS);

    logger.info(`💰 Payment processing started (every ${PAYMENT_PROCESSING_INTERVAL_MS / 1000}s)`);
  }

  /**
   * Start timeout checking (Phase 3: reject expired payment windows)
   * Runs every 5 seconds globally
   */
  private startTimeoutChecking(): void {
    if (this.timeoutCheckingInterval) {
      clearInterval(this.timeoutCheckingInterval);
    }

    this.timeoutCheckingInterval = setInterval(async () => {
      try {
        await roundProcessor.processPaymentTimeouts(this.io || undefined);
      } catch (error: any) {
        logger.error({ 
          error: error.message 
        }, '❌ Timeout checking interval error');
      }
    }, TIMEOUT_CHECKING_INTERVAL_MS);

    logger.info(`⏰ Timeout checking started (every ${TIMEOUT_CHECKING_INTERVAL_MS / 1000}s)`);
  }

  /**
   * Stop all rounds and monitoring
   */
  shutdown(): void {
    if (this.monitorInterval) {
      clearInterval(this.monitorInterval);
      this.monitorInterval = null;
    }

    if (this.paymentProcessingInterval) {
      clearInterval(this.paymentProcessingInterval);
      this.paymentProcessingInterval = null;
    }

    if (this.timeoutCheckingInterval) {
      clearInterval(this.timeoutCheckingInterval);
      this.timeoutCheckingInterval = null;
    }

    for (const [tokenId] of this.activeRounds.entries()) {
      this.stopRound(tokenId);
    }

    logger.info('🛑 Round Timer shutdown');
  }
}

// Singleton instance
export const roundTimer = new RoundTimer();
