/**
 * Bitcoin OP_RETURN encoding for token CREATION only
 * 
 * This is used for the Bitcoin Layer 1 proof transaction.
 * Format (must be <= 80 bytes):
 * - Protocol: "ARK" (3 bytes) - Arkade protocol identifier
 * - Version: 0x01 (1 byte)
 * - Op Type: 0x01 = CREATE (1 byte)
 * - Name length: (1 byte)
 * - Name: (variable, max 20 bytes)
 * - Symbol length: (1 byte)
 * - Symbol: (variable, max 10 bytes)
 * - Total Supply: (8 bytes, uint64 LE)
 * - Decimals: (1 byte)
 * 
 * Total: 5 + name + symbol + 9 = ~40-50 bytes (safe)
 */

const PROTOCOL_ID = Buffer.from('ARK', 'utf8'); // 3 bytes - Arkade
const VERSION = 0x01; // 1 byte
const OP_CREATE = 0x01; // 1 byte

export interface TokenCreationData {
  name: string;
  symbol: string;
  totalSupply: bigint;
  decimals: number;
  // Pre-sale fields (optional)
  presaleBatchAmount?: bigint;
  priceInSats?: bigint;
  maxPurchasesPerWallet?: number;
}

/**
 * Encode token creation data for Bitcoin OP_RETURN
 * Returns a buffer that can be included in OP_RETURN output
 */
export function encodeTokenCreationForBitcoin(data: TokenCreationData): Buffer {
  const nameBuf = Buffer.from(data.name, 'utf8');
  const symbolBuf = Buffer.from(data.symbol, 'utf8');
  
  // Validate sizes
  if (nameBuf.length > 20) {
    throw new Error(`Token name too long: ${nameBuf.length} bytes (max 20)`);
  }
  if (symbolBuf.length > 10) {
    throw new Error(`Token symbol too long: ${symbolBuf.length} bytes (max 10)`);
  }
  if (data.decimals > 255) {
    throw new Error(`Decimals too large: ${data.decimals} (max 255)`);
  }
  
  // Create supply buffer (8 bytes, little-endian uint64)
  // Manual write for browser compatibility (Buffer.writeBigUInt64LE not available)
  const supplyBuf = Buffer.alloc(8);
  const supply = data.totalSupply;
  for (let i = 0; i < 8; i++) {
    supplyBuf[i] = Number((supply >> BigInt(i * 8)) & BigInt(0xff));
  }
  
  // Check if this is a pre-sale token
  const hasPresale = !!(data.presaleBatchAmount && data.priceInSats && data.maxPurchasesPerWallet);
  
  let presaleBuffers: Buffer[] = [];
  if (hasPresale) {
    // Encode pre-sale batch amount (8 bytes)
    const batchBuf = Buffer.alloc(8);
    const batch = data.presaleBatchAmount!;
    for (let i = 0; i < 8; i++) {
      batchBuf[i] = Number((batch >> BigInt(i * 8)) & BigInt(0xff));
    }
    
    // Encode price in sats (8 bytes)
    const priceBuf = Buffer.alloc(8);
    const price = data.priceInSats!;
    for (let i = 0; i < 8; i++) {
      priceBuf[i] = Number((price >> BigInt(i * 8)) & BigInt(0xff));
    }
    
    // Encode max purchases per wallet (2 bytes)
    const maxPurchasesBuf = Buffer.alloc(2);
    maxPurchasesBuf.writeUInt16LE(data.maxPurchasesPerWallet!);
    
    presaleBuffers = [
      Buffer.from([0x01]),  // 1 byte: pre-sale flag (0x01 = yes)
      batchBuf,             // 8 bytes: batch amount
      priceBuf,             // 8 bytes: price in sats
      maxPurchasesBuf,      // 2 bytes: max purchases per wallet
    ];
  } else {
    presaleBuffers = [Buffer.from([0x00])]; // 1 byte: no pre-sale
  }
  
  // Build the complete OP_RETURN data
  const result = Buffer.concat([
    PROTOCOL_ID,                      // 3 bytes: "ARK"
    Buffer.from([VERSION]),           // 1 byte: 0x01
    Buffer.from([OP_CREATE]),         // 1 byte: 0x01
    Buffer.from([nameBuf.length]),    // 1 byte: name length
    nameBuf,                          // variable: name
    Buffer.from([symbolBuf.length]),  // 1 byte: symbol length
    symbolBuf,                        // variable: symbol
    supplyBuf,                        // 8 bytes: total supply
    Buffer.from([data.decimals]),     // 1 byte: decimals
    ...presaleBuffers,                // 1 or 19 bytes: pre-sale data
  ]);
  
  console.log('📦 Encoded OP_RETURN data:');
  console.log(`   Protocol: ARK`);
  console.log(`   Version: ${VERSION}`);
  console.log(`   Op: CREATE`);
  console.log(`   Name: ${data.name} (${nameBuf.length} bytes)`);
  console.log(`   Symbol: ${data.symbol} (${symbolBuf.length} bytes)`);
  console.log(`   Supply: ${data.totalSupply.toString()}`);
  console.log(`   Decimals: ${data.decimals}`);
  if (hasPresale) {
    console.log(`   Pre-sale: YES`);
    console.log(`   Batch Amount: ${data.presaleBatchAmount!.toString()}`);
    console.log(`   Price: ${data.priceInSats!.toString()} sats`);
    console.log(`   Max Purchases: ${data.maxPurchasesPerWallet}`);
  } else {
    console.log(`   Pre-sale: NO`);
  }
  console.log(`   Total size: ${result.length} bytes`);
  
  if (result.length > 80) {
    throw new Error(`OP_RETURN data too large: ${result.length} bytes (max 80)`);
  }
  
  return result;
}

