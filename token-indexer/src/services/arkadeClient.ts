/**
 * Arkade ASP Client
 *
 * Notes:
 * - The public Arkade host (https://arkade.computer) exposes v8 REST routes under `/v1/indexer/*`.
 * - Our app currently stores the result of `wallet.settle()` as `vtxoId`, but that value is a txid
 *   (commitment txid), not an outpoint.
 */

import { logger } from '../utils/logger';

export interface VtxoInfo {
  txid: string;
  vout: number;
  amount: number;
  address: string;
  spendable: boolean;
}

type GrpcGatewayErrorBody = {
  code?: number;
  message?: string;
  details?: unknown[];
};

function looksLikeNotFound(err: GrpcGatewayErrorBody | undefined): boolean {
  if (!err) return false;
  if (err.code === 5) return true; // gRPC NotFound
  const msg = (err.message ?? '').toLowerCase();
  return (
    msg.includes('not found') ||
    msg.includes('no rows in result set') ||
    msg.includes('vtxo not found')
  );
}

export class ArkadeClient {
  constructor(private readonly arkServerUrl: string) {}

  /**
   * Verify a settlement txid exists on the Arkade ASP.
   *
   * Despite the name, `vtxoId` is currently a txid returned by the SDK's `wallet.settle()`.
   */
  async verifyVtxo(vtxoId: string, expectedAddress?: string): Promise<boolean> {
    try {
      logger.info({ vtxoId, expectedAddress }, 'Verifying VTXO with Arkade ASP');

      // The most reliable non-streaming check is asking the Indexer for the commitment tx.
      const response = await fetch(`${this.arkServerUrl}/v1/indexer/commitmentTx/${vtxoId}`);

      if (response.ok) {
        logger.info({ vtxoId }, 'Commitment tx verified successfully');
        return true;
      }

      // Some gateway deployments return 500 with a gRPC error body for "not found".
      const text = await response.text().catch(() => '');
      let body: GrpcGatewayErrorBody | undefined;
      try {
        body = text ? (JSON.parse(text) as GrpcGatewayErrorBody) : undefined;
      } catch {
        body = undefined;
      }

      if (response.status === 404 || looksLikeNotFound(body)) {
        logger.warn({ vtxoId, status: response.status, body }, 'Commitment tx not found on Arkade ASP');
        return false;
      }

      throw new Error(
        `ASP returned ${response.status}: ${response.statusText}${text ? ` body=${text}` : ''}`
      );
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

      // v8 indexer exposes non-streaming virtual tx lookup.
      // For unknown txids it still returns 200 with an empty list, so we must inspect the body.
      const response = await fetch(`${this.arkServerUrl}/v1/indexer/virtualTx/${txid}`);

      if (!response.ok) {
        const text = await response.text().catch(() => '');
        let body: GrpcGatewayErrorBody | undefined;
        try {
          body = text ? (JSON.parse(text) as GrpcGatewayErrorBody) : undefined;
        } catch {
          body = undefined;
        }

        if (response.status === 404 || looksLikeNotFound(body)) {
          logger.warn({ txid, status: response.status, body }, 'Transaction not found on Arkade ASP');
          return false;
        }

        throw new Error(
          `ASP returned ${response.status}: ${response.statusText}${text ? ` body=${text}` : ''}`
        );
      }

      const data = (await response.json()) as { txs?: unknown[] };
      const found = Array.isArray(data.txs) && data.txs.length > 0;
      if (!found) {
        logger.warn({ txid }, 'Transaction not found on Arkade ASP (empty result)');
        return false;
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
      // We don't have an outpoint here (only txid), so we can't reliably determine spentness.
      // Treat "not found" as spent/invalid.
      const ok = await this.verifyVtxo(vtxoId);
      return !ok;
    } catch (error) {
      logger.error({ error, vtxoId }, 'Failed to check VTXO spent status');
      return true; // Fail closed - assume spent if can't verify
    }
  }
}
