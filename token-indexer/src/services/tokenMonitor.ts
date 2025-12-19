/**
 * Token Creation Monitor
 * 
 * Monitors pending OP_RETURN transactions for confirmations
 * and completes Arkade Layer 2 settlement automatically
 */

import { PrismaClient } from '@prisma/client';
import pino from 'pino';

const prisma = new PrismaClient();
const logger = pino({ level: 'info' });

const BITCOIN_MEMPOOL_API = 'https://mempool.space/api';
const CHECK_INTERVAL_MS = 30_000; // Check every 30 seconds
const REQUIRED_CONFIRMATIONS = 1; // Minimum confirmations before allowing settlement

interface MempoolTxStatus {
  confirmed: boolean;
  block_height?: number;
  block_hash?: string;
  block_time?: number;
}

interface PendingToken {
  id: string; // Bitcoin TXID
  name: string;
  symbol: string;
  totalSupply: string;
  decimals: number;
  creator: string;
  issuer?: string;
  status: string;
  createdAt: Date;
}

/**
 * Check if a Bitcoin transaction has been confirmed
 */
async function checkBitcoinConfirmation(txid: string): Promise<number> {
  try {
    const response = await fetch(`${BITCOIN_MEMPOOL_API}/tx/${txid}/status`);
    if (!response.ok) {
      throw new Error(`Failed to fetch tx status: ${response.status}`);
    }
    
    const status = await response.json() as MempoolTxStatus;
    return status.confirmed ? (status.block_height ? 1 : 0) : 0;
  } catch (error: any) {
    logger.error({ txid, error: error.message }, '❌ Failed to check Bitcoin confirmation');
    return 0;
  }
}

/**
 * Process a single pending token
 */
async function processPendingToken(token: PendingToken): Promise<boolean> {
  try {
    logger.info({ tokenId: token.id, symbol: token.symbol }, '🔍 Checking token confirmation status...');
    
    // Check Bitcoin confirmation
    const confirmations = await checkBitcoinConfirmation(token.id);
    
    if (confirmations < REQUIRED_CONFIRMATIONS) {
      logger.info({ 
        tokenId: token.id, 
        confirmations, 
        required: REQUIRED_CONFIRMATIONS 
      }, '⏳ Waiting for confirmations...');
      return false;
    }
    
    logger.info({ tokenId: token.id, confirmations }, '✅ Bitcoin transaction confirmed!');

    // Bitcoin is confirmed. Next step is a NON-CUSTODIAL ASP action:
    // the client wallet sends a small amount (1000 sats) to itself via the ASP,
    // then POST /api/tokens/:tokenId/settle with the resulting txid.
    await prisma.token.update({
      where: { id: token.id },
      data: {
        status: 'awaiting_settlement',
        confirmations: confirmations,
        updatedAt: new Date(),
      },
    });
    
    logger.info({ 
      tokenId: token.id, 
      symbol: token.symbol,
    }, '✅ Token ready for settlement (awaiting_settlement)');
    
    // Emit WebSocket notification to creator
    try {
      const { getIO } = await import('../api/server');
      const io = getIO();
      if (io) {
        const issuerAddress = token.issuer || token.creator;
        const roomName = `wallet:${issuerAddress}`;
        logger.info({ tokenId: token.id, issuerAddress, roomName }, '📡 Emitting WebSocket notification to room');

        // Notify the issuer wallet to perform client-side finalization.
        io.to(roomName).emit('token-bitcoin-confirmed', {
          tokenId: token.id,
          name: token.name,
          symbol: token.symbol,
          issuerAddress,
          status: 'awaiting_settlement',
          confirmations,
          message: `✅ Bitcoin confirmed for ${token.symbol}. Finalizing via ASP self-send...`
        });
        
        logger.info({ tokenId: token.id, roomName }, '✅ WebSocket notification sent');
      } else {
        logger.warn('⚠️ WebSocket IO not available');
      }
    } catch (error: any) {
      logger.warn({ error: error.message }, '⚠️ Failed to send WebSocket notification');
    }
    
    return true;
  } catch (error: any) {
    logger.error({ 
      tokenId: token.id, 
      error: error.message 
    }, '❌ Failed to process pending token');
    return false;
  }
}

