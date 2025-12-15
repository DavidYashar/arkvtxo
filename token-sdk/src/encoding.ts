/**
 * OP_RETURN encoding/decoding for token operations
 * 
 * Format:
 * - Protocol: "TKN" (3 bytes)
 * - Version: 0x01 (1 byte)
 * - Op Type: CREATE/TRANSFER/BURN (1 byte)
 * - Token ID: sha256 hash (32 bytes)
 * - Amount: variable length integer (1-9 bytes)
 * - Additional data: varies by operation
 * 
 * Total: ~40-80 bytes (fits in 80 byte OP_RETURN limit)
 */

import { hex } from '@scure/base';
import * as crypto from 'crypto';
import { TokenOpType, TokenOperation, CreateTokenParams, TransferTokenParams, BurnTokenParams } from './types';

const PROTOCOL_ID = Buffer.from('TKN', 'utf8'); // 3 bytes
const VERSION = 0x01; // 1 byte

/**
 * Encode variable length integer (Bitcoin varint format)
 */
function encodeVarint(n: bigint): Buffer {
  if (n < 0xfd) {
    return Buffer.from([Number(n)]);
  } else if (n <= 0xffff) {
    const buf = Buffer.alloc(3);
    buf[0] = 0xfd;
    buf.writeUInt16LE(Number(n), 1);
    return buf;
  } else if (n <= 0xffffffff) {
    const buf = Buffer.alloc(5);
    buf[0] = 0xfe;
    buf.writeUInt32LE(Number(n), 1);
    return buf;
  } else {
    const buf = Buffer.alloc(9);
    buf[0] = 0xff;
    // Manual write for browser compatibility (Buffer.writeBigUInt64LE not available)
    for (let i = 0; i < 8; i++) {
      buf[1 + i] = Number((n >> BigInt(i * 8)) & BigInt(0xff));
    }
    return buf;
  }
}

/**
 * Decode variable length integer
 */
function decodeVarint(buf: Buffer, offset: number): { value: bigint; length: number } {
  const first = buf[offset];
  
  if (first < 0xfd) {
    return { value: BigInt(first), length: 1 };
  } else if (first === 0xfd) {
    return { value: BigInt(buf.readUInt16LE(offset + 1)), length: 3 };
  } else if (first === 0xfe) {
    return { value: BigInt(buf.readUInt32LE(offset + 1)), length: 5 };
  } else {
    // Manual read for browser compatibility (Buffer.readBigUInt64LE not available)
    let value = BigInt(0);
    for (let i = 0; i < 8; i++) {
      value |= BigInt(buf[offset + 1 + i]) << BigInt(i * 8);
    }
    return { value, length: 9 };
  }
}

/**
 * Generate token ID from creator address and token name
 */
export function generateTokenId(creator: string, name: string, symbol: string): string {
  const data = `${creator}:${name}:${symbol}:${Date.now()}`;
  return crypto.createHash('sha256').update(data).digest('hex');
}

/**
 * Encode CREATE token operation
 */
export function encodeCreateToken(params: CreateTokenParams, creator: string): Buffer {
  const tokenId = generateTokenId(creator, params.name, params.symbol);
  const tokenIdBuf = Buffer.from(tokenId, 'hex');
  
  const nameBuf = Buffer.from(params.name, 'utf8');
  const symbolBuf = Buffer.from(params.symbol, 'utf8');
  const supplyBuf = encodeVarint(params.totalSupply);
  const decimalsBuf = Buffer.from([params.decimals || 0]);
  
  // Encode: PROTOCOL | VERSION | OP_TYPE | TOKEN_ID | SUPPLY | DECIMALS | NAME_LEN | NAME | SYMBOL_LEN | SYMBOL
  return Buffer.concat([
    PROTOCOL_ID,                           // 3 bytes
    Buffer.from([VERSION]),                // 1 byte
    Buffer.from([TokenOpType.CREATE]),     // 1 byte
    tokenIdBuf,                            // 32 bytes
    supplyBuf,                             // 1-9 bytes
    decimalsBuf,                           // 1 byte
    Buffer.from([nameBuf.length]),         // 1 byte
    nameBuf,                               // variable
    Buffer.from([symbolBuf.length]),       // 1 byte
    symbolBuf,                             // variable
  ]);
}

/**
 * Encode TRANSFER token operation
 */
