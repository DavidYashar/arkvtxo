/**
 * Pre-sale Pool Wallet Configuration
 * 
 * This configuration manages rotating payment wallets for controlled pre-sales.
 * 
 * MODES:
 * - enabled: true  → Payments go to pool wallets (rotation)
 * - enabled: false → Payments go directly to token creator's wallet
 * 
 * USAGE:
 * 1. Set enabled = true for first token (controlled launch)
 * 2. Add your Arkade wallet addresses to PRESALE_POOL_WALLETS array
 * 3. Adjust WALLET_THRESHOLD_SATS if needed (default: 20,000 sats)
 * 4. After public launch, set enabled = false
 */

// ============================================================================
// CONFIGURATION
// ============================================================================

export const PRESALE_POOL_CONFIG = {
  // Toggle pool wallet system on/off
  enabled: true,  // Set to false for public launch (direct to creator)
  
  // Threshold in sats - when wallet reaches this, mark as full and rotate
  WALLET_THRESHOLD_SATS: 4000,
  
  // Background monitor interval - check wallet balances every X milliseconds
  MONITOR_INTERVAL_MS: 60_000, // 60 seconds (configurable)
};

//calculations
// each wallet can handle up to 2,100,000 sats (0.021 BTC) before rotating
// with 20 wallets, total capacity is 42,000,000 sats (0.42 BTC)
//total token supply of VTXO is 21,000,000 
// each purchase is 2000 sats for 1000 VTXO tokens
// so each wallet can get 1050 purchases before rotation
// total number of purchases will be 21000 

// ============================================================================
// POOL WALLETS
// ============================================================================

interface PoolWallet {
  address: string;
  privateKey: string;     // Private key to check real balance from ASP
  currentVolume: number;  // Cached balance (refreshed on check)
  isFull: boolean;
}

/**
 * Load pool wallet addresses from Render Secret File
 * 
 * Wallets are stored securely in Render Secret Files at:
 * - Production: /etc/secrets/presale-wallets.json
 * - Local dev: ./presale-wallets.json (gitignored)
 * 
 * Each wallet should have format:
 * { "address": "ark1...", "privateKey": "hex..." }
 */
function loadPoolWallets(): PoolWallet[] {
  const fs = require('fs');
  const path = require('path');
  
  // Try Render Secret File location first (production)
  const secretFilePath = '/etc/secrets/presale-wallets.json';
  
  // Try local file (development)
  const localFilePath = path.join(__dirname, '../../presale-wallets.json');
  
  let walletsData: Array<{ address: string; privateKey: string }> = [];
  
  try {
    if (fs.existsSync(secretFilePath)) {
      console.log('📂 Loading pool wallets from Render Secret File');
      walletsData = JSON.parse(fs.readFileSync(secretFilePath, 'utf8'));
    } else if (fs.existsSync(localFilePath)) {
      console.log('📂 Loading pool wallets from local file (development)');
      walletsData = JSON.parse(fs.readFileSync(localFilePath, 'utf8'));
    } else {
      throw new Error('❌ Pool wallets file not found. Please configure presale-wallets.json in Render Secret Files or locally.');
    }
    
    if (!Array.isArray(walletsData) || walletsData.length === 0) {
      throw new Error('❌ Pool wallets file is empty or invalid format');
    }
    
    console.log(`✅ Loaded ${walletsData.length} pool wallets`);
    
    return walletsData.map(w => ({
      address: w.address,
      privateKey: w.privateKey,
      currentVolume: 0,
      isFull: false,
    }));
  } catch (error: any) {
    console.error('❌ Failed to load pool wallets:', error.message);
    throw error;
  }
}

export const PRESALE_POOL_WALLETS: PoolWallet[] = loadPoolWallets();

// ============================================================================
// ROTATION LOGIC
// ============================================================================

/**
 * Query real balance from ASP for a wallet
 */
async function getWalletBalanceFromASP(privateKey: string): Promise<number> {
  try {
    const { Wallet, SingleKey } = await import('@arkade-os/sdk');
    const ASP_URL = process.env.ARKADE_ASP_URL || 'https://arkade.computer';
    
    const identity = SingleKey.fromHex(privateKey);
    const wallet = await Wallet.create({
      identity,
      arkServerUrl: ASP_URL,
    });

    const balance = await wallet.getBalance();
    const arkadeAddress = await wallet.getAddress();
    
    console.log(`📊 Balance query for ${arkadeAddress.slice(0, 20)}...: available=${balance.available}, total=${balance.total}`);
    
    return balance.available || 0;
  } catch (error: any) {
    console.error(`❌ Failed to get ASP balance:`, error.message);
    return 0;  // Return 0 on error to avoid blocking
  }
}

/**
 * Refresh all wallet balances from ASP
 * Should be called periodically or on-demand
 */
