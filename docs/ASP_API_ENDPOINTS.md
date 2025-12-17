# 🔍 Arkade ASP API Endpoints Reference

Base URL: `https://mutinynet.arkade.sh`

## 📊 ExplorerService - Public Queries

### 1. List VTXOs by Address
**Endpoint:** `GET /v1/vtxos/{address}`

**Description:** Get all VTXOs (spendable and spent) for an Arkade address.

**Example:**
```bash
curl "https://mutinynet.arkade.sh/v1/vtxos/tark1q..."
```

**Response:**
```json
{
  "spendableVtxos": [
    {
      "outpoint": {"txid": "...", "vout": 0},
      "spent": false,
      "roundTxid": "...",
      "amount": "1000",
      "pubkey": "...",
      "createdAt": "2025-11-28T...",
      "expireAt": "...",
      "swept": false,
      "isPending": false
    }
  ],
  "spentVtxos": [...]
}
```

**Use Cases:**
- ✅ Check user's VTXO balance
- ✅ Verify token creation VTXOs
- ✅ List available VTXOs for spending

---

### 2. Get Round by Transaction ID
**Endpoint:** `GET /v1/round/{txid}`

**Description:** Get full round details including VTXO tree, forfeit txs, connectors.

**Example:**
```bash
curl "https://mutinynet.arkade.sh/v1/round/abc123..."
```

**Response:**
```json
{
  "round": {
    "id": "...",
    "start": "...",
    "end": "...",
    "roundTx": "...",
    "vtxoTree": {...},
    "forfeitTxs": [...],
    "connectors": {...},
    "stage": "ROUND_STAGE_FINALIZED"
  }
}
```

**Use Cases:**
- ✅ Verify round settlement
- ✅ Inspect VTXO tree structure
- ✅ Audit round transactions

---

### 3. Get Round by ID
**Endpoint:** `GET /v1/round/id/{id}`

**Description:** Same as above but query by round ID instead of txid.

**Example:**
```bash
curl "https://mutinynet.arkade.sh/v1/round/id/round-123"
```

---

### 4. Subscribe to Address Updates
**Endpoint:** `GET /v1/vtxos/{address}/subscribe` (streaming)

**Description:** Real-time streaming of VTXO updates for an address.

**Use Cases:**
- ✅ Real-time balance updates
- ✅ Token transfer notifications
- ✅ VTXO settlement alerts

---

## 📇 IndexerService - Advanced Queries

### 5. Get VTXOs by Address (Indexer)
**Endpoint:** `GET /v1/getVtxos/{addresses}`

**Query Parameters:**
- `spendableOnly` (boolean): Only return unspent VTXOs
- `spentOnly` (boolean): Only return spent VTXOs
- `page.size` (int): Results per page
- `page.index` (int): Page number

**Example:**
```bash
curl "https://mutinynet.arkade.sh/v1/getVtxos/tark1q...?spendableOnly=true"
```

**Response:**
```json
{
  "vtxos": [
    {
      "outpoint": {"txid": "...", "vout": 0},
      "createdAt": "...",
      "expiresAt": "...",
      "amount": "1000",
      "script": "...",
      "isLeaf": true,
      "isSwept": false,
      "isSpent": false,
      "spentBy": "",
      "commitmentTxid": "..."
    }
  ],
  "page": {"current": 1, "next": 2, "total": 5}
}
```

---

### 6. Get VTXOs by Outpoint
**Endpoint:** `GET /v1/getVtxosByOutpoint/{outpoints}`

**Description:** Query specific VTXOs by their txid:vout outpoints.

**Example:**
```bash
curl "https://mutinynet.arkade.sh/v1/getVtxosByOutpoint/abc123:0,def456:1"
```

**Use Cases:**
- ✅ Verify specific token VTXOs
- ✅ Check VTXO status by ID
- ✅ Batch VTXO queries

---

### 7. Get Transaction History
**Endpoint:** `GET /v1/history/{address}`

**Query Parameters:**
- `startTime` (int64): Unix timestamp start
- `endTime` (int64): Unix timestamp end
- `page.size` (int): Results per page
- `page.index` (int): Page number

**Example:**
```bash
curl "https://mutinynet.arkade.sh/v1/history/tark1q...?page.size=10"
```

**Response:**
```json
{
  "history": [
    {
      "commitmentTxid": "...",
      "virtualTxid": "...",
      "type": "INDEXER_TX_TYPE_SEND",
      "amount": "1000",
      "createdAt": "...",
      "isSettled": true,
      "settledBy": "..."
    }
  ],
  "page": {...}
}
```

**Transaction Types:**
- `INDEXER_TX_TYPE_UNSPECIFIED`
- `INDEXER_TX_TYPE_SEND`
- `INDEXER_TX_TYPE_RECEIVE`

**Use Cases:**
- ✅ Token transfer history
- ✅ Settlement verification
- ✅ Transaction auditing

---

### 8. Get VTXO Chain
**Endpoint:** `GET /v1/vtxo/{txid}/{vout}/chain`

**Description:** Get the full spending chain for a VTXO.

**Example:**
```bash
curl "https://mutinynet.arkade.sh/v1/vtxo/abc123.../0/chain"
```

