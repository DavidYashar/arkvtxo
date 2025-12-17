# OP_RETURN Explained: Complete Token Verification Guide

## 🎯 Overview

When you create a token on Arkade, the token metadata is **permanently recorded on Bitcoin blockchain** using OP_RETURN. This makes it:
- ✅ **Immutable** - Can never be changed or deleted
- ✅ **Verifiable** - Anyone can verify on Bitcoin blockchain
- ✅ **Decentralized** - No central authority controls the data
- ✅ **Trustless** - Mathematical proof, no trust needed

## 📜 What's in the Bitcoin Transaction?

Let's use your TestToken as an example:
- **TXID**: `5dfac485527de8f17abb302b6307d14018703a0da434126d11d5725373ecbf2c`
- **Explorer**: https://mutinynet.com/tx/5dfac485527de8f17abb302b6307d14018703a0da434126d11d5725373ecbf2c

### Transaction Structure

```
┌─────────────────────────────────────────────┐
│          Bitcoin Transaction                │
├─────────────────────────────────────────────┤
│                                             │
│  📥 INPUT (1):                              │
│    UTXO: 99,800 sats                        │
│    From: tb1qhfwy29e2rayu8m3qxyj42pf7...   │
│         (Creator's Bitcoin address)         │
│                                             │
│  📤 OUTPUTS (2):                            │
│                                             │
│    Output #1: OP_RETURN (0 sats) ⭐         │
│    ┌─────────────────────────────────────┐ │
│    │  Token Creation Data (29 bytes)    │ │
│    │  ARK | v1 | CREATE | TestToken...  │ │
│    └─────────────────────────────────────┘ │
│                                             │
│    Output #2: Change (99,600 sats)          │
│    To: tb1qhfwy29e2rayu8m3qxyj42pf7...     │
│                                             │
│  ⛓️  Block: 2,660,441                       │
│  ⏰ Time: 2025-11-30                        │
│  💰 Fee: 200 sats                           │
│                                             │
└─────────────────────────────────────────────┘
```

## 🔍 OP_RETURN Breakdown

### Complete ScriptPubKey

```
6a1d41524b01010954657374546f6b656e045445535440420f000000000008
```

This breaks down into:

```
┌────────────────────────────────────────────────────────┐
│  BITCOIN LAYER (Script Opcodes)                        │
├────────────────────────────────────────────────────────┤
│  6a       = OP_RETURN                                  │
│             Makes output unspendable (provably lost)   │
│                                                        │
│  1d       = OP_PUSHBYTES_29                            │
│             Next 29 bytes are data                     │
└────────────────────────────────────────────────────────┘

┌────────────────────────────────────────────────────────┐
│  ARKADE TOKEN DATA (Our Protocol - 29 bytes)           │
├────────────────────────────────────────────────────────┤
│                                                        │
│  41 52 4b         → "ARK"        (Protocol ID)         │
│  01               → 1            (Version)             │
│  01               → CREATE       (Operation type)      │
│                                                        │
│  ┌──────────────────────────────────────────────────┐ │
│  │  TOKEN NAME (variable length)                    │ │
│  ├──────────────────────────────────────────────────┤ │
│  │  09               → 9 bytes      (Name length)   │ │
│  │  54 65 73 74      → "Test"                       │ │
│  │  54 6f 6b 65 6e   → "Token"                      │ │
│  └──────────────────────────────────────────────────┘ │
│                                                        │
│  ┌──────────────────────────────────────────────────┐ │
│  │  TOKEN SYMBOL (variable length)                  │ │
│  ├──────────────────────────────────────────────────┤ │
│  │  04               → 4 bytes      (Symbol length) │ │
│  │  54 45 53 54      → "TEST"                       │ │
│  └──────────────────────────────────────────────────┘ │
│                                                        │
│  ┌──────────────────────────────────────────────────┐ │
│  │  SUPPLY & DECIMALS                               │ │
│  ├──────────────────────────────────────────────────┤ │
│  │  40 42 0f 00      → 1,000,000    (Little-endian │ │
│  │  00 00 00 00                      uint64)        │ │
│  │                                                  │ │
│  │  08               → 8            (Decimals)      │ │
│  └──────────────────────────────────────────────────┘ │
│                                                        │
│  ✅ Total: 29 bytes / 80 max (36% capacity used)      │
└────────────────────────────────────────────────────────┘
```

### What Each Part Means

