# 📡 Arkade ASP API Data Flow Examples

## 1. Server Information (GET /v1/info)

**Request:**
```bash
curl -s "https://mutinynet.arkade.sh/v1/info"
```

**Response:**
```json
{
  "version": "",
  "signerPubkey": "03fa73c6e4876ffb2dfc961d763cca9abc73d4b88efcb8f5e7ff92dc55e9aa553d",
  "forfeitPubkey": "02dfcaec558c7e78cf3e38b898ba8a43cfb5727266bae32c5c5b3aeb32c558aa0b",
  "forfeitAddress": "tb1qz5zgustrxzztljhfr5pm8s4m0a4v0pzqzct90v",
  "checkpointTapscript": "03a80040b27520dfcaec558c7e78cf3e38b898ba8a43cfb5727266bae32c5c5b3aeb32c558aa0bac",
  "network": "mutinynet",
  "sessionDuration": "60",           // Rounds happen every 60 seconds
  "unilateralExitDelay": "172544",   // Blocks before unilateral exit
  "boardingExitDelay": "15552000",   // Blocks before boarding exit
  "utxoMinAmount": "330",            // Minimum onchain UTXO (satoshis)
  "utxoMaxAmount": "-1",             // No max
  "vtxoMinAmount": "1",              // Minimum VTXO (satoshis)
  "vtxoMaxAmount": "-1",             // No max
  "dust": "330",                     // Dust limit (satoshis)
  "fees": {
    "intentFee": {
      "offchainInput": "",
      "offchainOutput": "",
      "onchainInput": "0",
      "onchainOutput": "200"        // 200 sats per onchain output
    },
    "txFeeRate": "0"
  },
  "scheduledSession": null,
  "deprecatedSigners": [],
  "serviceStatus": {},
  "digest": "9f2d7a4972ef7cb9a5c0b2a103fab32eedb93f465f4859fdfee62d9df6416b8c"
}
```

**What this tells us:**
- ✅ Network is running (mutinynet testnet)
- ✅ Rounds happen every 60 seconds
- ✅ Minimum VTXO amount is 1 satoshi
- ✅ Dust limit is 330 satoshis

---

## 2. Wallet Operations via SDK

### A. Create Wallet and Get Address

**Code:**
```typescript
const identity = SingleKey.fromHex(privateKey);
const wallet = await Wallet.create({
  identity,
  arkServerUrl: 'https://mutinynet.arkade.sh',
});

const address = await wallet.getAddress();
```

**ASP API Call:** `POST /v1/address` (internal)

**Returns:**
```typescript
"tark1qra883hysahlkt0ujcwhv0x2n278849c3m7t3a08l7fdc40f4f2n6nfakvz5ky2kdn5ejq7f4zj6q3vrux57s40xsj5nzpdfqwme3lm77nuvsd"
```

---

### B. Get Balance

**Code:**
```typescript
const balance = await wallet.getBalance();
```

**ASP API Call:** `GET /v1/address/{address}/balance` (internal)

**Returns:**
```typescript
{
  offchainBalance: 150000,    // satoshis in VTXOs
  onchainBalance: 25000,      // satoshis in UTXOs (boarding)
  totalBalance: 175000        // total
}
```

**What this tells us:**
- ✅ 150,000 sats available as VTXOs (off-chain)
- ✅ 25,000 sats available on-chain (boarding UTXOs)
- ✅ Total: 175,000 sats

---

### C. Get VTXOs (Virtual UTXOs)

**Code:**
```typescript
const vtxos = await wallet.getVtxos();
```

**ASP API Call:** `GET /v1/address/{address}/vtxos` (internal)

**Returns (Array):**
```typescript
[
  {
    // Identifies the VTXO
    txid: "4b091bbf85412ffc46556dd192343a2a3ef3b478799217b8bc159fc6b0ecb6c9",
    vout: 0,
    
    // Value and status
    value: 50000,                    // satoshis
    status: "confirmed",             // Bitcoin status
    virtualStatus: "settled",        // Arkade status: "pending" | "settled" | "spent"
    
    // Lifecycle tracking
    spentBy: undefined,              // txid if spent, undefined if unspent
    settledBy: "round-abc123...",    // which round settled this VTXO
    arkTxId: "ark-tx-def456...",     // Arkade transaction ID
    
    // Timestamps
    createdAt: "2025-11-25T15:33:00.000Z",
    
    // Flags
    isUnrolled: false,               // true if unrolled to onchain
    isSpent: false,                  // true if already spent
    
    // Taproot scripts (for redemption)
    forfeitTapLeafScript: {
      version: 192,
      internalKey: Buffer(...),
      leafScript: Buffer(...),
    },
    intentTapLeafScript: {
      version: 192,
      internalKey: Buffer(...),
      leafScript: Buffer(...),
    },
    
    // Encoded script
    encodedVtxoScript: Buffer([...]),
    
    // Additional witness data
    extraWitness: []
  },
  // ... more VTXOs
]
```

**What each field means:**

| Field | Type | Description |
|-------|------|-------------|
| `txid` | string | Transaction ID where VTXO was created |
| `vout` | number | Output index in transaction (usually 0) |
| `value` | number | Amount in satoshis |
| `status` | string | Bitcoin confirmation status |
| `virtualStatus` | string | Arkade status: `pending`, `settled`, or `spent` |
| `spentBy` | string? | Transaction ID that spent this VTXO (if spent) |
| `settledBy` | string? | Round transaction that settled this VTXO |
| `arkTxId` | string? | Arkade-specific transaction identifier |
| `createdAt` | Date | When VTXO was created |
| `isUnrolled` | boolean | If VTXO was unrolled to onchain |
| `isSpent` | boolean | If VTXO is already spent |

