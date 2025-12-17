# Quick Verification Cheat Sheet

## 🔍 Your TestToken Details

```
Token ID:    5dfac485527de8f17abb302b6307d14018703a0da434126d11d5725373ecbf2c
Name:        TestToken
Symbol:      TEST
Supply:      1,000,000 (0.01 TEST with 8 decimals)
Creator:     tb1qhfwy29e2rayu8m3qxyj42pf7urynjuv2z76ke2
Block:       2,660,441
Time:        Nov 30, 2025

Explorer:    https://mutinynet.com/tx/5dfac485527de8f17abb302b6307d14018703a0da434126d11d5725373ecbf2c
```

## 📋 OP_RETURN Data Breakdown

```
Complete ScriptPubKey:
6a1d41524b01010954657374546f6b656e045445535440420f000000000008

Breakdown:
┌─────────────┬──────┬──────────────────┬─────────────────────────┐
│ Offset      │ Hex  │ Decoded          │ Meaning                 │
├─────────────┼──────┼──────────────────┼─────────────────────────┤
│ 0           │ 6a   │ OP_RETURN        │ Bitcoin: Unspendable    │
│ 1           │ 1d   │ 29               │ Bitcoin: Push 29 bytes  │
│ 2-4         │ 4152 │ "ARK"            │ Protocol identifier     │
│             │ 4b   │                  │                         │
│ 5           │ 01   │ 1                │ Protocol version        │
│ 6           │ 01   │ CREATE           │ Operation type          │
│ 7           │ 09   │ 9                │ Name length             │
│ 8-16        │ 5465 │ "TestToken"      │ Token name              │
│             │ 7374 │                  │                         │
│             │ 546f │                  │                         │
│             │ 6b65 │                  │                         │
│             │ 6e   │                  │                         │
│ 17          │ 04   │ 4                │ Symbol length           │
│ 18-21       │ 5445 │ "TEST"           │ Token symbol            │
│             │ 5354 │                  │                         │
│ 22-29       │ 4042 │ 1,000,000        │ Total supply (LE)       │
│             │ 0f00 │                  │                         │
│             │ 0000 │                  │                         │
│             │ 0000 │                  │                         │
│ 30          │ 08   │ 8                │ Decimals                │
└─────────────┴──────┴──────────────────┴─────────────────────────┘

Total: 31 bytes (6a1d prefix + 29 data)
Used: 29/80 bytes (36% of OP_RETURN capacity)
```

## 🚀 Quick API Tests

### Test 1: Verify Token
```bash
curl http://localhost:3002/api/verify/5dfac485527de8f17abb302b6307d14018703a0da434126d11d5725373ecbf2c | jq
```

### Test 2: Decode OP_RETURN
```bash
curl -X POST http://localhost:3002/api/verify/decode \
  -H "Content-Type: application/json" \
  -d '{"opReturnHex":"41524b01010954657374546f6b656e045445535440420f000000000008"}' | jq
```

### Test 3: Get Token from Indexer
```bash
curl http://localhost:3002/api/tokens/5dfac485527de8f17abb302b6307d14018703a0da434126d11d5725373ecbf2c | jq
```

## 📊 What You Get From Each Source

### From Bitcoin Transaction (Immutable):
- ✅ Token ID (TXID)
- ✅ Token Name
- ✅ Token Symbol
- ✅ Total Supply
- ✅ Decimals
- ✅ Creator Address (input)
- ✅ Creation Time (block time)
- ✅ Block Height

### From Arkade Layer 2 (Fast):
- ✅ Token Balances
- ✅ Transfer History
- ✅ Holder Addresses
- ✅ Transfer Speeds (~instant)

### Best of Both Worlds:
```
Bitcoin L1          Arkade L2
───────────         ──────────
Immutable proof  +  Fast transfers
Decentralized    +  Cheap fees
Verifiable       +  Instant UX
Trustless        +  Scalable
```

## 🎯 Common Verification Flows

### Flow 1: User Views Token
```
1. Frontend fetches token from indexer
2. Display token info (name, symbol, supply)
3. Show "Bitcoin Verified ✅" badge
4. Link to Bitcoin explorer for proof
```

### Flow 2: User Receives Token
```
1. Receive transfer notification
2. Query /api/verify/{tokenId}
3. Confirm metadata matches expected
4. Accept transfer
```

### Flow 3: External Verification (No Indexer)
```
1. Get Bitcoin TXID (token ID)
2. Query Bitcoin explorer/node
3. Extract OP_RETURN output
4. Decode hex data manually
5. Verify creator from inputs
```

## 💡 Key Insights

### Why OP_RETURN?
- **Provable**: Mathematically provable on Bitcoin
- **Permanent**: Can't be deleted or altered
- **Efficient**: Only 29 bytes for full metadata
- **Standard**: Bitcoin's recommended data storage method

### Why NOT Include Everything?
- Bitcoin addresses: 42+ bytes (too large!)
- Timestamps: Block time provides this
- Token ID: TXID is naturally unique
- Creator: Input address proves ownership

### Result: Efficient Encoding
```
If we included everything manually:
- Protocol ID:    3 bytes   ✅ (needed)
- Version:        1 byte    ✅ (needed)
- Operation:      1 byte    ✅ (needed)
- Name:          ~9 bytes   ✅ (needed)
- Symbol:        ~4 bytes   ✅ (needed)
- Supply:         8 bytes   ✅ (needed)
- Decimals:       1 byte    ✅ (needed)
- Token ID:      32 bytes   ❌ (TXID provides this!)
- Creator:       42 bytes   ❌ (Input provides this!)
- Timestamp:      4 bytes   ❌ (Block provides this!)
────────────────────────────
Total:           29 bytes vs 105 bytes
Saved:           76 bytes (72% reduction!)
```

## 🔐 Security Guarantees

### What's Guaranteed by Bitcoin:
1. **Immutability**: Cannot change metadata after creation
2. **Timestamp**: Block time proves when token was created
3. **Provenance**: Input address proves who created it
4. **Uniqueness**: TXID guarantees unique token ID
5. **Consensus**: Bitcoin's PoW secures the data

### What's NOT Guaranteed:
1. **Token value**: Market determines value
2. **Transfer validity**: Arkade L2 handles this
3. **Balance accuracy**: Indexer tracks balances
4. **Double-spend prevention**: Arkade protocol prevents this

## 🎨 Visual Verification

### In Your UI:
```
┌────────────────────────────────────────┐
│  🪙 TestToken (TEST)                   │
│                                        │
│  Supply: 0.01000000 TEST               │
│  Created: Nov 30, 2025                 │
│                                        │
│  ⛓️ Bitcoin Verified                   │
│  ┌──────────────────────────────────┐ │
│  │ TXID: 5dfac48...ecbf2c           │ │
│  │ Block: 2,660,441                 │ │
│  │ Creator: tb1qhfw...76ke2          │ │
│  │                                  │ │
│  │ [View on Bitcoin Explorer →]     │ │
│  └──────────────────────────────────┘ │
│                                        │
│  [Transfer] [View History]             │
└────────────────────────────────────────┘
```

## 📞 Quick Reference

| Need to... | Use... |
|------------|--------|
| Verify token exists | `/api/verify/{txid}` |
| Decode OP_RETURN | `/api/verify/decode` |
| Get token details | `/api/tokens/{tokenId}` |
| View on blockchain | `https://mutinynet.com/tx/{txid}` |
| Manual decode | See `OP_RETURN_EXPLAINED.md` |

---

**Remember**: Token ID = Bitcoin TXID = Permanent Proof! 🎉
