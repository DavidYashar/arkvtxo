/**
 * Arkade ASP Client - verifies VTXOs with Arkade blockchain
 */

import { logger } from '../utils/logger';

export interface VtxoInfo {
  txid: string;
  vout: number;
  amount: number;
  address: string;
  spendable: boolean;
}

export class ArkadeClient {
  constructor(private readonly arkServerUrl: string) {}

  /**
   * Verify a VTXO exists on Arkade ASP
   */
  async verifyVtxo(vtxoId: string, expectedAddress?: string): Promise<boolean> {
    try {
      logger.info({ vtxoId, expectedAddress }, 'Verifying VTXO with Arkade ASP');

      // Query Arkade ASP for VTXO details
      const response = await fetch(`${this.arkServerUrl}/v1/vtxos/${vtxoId}`);
      
      if (!response.ok) {
        if (response.status === 404) {
          logger.warn({ vtxoId }, 'VTXO not found on Arkade ASP');
          return false;
        }
        throw new Error(`ASP returned ${response.status}: ${response.statusText}`);
      }

      const vtxo = await response.json() as VtxoInfo;
      
      // Verify VTXO exists and is spendable
      if (!vtxo.spendable) {
        logger.warn({ vtxoId }, 'VTXO exists but is not spendable');
        return false;
      }

      // If address provided, verify it matches
      if (expectedAddress && vtxo.address !== expectedAddress) {
        logger.warn(
          { vtxoId, expectedAddress, actualAddress: vtxo.address },
          'VTXO address mismatch'
        );
        return false;
      }

      logger.info({ vtxoId, amount: vtxo.amount }, 'VTXO verified successfully');
      return true;
    } catch (error) {
      logger.error({ error, vtxoId }, 'Failed to verify VTXO with ASP');
      return false;
    }
  }

  /**
   * Verify a transaction exists on Arkade ASP
   */
  async verifyTransaction(txid: string): Promise<boolean> {
    try {
      logger.info({ txid }, 'Verifying transaction with Arkade ASP');

      const response = await fetch(`${this.arkServerUrl}/v1/transactions/${txid}`);
      
      if (!response.ok) {
        if (response.status === 404) {
          logger.warn({ txid }, 'Transaction not found on Arkade ASP');
          return false;
        }
        throw new Error(`ASP returned ${response.status}: ${response.statusText}`);
      }

      logger.info({ txid }, 'Transaction verified successfully');
      return true;
    } catch (error) {
      logger.error({ error, txid }, 'Failed to verify transaction with ASP');
      return false;
    }
  }

  /**
   * Check if VTXO has been spent (to prevent double-spending)
   */
  async isVtxoSpent(vtxoId: string): Promise<boolean> {
    try {
      const response = await fetch(`${this.arkServerUrl}/v1/vtxos/${vtxoId}`);
      
      if (!response.ok) {
        return true; // If not found, assume spent
      }

      const vtxo = await response.json() as VtxoInfo;
      return !vtxo.spendable;
    } catch (error) {
      logger.error({ error, vtxoId }, 'Failed to check VTXO spent status');
      return true; // Fail closed - assume spent if can't verify
    }
  }
}
