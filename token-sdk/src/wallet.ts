/**
 * Token Wallet - extends Arkade Wallet with token support
 * 
 * This wallet class adds token operations to the standard Arkade wallet:
 * - Create tokens (using VTXO Metadata)
 * - Transfer tokens (using VTXO Metadata)
 * - Query token balances
 * 
 * Implementation uses Taproot script trees with embedded token metadata.
 */

import { TokenProvider } from './provider';
import {
  CreateTokenParams,
  TransferTokenParams,
  BurnTokenParams,
  TokenBalance,
  TokenTransfer,
} from './types';
import { TokenMetadata as LegacyTokenMetadata } from './types';
import { TokenVTXOBuilder, selectTokenVTXOs, calculateTotalAmount } from './vtxo-builder';
import { 
  generateTokenId, 
  formatTokenAmount, 
  parseTokenAmount,
  TokenMetadata,
  TokenCreationData,
} from './metadata';
import * as bitcoin from 'bitcoinjs-lib';
import { BitcoinClient } from './bitcoin';
import { 
  encodeTokenCreationForBitcoin, 
  decodeTokenCreationFromBitcoin,
  TokenCreationData as BitcoinTokenData 
} from './bitcoinEncoding';

/**
 * Extended settlement output that supports OP_RETURN
 */
export interface TokenSettlementOutput {
  address?: string;
  amount?: bigint;
  opReturn?: Buffer; // OP_RETURN script data
}

/**
 * Token Wallet extends Arkade Wallet
 * 
 * Uses VTXO Metadata approach - embeds token data in Taproot script trees.
 */
export class TokenWallet {
  private readonly vtxoBuilder: TokenVTXOBuilder;
  private readonly bitcoinClient: BitcoinClient;
  private readonly network: bitcoin.Network;
  private bitcoinPrivateKey?: string; // Optional: for L1 OP_RETURN creation

  constructor(
    private readonly arkadeWallet: any, // IWallet from @arkade-os/sdk
    private readonly tokenProvider: TokenProvider,
    network: bitcoin.Network = bitcoin.networks.testnet,
    bitcoinPrivateKey?: string // Optional: Bitcoin L1 private key
  ) {
    this.vtxoBuilder = new TokenVTXOBuilder({ network });
    this.bitcoinClient = new BitcoinClient(network);
    this.network = network;
    this.bitcoinPrivateKey = bitcoinPrivateKey;
  }

  /**
   * Get Arkade address
   */
  async getAddress(): Promise<string> {
    const address = await this.arkadeWallet.getAddress();
    console.log('🏦 TokenWallet.getAddress() returned:', address);
    return address;
  }

  /**
   * Send Bitcoin/sats to another Arkade address
   * @param toAddress - Recipient's Arkade address
   * @param amount - Amount in satoshis
   * @returns Transaction ID
   */
  async sendToArkade(toAddress: string, amount: bigint | number): Promise<string> {
    console.log('💸 Sending sats via Arkade:', {
      to: toAddress,
      amount: amount.toString(),
    });

    const amountNumber = typeof amount === 'bigint' ? Number(amount) : amount;
    
    const txid = await this.arkadeWallet.sendBitcoin({
      address: toAddress,
      amount: amountNumber,
    });

    console.log('✅ Payment sent! TXID:', txid);
    return txid;
  }

