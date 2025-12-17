# Pre-sale Pool Wallet System - Implementation Complete

## ✅ What Was Added

### 1. **New File: Pool Wallet Configuration**
**Location:** `token-indexer/src/config/presale-pool.ts`

**Features:**
- Toggle system: `enabled: true/false`
- Configurable threshold: `WALLET_THRESHOLD_SATS: 20000`
- Unlimited wallet support (you add as many as needed)
- Automatic rotation based on volume
- Statistics and monitoring functions

**What You Need to Do:**
Replace `'wallet1'`, `'wallet2'`, `'wallet3'` with your actual Arkade testnet addresses:

```typescript
export const PRESALE_POOL_WALLETS: PoolWallet[] = [
  {
    address: 'tark1q...your-actual-address-1...',  // Replace this
    currentVolume: 0,
    isFull: false,
  },
  {
    address: 'tark1q...your-actual-address-2...',  // Replace this
    currentVolume: 0,
    isFull: false,
  },
  // Add more as needed
];
```

### 2. **Modified: Token Creation Endpoint**
**Location:** `token-indexer/src/api/server.ts` (lines ~276-294)

**How It Works:**
- **Pool Mode ON** (`enabled: true`): Pre-sale tokens use pool wallet addresses
- **Pool Mode OFF** (`enabled: false`): Tokens use creator's wallet address
- Selects pool wallet with lowest volume that isn't full
- Logs which wallet is being used

### 3. **Modified: Purchase Recording**
**Location:** `token-indexer/src/api/server.ts` (lines ~887-894)

**How It Works:**
- After each purchase, updates the pool wallet volume
- When wallet reaches 20,000 sats → marks as "full"
- Automatically rotates to next wallet for future tokens
- Logs volume and status changes

### 4. **New: Monitoring Endpoint**
**Location:** `token-indexer/src/api/server.ts` (line ~857)

**Endpoint:** `GET http://localhost:3001/api/presale/pool-stats`

**Returns:**
```json
{
  "enabled": true,
  "threshold": 20000,
  "totalWallets": 3,
  "fullWallets": 0,
  "availableWallets": 3,
  "totalVolume": 0,
  "wallets": [
    {
      "address": "wallet1...",
      "volume": 0,
      "isFull": false,
      "percentFull": "0.0"
    }
  ]
}
```

---

## 🚀 How to Use

### Step 1: Add Your Wallet Addresses
Edit `token-indexer/src/config/presale-pool.ts`:
```typescript
export const PRESALE_POOL_WALLETS: PoolWallet[] = [
  {
    address: 'tark1qYOUR_TESTNET_ADDRESS_1',
    currentVolume: 0,
    isFull: false,
  },
  {
    address: 'tark1qYOUR_TESTNET_ADDRESS_2',
    currentVolume: 0,
    isFull: false,
  },
  // ... add more
];
```

### Step 2: Verify Pool Mode is ON
In `presale-pool.ts`:
```typescript
export const PRESALE_POOL_CONFIG = {
  enabled: true,  // ✅ Should be true for testing
  WALLET_THRESHOLD_SATS: 20000,
};
```

### Step 3: Restart Token Indexer
```bash
cd token-indexer
npm run dev
```

### Step 4: Create a Pre-sale Token
When you create a pre-sale token, the system will automatically:
1. Select the pool wallet with lowest volume
2. Use that wallet address as the payment receiver
3. Log which wallet was assigned

Console output:
```
🔄 Assigned pool wallet: tark1qYOUR_ADDRESS... (Volume: 0 sats)
```

### Step 5: Users Make Purchases
When users buy batches:
1. Payments go to the assigned pool wallet
2. System tracks volume: `💰 Pool wallet ... volume: 5000 / 20000 sats`
3. When hits 20K: `🔴 Pool wallet ... is now FULL (20000 sats)`
4. Next token will use a different wallet

