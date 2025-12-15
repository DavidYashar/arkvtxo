/**
 * Token VTXO Builder
 * 
 * Creates Taproot VTXOs with embedded token metadata for use with Arkade.
 */

import * as bitcoin from 'bitcoinjs-lib';
import {
  TokenMetadata,
  TokenCreationData,
  encodeTokenMetadata,
  generateTokenId,
  validateTokenCreation,
  validateTransfer,
  METADATA_VERSION,
} from './metadata';

// Type for Arkade wallet (any to avoid dependency)
type ArkadeWallet = any;

// ECC initialization flag
let eccInitialized = false;

// Initialize ECC library for bitcoinjs-lib (lazy init)
async function initEcc() {
  if (eccInitialized) return;
  
  try {
    // Try to load tiny-secp256k1
    const ecc = await import('tiny-secp256k1');
    bitcoin.initEccLib(ecc);
    eccInitialized = true;
  } catch (error) {
    console.warn('Failed to initialize ECC library:', error);
    // Continue without ECC - might work for some operations
  }
}

export interface TokenVTXOConfig {
  network?: bitcoin.Network;
  exitTimelock?: number; // Blocks for unilateral exit (default 144)
}

export class TokenVTXOBuilder {
  private network: bitcoin.Network;
  private exitTimelock: number;

  constructor(config: TokenVTXOConfig = {}) {
    this.network = config.network || bitcoin.networks.testnet;
    this.exitTimelock = config.exitTimelock || 144;
  }

  /**
   * Create a token VTXO with embedded metadata
   */
  async createTokenVTXO(
    wallet: ArkadeWallet,
    tokenId: Buffer,
    amount: bigint,
    recipient: Buffer,
    decimals: number,
    serverKey?: Buffer
  ): Promise<{ script: Buffer; metadata: TokenMetadata }> {
    // Create metadata
    const metadata: TokenMetadata = {
      version: METADATA_VERSION,
      tokenId,
      amount,
      decimals,
      owner: recipient,
    };

    // Encode metadata as script leaf
    const metadataScript = encodeTokenMetadata(metadata);

    // Validate metadata script was created
    if (!metadataScript || metadataScript.length === 0) {
      throw new Error('Failed to create metadata script');
    }
    
    console.log('Created token metadata script:', {
      length: metadataScript.length,
      tokenId: tokenId.toString('hex').slice(0, 16) + '...',
      amount: amount.toString(),
      decimals,
    });

    // For now, return just the metadata script
    // Arkade SDK will handle creating the actual VTXO with proper Taproot structure
    // The metadata will be stored and we can extract it later
    
    // TODO: When we need full Taproot support, we'll need to:
    // 1. Initialize ECC library properly in browser
    // 2. Build complete Taproot tree with cooperative + metadata + unilateral paths
    // 3. Return the P2TR scriptPubKey
    
    return {
      script: metadataScript, // Just the metadata leaf for now
      metadata,
    };
  }

  /**
   * Create initial token supply VTXO
   */
  async createToken(
    wallet: ArkadeWallet,
    data: TokenCreationData
  ): Promise<{ tokenId: Buffer; vtxoScript: Buffer; metadata: TokenMetadata }> {
    // Validate creation data
    validateTokenCreation(data);

    // Generate unique token ID
    const tokenId = generateTokenId(data);

    // Create initial supply VTXO to creator
    const result = await this.createTokenVTXO(
      wallet,
      tokenId,
      data.totalSupply,
      data.creator,
      data.decimals
    );

    console.log('createToken result:', {
      hasScript: !!result.script,
      scriptLength: result.script?.length,
      hasMetadata: !!result.metadata,
    });

    return {
      tokenId,
      vtxoScript: result.script,
      metadata: result.metadata,
    };
  }

