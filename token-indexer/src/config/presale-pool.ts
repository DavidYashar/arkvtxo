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
 * Pool wallet addresses for controlled pre-sales (MAINNET)
 * 
 * These 20 wallets are used in rotation to receive pre-sale payments.
 * When a wallet reaches the threshold (4000 sats), it rotates to the next one.
 * 
 * Total capacity: 20 wallets × 4000 sats = 80,000 sats (0.0008 BTC)
 * Each wallet can handle ~2 purchases (2000 sats each) before rotation
 */
export const PRESALE_POOL_WALLETS: PoolWallet[] = [
  { address: 'ark1qq4hfssprtcgnjzf8qlw2f78yvjau5kldfugg29k34y7j96q2w4t4vlcs2jcpuumuww8yrd6zq0ppevee2zaaldhnwn88sma02g0rw23re7jf9', privateKey: 'ac31ec6efe48e8b7899e4f8d182ef885a45092313dc6ff921c7b9f52542de407', currentVolume: 0, isFull: false },
  { address: 'ark1qq4hfssprtcgnjzf8qlw2f78yvjau5kldfugg29k34y7j96q2w4t42ufznnec6pvl34za9uw2tl39cxchu296ty05gv99mujl5uwgyv6n74em6', privateKey: '39ba76fa86788933982476f1e9ff20b71c2bfb480f1522181742cc91a1b4ec8f', currentVolume: 0, isFull: false },
  { address: 'ark1qq4hfssprtcgnjzf8qlw2f78yvjau5kldfugg29k34y7j96q2w4t5rksk6an0n7u2tvws2dmy4gsvnej6jv09exv8ykccdwrrj2p7sedkuzy56', privateKey: '999d90063bcf6c0ee5faf5ab0dc717810a1a0731905d7d6987b16f6b97f71a36', currentVolume: 0, isFull: false },
  { address: 'ark1qq4hfssprtcgnjzf8qlw2f78yvjau5kldfugg29k34y7j96q2w4t56nnt7z54vfqu4cw7sv77ggkp7lcu0xtpelqrc2xnva70c3n28uxgsy0dw', privateKey: '59a6d655726f2bd7b34ac423da2db7314c8ab656121a8753b58e02b233679aaf', currentVolume: 0, isFull: false },
  { address: 'ark1qq4hfssprtcgnjzf8qlw2f78yvjau5kldfugg29k34y7j96q2w4t59f0tv3amtqd372tym6hksslz2whwumjwjmk2h5qy4g82t37354t8raa7u', privateKey: '32f49d5f309573a784bec8f07b0a9cc74fa431c8d4da185588263477c3dfecbf', currentVolume: 0, isFull: false },
  { address: 'ark1qq4hfssprtcgnjzf8qlw2f78yvjau5kldfugg29k34y7j96q2w4t54khgxhc23jnq3tlgh6nulkqm56k8qafvxjs9y70y38jat9vfl8xlgpghx', privateKey: 'a907aa66733cbe95ddb8f25bbf743b5c25738058a9ba7d646b5f18e6a5e749f8', currentVolume: 0, isFull: false },
  { address: 'ark1qq4hfssprtcgnjzf8qlw2f78yvjau5kldfugg29k34y7j96q2w4t4yct8nrkswdwjzhz9vvxzu3zdk2ulmzjhzstdylau8qpmz6ws2gepyd5ft', privateKey: '6c4bc68bb7bc59080c42678078343e4eeacccd5868e101b5f3a777e36b06bcbc', currentVolume: 0, isFull: false },
  { address: 'ark1qq4hfssprtcgnjzf8qlw2f78yvjau5kldfugg29k34y7j96q2w4t4tjf68e2ttql05gv0j9fw3aztvzktgemvdvnp3wsukfpefxmmeeq9g9zpe', privateKey: '45865583c60cd3d77920f2d7a99874a6e805e976bc667dc0aab2cc8a7af2d6cc', currentVolume: 0, isFull: false },
  { address: 'ark1qq4hfssprtcgnjzf8qlw2f78yvjau5kldfugg29k34y7j96q2w4t50vdcy7u9udwmd0cf34v0kyr5mw7pku0jpvn5ecg5xpjs8m0dxdll58m5f', privateKey: '3a4c895d84fd28e76610b95618200edefa2b89bf83b4e019299721265aada168', currentVolume: 0, isFull: false },
  { address: 'ark1qq4hfssprtcgnjzf8qlw2f78yvjau5kldfugg29k34y7j96q2w4t52762n5wzm5m8a53ugzdh2xgv44wrzy92cx9wn6zzh9ce78zjnq6ygtaun', privateKey: '37f404a3c550b3883d40312deb92d7e1f7cb95a5b89730b79bec6ad73ba8db6d', currentVolume: 0, isFull: false },
  { address: 'ark1qq4hfssprtcgnjzf8qlw2f78yvjau5kldfugg29k34y7j96q2w4t4zp63784vvyddu7u5zn338lepu2559rl2qrx4ksu223tywgs24maseyhg7', privateKey: '7476f01defb460f68fe8ca2952f04589400275d9cce08b78ea61b29929fb8be4', currentVolume: 0, isFull: false },
  { address: 'ark1qq4hfssprtcgnjzf8qlw2f78yvjau5kldfugg29k34y7j96q2w4t59v997ckuvvjvuyk3kpzug066wteclzps4hl4gqeyd28evmmuytukpt38g', privateKey: '3e82e226aa000d1c8fc7b75ffa97014ea61d0a3536d5b86a6576cecec541009e', currentVolume: 0, isFull: false },
  { address: 'ark1qq4hfssprtcgnjzf8qlw2f78yvjau5kldfugg29k34y7j96q2w4t4w44mdwhdqyc4a65pcykfkql83akvqp073jz4juf2x6qacnykxualjv2sm', privateKey: 'c5dcf82691cbfb02e703b5c42dacccc824aa38c6cc79b93f1617275edd6ddca6', currentVolume: 0, isFull: false },
  { address: 'ark1qq4hfssprtcgnjzf8qlw2f78yvjau5kldfugg29k34y7j96q2w4t5avchzrfwdu59ywq49w4ve97ggdyxlyfyf57x36lkmcqnv7jtc9k0ry8u0', privateKey: '7d828aeb7fcf00706d5a11376be6a6e2c7e4e2f5432e62a4a9a0a2cbd49c3ee9', currentVolume: 0, isFull: false },
  { address: 'ark1qq4hfssprtcgnjzf8qlw2f78yvjau5kldfugg29k34y7j96q2w4t4nknwuj74kqdmd47tzkl9ggufna6qk927ve6g4h99upcacltvlhsj8tnrf', privateKey: '6ddf6fb1d9683c0a2c1d2040bbaa64dd792982979e82939292fb8ef586e41f82', currentVolume: 0, isFull: false },
  { address: 'ark1qq4hfssprtcgnjzf8qlw2f78yvjau5kldfugg29k34y7j96q2w4t4kamd2dy8gudhw6cwjfypk74p7n2ct23g2d7533q3sgv7pm2xry7lulrnc', privateKey: '3fd7c80ce662ac698d7441e4f0fa29e3feff444dfbd784f297be0584f04875e4', currentVolume: 0, isFull: false },
  { address: 'ark1qq4hfssprtcgnjzf8qlw2f78yvjau5kldfugg29k34y7j96q2w4t5m26zruw4n6uuahmc9yw8knjp0t5fd6yvq0vj3msj6l32jxursvuq8t4tq', privateKey: 'a40dc5670a9805290b5bd48cc974c141d5b4acfe253dedbbbfb8e5a77bb2c763', currentVolume: 0, isFull: false },
  { address: 'ark1qq4hfssprtcgnjzf8qlw2f78yvjau5kldfugg29k34y7j96q2w4t4wsw8y7fclt39xsww239q0zlrz852zxncjztsqs65zgt9j42jk4xm80k35', privateKey: 'c16ace68e504d29047c10a58decd4ee2eb477522d59d9ad79983c2a0709a9cb0', currentVolume: 0, isFull: false },
  { address: 'ark1qq4hfssprtcgnjzf8qlw2f78yvjau5kldfugg29k34y7j96q2w4t43sqp4w8xnyks9gqyvud0x8pgt9dzgqu3ry9ldfezfrc940pm980ypyvsn', privateKey: 'bc51ccd1e11c051b56b24ed445fb6d4ef379264ea2d14c151f00bfed0f08bdf5', currentVolume: 0, isFull: false },
  { address: 'ark1qq4hfssprtcgnjzf8qlw2f78yvjau5kldfugg29k34y7j96q2w4t5f9vy0zfshmycf39rqj5lv6yuvkj4gjtumsuvverg5f0z0rg82d2qjh07p', privateKey: '0eb51a0f273cb78b03391fdcce1504304029a80d896e32f380819f976b3fd59f', currentVolume: 0, isFull: false },
];

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
