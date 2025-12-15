/**
 * Wallet management for Arkade Token Platform
 */

import { Wallet, SingleKey } from '@arkade-os/sdk';
import { TokenWallet, TokenProvider, BitcoinClient, initECC } from '@arkade-token/sdk';
import * as bitcoin from 'bitcoinjs-lib';
import * as bip39 from 'bip39';
import { BIP32Factory } from 'bip32';
import { ECPairFactory, ECPairAPI } from 'ecpair';
import * as ecc from '@bitcoinerlab/secp256k1';

// Initialize crypto factories synchronously with @bitcoinerlab/secp256k1
const bip32 = BIP32Factory(ecc);
const ECPair = ECPairFactory(ecc);

// Initialize bitcoinjs-lib with ECC library (required for p2tr/Taproot)
bitcoin.initEccLib(ecc);

export interface WalletConfig {
  arkServerUrl: string;
  tokenIndexerUrl: string;
  privateKey?: string;
  mnemonic?: string;
  forceNew?: boolean; // Force creation of new wallet, ignore sessionStorage
}

export interface WalletCredentials {
  privateKey: string;
  mnemonic: string;
}

let walletInstance: TokenWallet | null = null;
let arkadeWallet: any | null = null;

/**
 * Generate new wallet credentials (private key and mnemonic)
 */
export function generateWalletCredentials(): WalletCredentials {
  // Generate 12-word mnemonic (128 bits of entropy)
  const mnemonic = bip39.generateMnemonic(128);
  
  // Derive private key from mnemonic using BIP32/BIP44 path
  const seed = bip39.mnemonicToSeedSync(mnemonic);
  const root = bip32.fromSeed(seed);
  
  // Use Bitcoin's BIP44 path: m/44'/0'/0'/0/0
  const path = "m/44'/0'/0'/0/0";
  const child = root.derivePath(path);
  
  if (!child.privateKey) {
    throw new Error('Failed to derive private key from mnemonic');
  }
  
  // Ensure we get exactly 32 bytes
  const keyBuffer = Buffer.from(child.privateKey);
  if (keyBuffer.length !== 32) {
    throw new Error(`Invalid private key buffer length: ${keyBuffer.length}`);
  }
  
  const privateKey = keyBuffer.toString('hex');
  
  // Validate that we have a proper 64-character hex string (32 bytes)
  if (privateKey.length !== 64) {
    throw new Error(`Invalid private key length: ${privateKey.length} (expected 64)`);
  }
  
  return { privateKey, mnemonic };
}

/**
 * Derive private key from mnemonic
 */
export function mnemonicToPrivateKey(mnemonic: string): string {
  if (!bip39.validateMnemonic(mnemonic)) {
    throw new Error('Invalid seed phrase');
  }
  
  const seed = bip39.mnemonicToSeedSync(mnemonic);
  const root = bip32.fromSeed(seed);
  const path = "m/44'/0'/0'/0/0";
  const child = root.derivePath(path);
  
  if (!child.privateKey) {
    throw new Error('Failed to derive private key from mnemonic');
  }
  
  // Ensure we get exactly 32 bytes
  const keyBuffer = Buffer.from(child.privateKey);
  if (keyBuffer.length !== 32) {
    throw new Error(`Invalid private key buffer length: ${keyBuffer.length}`);
  }
  
  const privateKey = keyBuffer.toString('hex');
  
  if (privateKey.length !== 64) {
    throw new Error(`Invalid private key length: ${privateKey.length}`);
  }
  
  return privateKey;
}

/**
 * Initialize wallet from private key, mnemonic, or create new one
 * Uses sessionStorage to keep wallets separate per tab
 */
