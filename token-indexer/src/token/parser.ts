/**
 * Token operation parser - decodes OP_RETURN data
 */

export enum TokenOpType {
  CREATE = 0x01,
  TRANSFER = 0x02,
  BURN = 0x03,
}

export interface TokenOperation {
  version: number;
  opType: TokenOpType;
  tokenId: string;
  amount: bigint;
  data: Buffer;
}

const PROTOCOL_ID = Buffer.from('TKN', 'utf8');
const VERSION = 0x01;

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
    return { value: buf.readBigUInt64LE(offset + 1), length: 9 };
  }
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
 * Parse CREATE token operation data
 */
export function parseCreateTokenData(data: Buffer): {
  decimals: number;
  name: string;
  symbol: string;
} | null {
  try {
    let offset = 0;
    
    // Decimals (1 byte)
    const decimals = data[offset];
    offset += 1;
    
    // Name length + name
    const nameLen = data[offset];
    offset += 1;
    const name = data.slice(offset, offset + nameLen).toString('utf8');
    offset += nameLen;
    
    // Symbol length + symbol
    const symbolLen = data[offset];
    offset += 1;
    const symbol = data.slice(offset, offset + symbolLen).toString('utf8');
    
    return { decimals, name, symbol };
  } catch (error) {
    console.error('Failed to parse CREATE token data:', error);
    return null;
  }
}
