import { Router, Request, Response } from 'express';
import axios from 'axios';

const router = Router();

interface TokenMetadata {
  name: string;
  symbol: string;
  totalSupply: bigint;
  decimals: number;
  // Pre-sale fields
  isPresale: boolean;
  presaleBatchAmount?: bigint;
  priceInSats?: bigint;
  maxPurchasesPerWallet?: number;
}

/**
 * Decode OP_RETURN data from Bitcoin transaction
 */
function decodeOpReturnData(opReturnHex: string): TokenMetadata {
  const buffer = Buffer.from(opReturnHex, 'hex');
  let offset = 0;

  // Protocol (3 bytes)
  const protocol = buffer.subarray(offset, offset + 3).toString('utf8');
  offset += 3;

  if (protocol !== 'ARK') {
    throw new Error('Invalid protocol identifier');
  }

  // Version (1 byte)
  const version = buffer[offset];
  offset += 1;

  if (version !== 1) {
    throw new Error(`Unsupported version: ${version}`);
  }

  // Op type (1 byte)
  const opType = buffer[offset];
  offset += 1;

  if (opType !== 1) {
    throw new Error(`Not a CREATE operation: ${opType}`);
  }

  // Name length (1 byte)
  const nameLen = buffer[offset];
  offset += 1;

  // Name (variable)
  const name = buffer.subarray(offset, offset + nameLen).toString('utf8');
  offset += nameLen;

  // Symbol length (1 byte)
  const symbolLen = buffer[offset];
  offset += 1;

  // Symbol (variable)
  const symbol = buffer.subarray(offset, offset + symbolLen).toString('utf8');
  offset += symbolLen;

  // Total supply (8 bytes, little-endian)
  const totalSupply = buffer.readBigUInt64LE(offset);
  offset += 8;

  // Decimals (1 byte)
  const decimals = buffer[offset];
  offset += 1;

  // Check for pre-sale data
  let isPresale = false;
  let presaleBatchAmount: bigint | undefined;
  let priceInSats: bigint | undefined;
  let maxPurchasesPerWallet: number | undefined;

  if (offset < buffer.length) {
    const presaleFlag = buffer[offset];
    offset += 1;

    if (presaleFlag === 0x01 && offset + 18 <= buffer.length) {
      isPresale = true;

      // Batch amount (8 bytes)
      presaleBatchAmount = buffer.readBigUInt64LE(offset);
      offset += 8;

      // Price in sats (8 bytes)
      priceInSats = buffer.readBigUInt64LE(offset);
      offset += 8;

      // Max purchases (2 bytes)
      maxPurchasesPerWallet = buffer.readUInt16LE(offset);
    }
  }

  return {
    name,
    symbol,
    totalSupply,
    decimals,
    isPresale,
    presaleBatchAmount,
    priceInSats,
    maxPurchasesPerWallet,
  };
}

/**
 * Extract OP_RETURN data from Bitcoin transaction
 */
async function fetchBitcoinTransaction(txid: string): Promise<{
  opReturnData: string | null;
  creator: string | null;
  blockHeight: number | null;
  blockTime: number | null;
  confirmations: number;
}> {
  try {
    const response = await axios.get(`https://mutinynet.com/api/tx/${txid}`);
    const tx = response.data;

    // Find OP_RETURN output
    let opReturnData: string | null = null;
    for (const output of tx.vout) {
      if (output.scriptpubkey_type === 'op_return') {
        // Extract the data after OP_RETURN and OP_PUSHBYTES
        const scriptHex = output.scriptpubkey;
        // Skip OP_RETURN (6a) and OP_PUSHBYTES_XX
        const dataStartIndex = 4; // Skip "6a1d" (OP_RETURN + OP_PUSHBYTES_29)
        opReturnData = scriptHex.substring(dataStartIndex);
        break;
      }
    }

    // Get creator address (first input)
    let creator: string | null = null;
    if (tx.vin && tx.vin.length > 0) {
      const firstInput = tx.vin[0];
      if (firstInput.prevout && firstInput.prevout.scriptpubkey_address) {
        creator = firstInput.prevout.scriptpubkey_address;
      }
    }

    // Get block info
    const blockHeight = tx.status?.block_height || null;
    const blockTime = tx.status?.block_time || null;
    const confirmations = tx.status?.confirmed ? (tx.status.block_height ? 1 : 0) : 0;

    return {
      opReturnData,
      creator,
      blockHeight,
      blockTime,
      confirmations,
    };
  } catch (error) {
    console.error('Error fetching Bitcoin transaction:', error);
    throw new Error('Failed to fetch Bitcoin transaction');
  }
}

/**
 * GET /api/verify/:txid
 * Verify and decode token from Bitcoin transaction
 */
router.get('/verify/:txid', async (req: Request, res: Response) => {
  try {
    const { txid } = req.params;

    console.log(`🔍 Verifying token from Bitcoin TXID: ${txid}`);

    // Fetch Bitcoin transaction
    const bitcoinData = await fetchBitcoinTransaction(txid);

    if (!bitcoinData.opReturnData) {
      return res.status(404).json({
        error: 'No OP_RETURN data found in transaction',
      });
    }

    // Decode OP_RETURN data
    const tokenMetadata = decodeOpReturnData(bitcoinData.opReturnData);

    // Format response
    const response = {
      verified: true,
      tokenId: txid,
      metadata: {
        name: tokenMetadata.name,
        symbol: tokenMetadata.symbol,
        totalSupply: tokenMetadata.totalSupply.toString(),
        decimals: tokenMetadata.decimals,
        displaySupply: (Number(tokenMetadata.totalSupply) / Math.pow(10, tokenMetadata.decimals)).toFixed(tokenMetadata.decimals),
      },
      bitcoinProof: {
        txid,
        creator: bitcoinData.creator,
        blockHeight: bitcoinData.blockHeight,
        blockTime: bitcoinData.blockTime,
        confirmations: bitcoinData.confirmations,
        opReturnDataHex: bitcoinData.opReturnData,
        explorerUrl: `https://mutinynet.com/tx/${txid}`,
      },
      verification: {
        protocol: 'ARK',
        version: 1,
        operation: 'CREATE',
        immutable: true,
        note: 'This token metadata is permanently recorded on Bitcoin blockchain',
      },
    };

    res.json(response);
  } catch (error) {
    console.error('Error verifying token:', error);
    res.status(500).json({
      error: error instanceof Error ? error.message : 'Failed to verify token',
    });
  }
});

/**
 * POST /api/verify/decode
 * Decode OP_RETURN hex directly
 */
router.post('/verify/decode', async (req: Request, res: Response) => {
  try {
    const { opReturnHex } = req.body;

    if (!opReturnHex) {
      return res.status(400).json({
        error: 'opReturnHex is required',
      });
    }

    console.log(`🔍 Decoding OP_RETURN data: ${opReturnHex}`);

    const tokenMetadata = decodeOpReturnData(opReturnHex);

    res.json({
      decoded: true,
      metadata: {
        name: tokenMetadata.name,
        symbol: tokenMetadata.symbol,
        totalSupply: tokenMetadata.totalSupply.toString(),
        decimals: tokenMetadata.decimals,
        displaySupply: (Number(tokenMetadata.totalSupply) / Math.pow(10, tokenMetadata.decimals)).toFixed(tokenMetadata.decimals),
      },
    });
  } catch (error) {
    console.error('Error decoding OP_RETURN:', error);
    res.status(500).json({
      error: error instanceof Error ? error.message : 'Failed to decode OP_RETURN',
    });
  }
});

export default router;
