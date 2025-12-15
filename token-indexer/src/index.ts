/**
 * Main entry point for token indexer
 */

import dotenv from 'dotenv';
import { TokenIndexer } from './indexer';
import { createApiServer } from './api/server';
import { logger } from './utils/logger';

// Load environment variables
dotenv.config();

const PORT = process.env.PORT || 3002;
const ARKADE_INDEXER_URL = process.env.ARKADE_INDEXER_URL || 'http://localhost:7070';

async function main() {
  logger.info('Starting Arkade Token Indexer...');

  // Start API server with WebSocket support
  const httpServer = createApiServer();
  httpServer.listen(PORT, () => {
    logger.info(`\n🚀 Token Indexer + ASP VTXO Service + WebSocket running on port ${PORT}`);
    logger.info(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
    logger.info(`\n📦 Token Endpoints:`);
    logger.info(`   GET  /api/tokens - List all tokens`);
    logger.info(`   GET  /api/tokens/:tokenId - Get token details`);
    logger.info(`   GET  /api/balances/:address - Get balances for address`);
    logger.info(`   POST /api/transfers - Record token transfer`);
    logger.info(`\n🔗 ASP VTXO Endpoints (Public):`);
    logger.info(`   GET  /api/asp/history/:address - Transaction history`);
    logger.info(`   GET  /api/asp/vtxos/:address - Get VTXOs for address`);
    logger.info(`   GET  /api/asp/vtxo-chain/:txid/:vout - VTXO chain info`);
    logger.info(`\n🔐 ASP SDK Endpoints (POST with privateKey):`);
    logger.info(`   POST /api/asp/sdk/vtxos - Get wallet VTXOs`);
    logger.info(`   POST /api/asp/sdk/balance - Get wallet balance`);
    logger.info(`   POST /api/asp/sdk/history - Get wallet history`);
    logger.info(`   POST /api/asp/sdk/address - Derive address`);
    logger.info(`   POST /api/asp/sdk/verify-vtxo - Verify VTXO in wallet`);
    logger.info(`\n🎯 Round-Based Purchase Endpoints:`);
    logger.info(`   POST /api/presale/round-purchase - Submit purchase to queue`);
    logger.info(`   GET  /api/presale/queue-status/:tokenId/:wallet - Get queue status`);
    logger.info(`   GET  /api/presale/queue-stats/:tokenId - Get queue statistics`);
    logger.info(`\n🔌 WebSocket Events:`);
    logger.info(`   📥 join-wallet / join-token - Subscribe to updates`);
    logger.info(`   📤 round-countdown - Real-time countdown (every second)`);
    logger.info(`   📤 round-completed - Round result notification`);
    logger.info(`   📤 purchase-confirmed - Purchase success`);
    logger.info(`   📤 purchase-rejected - Purchase rejection with reason`);
    logger.info(`\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
  });

  // Start indexer
  const indexer = new TokenIndexer(ARKADE_INDEXER_URL);
  await indexer.start();

  // Handle shutdown
  process.on('SIGINT', async () => {
    logger.info('Shutting down...');
    await indexer.stop();
    process.exit(0);
  });
}

main().catch((error) => {
  logger.error({ error }, 'Fatal error');
  process.exit(1);
});