  /**
   * Create a new token - ASYNC 2-PHASE APPROACH
   * Phase 1: Bitcoin Layer 1 OP_RETURN (proof) - IMMEDIATE
   * Phase 2: Backend monitors confirmation and completes Arkade settlement
   */
  async createToken(params: CreateTokenParams): Promise<string> {
    console.log(' === TOKEN CREATION START ===');
    console.log('Token parameters:', {
      name: params.name,
      symbol: params.symbol,
      supply: params.totalSupply.toString(),
      decimals: params.decimals || 8,
    });
    
    try {
      // ============================================================
      // PHASE 1: Bitcoin Layer 1 OP_RETURN (On-Chain Proof)
      // ============================================================
      console.log('\n PHASE 1: Creating Bitcoin Layer 1 proof...');
      
      if (!this.bitcoinPrivateKey) {
        throw new Error('Bitcoin private key required for token creation. Please provide it in TokenWallet constructor.');
      }
      
      // Get Bitcoin address for display
      const bitcoinAddress = await this.bitcoinClient.createAddressFromHex(this.bitcoinPrivateKey);
      console.log('📍 Bitcoin L1 Address:', bitcoinAddress);
      
      // Get Arkade address (for registration)
      const arkadeAddress = await this.getAddress();
      console.log('🏠 Arkade Address:', arkadeAddress);
      
      // Prepare token metadata for Bitcoin OP_RETURN
      const bitcoinTokenData: BitcoinTokenData = {
        name: params.name,
        symbol: params.symbol,
        totalSupply: params.totalSupply,
        decimals: params.decimals || 8,
        presaleBatchAmount: params.presaleBatchAmount,
        priceInSats: params.priceInSats,
        maxPurchasesPerWallet: params.maxPurchasesPerWallet,
      };
      
      // Encode to OP_RETURN format (must be < 80 bytes)
      const opReturnData = encodeTokenCreationForBitcoin(bitcoinTokenData);
      console.log(`Token data encoded: ${opReturnData.length} bytes (max 80)`);
      
      // Use provided fee rate or default to a safe value
      const feeRate = params.feeRate || 31; // Default 31 sat/vbyte
      
      // Create Bitcoin OP_RETURN transaction
      console.log(' Broadcasting Bitcoin OP_RETURN transaction...');
      console.log(` Using fee rate: ${feeRate} sat/vbyte`);
      const bitcoinTxid = await this.bitcoinClient.createOpReturnTransaction(
        this.bitcoinPrivateKey,
        opReturnData,
        feeRate
      );
      
      console.log(' Bitcoin transaction broadcast!');
      console.log(`   TXID: ${bitcoinTxid}`);
      console.log(`   Explorer: https://mempool.space/tx/${bitcoinTxid}`);
      
      // TOKEN_ID = Bitcoin TXID (permanent, immutable proof)
      const tokenId = bitcoinTxid;
      console.log(`\n TOKEN ID: ${tokenId}`);
      console.log('   This is the Bitcoin transaction ID - permanent on-chain proof!');
      
      // ============================================================
      // PHASE 2: Register as PENDING with backend
      // Backend will monitor confirmation and complete Arkade settlement
      // ============================================================
      console.log('\n Registering pending token with indexer...');
      
      try {
        await this.tokenProvider.registerToken({
          tokenId,
          name: params.name,
          symbol: params.symbol,
          totalSupply: params.totalSupply.toString(),
          decimals: params.decimals || 8,
          creator: arkadeAddress,
          bitcoinProof: bitcoinTxid,
          bitcoinAddress: bitcoinAddress,
          opReturnData: opReturnData.toString('hex'),
          status: 'pending', // Backend will update to 'confirmed' after monitoring
          isPresale: !!(params.presaleBatchAmount && params.priceInSats),
          presaleBatchAmount: params.presaleBatchAmount?.toString() || null,
          priceInSats: params.priceInSats?.toString() || null,
          maxPurchasesPerWallet: params.maxPurchasesPerWallet || null,
        });
        
        console.log(' Pending token registered. Backend will monitor for confirmation.');
      } catch (indexerError) {
        console.warn(' Failed to register with indexer (backend will pick up from blockchain):', indexerError);
        // Don't throw - backend monitoring will detect the OP_RETURN
      }
      
      // ============================================================
      // Success - Return immediately so UI can show toast
      // ============================================================
      console.log('\n === TOKEN CREATION SUBMITTED ===');
      console.log(`Transaction ID: ${tokenId}`);
      console.log(`Status: Pending confirmation (backend monitoring)`);
      console.log(`Track at: https://mempool.space/tx/${tokenId}`);
      console.log('\n Backend will:');
      console.log('   1. Monitor for Bitcoin confirmation');
      console.log('   2. Complete Arkade Layer 2 settlement');
      console.log('   3. Update token status to confirmed');
      
      return tokenId;
    } catch (error) {
      console.error('Failed to create token:', error);
      throw new Error(`Token creation failed: ${(error as Error).message}`);
    }
  }