**Response:**
```json
{
  "chain": [
    {
      "txid": "...",
      "spends": [
        {"txid": "...", "type": "INDEXER_CHAINED_TX_TYPE_OFFCHAIN"}
      ],
      "expiresAt": "..."
    }
  ],
  "depth": 3,
  "rootCommitmentTxid": "...",
  "page": {...}
}
```

**Use Cases:**
- ✅ Trace token transfer chains
- ✅ Verify VTXO lineage
- ✅ Audit transaction paths

---

### 9. Get Virtual Transactions
**Endpoint:** `GET /v1/virtualTx/{txids}`

**Description:** Get virtual transaction details by IDs.

**Example:**
```bash
curl "https://mutinynet.arkade.sh/v1/virtualTx/tx1,tx2,tx3"
```

---

### 10. Get Commitment Transaction
**Endpoint:** `GET /v1/commitmentTx/{txid}`

**Description:** Get full commitment transaction details.

**Response:**
```json
{
  "startedAt": "...",
  "endedAt": "...",
  "batches": {
    "batch1": {
      "totalOutputAmount": "100000",
      "totalOutputVtxos": 5,
      "expiresAt": "...",
      "swept": false
    }
  },
  "totalInputAmount": "100000",
  "totalInputVtxos": 3,
  "totalOutputAmount": "100000",
  "totalOutputVtxos": 5
}
```

---

### 11. Get VTXO Tree
**Endpoint:** `GET /v1/batch/{txid}/{vout}/tree`

**Description:** Get the VTXO tree structure for a batch.

---

### 12. Get VTXO Tree Leaves
**Endpoint:** `GET /v1/batch/{txid}/{vout}/tree/leaves`

**Description:** Get all leaf VTXOs in a tree.

---

## 🔧 ArkService - Server Operations

### 13. Get Server Info
**Endpoint:** `GET /v1/info`

**Description:** Get ASP server configuration and status.

**Example:**
```bash
curl "https://mutinynet.arkade.sh/v1/info"
```

**Response:**
```json
{
  "pubkey": "03fa73c6...",
  "vtxoTreeExpiry": "...",
  "unilateralExitDelay": "172544",
  "roundInterval": "60",
  "network": "mutinynet",
  "dust": "330",
  "vtxoMinAmount": "1",
  "vtxoMaxAmount": "-1"
}
```

**Use Cases:**
- ✅ Check server health
- ✅ Get round timing
- ✅ Verify network configuration

---

### 14. Get Event Stream
**Endpoint:** `GET /v1/events` (streaming)

**Description:** Real-time streaming of ASP events (round finalization, signing, etc).

**Events:**
- `roundFinalization`: New round created
- `roundFinalized`: Round confirmed on-chain
- `roundFailed`: Round failed
- `roundSigning`: Round in signing phase

---

### 15. Get Transactions Stream
**Endpoint:** `GET /v1/transactions` (streaming)

**Description:** Real-time streaming of all transactions.

---

## 🎯 Most Useful for Token Verification

### Primary Endpoints:
1. **`GET /v1/vtxos/{address}`** - List user's VTXOs
2. **`GET /v1/history/{address}`** - Transaction history
3. **`GET /v1/getVtxosByOutpoint/{outpoints}`** - Verify specific VTXOs
4. **`GET /v1/vtxo/{txid}/{vout}/chain`** - Trace VTXO spending chain
5. **`GET /v1/info`** - Server status

### For Token Creation Verification:
```bash
# 1. Check if token VTXO exists
curl "https://mutinynet.arkade.sh/v1/getVtxosByOutpoint/030b67bd...:0"

# 2. Get creator's VTXO list
curl "https://mutinynet.arkade.sh/v1/vtxos/tark1qra883..."

# 3. Check transaction history
curl "https://mutinynet.arkade.sh/v1/history/tark1qra883..."

# 4. Trace VTXO chain
curl "https://mutinynet.arkade.sh/v1/vtxo/030b67bd.../0/chain"
```

---

## 📝 Integration with Verification Indexer

We can add these endpoints to our verification system:

```typescript
// verification-indexer/src/services/asp.ts

export async function queryVtxosByAddress(address: string) {
  const response = await axios.get(
    `${ASP_URL}/v1/vtxos/${address}`,
    { timeout: 10000 }
  );
  return response.data;
}

export async function queryTransactionHistory(
  address: string,
  pageSize: number = 10
) {
  const response = await axios.get(
    `${ASP_URL}/v1/history/${address}`,
    { params: { 'page.size': pageSize }, timeout: 10000 }
  );
  return response.data;
}

export async function queryVtxoChain(txid: string, vout: number = 0) {
  const response = await axios.get(
    `${ASP_URL}/v1/vtxo/${txid}/${vout}/chain`,
    { timeout: 10000 }
  );
  return response.data;
}

export async function queryVtxosByOutpoint(outpoints: string[]) {
  const outpointStr = outpoints.join(',');
  const response = await axios.get(
    `${ASP_URL}/v1/getVtxosByOutpoint/${outpointStr}`,
    { timeout: 10000 }
  );
  return response.data;
}
```

---

## 🚀 Next Steps

1. **Test with real wallet address** that has VTXOs
2. **Add new ASP query methods** to verification indexer
3. **Create new verification endpoints** that use these queries
4. **Build UI components** to display transaction history, VTXO chains, etc.

Want me to implement these new ASP integration functions?