/**
 * Decode token creation data from Bitcoin OP_RETURN
 */
export function decodeTokenCreationFromBitcoin(data: Buffer): TokenCreationData {
  let offset = 0;
  
  // Check protocol ID
  const protocol = data.subarray(offset, offset + 3).toString('utf8');
  offset += 3;
  
  if (protocol !== 'ARK') {
    throw new Error(`Invalid protocol: ${protocol} (expected ARK)`);
  }
  
  // Check version
  const version = data[offset];
  offset += 1;
  
  if (version !== VERSION) {
    throw new Error(`Invalid version: ${version} (expected ${VERSION})`);
  }
  
  // Check op type
  const opType = data[offset];
  offset += 1;
  
  if (opType !== OP_CREATE) {
    throw new Error(`Invalid op type: ${opType} (expected ${OP_CREATE})`);
  }
  
  // Read name
  const nameLength = data[offset];
  offset += 1;
  const name = data.subarray(offset, offset + nameLength).toString('utf8');
  offset += nameLength;
  
  // Read symbol
  const symbolLength = data[offset];
  offset += 1;
  const symbol = data.subarray(offset, offset + symbolLength).toString('utf8');
  offset += symbolLength;
  
  // Read total supply (8 bytes, little-endian uint64)
  // Manual read for browser compatibility (Buffer.readBigUInt64LE not available)
  let totalSupply = BigInt(0);
  for (let i = 0; i < 8; i++) {
    totalSupply |= BigInt(data[offset + i]) << BigInt(i * 8);
  }
  offset += 8;
  
  // Read decimals
  const decimals = data[offset];
  offset += 1;
  
  // Check if there's pre-sale data
  let presaleBatchAmount: bigint | undefined;
  let priceInSats: bigint | undefined;
  let maxPurchasesPerWallet: number | undefined;
  
  if (offset < data.length) {
    const presaleFlag = data[offset];
    offset += 1;
    
    if (presaleFlag === 0x01 && offset + 18 <= data.length) {
      // Read batch amount (8 bytes)
      presaleBatchAmount = BigInt(0);
      for (let i = 0; i < 8; i++) {
        presaleBatchAmount |= BigInt(data[offset + i]) << BigInt(i * 8);
      }
      offset += 8;
      
      // Read price in sats (8 bytes)
      priceInSats = BigInt(0);
      for (let i = 0; i < 8; i++) {
        priceInSats |= BigInt(data[offset + i]) << BigInt(i * 8);
      }
      offset += 8;
      
      // Read max purchases (2 bytes)
      maxPurchasesPerWallet = data.readUInt16LE(offset);
    }
  }
  
  return {
    name,
    symbol,
    totalSupply,
    decimals,
    presaleBatchAmount,
    priceInSats,
    maxPurchasesPerWallet,
  };
}

/**
 * Verify that OP_RETURN data matches expected token metadata
 */
export function verifyTokenCreation(
  opReturnData: Buffer,
  expected: TokenCreationData
): boolean {
  try {
    const decoded = decodeTokenCreationFromBitcoin(opReturnData);
    
    return (
      decoded.name === expected.name &&
      decoded.symbol === expected.symbol &&
      decoded.totalSupply === expected.totalSupply &&
      decoded.decimals === expected.decimals
    );
  } catch (error) {
    console.error('Error verifying token creation:', error);
    return false;
  }
}