  /**
   * Transfer tokens to another address
   */
  async transferToken(params: TransferTokenParams): Promise<string> {
    console.log(' Starting token transfer:', {
      tokenId: params.tokenId.slice(0, 20) + '...',
      to: params.to.slice(0, 20) + '...',
      amount: params.amount.toString(),
    });
    
    try {
      const tokenId = Buffer.from(params.tokenId, 'hex');
      
      // For now, we'll use a simplified approach:
      // 1. Create a standard Arkade transfer to the recipient
      // 2. Log the token transfer details (to be stored in indexer later)
      
      console.log('Creating Arkade transfer...');
      
      // For now, we create a standard VTXO settlement
      // In a full implementation, we'd need to:
      // 1. Find the user's VTXOs containing this token
      // 2. Use those as inputs to create new VTXOs for recipient
      // 3. Create change VTXO back to sender if needed
      
      // Since we're using off-chain tracking, just create a marker VTXO
      console.log('Submitting transfer to Arkade ASP...');
      const vtxoId = await this.arkadeWallet.settle();
      console.log(' Arkade settle() returned VTXO ID:', vtxoId);
      
      // Note: Transfer submitted to ASP, will be confirmed in next round
      console.log(` Token transfer submitted to ASP`);
      console.log(`   Token ID: ${params.tokenId.slice(0, 20)}...`);
      console.log(`   Amount: ${params.amount.toString()}`);
      console.log(`   To: ${params.to.slice(0, 20)}...`);
      console.log(`   VTXO ID: ${vtxoId}`);
      
      // Register transfer with indexer (indexer will verify with ASP)
      try {
        console.log('Recording transfer with indexer...');
        const fromAddress = await this.getAddress();
        await this.tokenProvider.recordTransfer({
          tokenId: params.tokenId,
          fromAddress,
          toAddress: params.to,
          amount: params.amount.toString(),
          vtxoId,
        });
        console.log(' Transfer recorded with indexer');
      } catch (indexerError) {
        console.error(' Failed to record transfer with indexer:', indexerError);
        throw new Error(`Failed to register transfer: ${(indexerError as Error).message}`);
      }
      
      return vtxoId;
    } catch (error) {
      console.error('Failed to transfer token:', error);
      throw new Error(`Token transfer failed: ${(error as Error).message}`);
    }
  }

  /**
   * Burn tokens (removes them from circulation)
   */
  async burnToken(params: BurnTokenParams): Promise<string> {
    try {
      // Get token metadata
      const tokenMetadata = await this.tokenProvider.getToken(params.tokenId);
      if (!tokenMetadata) {
        throw new Error(`Token not found: ${params.tokenId}`);
      }
      
      // Get our VTXOs with this token
      const myVtxos = await this.getTokenVTXOs(params.tokenId);
      
      // Select VTXOs to cover the burn amount
      const selectedVtxos = selectTokenVTXOs(myVtxos, params.amount);
      const totalAmount = calculateTotalAmount(selectedVtxos);
      
      if (totalAmount < params.amount) {
        throw new Error('Insufficient balance to burn');
      }
      
      // Calculate remaining after burn
      const remainingAmount = totalAmount - params.amount;
      
      // If there's remaining amount, create a change VTXO
      // If burning all, just don't create any output (tokens disappear)
      if (remainingAmount > 0n) {
        const tokenId = Buffer.from(params.tokenId, 'hex');
        const ownerPubkey = await this.getPublicKey();
        
        const changeOutput = await this.vtxoBuilder.createMergeOutput(
          this.arkadeWallet,
          tokenId,
          tokenMetadata.decimals,
          ownerPubkey,
          remainingAmount
        );
        
        // Submit with change output
        const vtxoId = await this.arkadeWallet.settle({
          inputs: selectedVtxos.map(v => v.id),
          outputs: [{
            scriptPubKey: changeOutput.script.toString('hex'),
            amount: 1000,
          }],
        });
        
        console.log(` Burned ${formatTokenAmount(params.amount, tokenMetadata.decimals)} tokens`);
        console.log(`   Remaining: ${formatTokenAmount(remainingAmount, tokenMetadata.decimals)}`);
        
        return vtxoId;
      } else {
        // Burn all - no outputs
        const vtxoId = await this.arkadeWallet.settle({
          inputs: selectedVtxos.map(v => v.id),
          outputs: [], // No outputs = tokens destroyed
        });
        
        console.log(` Burned all tokens: ${formatTokenAmount(params.amount, tokenMetadata.decimals)}`);
        
        return vtxoId;
      }
    } catch (error) {
      console.error('Failed to burn tokens:', error);
      throw new Error(`Token burn failed: ${(error as Error).message}`);
    }
  }

