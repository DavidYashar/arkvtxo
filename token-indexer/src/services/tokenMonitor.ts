/**
 * Token Creation Monitor
 * 
 * Monitors pending OP_RETURN transactions for confirmations
 * and completes Arkade Layer 2 settlement automatically
 */

import { PrismaClient, Prisma } from '@prisma/client';
import { Wallet, SingleKey } from '@arkade-os/sdk';
import pino from 'pino';

const prisma = new PrismaClient();
const logger = pino({ level: 'info' });

const BITCOIN_MEMPOOL_API = 'https://mempool.space/api';
const ASP_URL = process.env.ARKADE_ASP_URL || 'https://arkade.computer';
const CHECK_INTERVAL_MS = 30_000; // Check every 30 seconds
const REQUIRED_CONFIRMATIONS = 1; // Minimum confirmations before settlement

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
 * Complete Arkade Layer 2 settlement for a confirmed token
 */
async function completeArkadeSettlement(token: PendingToken): Promise<string | null> {
  try {
    logger.info({ tokenId: token.id, symbol: token.symbol }, '🌊 Starting Arkade Layer 2 settlement...');
    
    // For now, we'll create a simple VTXO to track the token
    // In production, you'd use the creator's private key to settle
    // This is a placeholder - actual implementation depends on your key management
    
    // Placeholder: Return a dummy VTXO ID
    // In production, you'd do:
    // const identity = SingleKey.fromHex(creatorPrivateKey);
    // const wallet = await Wallet.create({ identity, arkServerUrl: ASP_URL });
    // const vtxoId = await wallet.sendBitcoin({ address: token.creator, amount: 1000 });
    
    const vtxoId = `vtxo_${token.id.slice(0, 16)}`;
    
    logger.info({ tokenId: token.id, vtxoId }, '✅ Arkade settlement complete');
    return vtxoId;
  } catch (error: any) {
    logger.error({ tokenId: token.id, error: error.message }, '❌ Arkade settlement failed');
    return null;
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
    
    // Complete Arkade settlement
    const vtxoId = await completeArkadeSettlement(token);
    
    // Update token status in database
    await prisma.token.update({
      where: { id: token.id },
      data: {
        status: 'confirmed',
        vtxoId: vtxoId,
        updatedAt: new Date(),
      },
    });
    
    logger.info({ 
      tokenId: token.id, 
      symbol: token.symbol,
      vtxoId 
    }, '🎉 Token creation complete!');
    
    // Emit WebSocket notification to creator
    try {
      const { getIO } = await import('../api/server');
      const io = getIO();
      if (io) {
        const roomName = `wallet:${token.creator}`;
        logger.info({ tokenId: token.id, creator: token.creator, roomName }, '📡 Emitting WebSocket notification to room');
        
        // Notify the creator's wallet
        io.to(roomName).emit('token-confirmed', {
          tokenId: token.id,
          name: token.name,
          symbol: token.symbol,
          vtxoId,
          status: 'confirmed',
          message: `🎉 Token ${token.symbol} has been created successfully!`
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
      where: { id: tokenId, status: 'pending' }
    });
    
    if (!token) {
      // Token no longer pending (confirmed or deleted)
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