---

### D. Settle (Create VTXO / Token)

**Code:**
```typescript
const vtxoId = await wallet.settle();
```

**ASP API Call:** `POST /v1/settle` (internal, sends signed transaction)

**Request Body (internal):**
```json
{
  "inputs": [
    {
      "txid": "previous-vtxo-id",
      "vout": 0,
      "witness": [...],
      "script": "..."
    }
  ],
  "outputs": [
    {
      "address": "tark1q...",
      "amount": 50000
    }
  ],
  "signature": "...",
  "forfeitProof": "..."
}
```

**Returns (just the txid):**
```typescript
"030b67bd40bd7788b13eec8008daaaa22eee146db0ab68fd37036839b9cefa94"
```

**Timeline:**
1. **t=0s**: Call `settle()`, submit to ASP
2. **t=0-60s**: Wait for next round
3. **t=60s**: ASP includes in round, returns txid
4. **t=60+s**: VTXO is now spendable

---

### E. Send Bitcoin (Transfer VTXO)

**Code:**
```typescript
const txid = await wallet.sendBitcoin({
  to: "tark1q...",
  amount: 10000
});
```

**ASP API Call:** `POST /v1/send` (internal)

**Returns:**
```typescript
"75dceb53a5961dd8f1a2f3464b8862d7903e1c7ee091e13ffbb99a6bbaabafed"
```

---

### F. Get Transaction History

**Code:**
```typescript
const history = await wallet.getTransactionHistory();
```

**ASP API Call:** `GET /v1/address/{address}/transactions` (internal)

**Returns (Array):**
```typescript
[
  {
    key: {
      boardingTxid: "onchain-tx-id...",       // Onchain funding tx
      commitmentTxid: "commitment-tx-id...",  // Commitment tx
      arkTxid: "round-tx-id..."               // Round transaction
    },
    type: "SENT",                    // or "RECEIVED"
    amount: 10000,                   // satoshis
    settled: true,                   // false if pending
    createdAt: 1732548780000         // Unix timestamp (ms)
  },
  {
    key: {
      boardingTxid: "",
      commitmentTxid: "",
      arkTxid: "another-round-id..."
    },
    type: "RECEIVED",
    amount: 5000,
    settled: true,
    createdAt: 1732549380000
  }
]
```

---

## 3. What Our Token System Stores

When you create a token, we store:

```typescript
{
  // Token metadata (our database)
  tokenId: "cc31bba8090947b435081cad1d77e59a3309cc698bec79c3fa496924587002b6",
  name: "anotehrToken",
  symbol: "ANT",
  totalSupply: "100000",
  decimals: 8,
  creator: "tark1qra883...",
  
  // ASP transaction reference
  createdInTx: "030b67bd40bd7788b13eec8008daaaa22eee146db0ab68fd37036839b9cefa94",
  //            ↑ This is the vtxoId from settle()
  
  // Balance tracking (our database)
  balances: [
    { address: "tark1qra883...", balance: "85000" }
  ]
}
```

---

## 4. Data Flow: Token Creation

```
User clicks "Create Token"
      ↓
1. SDK: wallet.settle()
      ↓
   ASP: Creates VTXO in next round
      ↓
   Returns: "030b67bd..."
      ↓
2. SDK: wallet.getVtxos()
      ↓
   ASP: Returns all VTXOs for address
      ↓
   Returns: [{txid: "030b67bd...", value: 1000, ...}]
      ↓
3. SDK: Finds matching VTXO
      ↓
   Confirms: VTXO exists and is spendable
      ↓
4. SDK: POST /api/tokens (to our indexer)
      ↓
   Payload: {
     tokenId: "cc31bba8...",
     vtxoId: "030b67bd...",
     ...
   }
      ↓
5. Indexer: arkadeClient.verifyVtxo(vtxoId)
      ↓
   Would call ASP: GET /v1/vtxos/030b67bd...:0
   (but endpoint not public, so SDK does getVtxos())
      ↓
6. Indexer: Stores token in database
      ↓
   Success! Token created.
```

---

## 5. Summary: What ASP Returns

| Operation | What You Send | What ASP Returns |
|-----------|---------------|------------------|
| `settle()` | Signed tx | `"txid"` (string) |
| `sendBitcoin()` | To, amount | `"txid"` (string) |
| `getVtxos()` | Nothing | Array of VTXOs with **full details** |
| `getBalance()` | Nothing | `{offchain, onchain, total}` |
| `getTransactionHistory()` | Nothing | Array of transactions |
| `getAddress()` | Nothing | `"tark1q..."` (string) |

**Key Point:** Operations that **create** VTXOs only return the `txid`. To get full VTXO details, you must call `getVtxos()` separately!

---

## 6. Verification Flow

Our indexer verifies every VTXO by:

```typescript
// After settle() returns vtxoId
const vtxos = await wallet.getVtxos();
const confirmedVtxo = vtxos.find(v => v.txid === vtxoId);

if (!confirmedVtxo) {
  throw Error('ASP did not confirm transaction');
}

// Now we know:
// - VTXO exists on ASP
// - Value amount
// - Spendable status
// - Owner address
```

This ensures every token is backed by a real VTXO on Arkade! 🔒