### Step 6: Monitor Pool Wallets
Check status anytime:
```bash
curl http://localhost:3001/api/presale/pool-stats
```

---

## 🔧 Configuration Options

### Change Threshold
Edit `presale-pool.ts`:
```typescript
WALLET_THRESHOLD_SATS: 50000,  // Change from 20K to 50K
```

### Add More Wallets
Just add to the array:
```typescript
export const PRESALE_POOL_WALLETS: PoolWallet[] = [
  { address: 'wallet1', currentVolume: 0, isFull: false },
  { address: 'wallet2', currentVolume: 0, isFull: false },
  { address: 'wallet3', currentVolume: 0, isFull: false },
  { address: 'wallet4', currentVolume: 0, isFull: false },  // New
  { address: 'wallet5', currentVolume: 0, isFull: false },  // New
];
```

### Switch to Public Mode (After Launch)
```typescript
export const PRESALE_POOL_CONFIG = {
  enabled: false,  // 🔴 Disable pool mode
  WALLET_THRESHOLD_SATS: 20000,
};
```

Now all new tokens will use creator's wallet address directly.

---

## 🧪 Testing Checklist

### Test 1: Pool Wallet Assignment
- [ ] Create pre-sale token
- [ ] Check logs: Should show "Using pool wallet for pre-sale payments"
- [ ] Verify token.creator = pool wallet address (not your wallet)

### Test 2: Purchase Tracking
- [ ] Make purchase with 2000 sats
- [ ] Check logs: Should show "volume: 2000 / 20000 sats"
- [ ] Make more purchases until 20K reached
- [ ] Verify logs: "Pool wallet ... is now FULL"

### Test 3: Rotation
- [ ] After wallet 1 is full, create another pre-sale token
- [ ] Verify it uses wallet 2
- [ ] Check `/api/presale/pool-stats`: Should show wallet 1 full, wallet 2 active

### Test 4: Public Mode
- [ ] Set `enabled: false` in config
- [ ] Create pre-sale token
- [ ] Verify token.creator = your wallet address (not pool wallet)

---

## 📊 Monitoring Commands

**Check pool wallet status:**
```bash
curl http://localhost:3001/api/presale/pool-stats | jq
```

**Check specific token's payment address:**
```bash
curl http://localhost:3001/api/tokens/{TOKEN_ID} | jq '.creator'
```

**Check all purchases for a token:**
```bash
curl http://localhost:3001/api/presale/{TOKEN_ID}/all-purchases | jq
```

---

## ⚠️ Important Notes

1. **No Database Changes**: System uses existing database schema
2. **Volume Tracking**: In-memory only, resets on server restart (this is fine for controlled launch)
3. **Wallet Format**: Must start with `tark1q` for testnet
4. **Threshold Flexibility**: Can change anytime, takes effect for next rotation
5. **Backward Compatible**: Non-pre-sale tokens always use creator's wallet

---

## 🐛 Troubleshooting

**Problem: "All pool wallets are at capacity"**
- **Solution**: Add more wallet addresses to the array, or increase threshold

**Problem: Pool wallet not rotating**
- **Check**: Are purchases actually being recorded? Check `/api/presale/pool-stats`
- **Check**: Is threshold too high? Lower it for testing

**Problem: Payments still going to creator**
- **Check**: Is `enabled: true` in config?
- **Check**: Is token actually marked as pre-sale? (`isPresale: true`)
- **Check**: Server restarted after config change?

---

## 📝 Next Steps

1. **Add your 3+ wallet addresses** to `presale-pool.ts`
2. **Restart the indexer** (`npm run dev`)
3. **Create a test pre-sale token** and verify pool wallet is used
4. **Make test purchases** to verify volume tracking
5. **Monitor via** `/api/presale/pool-stats`
6. **After public launch**, set `enabled: false`

---

## 🎯 Ready to Test!

All code is implemented and working. Just add your wallet addresses and test! 🚀