export async function initializeWallet(config: WalletConfig): Promise<TokenWallet> {
  let privateKey = config.privateKey;
  let mnemonic = config.mnemonic;
  
  // If mnemonic provided, derive private key from it
  if (mnemonic && !privateKey) {
    privateKey = await mnemonicToPrivateKey(mnemonic);
  }
  
  // Get or generate private key
  if (!privateKey) {
    // If forceNew flag is set, skip sessionStorage completely
    if (!config.forceNew) {
      // Only check sessionStorage if we're explicitly restoring (not creating new)
      // This prevents reusing old credentials when creating a new wallet
      const isRestoringFromSession = typeof window !== 'undefined' && 
        sessionStorage.getItem('arkade_private_key') && 
        sessionStorage.getItem('wallet_key_shown') === 'true';
      
      if (isRestoringFromSession) {
        // Restoring existing wallet from session
        privateKey = sessionStorage.getItem('arkade_private_key') || undefined;
        mnemonic = sessionStorage.getItem('arkade_mnemonic') || undefined;
      }
    }
    
    // If still no private key, generate a brand new wallet
    if (!privateKey) {
      // Generate new wallet with both private key and mnemonic
      const credentials = generateWalletCredentials();
      privateKey = credentials.privateKey;
      mnemonic = credentials.mnemonic;
      
      // Save both to sessionStorage (only for this tab)
      if (typeof window !== 'undefined') {
        sessionStorage.setItem('arkade_private_key', privateKey);
        sessionStorage.setItem('arkade_mnemonic', mnemonic);
      }
    }
  } else {
    // If private key provided explicitly (restoring), save it to sessionStorage
    if (typeof window !== 'undefined') {
      sessionStorage.setItem('arkade_private_key', privateKey);
      if (mnemonic) {
        sessionStorage.setItem('arkade_mnemonic', mnemonic);
      }
    }
  }
  
  // Create Arkade wallet
  const identity = SingleKey.fromHex(privateKey);
  console.log('🔧 Creating Arkade wallet with config:', {
    arkServerUrl: config.arkServerUrl,
    tokenIndexerUrl: config.tokenIndexerUrl,
    network: 'bitcoin (mainnet)'
  });
  arkadeWallet = await Wallet.create({
    identity,
    arkServerUrl: config.arkServerUrl,
    // esploraUrl: 'https://mutinynet.com/api', // For testnet
  });
  
  const arkadeAddress = await arkadeWallet.getAddress();
  console.log('🏦 Arkade wallet created with address:', arkadeAddress);
  console.log('🌐 Network check:', {
    isMainnet: arkadeAddress.startsWith('ark1'),
    isTestnet: arkadeAddress.startsWith('tark1')
  });
  
  // Create token provider
  const tokenProvider = new TokenProvider(config.tokenIndexerUrl);
  
  // Create token wallet with Bitcoin private key for OP_RETURN
  walletInstance = new TokenWallet(
    arkadeWallet, 
    tokenProvider,
    bitcoin.networks.bitcoin,
    privateKey  // ← Pass private key for Bitcoin L1 OP_RETURN
  );
  
  return walletInstance;
}

/**
 * Get current wallet instance (synchronous - returns null if not in memory)
 * Use getWalletAsync() for auto-restore functionality
 */
export function getWallet(): TokenWallet | null {
  return walletInstance;
}

/**
 * Get current wallet instance with auto-restore from sessionStorage
 * Automatically restores wallet if it exists in sessionStorage but not in memory
 */
export async function getWalletAsync(): Promise<TokenWallet | null> {
  // If already in memory, return it
  if (walletInstance) {
    return walletInstance;
  }

  // Try to restore from sessionStorage
  if (typeof window !== 'undefined' && hasStoredWallet()) {
    try {
      console.log('🔄 Auto-restoring wallet from sessionStorage...');
      const privateKey = sessionStorage.getItem('arkade_private_key');
      const mnemonic = sessionStorage.getItem('arkade_mnemonic');
      
      if (privateKey) {
        walletInstance = await initializeWallet({
          arkServerUrl: process.env.NEXT_PUBLIC_ARK_SERVER_URL || 'https://arkade.computer',
          tokenIndexerUrl: process.env.NEXT_PUBLIC_INDEXER_URL || 'http://localhost:3001',
          privateKey,
          mnemonic: mnemonic || undefined,
        });
        console.log('✅ Wallet restored from sessionStorage');
        return walletInstance;
      }
    } catch (error) {
      console.error('Failed to restore wallet:', error);
    }
  }

  return null;
}