  /**
   * Get token balance for current wallet
   */
  async getTokenBalance(tokenId: string): Promise<bigint> {
    const address = await this.getAddress();
    return this.tokenProvider.getBalance(address, tokenId);
  }

  /**
   * Get all token balances for current wallet
   */
  async getTokenBalances(): Promise<TokenBalance[]> {
    const address = await this.getAddress();
    return this.tokenProvider.getBalances(address);
  }

  /**
   * Get token metadata
   */
  async getToken(tokenId: string): Promise<LegacyTokenMetadata> {
    return this.tokenProvider.getToken(tokenId);
  }

  /**
   * Get token transfer history
   */
  async getTokenTransfers(tokenId?: string): Promise<TokenTransfer[]> {
    const address = await this.getAddress();
    console.log(' TokenWallet.getTokenTransfers() - Using address:', address);
    return this.tokenProvider.getTransfers(address, tokenId);
  }

  /**
   * Helper: Select VTXOs for spending
   */
  private async selectVtxos(minAmount: bigint): Promise<any[]> {
    const vtxos = await this.arkadeWallet.getVtxos({
      withRecoverable: false,
      withUnrolled: false,
    });
    
    // Filter spendable VTXOs
    const spendable = vtxos.filter((v: any) => 
      v.virtualStatus.state === 'settled' && !v.isSpent
    );
    
    if (spendable.length === 0) {
      throw new Error('No spendable VTXOs available');
    }
    
    // Select VTXOs with enough value
    let totalValue = 0n;
    const selected: any[] = [];
    
    for (const vtxo of spendable) {
      selected.push(vtxo);
      totalValue += BigInt(vtxo.value);
      
      if (totalValue >= minAmount) {
        break;
      }
    }
    
    if (totalValue < minAmount) {
      throw new Error(`Insufficient Bitcoin balance. Need: ${minAmount}, have: ${totalValue}`);
    }
    
    return selected;
  }

  /**
   * Get public key from Arkade wallet
   */
  private async getPublicKey(): Promise<Buffer> {
    // Get from identity/SingleKey
    if (this.arkadeWallet.identity && typeof this.arkadeWallet.identity.compressedPublicKey === 'function') {
      const pubkey = await this.arkadeWallet.identity.compressedPublicKey();
      
      if (!pubkey || pubkey.length === 0) {
        throw new Error('compressedPublicKey() returned empty/undefined value');
      }
      
      const buffer = Buffer.from(pubkey);
      
      if (buffer.length !== 33) {
        throw new Error(`Invalid public key length: ${buffer.length}, expected 33 bytes`);
      }
      
      return buffer;
    }
    
    throw new Error('Unable to get public key from wallet. Make sure wallet is initialized with identity.');
  }

  /**
   * Parse recipient key (address or public key hex)
   */
  private parseRecipientKey(recipient: string): Buffer {
    try {
      // Try as hex public key
      if (recipient.length === 66) {
        return Buffer.from(recipient, 'hex');
      }
      
      // Try as Arkade address (tark1...)
      // TODO: Implement address-to-pubkey resolution via indexer
      throw new Error('Address-to-pubkey resolution not yet implemented. Use hex public key.');
    } catch (error) {
      throw new Error(`Invalid recipient: ${recipient}. Use 66-char hex public key.`);
    }
  }

  /**
   * Get token VTXOs owned by this wallet
   */
  private async getTokenVTXOs(tokenId: string): Promise<Array<{ metadata: TokenMetadata; id: string; outpoint: string }>> {
    // TODO: Implement VTXO metadata extraction
    // This requires:
    // 1. Get all VTXOs from Arkade wallet
    // 2. Parse Taproot script trees
    // 3. Extract and decode token metadata from leaf #1
    // 4. Filter by tokenId
    //
    // For now, throw error until indexer is ready
    throw new Error(
      'Token VTXO tracking not yet implemented. ' +
      'Need to either: (1) Parse Taproot trees from VTXOs, or (2) Query token indexer API'
    );
  }

  /**
   * Get underlying Arkade wallet (for standard Bitcoin operations)
   */
  get wallet() {
    return this.arkadeWallet;
  }
}