| Bytes | Hex | Decoded | Purpose |
|-------|-----|---------|---------|
| 0 | `6a` | OP_RETURN | Bitcoin opcode - marks output as unspendable |
| 1 | `1d` | 29 | Push next 29 bytes as data |
| 2-4 | `41524b` | "ARK" | Protocol identifier for Arkade |
| 5 | `01` | 1 | Protocol version |
| 6 | `01` | CREATE | Operation type (1 = create token) |
| 7 | `09` | 9 | Token name is 9 bytes long |
| 8-16 | `54657374546f6b656e` | "TestToken" | Token name |
| 17 | `04` | 4 | Token symbol is 4 bytes long |
| 18-21 | `54455354` | "TEST" | Token symbol |
| 22-29 | `40420f0000000000` | 1,000,000 | Total supply (little-endian) |
| 30 | `08` | 8 | Decimals |

## 📊 What Data is Included vs Excluded

### ✅ Included in OP_RETURN (29 bytes)
- Token Name (variable, max 20 bytes)
- Token Symbol (variable, max 10 bytes)
- Total Supply (8 bytes - supports up to 18.4 quintillion)
- Decimals (1 byte - 0 to 255)
- Protocol identifier ("ARK")
- Version & operation type

### ❌ Not Included (Derived from Bitcoin TX)
- **Token ID**: The Bitcoin TXID itself = Token ID
- **Creator**: The first input's address = Creator
- **Creation Time**: Block timestamp = Creation time
- **Block Height**: Included in Bitcoin block = Verification depth

### 💡 Why This Design?

**Space Efficiency**: OP_RETURN limited to 80 bytes
- Bitcoin addresses are 42+ bytes (bech32) - too large!
- Instead: Input address automatically identifies creator
- TXID automatically becomes unique token ID
- Block timestamp automatically records creation time

**Result**: We only need 29 bytes for actual token metadata!

## 🔐 How to Verify a Token

### Method 1: Using Our API

```bash
# Verify by Bitcoin TXID
curl http://localhost:3002/api/verify/5dfac485527de8f17abb302b6307d14018703a0da434126d11d5725373ecbf2c
```

**Response:**
```json
{
  "verified": true,
  "tokenId": "5dfac485527de8f17abb302b6307d14018703a0da434126d11d5725373ecbf2c",
  "metadata": {
    "name": "TestToken",
    "symbol": "TEST",
    "totalSupply": "1000000",
    "decimals": 8,
    "displaySupply": "0.01000000"
  },
  "bitcoinProof": {
    "txid": "5dfac485527de8f17abb302b6307d14018703a0da434126d11d5725373ecbf2c",
    "creator": "tb1qhfwy29e2rayu8m3qxyj42pf7urynjuv2z76ke2",
    "blockHeight": 2660441,
    "blockTime": 1764499705,
    "confirmations": 1,
    "opReturnDataHex": "41524b01010954657374546f6b656e045445535440420f000000000008",
    "explorerUrl": "https://mutinynet.com/tx/5dfac485527de8f17abb302b6307d14018703a0da434126d11d5725373ecbf2c"
  },
  "verification": {
    "protocol": "ARK",
    "version": 1,
    "operation": "CREATE",
    "immutable": true,
    "note": "This token metadata is permanently recorded on Bitcoin blockchain"
  }
}
```

### Method 2: Decode OP_RETURN Directly

```bash
# If you have the hex data
curl -X POST http://localhost:3002/api/verify/decode \
  -H "Content-Type: application/json" \
  -d '{"opReturnHex":"41524b01010954657374546f6b656e045445535440420f000000000008"}'
```

**Response:**
```json
{
  "decoded": true,
  "metadata": {
    "name": "TestToken",
    "symbol": "TEST",
    "totalSupply": "1000000",
    "decimals": 8,
    "displaySupply": "0.01000000"
  }
}
```

### Method 3: Manual Verification (Bitcoin Explorer)

1. **Go to Bitcoin Explorer**: https://mutinynet.com/tx/[TXID]

2. **Find OP_RETURN Output**: Look for output with 0 value and type "op_return"

3. **Extract Hex Data**: Copy the OP_RETURN hex (after `6a1d`)

4. **Decode**:
   ```javascript
   const hex = "41524b01010954657374546f6b656e045445535440420f000000000008";
   const buffer = Buffer.from(hex, 'hex');
   
   // Parse according to format above
   const protocol = buffer.subarray(0, 3).toString('utf8'); // "ARK"
   const version = buffer[3]; // 1
   const opType = buffer[4]; // 1 (CREATE)
   // ... continue parsing
   ```

5. **Verify Creator**: Check the first input's address

6. **Verify Timestamp**: Check block time

## 🚀 Integration Examples

### Frontend Integration