export function encodeTransferToken(
  params: TransferTokenParams,
  from: string,
  to: string,
  vtxoOutpoint: string
): Buffer {
  const tokenIdBuf = Buffer.from(params.tokenId, 'hex');
  const amountBuf = encodeVarint(params.amount);
  
  // Hash addresses for compact representation
  const fromHash = crypto.createHash('sha256').update(from).digest();
  const toHash = crypto.createHash('sha256').update(to).digest();
  
  // Encode VTXO outpoint (txid:vout)
  const [txid, vout] = vtxoOutpoint.split(':');
  const txidBuf = Buffer.from(txid, 'hex').slice(0, 16); // Use first 16 bytes for space
  const voutBuf = Buffer.alloc(4);
  voutBuf.writeUInt32LE(parseInt(vout), 0);
  
  // Encode: PROTOCOL | VERSION | OP_TYPE | TOKEN_ID | AMOUNT | FROM_HASH | TO_HASH | TXID_PREFIX | VOUT
  return Buffer.concat([
    PROTOCOL_ID,                           // 3 bytes
    Buffer.from([VERSION]),                // 1 byte
    Buffer.from([TokenOpType.TRANSFER]),   // 1 byte
    tokenIdBuf,                            // 32 bytes
    amountBuf,                             // 1-9 bytes
    fromHash.slice(0, 20),                 // 20 bytes (shortened)
    toHash.slice(0, 20),                   // 20 bytes (shortened)
    // Total: ~78 bytes (fits in 80 byte limit)
  ]);
}

/**
 * Encode BURN token operation
 */
export function encodeBurnToken(params: BurnTokenParams, burner: string): Buffer {
  const tokenIdBuf = Buffer.from(params.tokenId, 'hex');
  const amountBuf = encodeVarint(params.amount);
  const burnerHash = crypto.createHash('sha256').update(burner).digest();
  
  // Encode: PROTOCOL | VERSION | OP_TYPE | TOKEN_ID | AMOUNT | BURNER_HASH
  return Buffer.concat([
    PROTOCOL_ID,                           // 3 bytes
    Buffer.from([VERSION]),                // 1 byte
    Buffer.from([TokenOpType.BURN]),       // 1 byte
    tokenIdBuf,                            // 32 bytes
    amountBuf,                             // 1-9 bytes
    burnerHash.slice(0, 20),               // 20 bytes
  ]);
}

/**
 * Decode token operation from OP_RETURN data
 */
export function decodeTokenOperation(opReturnData: Buffer): TokenOperation | null {
  try {
    // Verify protocol ID
    if (!opReturnData.slice(0, 3).equals(PROTOCOL_ID)) {
      return null;
    }
    
    const version = opReturnData[3];
    if (version !== VERSION) {
      return null;
    }
    
    const opType = opReturnData[4] as TokenOpType;
    let offset = 5;
    
    // Extract token ID (32 bytes)
    const tokenId = opReturnData.slice(offset, offset + 32).toString('hex');
    offset += 32;
    
    // Extract amount (variable)
    const { value: amount, length } = decodeVarint(opReturnData, offset);
    offset += length;
    
    // Remaining data
    const data = opReturnData.slice(offset);
    
    return {
      version,
      opType,
      tokenId,
      amount,
      data,
    };
  } catch (error) {
    console.error('Failed to decode token operation:', error);
    return null;
  }
}

/**
 * Create OP_RETURN script from encoded token data
 */
export function createOpReturnScript(tokenData: Buffer): Buffer {
  // OP_RETURN <length> <data>
  const length = tokenData.length;
  
  if (length > 80) {
    throw new Error(`Token data too large: ${length} bytes (max 80)`);
  }
  
  // Build script: OP_RETURN OP_PUSHDATA <length> <data>
  if (length <= 75) {
    // OP_RETURN + direct push
    return Buffer.concat([
      Buffer.from([0x6a]), // OP_RETURN
      Buffer.from([length]), // Push length
      tokenData,
    ]);
  } else {
    // OP_RETURN + OP_PUSHDATA1
    return Buffer.concat([
      Buffer.from([0x6a]), // OP_RETURN
      Buffer.from([0x4c]), // OP_PUSHDATA1
      Buffer.from([length]),
      tokenData,
    ]);
  }
}

/**
 * Extract OP_RETURN data from script
 */
export function extractOpReturnData(script: Buffer): Buffer | null {
  if (script[0] !== 0x6a) { // OP_RETURN
    return null;
  }
  
  if (script[1] === 0x4c) { // OP_PUSHDATA1
    const length = script[2];
    return script.slice(3, 3 + length);
  } else {
    const length = script[1];
    return script.slice(2, 2 + length);
  }
}
