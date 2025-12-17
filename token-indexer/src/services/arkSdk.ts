import { Wallet, SingleKey } from '@arkade-os/sdk';

const ASP_URL = process.env.ARKADE_ASP_URL || process.env.ASP_URL || 'https://arkade.computer';

/**
 * Query VTXOs using the Ark SDK (like the wallet does)
 * This bypasses the public HTTP API and uses the SDK's internal methods
 */
export async function queryVtxosViaSdk(privateKeyHex: string) {
  try {
    // Create identity from private key
    const identity = SingleKey.fromHex(privateKeyHex);
    
    // Initialize wallet
    const wallet = await Wallet.create({
      identity,
      arkServerUrl: ASP_URL,
    });

    // Get VTXOs using SDK
    const vtxos = await wallet.getVtxos();
    
    console.log(`📦 VTXOs count: ${vtxos.length}`);
    vtxos.forEach((v, i) => {
      console.log(`  VTXO #${i + 1}: ${v.value} sats, state: ${v.virtualStatus?.state}, spent: ${v.isSpent}`);
    });
    
    return {
      success: true,
      vtxos: vtxos.map(v => ({
        txid: v.txid,
        vout: v.vout,
        value: v.value,
        status: v.status,
        virtualStatus: v.virtualStatus,
        spentBy: v.spentBy,
        settledBy: v.settledBy,
        arkTxId: v.arkTxId,
        createdAt: v.createdAt,
        isUnrolled: v.isUnrolled,
        isSpent: v.isSpent,
      })),
      total: vtxos.length,
    };
  } catch (error: any) {
    return {
      success: false,
      error: error.message,
      vtxos: [],
      total: 0,
    };
  }
}

/**
 * Query balance using the Ark SDK
 */
export async function queryBalanceViaSdk(privateKeyHex: string) {
  try {
    const identity = SingleKey.fromHex(privateKeyHex);
    
    const wallet = await Wallet.create({
      identity,
      arkServerUrl: ASP_URL,
    });

    const balance = await wallet.getBalance();
    
    console.log('📊 Full balance response from SDK:', JSON.stringify(balance, null, 2));
    
    return {
      success: true,
      available: balance.available || 0,
      preconfirmed: balance.preconfirmed || 0,
      settled: balance.settled || 0,
      recoverable: balance.recoverable || 0,
      boarding: balance.boarding?.total || 0,
      total: balance.total || 0,
      balanceDetails: balance,
    };
  } catch (error: any) {
    return {
      success: false,
      error: error.message,
    };
  }
}

/**
 * Query transaction history using the Ark SDK
 */
export async function queryHistoryViaSdk(privateKeyHex: string) {
  try {
    const identity = SingleKey.fromHex(privateKeyHex);
    
    const wallet = await Wallet.create({
      identity,
      arkServerUrl: ASP_URL,
    });

    const history = await wallet.getTransactionHistory();
    
    return {
      success: true,
      transactions: history.map(tx => ({
        boardingTxid: tx.key.boardingTxid,
        commitmentTxid: tx.key.commitmentTxid,
        arkTxid: tx.key.arkTxid,
        type: tx.type,
        amount: tx.amount,
        settled: tx.settled,
        createdAt: tx.createdAt,
      })),
      total: history.length,
    };
  } catch (error: any) {
    return {
      success: false,
      error: error.message,
      transactions: [],
      total: 0,
    };
  }
}

/**
 * Get Arkade address from private key
 */
export async function getAddressViaSdk(privateKeyHex: string) {
  try {
    const identity = SingleKey.fromHex(privateKeyHex);
    
    const wallet = await Wallet.create({
      identity,
      arkServerUrl: ASP_URL,
    });

    const address = await wallet.getAddress();
    
    return {
      success: true,
      address,
    };
  } catch (error: any) {
    return {
      success: false,
      error: error.message,
    };
  }
}

/**
 * Verify a specific VTXO exists in the wallet OR search transaction history
 */
export async function verifyVtxoViaSdk(privateKeyHex: string, vtxoId: string) {
  try {
    const identity = SingleKey.fromHex(privateKeyHex);
    
    const wallet = await Wallet.create({
      identity,
      arkServerUrl: ASP_URL,
    });

    // First, try to find it as a VTXO
    const vtxos = await wallet.getVtxos();
    const vtxo = vtxos.find(v => v.txid === vtxoId);
    
    if (vtxo) {
      return {
        success: true,
        exists: true,
        type: 'vtxo',
        vtxo: {
          txid: vtxo.txid,
          vout: vtxo.vout,
          value: vtxo.value,
          status: vtxo.status,
          virtualStatus: vtxo.virtualStatus,
          spentBy: vtxo.spentBy,
          settledBy: vtxo.settledBy,
          arkTxId: vtxo.arkTxId,
          createdAt: vtxo.createdAt,
          isUnrolled: vtxo.isUnrolled,
          isSpent: vtxo.isSpent,
        },
      };
    }

    // If not found as VTXO, check transaction history for arkTxid, boardingTxid, or commitmentTxid
    const history = await wallet.getTransactionHistory();
    const transaction = history.find(tx => 
      tx.key.arkTxid === vtxoId || 
      tx.key.boardingTxid === vtxoId || 
      tx.key.commitmentTxid === vtxoId
    );

    if (transaction) {
      return {
        success: true,
        exists: true,
        type: 'transaction',
        transaction: {
          boardingTxid: transaction.key.boardingTxid,
          commitmentTxid: transaction.key.commitmentTxid,
          arkTxid: transaction.key.arkTxid,
          type: transaction.type,
          amount: transaction.amount,
          settled: transaction.settled,
          createdAt: transaction.createdAt,
        },
      };
    }

    // Not found anywhere
    return {
      success: true,
      exists: false,
      type: 'not_found',
      message: 'Transaction ID not found in your wallet or transaction history',
    };
  } catch (error: any) {
    return {
      success: false,
      error: error.message,
      exists: false,
    };
  }
}

/**
 * Get VTXO information by transaction ID (public lookup)
 * This queries ASP for any VTXO by its TXID without requiring a private key
 * Note: This uses HTTP API which may not return data for all VTXOs
 */
export async function getVtxoInfoViaSdk(txid: string) {
  try {
    const axios = require('axios');
    
    // Try the ASP HTTP endpoint
    const url = `${ASP_URL}/v1/vtxos/${txid}:0`;
    const response = await axios.get(url, {
      timeout: 10000,
      validateStatus: (status: number) => status < 500
    });
    
    if (response.status === 404) {
      return null;
    }
    
    if (response.status === 200 && response.data) {
      return response.data;
    }
    
    return null;
  } catch (error: any) {
    if (error.response?.status === 404) {
      return null;
    }
    throw error;
  }
}
