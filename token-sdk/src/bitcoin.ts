import * as bitcoin from 'bitcoinjs-lib';
import { ECPairFactory, ECPairInterface, ECPairAPI } from 'ecpair';
import * as ecc from '@bitcoinerlab/secp256k1';

// Initialize ECPair with synchronous secp256k1 library
const ECPair = ECPairFactory(ecc);

// Initialize bitcoinjs-lib with ECC library (required for p2tr/Taproot)
bitcoin.initEccLib(ecc);

/**
 * Initialize ECC library (now synchronous with @bitcoinerlab/secp256k1)
 * Kept for backward compatibility but no longer async
 */
export function initECC() {
  return ECPair;
}

// Bitcoin Mainnet configuration
const NETWORK = bitcoin.networks.bitcoin;
const ESPLORA_API = 'https://mempool.space/api';

export interface BitcoinUTXO {
  txid: string;
  vout: number;
  value: number;
  scriptPubKey: Buffer;
}

export interface BitcoinTransaction {
  txid: string;
  confirmations: number;
  vout: Array<{
    value: number;
    scriptPubKey: {
      hex: string;
      type: string;
    };
  }>;
}

/**
 * Bitcoin utilities for creating OP_RETURN transactions
 */
export class BitcoinClient {
  private network: bitcoin.Network;
  private esploraUrl: string;

  constructor(network: bitcoin.Network = NETWORK, esploraUrl: string = ESPLORA_API) {
    this.network = network;
    this.esploraUrl = esploraUrl;
  }

  /**
   * Create a Bitcoin address from WIF private key
   */
  async createAddressFromWIF(wif: string): Promise<string> {
    const keyPair = ECPair.fromWIF(wif, this.network);
    const { address } = bitcoin.payments.p2wpkh({
      pubkey: keyPair.publicKey,
      network: this.network,
    });
    
    if (!address) throw new Error('Failed to generate address');
    return address;
  }

  /**
   * Create a Bitcoin address from hex private key
   */
  async createAddressFromHex(privateKeyHex: string): Promise<string> {
    const privateKeyBuffer = Buffer.from(privateKeyHex, 'hex');
    const keyPair = ECPair.fromPrivateKey(privateKeyBuffer, { network: this.network });
    const { address } = bitcoin.payments.p2wpkh({
      pubkey: keyPair.publicKey,
      network: this.network,
    });
    
    if (!address) throw new Error('Failed to generate address');
    return address;
  }

  /**
   * Get UTXOs for a Bitcoin address
   */
  async getUTXOs(address: string): Promise<BitcoinUTXO[]> {
    try {
      // Get address script hash
      const scriptPubKey = bitcoin.address.toOutputScript(address, this.network);
      
      // Query Esplora API
      const response = await fetch(`${this.esploraUrl}/address/${address}/utxo`);
      if (!response.ok) {
        throw new Error(`Failed to fetch UTXOs: ${response.statusText}`);
      }
      
      const utxos = await response.json() as any[];
      
      return utxos.map((utxo: any) => ({
        txid: utxo.txid,
        vout: utxo.vout,
        value: utxo.value,
        scriptPubKey: scriptPubKey,
      }));
    } catch (error) {
      console.error('Error fetching UTXOs:', error);
      throw error;
    }
  }

  /**
   * Get transaction details
   */
  async getTransaction(txid: string): Promise<BitcoinTransaction> {
    try {
      const response = await fetch(`${this.esploraUrl}/tx/${txid}`);
      if (!response.ok) {
        throw new Error(`Failed to fetch transaction: ${response.statusText}`);
      }
      
      const tx = await response.json() as any;
      
      return {
        txid: tx.txid,
        confirmations: tx.status?.confirmed ? tx.status.block_height : 0,
        vout: tx.vout.map((out: any) => ({
          value: out.value,
          scriptPubKey: {
            hex: out.scriptpubkey,
            type: out.scriptpubkey_type,
          },
        })),
      };
    } catch (error) {
      console.error('Error fetching transaction:', error);
      throw error;
    }
  }

