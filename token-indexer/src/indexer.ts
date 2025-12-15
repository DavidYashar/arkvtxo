/**
 * Token Indexer - Main indexer logic
 * 
 * Watches Arkade commitment transactions for OP_RETURN data,
 * decodes token operations, and updates database.
 */

import { PrismaClient } from '@prisma/client';
import { logger } from './utils/logger';
import { decodeTokenOperation, TokenOpType } from './token/parser';
import { validateTokenOperation } from './token/validator';
import { processTokenCreate, processTokenTransfer, processTokenBurn } from './token/processor';

const prisma = new PrismaClient();

export class TokenIndexer {
  private isRunning = false;

  constructor(
    private readonly arkadeIndexerUrl: string
  ) {}

  /**
   * Start indexing
   */
  async start() {
    logger.info('Starting token indexer...');
    this.isRunning = true;

    // TODO: Subscribe to Arkade indexer for new transactions
    // For now, we'll implement polling
    await this.pollTransactions();
  }

  /**
   * Stop indexing
   */
  async stop() {
    logger.info('Stopping token indexer...');
    this.isRunning = false;
  }

  /**
   * Poll for new transactions (temporary until websocket subscription)
   */
  private async pollTransactions() {
    while (this.isRunning) {
      try {
        // Query Arkade indexer for recent commitment transactions
        // This is a placeholder - actual implementation depends on Arkade indexer API
        
        // Skip if no Arkade indexer URL configured
        if (!this.arkadeIndexerUrl || this.arkadeIndexerUrl === 'http://localhost:7070') {
          logger.warn('Arkade indexer URL not configured or using default. Waiting...');
          await this.sleep(30000); // Wait 30 seconds
          continue;
        }
        
        const response = await fetch(`${this.arkadeIndexerUrl}/api/transactions?limit=100`, {
          headers: { 'Accept': 'application/json' },
        });
        
        if (!response.ok) {
          logger.warn({ status: response.status, url: this.arkadeIndexerUrl }, 
            'Failed to fetch transactions from Arkade indexer - is it running?');
          await this.sleep(30000); // Wait 30 seconds before retry
          continue;
        }

        const data = await response.json() as any;
        const transactions = data.transactions || [];
        
        if (transactions.length > 0) {
          logger.info({ count: transactions.length }, 'Processing transactions');
        }

        for (const tx of transactions) {
          await this.processTransaction(tx);
        }

        // Wait before next poll
        await this.sleep(5000); // 5 seconds
      } catch (error) {
        const err = error as Error;
        logger.error({ 
          message: err.message, 
          stack: err.stack,
          url: this.arkadeIndexerUrl 
        }, 'Error polling transactions');
        await this.sleep(30000); // Wait longer after error
      }
    }
  }

  /**
   * Process a single transaction
   */
  async processTransaction(tx: any) {
    const txid = tx.txid || tx.id;

    // Check if already processed (idempotency)
    const existing = await prisma.processedTransaction.findUnique({
      where: { txid },
    });

    if (existing) {
      return; // Already processed
    }

    try {
      // Find OP_RETURN outputs
      const opReturnData = this.extractOpReturnData(tx);

      if (!opReturnData) {
        // No OP_RETURN, not a token transaction
        await this.markProcessed(txid, true);
        return;
      }

      // Decode token operation
      const tokenOp = decodeTokenOperation(opReturnData);

      if (!tokenOp) {
        // Not a valid token operation
        await this.markProcessed(txid, true);
        return;
      }

      logger.info({ txid, opType: tokenOp.opType }, 'Processing token operation');

      // Validate operation
      const validation = await validateTokenOperation(tokenOp, tx, prisma);

      if (!validation.valid) {
        logger.warn({ txid, reason: validation.reason }, 'Invalid token operation');
        await this.markProcessed(txid, false, validation.reason);
        return;
      }

      // Process based on operation type
      switch (tokenOp.opType) {
        case TokenOpType.CREATE:
          await processTokenCreate(tokenOp, tx, prisma);
          break;

        case TokenOpType.TRANSFER:
          await processTokenTransfer(tokenOp, tx, prisma);
          break;

        case TokenOpType.BURN:
          await processTokenBurn(tokenOp, tx, prisma);
          break;

        default:
          logger.warn({ opType: tokenOp.opType }, 'Unknown operation type');
      }

      await this.markProcessed(txid, true);
      logger.info({ txid }, 'Token operation processed successfully');

    } catch (error) {
      logger.error({ error, txid }, 'Error processing transaction');
      await this.markProcessed(txid, false, (error as Error).message);
    }
  }

  /**
   * Extract OP_RETURN data from transaction
   */
  private extractOpReturnData(tx: any): Buffer | null {
    // TODO: Parse transaction outputs and find OP_RETURN
    // This depends on the format of transactions from Arkade indexer
    
    if (!tx.outputs || tx.outputs.length === 0) {
      return null;
    }

    for (const output of tx.outputs) {
      // Check if output is OP_RETURN
      if (output.scriptPubKey && output.scriptPubKey.startsWith('6a')) {
        // Parse hex script
        const script = Buffer.from(output.scriptPubKey, 'hex');
        
        if (script[0] === 0x6a) { // OP_RETURN
          // Extract data
          if (script[1] === 0x4c) { // OP_PUSHDATA1
            const length = script[2];
            return script.slice(3, 3 + length);
          } else {
            const length = script[1];
            return script.slice(2, 2 + length);
          }
        }
      }
    }

    return null;
  }

  /**
   * Mark transaction as processed
   */
  private async markProcessed(txid: string, success: boolean, errorMsg?: string) {
    await prisma.processedTransaction.upsert({
      where: { txid },
      create: {
        txid,
        success,
        errorMsg,
      },
      update: {
        success,
        errorMsg,
        processedAt: new Date(),
      },
    });
  }

  /**
   * Sleep utility
   */
  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}
