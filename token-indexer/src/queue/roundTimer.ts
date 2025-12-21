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
import { logger } from '../utils/logger';

/**
 * IMPORTANT:
 * This project previously used background timers (15s “rounds”, 5s payment processing, etc).
 * On Render / multi-instance deployments, background intervals are a reliability risk.
 *
 * We now run supply promotion, timeout cleanup, and payment verification on-demand
 * (triggered by user API calls), so this timer is intentionally a no-op.
 */

class RoundTimer {
  private io: SocketIOServer | null = null;

  /**
   * Initialize the round timer with Socket.IO instance
   */
  initialize(io: SocketIOServer): void {
    this.io = io;
    logger.info('🎯 Round Timer initialized (disabled: on-demand presale processing)');
  }

  /**
   * Get active round info for a token
   */
  getRoundInfo(tokenId: string): { active: boolean; secondsRemaining?: number } {
    void tokenId;
    return { active: false };
  }

  /**
   * Stop all rounds and monitoring
   */
  shutdown(): void {
    this.io = null;
    logger.info('🛑 Round Timer shutdown (disabled: no background intervals)');
  }
}

// Singleton instance
export const roundTimer = new RoundTimer();