  /**
   * Create and broadcast OP_RETURN transaction
   */
  async createOpReturnTransaction(
    privateKeyHex: string,
    data: Buffer,
    feeRate: number = 1 // sats per vbyte
  ): Promise<string> {
    try {
      console.log(' Creating Bitcoin OP_RETURN transaction...');
      
      // Create key pair
      const privateKeyBuffer = Buffer.from(privateKeyHex, 'hex');
      const keyPair = ECPair.fromPrivateKey(privateKeyBuffer, { network: this.network });
      
      // Get address
      const { address } = bitcoin.payments.p2wpkh({
        pubkey: keyPair.publicKey,
        network: this.network,
      });
      
      if (!address) throw new Error('Failed to generate address');
      
      console.log(' Bitcoin address:', address);
      
      // Get UTXOs
      const utxos = await this.getUTXOs(address);
      if (utxos.length === 0) {
        throw new Error('No UTXOs available. Please fund your Bitcoin address first.');
      }
      
      console.log(`💰 Found ${utxos.length} UTXOs`);
      
      // Sort UTXOs by value (largest first)
      utxos.sort((a, b) => b.value - a.value);
      
      // Calculate estimated fee first to determine if we need multiple UTXOs
      const opReturnSize = 10 + data.length;
      const overhead = 11;
      
      // Start with 1 input, may add more if needed
      let inputSize = 68;
      let witnessSize = 27;
      let changeOutputSize = 31;
      let baseSize = inputSize + opReturnSize + changeOutputSize + overhead;
      let totalSize = baseSize + witnessSize;
      let weight = baseSize * 3 + totalSize;
      let vsize = Math.ceil(weight / 4);
      let estimatedFee = vsize * feeRate;
      
      // Select UTXOs until we have enough for fee + dust (546 sats minimum change)
      const selectedUtxos: typeof utxos = [];
      let totalValue = 0;
      const MIN_CHANGE = 546;
      
      for (const utxo of utxos) {
        selectedUtxos.push(utxo);
        totalValue += utxo.value;
        
        // Recalculate fee with current number of inputs
        inputSize = 68 * selectedUtxos.length;
        witnessSize = 27 * selectedUtxos.length;
        baseSize = inputSize + opReturnSize + changeOutputSize + overhead;
        totalSize = baseSize + witnessSize;
        weight = baseSize * 3 + totalSize;
        vsize = Math.ceil(weight / 4);
        estimatedFee = vsize * feeRate;
        
        // Check if we have enough: total value must cover fee + minimum change
        if (totalValue >= estimatedFee + MIN_CHANGE) {
          break;
        }
      }
      
      const changeValue = totalValue - estimatedFee;
      
      if (changeValue < MIN_CHANGE) {
        throw new Error(
          `Insufficient funds. Total: ${totalValue} sats, fee: ${estimatedFee} sats, ` +
          `change: ${changeValue} sats (need at least ${MIN_CHANGE} sats for change). ` +
          `Consider using a lower fee rate.`
        );
      }
      
      console.log(`   Using ${selectedUtxos.length} UTXO(s):`);
      selectedUtxos.forEach((u, i) => {
        console.log(`     ${i + 1}. ${u.txid}:${u.vout} (${u.value} sats)`);
      });
      console.log(`   Total input: ${totalValue} sats`);
      
      // Create PSBT
      const psbt = new bitcoin.Psbt({ network: this.network });
      
      // Add all selected inputs
      for (const utxo of selectedUtxos) {
        psbt.addInput({
          hash: utxo.txid,
          index: utxo.vout,
          witnessUtxo: {
            script: utxo.scriptPubKey,
            value: utxo.value,
          },
        });
      }
      
      // Create OP_RETURN output
      const opReturnScript = bitcoin.script.compile([
        bitcoin.opcodes.OP_RETURN,
        data,
      ]);
      
      console.log(' OP_RETURN data:', data.toString('hex'));
      console.log(`   Data size: ${data.length} bytes`);
      
      if (data.length > 80) {
        throw new Error(`OP_RETURN data too large: ${data.length} bytes (max 80)`);
      }
      
      // Add OP_RETURN output
      psbt.addOutput({
        script: opReturnScript,
        value: 0,
      });
      
      // Fee and change were already calculated above when selecting UTXOs
      console.log(` Transaction size: ${vsize} vbytes (fee rate: ${feeRate} sat/vbyte)`);
      console.log(` Fee: ${estimatedFee} sats`);
      console.log(` Change: ${changeValue} sats`);
      
      // Add change output
      psbt.addOutput({
        address: address,
        value: changeValue,
      });
      
      // Sign all inputs
      for (let i = 0; i < selectedUtxos.length; i++) {
        psbt.signInput(i, keyPair);
      }
      psbt.finalizeAllInputs();
      
      // Extract transaction
      const tx = psbt.extractTransaction();
      const txHex = tx.toHex();
      
      console.log(' Broadcasting transaction...');
      
      // Broadcast
      const txid = await this.broadcastTransaction(txHex);
      
      console.log(' Transaction broadcast successful!');
      console.log(`   TXID: ${txid}`);
      console.log(`   Explorer: https://mempool.space/tx/${txid}`);
      
      return txid;
    } catch (error) {
      console.error(' Failed to create OP_RETURN transaction:', error);
      throw error;
    }
  }