```typescript
// Verify token on page load
async function verifyToken(tokenId: string) {
  const response = await fetch(`/api/verify/${tokenId}`);
  const data = await response.json();
  
  if (data.verified) {
    console.log(`✅ Token verified on Bitcoin blockchain!`);
    console.log(`Creator: ${data.bitcoinProof.creator}`);
    console.log(`Block: ${data.bitcoinProof.blockHeight}`);
    console.log(`Confirmations: ${data.bitcoinProof.confirmations}`);
  }
}

// Display verification badge
function renderTokenCard(token) {
  return (
    <div>
      <h2>{token.metadata.name} ({token.metadata.symbol})</h2>
      <p>Supply: {token.metadata.displaySupply}</p>
      
      {/* Bitcoin Proof Badge */}
      <div className="bitcoin-verified">
        ⛓️ Verified on Bitcoin
        <a href={token.bitcoinProof.explorerUrl} target="_blank">
          View Proof
        </a>
      </div>
    </div>
  );
}
```

### Smart Contract Integration

```typescript
// Verify token before accepting transfer
async function acceptTokenTransfer(tokenId: string, amount: bigint) {
  // 1. Verify on Bitcoin
  const verification = await fetch(`/api/verify/${tokenId}`).then(r => r.json());
  
  if (!verification.verified) {
    throw new Error('Token not verified on Bitcoin');
  }
  
  // 2. Check metadata matches expected
  if (verification.metadata.symbol !== 'TEST') {
    throw new Error('Wrong token symbol');
  }
  
  // 3. Proceed with transfer
  await wallet.acceptTransfer(tokenId, amount);
}
```

## 🎨 UI/UX Recommendations

### Token Card

```
┌─────────────────────────────────────────┐
│  TestToken (TEST)                       │
│  Supply: 0.01000000 TEST                │
│                                         │
│  ⛓️ Bitcoin Verified                    │
│  Creator: tb1qhfw...76ke2               │
│  Block: 2,660,441                       │
│  Created: Nov 30, 2025                  │
│                                         │
│  [View on Bitcoin Explorer →]           │
└─────────────────────────────────────────┘
```

### Verification Badge

```
✅ Bitcoin Verified
   TXID: 5dfac48...ecbf2c
   Block: 2,660,441 (1+ confirmations)
   
   This token's metadata is permanently 
   recorded on Bitcoin blockchain and 
   cannot be altered.
```

## 🔧 API Reference

### GET /api/verify/:txid

Verify and decode token from Bitcoin transaction.

**Parameters:**
- `txid` - Bitcoin transaction ID (token ID)

**Response:**
- `verified` - Whether token was successfully verified
- `tokenId` - The Bitcoin TXID (token identifier)
- `metadata` - Decoded token information
- `bitcoinProof` - Bitcoin blockchain proof details
- `verification` - Protocol information

### POST /api/verify/decode

Decode OP_RETURN hex data directly.

**Request Body:**
```json
{
  "opReturnHex": "41524b01010954657374546f6b656e045445535440420f000000000008"
}
```

**Response:**
```json
{
  "decoded": true,
  "metadata": {
    "name": "TestToken",
    "symbol": "TEST",
    "totalSupply": "1000000",
    "decimals": 8,
    "displaySupply": "0.01000000"
  }
}
```

## 📚 Additional Resources

- **Bitcoin OP_RETURN**: https://en.bitcoin.it/wiki/OP_RETURN
- **Esplora API**: https://github.com/Blockstream/esplora/blob/master/API.md
- **Mutinynet Explorer**: https://mutinynet.com
- **Token Creation Guide**: See `QUICKSTART-2PHASE.md`

## ❓ FAQ

### Q: Can token metadata be changed after creation?

**A**: No! Once written to Bitcoin blockchain via OP_RETURN, it's **permanently immutable**. Even if the Arkade indexer database is deleted, anyone can re-verify the token from Bitcoin.

### Q: What happens if creator address changes?

**A**: Creator is determined by the Bitcoin transaction input at creation time. This cannot change - it's part of the immutable Bitcoin transaction.

### Q: How many confirmations are needed?

**A**: We recommend waiting for **1+ confirmations** before considering token created. On mainnet, 6+ confirmations are standard for high-value tokens.

### Q: Can I create tokens without Bitcoin fees?

**A**: No - creating the OP_RETURN proof requires a Bitcoin transaction (usually ~200 sats fee). However, **all transfers** happen on Arkade Layer 2 with zero Bitcoin fees!

### Q: What if Bitcoin transaction fails?

**A**: The 2-phase system handles this:
1. If Phase 1 (Bitcoin) fails → No token created
2. If Phase 2 (Arkade) fails → Token still provable on Bitcoin, can retry registration

### Q: Is this compatible with other protocols?

**A**: The OP_RETURN data uses Arkade's format (`ARK` protocol identifier). Other protocols can read/verify it, but interpretation depends on understanding our encoding scheme.

---

**🎉 Congratulations!** Your tokens now have immutable, decentralized, verifiable proof on Bitcoin blockchain while maintaining Layer 2 speed for transfers!
