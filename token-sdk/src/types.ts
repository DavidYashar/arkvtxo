/**
 * Type definitions for Token SDK
 */

export interface TokenMetadata {
  tokenId: string;
  name: string;
  symbol: string;
  totalSupply: bigint;
  decimals: number;
  creator: string;
  createdAt?: Date;
}

export interface TokenBalance {
  address: string;
  tokenId: string;
  balance: bigint;
  symbol?: string;
}

export interface TokenTransfer {
  txid: string;
  tokenId: string;
  from: string;
  to: string;
  amount: bigint;
  timestamp: Date;
  blockHeight?: number;
}

export interface CreateTokenParams {
  name: string;
  symbol: string;
  totalSupply: bigint;
  decimals?: number;
  metadata?: Record<string, string>;
  // Pre-sale fields
  presaleBatchAmount?: bigint;
  priceInSats?: bigint;
  maxPurchasesPerWallet?: number;
  // Fee configuration
  feeRate?: number; // Optional: sat/vbyte fee rate (auto-fetched if not provided)
}

export interface TransferTokenParams {
  tokenId: string;
  to: string;
  amount: bigint;
}

export interface BurnTokenParams {
  tokenId: string;
  amount: bigint;
}

/**
 * OP_RETURN encoded token operation types
 */
export enum TokenOpType {
  CREATE = 0x01,
  TRANSFER = 0x02,
  BURN = 0x03,
}

/**
 * Encoded token operation in OP_RETURN
 */
export interface TokenOperation {
  version: number;
  opType: TokenOpType;
  tokenId: string;
  amount: bigint;
  data: Uint8Array;
}

/**
 * Token provider interface for querying indexer
 */
export interface ITokenProvider {
  getToken(tokenId: string): Promise<TokenMetadata>;
  getBalance(address: string, tokenId: string): Promise<bigint>;
  getBalances(address: string): Promise<TokenBalance[]>;
  getTransfers(address: string, tokenId?: string): Promise<TokenTransfer[]>;
  getTransaction(txid: string): Promise<TokenTransfer | null>;
}