  /**
   * Broadcast a transaction
   */
  async broadcastTransaction(txHex: string): Promise<string> {
    try {
      const response = await fetch(`${this.esploraUrl}/tx`, {
        method: 'POST',
        body: txHex,
      });
      
      if (!response.ok) {
        const error = await response.text();
        throw new Error(`Broadcast failed: ${error}`);
      }
      
      const txid = await response.text();
      return txid;
    } catch (error) {
      console.error('Error broadcasting transaction:', error);
      throw error;
    }
  }

  /**
   * Wait for transaction confirmation
   */
  async waitForConfirmation(
    txid: string,
    requiredConfirmations: number = 1,
    pollInterval: number = 30000 // 30 seconds
  ): Promise<number> {
    console.log(` Waiting for ${requiredConfirmations} confirmation(s)...`);
    
    let attempts = 0;
    const maxAttempts = 40; // 20 minutes max wait
    
    while (attempts < maxAttempts) {
      try {
        const tx = await this.getTransaction(txid);
        
        if (tx.confirmations >= requiredConfirmations) {
          console.log(` Transaction confirmed! (${tx.confirmations} confirmations)`);
          return tx.confirmations;
        }
        
        console.log(` Current confirmations: ${tx.confirmations}/${requiredConfirmations}`);
        
        await new Promise(resolve => setTimeout(resolve, pollInterval));
        attempts++;
      } catch (error) {
        console.log('   Transaction not found yet, waiting...');
        await new Promise(resolve => setTimeout(resolve, pollInterval));
        attempts++;
      }
    }
    
    throw new Error('Transaction confirmation timeout');
  }

  /**
   * Extract OP_RETURN data from transaction
   */
  async extractOpReturnData(txid: string): Promise<Buffer | null> {
    try {
      const tx = await this.getTransaction(txid);
      
      for (const output of tx.vout) {
        if (output.scriptPubKey.type === 'nulldata') {
          // Parse OP_RETURN script
          const script = Buffer.from(output.scriptPubKey.hex, 'hex');
          const decompiled = bitcoin.script.decompile(script);
          
          if (decompiled && decompiled.length >= 2 && decompiled[0] === bitcoin.opcodes.OP_RETURN) {
            const data = decompiled[1];
            if (Buffer.isBuffer(data)) {
              return data;
            }
          }
        }
      }
      
      return null;
    } catch (error) {
      console.error('Error extracting OP_RETURN data:', error);
      return null;
    }
  }
}
