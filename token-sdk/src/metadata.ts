/**
 * Token Metadata Encoding/Decoding for VTXO-based Tokens
 * 
 * This module handles encoding token data into Tapscript leaves
 * and decoding it from VTXOs for validation and indexing.
 */

import * as bitcoin from 'bitcoinjs-lib';

// Token metadata structure
export interface TokenMetadata {
  version: number;        // Protocol version (1 byte)
  tokenId: Buffer;        // 32 bytes (unique token identifier)
  amount: bigint;         // 8 bytes (token balance in this VTXO)
  decimals: number;       // 1 byte (decimal places, e.g., 8 for BTC-style)
  owner: Buffer;          // 33 bytes (owner's compressed public key)
}

// Token creation data
export interface TokenCreationData {
  name: string;           // Token name (max 32 bytes)
  symbol: string;         // Token symbol (max 10 bytes)
  decimals: number;       // Decimal places
  totalSupply: bigint;    // Total supply
  creator: Buffer;        // Creator's public key
}

// Constants
export const METADATA_VERSION = 1;
export const METADATA_MARKER = Buffer.from('ARKTOK', 'utf8'); // 6 bytes

/**
 * Encode token metadata into a Tapscript leaf
 */
export function encodeTokenMetadata(metadata: TokenMetadata): Buffer {
  // Validate inputs
  if (metadata.version < 0 || metadata.version > 255) {
    throw new Error('Version must be 0-255');
  }
  if (metadata.tokenId.length !== 32) {
    throw new Error('Token ID must be 32 bytes');
  }
  if (metadata.decimals < 0 || metadata.decimals > 18) {
    throw new Error('Decimals must be 0-18');
  }
  if (metadata.owner.length !== 33) {
    throw new Error('Owner must be 33 bytes (compressed pubkey)');
  }
  if (metadata.amount < 0n) {
    throw new Error('Amount cannot be negative');
  }

  // Convert amount to 8-byte little-endian buffer
  const amountBuffer = Buffer.alloc(8);
  // Write as little-endian uint64 using two uint32 values
  const low = Number(metadata.amount & 0xFFFFFFFFn);
  const high = Number(metadata.amount >> 32n);
  amountBuffer.writeUInt32LE(low, 0);
  amountBuffer.writeUInt32LE(high, 4);

  // Build the metadata script
  // Note: We need to ensure single bytes are treated as data, not opcodes
  const versionBuf = Buffer.from([metadata.version]);
  const decimalsBuf = Buffer.from([metadata.decimals]);
  
  const script = bitcoin.script.compile([
    bitcoin.opcodes.OP_RETURN,           // Mark as data (unspendable via this path)
    METADATA_MARKER,                     // "ARKTOK" marker (6 bytes)
    versionBuf,                          // Version (1 byte)
    metadata.tokenId,                    // Token ID (32 bytes)
    amountBuffer,                        // Amount (8 bytes)
    decimalsBuf,                         // Decimals (1 byte)
    metadata.owner,                      // Owner pubkey (33 bytes)
  ]);

  return script;
}

/**
 * Decode token metadata from a Tapscript leaf
 */
export function decodeTokenMetadata(script: Buffer): TokenMetadata | null {
  try {
    const decompiled = bitcoin.script.decompile(script);
    
    if (!decompiled || decompiled.length !== 7) {
      return null;
    }

    // Check for OP_RETURN and marker
    if (decompiled[0] !== bitcoin.opcodes.OP_RETURN) {
      return null;
    }

    const marker = decompiled[1] as Buffer;
    if (!marker || !marker.equals(METADATA_MARKER)) {
      return null;
    }

    // Extract fields - bitcoinjs-lib may return opcodes for single byte values
    // OP_1 through OP_16 are 0x51 through 0x60, so we need to convert back
    const versionData = decompiled[2];
    let version: number;
    if (typeof versionData === 'number') {
      // It's an opcode
      if (versionData >= bitcoin.opcodes.OP_1 && versionData <= bitcoin.opcodes.OP_16) {
        version = versionData - bitcoin.opcodes.OP_1 + 1;
      } else if (versionData === bitcoin.opcodes.OP_0) {
        version = 0;
      } else {
        version = versionData;
      }
    } else {
      version = versionData[0];
    }
    
    const tokenId = decompiled[3] as Buffer;
    const amountBuffer = decompiled[4] as Buffer;
    
    const decimalsData = decompiled[5];
    let decimals: number;
    if (typeof decimalsData === 'number') {
      // It's an opcode
      if (decimalsData >= bitcoin.opcodes.OP_1 && decimalsData <= bitcoin.opcodes.OP_16) {
        decimals = decimalsData - bitcoin.opcodes.OP_1 + 1;
      } else if (decimalsData === bitcoin.opcodes.OP_0) {
        decimals = 0;
      } else {
        decimals = decimalsData;
      }
    } else {
      decimals = decimalsData[0];
    }
    
    const owner = decompiled[6] as Buffer;

    // Validate sizes
    if (tokenId.length !== 32 || amountBuffer.length !== 8 || owner.length !== 33) {
      return null;
    }

    // Convert amount from little-endian (read as two uint32 values)
    const low = BigInt(amountBuffer.readUInt32LE(0));
    const high = BigInt(amountBuffer.readUInt32LE(4));
    const amount = low | (high << 32n);

    return {
      version,
      tokenId,
      amount,
      decimals,
      owner,
    };
  } catch (error) {
    console.error('Error decoding token metadata:', error);
    return null;
  }
}