  /**
   * Create transfer outputs (recipient + optional change)
   */
  async createTransferOutputs(
    wallet: ArkadeWallet,
    tokenId: Buffer,
    decimals: number,
    sender: Buffer,
    recipient: Buffer,
    transferAmount: bigint,
    changeAmount: bigint
  ): Promise<Array<{ script: Buffer; metadata: TokenMetadata }>> {
    // Validate amounts
    validateTransfer(transferAmount + changeAmount, transferAmount, changeAmount);

    const outputs: Array<{ script: Buffer; metadata: TokenMetadata }> = [];

    // Create recipient output
    const recipientVTXO = await this.createTokenVTXO(
      wallet,
      tokenId,
      transferAmount,
      recipient,
      decimals
    );
    outputs.push(recipientVTXO);

    // Create change output if needed
    if (changeAmount > 0n) {
      const changeVTXO = await this.createTokenVTXO(
        wallet,
        tokenId,
        changeAmount,
        sender,
        decimals
      );
      outputs.push(changeVTXO);
    }

    return outputs;
  }

  /**
   * Create merge output (combine multiple token VTXOs)
   */
  async createMergeOutput(
    wallet: ArkadeWallet,
    tokenId: Buffer,
    decimals: number,
    owner: Buffer,
    totalAmount: bigint
  ): Promise<{ script: Buffer; metadata: TokenMetadata }> {
    if (totalAmount <= 0n) {
      throw new Error('Merge amount must be positive');
    }

    return await this.createTokenVTXO(
      wallet,
      tokenId,
      totalAmount,
      owner,
      decimals
    );
  }

  /**
   * Get server public key from wallet/ASP
   */
  private async getServerKey(wallet: ArkadeWallet): Promise<Buffer> {
    // In a real implementation, this would fetch from the ASP
    // For now, use a placeholder (will be replaced with actual ASP key)
    try {
      // Try to get from wallet if it has ASP connection
      if (wallet.getServerKey) {
        return await wallet.getServerKey();
      }
      
      // Fallback: use a default testnet key (REPLACE IN PRODUCTION)
      return Buffer.from(
        '03' + '0'.repeat(64),
        'hex'
      );
    } catch (error) {
      throw new Error('Failed to get server key: ' + error);
    }
  }

  /**
   * Generate internal key for Taproot
   * Uses NUMS (Nothing Up My Sleeve) point to ensure unspendability via key path
   */
  private generateInternalKey(userKey: Buffer): Buffer {
    // Use H(userKey) as internal key to make it deterministic but unspendable
    const hash = bitcoin.crypto.sha256(userKey);
    
    // Ensure it's a valid x-coordinate by taking it modulo curve order
    // For now, just use the hash (bitcoinjs-lib will validate)
    return Buffer.concat([Buffer.from([0x02]), hash.slice(0, 32)]);
  }
}

/**
 * Helper to select VTXOs for spending (coin selection)
 */
export function selectTokenVTXOs(
  vtxos: Array<{ metadata: TokenMetadata; id: string }>,
  requiredAmount: bigint
): Array<{ metadata: TokenMetadata; id: string }> {
  // Sort by amount (descending) for better selection
  const sorted = [...vtxos].sort((a, b) => {
    if (a.metadata.amount > b.metadata.amount) return -1;
    if (a.metadata.amount < b.metadata.amount) return 1;
    return 0;
  });

  const selected: Array<{ metadata: TokenMetadata; id: string }> = [];
  let total = 0n;

  // Greedy selection: pick largest first
  for (const vtxo of sorted) {
    selected.push(vtxo);
    total += vtxo.metadata.amount;

    if (total >= requiredAmount) {
      break;
    }
  }

  if (total < requiredAmount) {
    throw new Error(
      `Insufficient balance: have ${total}, need ${requiredAmount}`
    );
  }

  return selected;
}

/**
 * Calculate total amount from token VTXOs
 */
export function calculateTotalAmount(
  vtxos: Array<{ metadata: TokenMetadata }>
): bigint {
  return vtxos.reduce((sum, vtxo) => sum + vtxo.metadata.amount, 0n);
}