// Removed global monitorPendingTokens() - now using on-demand per-token monitoring

// Track active monitoring sessions
let activeMonitors = new Map<string, NodeJS.Timeout>();

/**
 * Start monitoring a specific pending token
 * This is called when a new pending token is registered
 */
export function startMonitoringToken(tokenId: string): void {
  // Don't start if already monitoring
  if (activeMonitors.has(tokenId)) {
    logger.debug({ tokenId }, 'Token already being monitored');
    return;
  }
  
  logger.info({ tokenId, intervalSeconds: CHECK_INTERVAL_MS / 1000 }, '🔄 Starting monitor for pending token');
  
  // Initial check immediately
  checkSingleToken(tokenId);
  
  // Set up interval for this specific token
  const intervalId = setInterval(() => {
    checkSingleToken(tokenId);
  }, CHECK_INTERVAL_MS);
  
  activeMonitors.set(tokenId, intervalId);
}

/**
 * Stop monitoring a specific token (when confirmed or failed)
 */
function stopMonitoringToken(tokenId: string): void {
  const intervalId = activeMonitors.get(tokenId);
  if (intervalId) {
    clearInterval(intervalId);
    activeMonitors.delete(tokenId);
    logger.info({ tokenId }, '✅ Stopped monitoring token');
  }
}

/**
 * Check a single token's confirmation status
 */
async function checkSingleToken(tokenId: string): Promise<void> {
  try {
    const token = await prisma.token.findUnique({
      where: { id: tokenId }
    });

    if (!token || token.status !== 'pending') {
      // Token no longer pending (confirmed/failed/deleted)
      stopMonitoringToken(tokenId);
      return;
    }
    
    logger.info({ tokenId, symbol: token.symbol }, '🔍 Checking token confirmation...');
    
    const success = await processPendingToken(token as unknown as PendingToken);
    
    if (success) {
      // Token confirmed, stop monitoring
      stopMonitoringToken(tokenId);
    }
  } catch (error: any) {
    logger.error({ tokenId, error: error.message }, '❌ Error checking token');
  }
}

/**
 * Initialize token monitor on startup
 * Check for any existing pending tokens and start monitoring them
 */
export function startTokenMonitor(): void {
  logger.info('🔧 Initializing token creation monitor (on-demand mode)');
  
  // Check for any existing pending tokens on startup
  prisma.token.findMany({
    where: { status: 'pending' },
    select: { id: true, symbol: true }
  }).then((pendingTokens) => {
    if (pendingTokens.length > 0) {
      logger.info({ count: pendingTokens.length }, '🔄 Found existing pending tokens, starting monitors...');
      pendingTokens.forEach(token => {
        startMonitoringToken(token.id);
      });
    } else {
      logger.info('✅ No pending tokens on startup. Monitors will start on-demand when tokens are created.');
    }
  }).catch((error) => {
    logger.error({ error: error.message }, '❌ Failed to check for pending tokens on startup');
  });
}

/**
 * Manually trigger a check for a specific token
 */
export async function checkTokenStatus(tokenId: string): Promise<boolean> {
  try {
    const token = await prisma.token.findUnique({
      where: { id: tokenId },
    });
    
    if (!token) {
      logger.warn({ tokenId }, 'Token not found');
      return false;
    }
    
    if (token.status !== 'pending') {
      logger.info({ tokenId, status: token.status }, 'Token is not pending');
      return false;
    }
    
    return await processPendingToken(token as unknown as PendingToken);
  } catch (error: any) {
    logger.error({ tokenId, error: error.message }, '❌ Failed to check token status');
    return false;
  }
}