/**
 * Generate a unique token ID from creation data
 */
export function generateTokenId(data: TokenCreationData): Buffer {
  // Create timestamp buffer (8 bytes, little-endian)
  const timestamp = Buffer.alloc(8);
  const timestampBigInt = BigInt(Date.now());
  
  // Write as little-endian uint64
  // Use writeUInt32LE for compatibility
  const low = Number(timestampBigInt & 0xFFFFFFFFn);
  const high = Number(timestampBigInt >> 32n);
  timestamp.writeUInt32LE(low, 0);
  timestamp.writeUInt32LE(high, 4);

  const nameBuffer = Buffer.from(data.name, 'utf8');
  const symbolBuffer = Buffer.from(data.symbol, 'utf8');

  // Hash: creator + name + symbol + timestamp
  const combined = Buffer.concat([
    data.creator,
    nameBuffer,
    symbolBuffer,
    timestamp,
  ]);

  return bitcoin.crypto.sha256(combined);
}

/**
 * Validate token creation data
 */
export function validateTokenCreation(data: TokenCreationData): void {
  if (!data.name || data.name.length === 0 || data.name.length > 32) {
    throw new Error('Token name must be 1-32 characters');
  }

  if (!data.symbol || data.symbol.length === 0 || data.symbol.length > 10) {
    throw new Error('Token symbol must be 1-10 characters');
  }

  if (data.decimals < 0 || data.decimals > 18) {
    throw new Error('Decimals must be 0-18');
  }

  if (data.totalSupply <= 0n) {
    throw new Error('Total supply must be positive');
  }

  if (data.creator.length !== 33) {
    throw new Error('Creator must be 33 bytes (compressed pubkey)');
  }
}

/**
 * Validate token transfer amounts
 */
export function validateTransfer(
  inputAmount: bigint,
  outputAmount: bigint,
  changeAmount: bigint
): void {
  if (outputAmount <= 0n) {
    throw new Error('Transfer amount must be positive');
  }

  if (changeAmount < 0n) {
    throw new Error('Change amount cannot be negative');
  }

  if (outputAmount + changeAmount !== inputAmount) {
    throw new Error('Amounts must sum to input amount');
  }
}

/**
 * Format token amount for display (with decimals)
 */
export function formatTokenAmount(amount: bigint, decimals: number): string {
  if (decimals === 0) {
    return amount.toString();
  }

  const divisor = 10n ** BigInt(decimals);
  const integerPart = amount / divisor;
  const fractionalPart = amount % divisor;

  if (fractionalPart === 0n) {
    return integerPart.toString();
  }

  const fractionalStr = fractionalPart.toString().padStart(decimals, '0');
  return `${integerPart}.${fractionalStr}`;
}

/**
 * Parse token amount from string (with decimals)
 */
export function parseTokenAmount(amountStr: string, decimals: number): bigint {
  const parts = amountStr.split('.');
  
  if (parts.length > 2) {
    throw new Error('Invalid amount format');
  }

  const integerPart = BigInt(parts[0] || '0');
  
  if (parts.length === 1) {
    return integerPart * (10n ** BigInt(decimals));
  }

  const fractionalPart = parts[1] || '0';
  
  if (fractionalPart.length > decimals) {
    throw new Error(`Too many decimal places (max ${decimals})`);
  }

  const fractionalPadded = fractionalPart.padEnd(decimals, '0');
  const fractionalBigInt = BigInt(fractionalPadded);

  return integerPart * (10n ** BigInt(decimals)) + fractionalBigInt;
}

/**
 * Check if a script contains token metadata
 */
export function isTokenMetadata(script: Buffer): boolean {
  try {
    const decompiled = bitcoin.script.decompile(script);
    
    if (!decompiled || decompiled.length < 2) {
      return false;
    }

    if (decompiled[0] !== bitcoin.opcodes.OP_RETURN) {
      return false;
    }

    const marker = decompiled[1] as Buffer;
    return marker && marker.equals(METADATA_MARKER);
  } catch {
    return false;
  }
}

/**
 * Extract token metadata from a Taproot script tree
 */
export function extractTokenMetadataFromTree(scriptTree: any[]): TokenMetadata | null {
  for (const leaf of scriptTree) {
    if (Buffer.isBuffer(leaf)) {
      const metadata = decodeTokenMetadata(leaf);
      if (metadata) {
        return metadata;
      }
    } else if (Array.isArray(leaf)) {
      const metadata = extractTokenMetadataFromTree(leaf);
      if (metadata) {
        return metadata;
      }
    }
  }
  return null;
}