export async function refreshPoolWalletBalances(): Promise<void> {
  console.log('🔄 Refreshing pool wallet balances from ASP...');
  
  for (const wallet of PRESALE_POOL_WALLETS) {
    try {
      const realBalance = await getWalletBalanceFromASP(wallet.privateKey);
      wallet.currentVolume = realBalance;
      wallet.isFull = realBalance >= PRESALE_POOL_CONFIG.WALLET_THRESHOLD_SATS;
      
      console.log(`  Wallet ${wallet.address.slice(0, 20)}...: ${realBalance} sats ${wallet.isFull ? '(FULL)' : ''}`);
    } catch (error: any) {
      console.error(`  ❌ Failed for ${wallet.address.slice(0, 20)}...:`, error.message);
    }
  }
  
  console.log('✅ Pool wallet balances refreshed');
}

/**
 * Get the next available pool wallet for a new pre-sale token
 * Queries real balances from ASP and selects the wallet with lowest volume
 */
export async function getNextAvailablePoolWallet(): Promise<PoolWallet> {
  // Refresh balances from ASP before selecting
  await refreshPoolWalletBalances();
  
  // Find wallet with lowest volume that isn't full
  const availableWallet = PRESALE_POOL_WALLETS
    .filter(wallet => !wallet.isFull)
    .sort((a, b) => a.currentVolume - b.currentVolume)[0];
  
  if (!availableWallet) {
    throw new Error('All pool wallets are at capacity. Please add more wallets or increase threshold.');
  }
  
  console.log(`🔄 Assigned pool wallet: ${availableWallet.address.slice(0, 20)}... (Real ASP Balance: ${availableWallet.currentVolume} sats)`);
  return availableWallet;
}

/**
 * Update pool wallet volume after a purchase (DEPRECATED - using real ASP balances now)
 * Kept for compatibility but does nothing
 */
export function updatePoolWalletVolume(walletAddress: string, amountInSats: number): void {
  // No longer needed - we query real balances from ASP
  console.log(`💰 Purchase recorded: ${amountInSats} sats (balance tracked via ASP)`);
}

/**
 * Get current pool wallet statistics
 * Queries real balances from ASP
 */
export async function getPoolWalletStats() {
  // Refresh balances from ASP
  await refreshPoolWalletBalances();
  
  const totalWallets = PRESALE_POOL_WALLETS.length;
  const fullWallets = PRESALE_POOL_WALLETS.filter(w => w.isFull).length;
  const totalVolume = PRESALE_POOL_WALLETS.reduce((sum, w) => sum + w.currentVolume, 0);
  
  return {
    enabled: PRESALE_POOL_CONFIG.enabled,
    threshold: PRESALE_POOL_CONFIG.WALLET_THRESHOLD_SATS,
    totalWallets,
    fullWallets,
    availableWallets: totalWallets - fullWallets,
    totalVolume,
    note: 'Volumes queried from ASP in real-time',
    wallets: PRESALE_POOL_WALLETS.map(w => ({
      address: `${w.address.slice(0, 20)}...${w.address.slice(-8)}`,
      volume: w.currentVolume,
      isFull: w.isFull,
      percentFull: ((w.currentVolume / PRESALE_POOL_CONFIG.WALLET_THRESHOLD_SATS) * 100).toFixed(1),
    })),
  };
}

/**
 * Check if a token's wallet needs rotation and rotate if necessary
 * Called by background monitor to proactively manage wallet rotation
 * @param tokenId - The token ID to check
 * @param currentCreator - Current wallet address assigned to token
 * @returns New wallet address if rotated, null if no rotation needed
 */
export async function checkAndRotateIfNeeded(
  tokenId: string,
  currentCreator: string
): Promise<string | null> {
  // Find current wallet in pool
  const currentWallet = PRESALE_POOL_WALLETS.find(w => w.address === currentCreator);
  
  if (!currentWallet) {
    // Token not using pool wallet, skip
    return null;
  }
  
  // Query real balance from ASP
  const realBalance = await getWalletBalanceFromASP(currentWallet.privateKey);
  currentWallet.currentVolume = realBalance;
  currentWallet.isFull = realBalance >= PRESALE_POOL_CONFIG.WALLET_THRESHOLD_SATS;
  
  // Check if wallet is full or near full
  if (currentWallet.isFull) {
    console.log(`🔄 [Monitor] Wallet ${currentWallet.address.slice(0, 20)}... is full (${realBalance} sats) - rotating token ${tokenId}`);
    
    // Get next available wallet
    const nextWallet = await getNextAvailablePoolWallet();
    
    console.log(`✅ [Monitor] Rotated token ${tokenId} to new wallet: ${nextWallet.address.slice(0, 20)}...`);
    return nextWallet.address;
  }
  
  return null; // No rotation needed
}

/**
 * Reset pool wallet volumes
 * Use with caution - only for testing or after manual withdrawal
 */
export function resetPoolWallets(): void {
  console.log('🔄 Resetting all pool wallet volumes...');
  PRESALE_POOL_WALLETS.forEach(wallet => {
    wallet.currentVolume = 0;
    wallet.isFull = false;
  });
  console.log('✅ All pool wallets reset');
}