/**
 * Get Arkade wallet instance
 */
export function getArkadeWallet(): any | null {
  return arkadeWallet;
}

/**
 * Disconnect wallet (clears only this tab's session)
 */
export function disconnectWallet() {
  walletInstance = null;
  arkadeWallet = null;
  if (typeof window !== 'undefined') {
    sessionStorage.removeItem('arkade_private_key');
    sessionStorage.removeItem('arkade_mnemonic');
  }
}

/**
 * Export credentials (private key and mnemonic) from current session
 */
export function exportCredentials(): WalletCredentials | null {
  if (typeof window !== 'undefined') {
    const privateKey = sessionStorage.getItem('arkade_private_key');
    const mnemonic = sessionStorage.getItem('arkade_mnemonic');
    if (privateKey && mnemonic) {
      return { privateKey, mnemonic };
    }
  }
  return null;
}

/**
 * Export private key from current session (legacy)
 */
export function exportPrivateKey(): string | null {
  if (typeof window !== 'undefined') {
    return sessionStorage.getItem('arkade_private_key');
  }
  return null;
}

/**
 * Export mnemonic from current session
 */
export function exportMnemonic(): string | null {
  if (typeof window !== 'undefined') {
    return sessionStorage.getItem('arkade_mnemonic');
  }
  return null;
}

/**
 * Check if wallet exists in current session
 */
export function hasStoredWallet(): boolean {
  if (typeof window !== 'undefined') {
    return !!sessionStorage.getItem('arkade_private_key');
  }
  return false;
}

/**
 * Get all three addresses (Arkade L2, SegWit P2WPKH, Taproot P2TR)
 */
export async function getAllAddresses(): Promise<{
  arkade: string;
  segwit: string;
  taproot: string;
} | null> {
  console.log('getAllAddresses called');
  console.log('arkadeWallet:', arkadeWallet ? 'exists' : 'null');
  
  if (!arkadeWallet) {
    console.error('getAllAddresses: arkadeWallet is null');
    return null;
  }
  
  const privateKey = typeof window !== 'undefined' 
    ? sessionStorage.getItem('arkade_private_key') 
    : null;
  
  console.log('privateKey from sessionStorage:', privateKey ? 'exists (length ' + privateKey.length + ')' : 'null');
    
  if (!privateKey) {
    console.error('getAllAddresses: privateKey is null');
    return null;
  }
  
  try {
    console.log('Starting address generation...');
    // 1. Arkade L2 address
    const arkadeAddress = await arkadeWallet.getAddress();
    
    // 2. SegWit P2WPKH (for token creation OP_RETURN)
    const bitcoinClient = new BitcoinClient(bitcoin.networks.bitcoin);
    const segwitAddress = await bitcoinClient.createAddressFromHex(privateKey);
    
    // 3. Taproot P2TR - Generate mainnet Taproot address from private key
    const taprootAddress = createTaprootAddress(privateKey);
    console.log('Taproot address (mainnet):', taprootAddress);
    
    const result = {
      arkade: arkadeAddress,
      segwit: segwitAddress,
      taproot: taprootAddress,
    };
    console.log('getAllAddresses result:', result);
    return result;
  } catch (error) {
    console.error('Failed to get addresses:', error);
    console.error('Error stack:', error instanceof Error ? error.stack : 'no stack');
    return null;
  }
}

/**
 * Create Taproot (P2TR) address from private key
 */
