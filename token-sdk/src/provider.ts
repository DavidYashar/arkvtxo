/**
 * Token Provider - connects to Token Indexer REST API
 */

import {
  ITokenProvider,
  TokenMetadata,
  TokenBalance,
  TokenTransfer,
} from './types';

export class TokenProvider implements ITokenProvider {
  constructor(private readonly baseUrl: string) {
    console.log('🔧 TokenProvider initialized with baseUrl:', baseUrl);
  }

  async getToken(tokenId: string): Promise<TokenMetadata> {
    const response = await fetch(`${this.baseUrl}/api/tokens/${tokenId}`);
    
    if (!response.ok) {
      throw new Error(`Failed to fetch token: ${response.statusText}`);
    }
    
    const data = await response.json() as any;
    
    return {
      tokenId: data.tokenId,
      name: data.name,
      symbol: data.symbol,
      totalSupply: BigInt(data.totalSupply),
      decimals: data.decimals,
      creator: data.creator,
      createdAt: data.createdAt ? new Date(data.createdAt) : undefined,
    };
  }

  async getBalance(address: string, tokenId: string): Promise<bigint> {
    const response = await fetch(
      `${this.baseUrl}/api/balances/${address}/${tokenId}`
    );
    
    if (!response.ok) {
      if (response.status === 404) {
        return 0n; // No balance
      }
      throw new Error(`Failed to fetch balance: ${response.statusText}`);
    }
    
    const data = await response.json() as any;
    return BigInt(data.balance);
  }

  async getBalances(address: string): Promise<TokenBalance[]> {
    const url = `${this.baseUrl}/api/balances/${address}`;
    console.log('📡 TokenProvider.getBalances - Fetching from:', url);
    const response = await fetch(url);
    
    if (!response.ok) {
      throw new Error(`Failed to fetch balances: ${response.statusText}`);
    }
    
    const data = await response.json() as any;
    
    return data.balances.map((b: any) => ({
      address: b.address,
      tokenId: b.tokenId,
      balance: BigInt(b.balance),
      symbol: b.symbol,
    }));
  }

  async getTransfers(
    address: string,
    tokenId?: string
  ): Promise<TokenTransfer[]> {
    const url = tokenId
      ? `${this.baseUrl}/api/transfers/${address}?tokenId=${tokenId}`
      : `${this.baseUrl}/api/transfers/${address}`;
    
    console.log('📡 TokenProvider.getTransfers - Fetching from:', url);
    const response = await fetch(url);
    
    if (!response.ok) {
      throw new Error(`Failed to fetch transfers: ${response.statusText}`);
    }
    
    const data = await response.json() as any;
    
    return data.transfers.map((t: any) => ({
      txid: t.txid,
      tokenId: t.tokenId,
      from: t.fromAddress,
      to: t.toAddress,
      amount: BigInt(t.amount),
      timestamp: new Date(t.timestamp),
      blockHeight: t.blockHeight,
    }));
  }

  async getTransaction(txid: string): Promise<TokenTransfer | null> {
    const response = await fetch(
      `${this.baseUrl}/api/transactions/${txid}`
    );
    
    if (!response.ok) {
      if (response.status === 404) {
        return null;
      }
      throw new Error(`Failed to fetch transaction: ${response.statusText}`);
    }
    
    const data = await response.json() as any;
    
    return {
      txid: data.txid,
      tokenId: data.tokenId,
      from: data.from,
      to: data.to,
      amount: BigInt(data.amount),
      timestamp: new Date(data.timestamp),
      blockHeight: data.blockHeight,
    };
  }

  /**
   * Register a new token with the indexer
   * Now supports Bitcoin L1 proof fields
   */
  async registerToken(params: {
    tokenId: string;
    name: string;
    symbol: string;
    totalSupply: string;
    decimals: number;
    creator: string;
    vtxoId?: string;            // Optional for pending tokens
    status?: string;            // pending | confirmed | failed
    bitcoinProof?: string;      // Bitcoin L1 TXID
    bitcoinAddress?: string;    // Bitcoin L1 address
    opReturnData?: string;      // Hex-encoded OP_RETURN data
    confirmations?: number;     // Bitcoin confirmations
    isPresale?: boolean;        // Is presale token
    presaleBatchAmount?: string | null;
    priceInSats?: string | null;
    maxPurchasesPerWallet?: number | null;
  }): Promise<void> {
    const url = `${this.baseUrl}/api/tokens`;
    console.log(' TokenProvider.registerToken called');
    console.log('  URL:', url);
    console.log('  Params:', params);
    
    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(params),
      });

      console.log('  Response status:', response.status, response.statusText);

      if (!response.ok) {
        const error = await response.text();
        console.error('  Response error:', error);
        throw new Error(`Failed to register token: ${response.statusText} - ${error}`);
      }
      
      const data = await response.json();
      console.log('  Success! Response data:', data);
    } catch (error) {
      console.error('  Fetch error:', error);
      throw error;
    }
  }

  /**
   * Record a token transfer with the indexer
   */
  async recordTransfer(params: {
    tokenId: string;
    fromAddress: string;
    toAddress: string;
    amount: string;
    vtxoId: string;
  }): Promise<void> {
    const response = await fetch(`${this.baseUrl}/api/transfers`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(params),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Failed to record transfer: ${response.statusText} - ${error}`);
    }
  }
}