function createTaprootAddress(privateKeyHex: string): string {
  const keyPair = ECPair.fromPrivateKey(
    Buffer.from(privateKeyHex, 'hex'),
    { network: bitcoin.networks.bitcoin }
  );

  const { address } = bitcoin.payments.p2tr({
    internalPubkey: keyPair.publicKey.slice(1, 33), // Remove first byte (02/03)
    network: bitcoin.networks.bitcoin,
  });

  if (!address) {
    throw new Error('Failed to create Taproot address');
  }

  return address;
}

/**
 * Get balances for all three addresses
 */
export async function getAllBalances(): Promise<{
  arkade: number;
  segwit: number;
  taproot: number;
  total: number;
} | null> {
  console.log('getAllBalances called');
  console.log('arkadeWallet:', arkadeWallet ? 'exists' : 'null');
  
  if (!arkadeWallet) {
    console.error('getAllBalances: arkadeWallet is null');
    return null;
  }
  
  const privateKey = typeof window !== 'undefined' 
    ? sessionStorage.getItem('arkade_private_key') 
    : null;
  
  console.log('privateKey from sessionStorage:', privateKey ? 'exists (length ' + privateKey.length + ')' : 'null');
    
  if (!privateKey) {
    console.error('getAllBalances: privateKey is null');
    return null;
  }
  
  try {
    console.log('Starting balance fetch...');
    // 1. Arkade L2 balance
    const arkadeBalance = await arkadeWallet.getBalance();
    const arkadeSats = arkadeBalance.available || 0;
    
    // 2. SegWit balance
    const bitcoinClient = new BitcoinClient(bitcoin.networks.bitcoin);
    const segwitAddress = await bitcoinClient.createAddressFromHex(privateKey);
    const segwitUtxos = await bitcoinClient.getUTXOs(segwitAddress);
    const segwitSats = segwitUtxos.reduce((sum, utxo) => sum + utxo.value, 0);
    
    // 3. Taproot balance - Generate mainnet Taproot address from private key
    const taprootAddress = createTaprootAddress(privateKey);
    console.log('Checking balance for Taproot address:', taprootAddress);
    const taprootUtxos = await bitcoinClient.getUTXOs(taprootAddress);
    const taprootSats = taprootUtxos.reduce((sum, utxo) => sum + utxo.value, 0);
    
    const result = {
      arkade: arkadeSats,
      segwit: segwitSats,
      taproot: taprootSats,
      total: arkadeSats + segwitSats + taprootSats,
    };
    console.log('getAllBalances result:', result);
    return result;
  } catch (error) {
    console.error('Failed to get balances:', error);
    console.error('Error stack:', error instanceof Error ? error.stack : 'no stack');
    return null;
  }
}

/**
 * Check if user has sufficient balance to create token
 */
export async function canCreateToken(): Promise<{
  canCreate: boolean;
  segwitBalance: number;
  arkadeBalance: number;
  errors: string[];
}> {
  console.log('canCreateToken called');
  console.log('Calling getAllBalances...');
  const balances = await getAllBalances();
  console.log('getAllBalances returned:', balances);
  
  if (!balances) {
    console.error('canCreateToken: balances is null, wallet not initialized');
    return {
      canCreate: false,
      segwitBalance: 0,
      arkadeBalance: 0,
      errors: ['Wallet not initialized'],
    };
  }
  
  const errors: string[] = [];
  const MIN_SEGWIT = 1000; // Need at least 1000 sats for OP_RETURN
  const MIN_ARKADE = 1000; // Need at least 1000 sats for ASP settlement
  
  if (balances.segwit < MIN_SEGWIT) {
    errors.push(
      `Insufficient SegWit balance. Need ${MIN_SEGWIT} sats, have ${balances.segwit} sats. ` +
      `Fund your SegWit address (bc1q...) to create tokens.`
    );
  }
  
  if (balances.arkade < MIN_ARKADE) {
    errors.push(
      `Insufficient Arkade balance. Need ${MIN_ARKADE} sats, have ${balances.arkade} sats.`
    );
  }
  
  return {
    canCreate: errors.length === 0,
    segwitBalance: balances.segwit,
    arkadeBalance: balances.arkade,
    errors,
  };
}
