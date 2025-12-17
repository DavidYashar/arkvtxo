# VTXO Metadata Approach - Detailed Explanation

## Overview

The VTXO Metadata approach embeds token information **directly into the VTXO's tapscript structure** rather than using covenant-enforced state transitions. The Arkade Service Provider (ASP) validates token operations during the cooperative path, ensuring only valid token transfers are processed.

## Core Concept

Instead of:
```
Token State → Covenant Script → Self-Enforcing Rules
```

We use:
```
Token Metadata → Tapscript Leaves → Server-Validated Rules
```

## How VTXOs Work in Arkade

### Standard VTXO Structure
Every VTXO in Arkade has a **Taproot output** with multiple spending paths:

```
┌─────────────────────────────────────┐
│     VTXO Taproot Output (P2TR)      │
└─────────────────────────────────────┘
              │
              ├──► Cooperative Path (user + server)
              │    • Instant settlement
              │    • Server cosigns
              │
              └──► Unilateral Path (user only)
                   • Timelock (144 blocks)
                   • User can exit to L1
```

### Token VTXO Structure (Metadata Approach)

We **extend** this by adding token metadata to the Taproot tree:

```
┌─────────────────────────────────────┐
│    Token VTXO Taproot Output        │
└─────────────────────────────────────┘
              │
              ├──► Cooperative Path (user + server)
              │    • Server validates token rules
              │    • Checks: balance, tokenId, owner
              │
              ├──► Token Metadata Leaf
              │    • tokenId: bytes32
              │    • amount: uint64
              │    • decimals: uint8
              │    • owner: pubkey
              │
              └──► Unilateral Path (user only)
                   • Timelock exit
                   • Exits as regular Bitcoin
```

## Technical Implementation

### 1. Token Metadata Encoding

Token data is embedded as a **Tapscript leaf** in the Taproot tree:

```typescript
// Token metadata structure
interface TokenMetadata {
  version: number;      // Protocol version (1 byte)
  tokenId: Buffer;      // 32 bytes (sha256 of token creation tx)
  amount: bigint;       // 8 bytes (token balance)
  decimals: number;     // 1 byte (decimal places)
  owner: Buffer;        // 33 bytes (owner's public key)
}

// Encode as tapscript
function encodeTokenMetadata(metadata: TokenMetadata): Buffer {
  const script = bitcoin.script.compile([
    // OP_RETURN style data push (never executable)
    bitcoin.opcodes.OP_RETURN,
    
    // Metadata marker: "ARKTOK" (6 bytes)
    Buffer.from('ARKTOK', 'utf8'),
    
    // Version
    Buffer.from([metadata.version]),
    
    // Token ID (32 bytes)
    metadata.tokenId,
    
    // Amount (8 bytes, little-endian)
    bigIntToBuffer(metadata.amount, 8),
    
    // Decimals (1 byte)
    Buffer.from([metadata.decimals]),
    
    // Owner pubkey (33 bytes compressed)
    metadata.owner,
  ]);
  
  return script;
}
```

### 2. Creating Token VTXOs

When creating a token VTXO, we build a Taproot tree with the metadata:

```typescript
class TokenVTXOBuilder {
  async createTokenVTXO(
    wallet: ArkadeWallet,
    tokenId: Buffer,
    amount: bigint,
    recipient: Buffer,
    decimals: number
  ): Promise<string> {
    // 1. Encode token metadata
    const metadata = encodeTokenMetadata({
      version: 1,
      tokenId,
      amount,
      decimals,
      owner: recipient,
    });
    
    // 2. Build Taproot tree
    const internalKey = wallet.getPublicKey();
    const serverKey = await this.getServerKey();
    
    const taprootTree = {
      // Cooperative path (leaf 0)
      cooperative: bitcoin.script.compile([
        internalKey,
        bitcoin.opcodes.OP_CHECKSIGVERIFY,
        serverKey,
        bitcoin.opcodes.OP_CHECKSIG,
      ]),
      
      // Token metadata (leaf 1)
      metadata: metadata,
      
      // Unilateral path (leaf 2)
      unilateral: bitcoin.script.compile([
        bitcoin.opcodes.OP_PUSHNUM_144,
        bitcoin.opcodes.OP_CHECKSEQUENCEVERIFY,
        bitcoin.opcodes.OP_DROP,
        internalKey,
        bitcoin.opcodes.OP_CHECKSIG,
      ]),
    };
    
    // 3. Create Taproot output
    const { output, witness } = bitcoin.payments.p2tr({
      internalPubkey: internalKey,
      scriptTree: taprootTree,
      network: bitcoin.networks.testnet,
    });
    
    // 4. Submit to Arkade for VTXO creation
    const vtxoId = await wallet.settle({
      outputs: [{ scriptPubKey: output, amount: 1000 }], // 1000 sats per VTXO
      metadata: { type: 'token', tokenId: tokenId.toString('hex') },
    });
    
    return vtxoId;
  }
}
```

### 3. Server-Side Validation

The Arkade Service Provider validates token operations during cooperative path:

```typescript
class TokenValidator {
  async validateTokenTransfer(
    inputs: TokenVTXO[],
    outputs: TokenVTXO[]
  ): Promise<boolean> {
    // 1. Extract metadata from input VTXOs
    const inputMetadata = inputs.map(vtxo => 
      this.extractTokenMetadata(vtxo.scriptTree)
    );
    
    // 2. Validate conservation of tokens
    const inputSum = inputMetadata.reduce(
      (sum, meta) => sum + meta.amount, 
      0n
    );
    
    const outputSum = outputs.reduce(
      (sum, meta) => sum + meta.amount, 
      0n
    );
    
    if (inputSum !== outputSum) {
      throw new Error('Token amounts do not match');
    }
    
    // 3. Validate all tokens have same tokenId
    const tokenId = inputMetadata[0].tokenId;
    if (!inputMetadata.every(meta => 
      meta.tokenId.equals(tokenId)
    )) {
      throw new Error('Mixed token types');
    }
    
    // 4. Validate ownership signatures
    for (let i = 0; i < inputs.length; i++) {
      const signature = inputs[i].signature;
      const owner = inputMetadata[i].owner;
      
      if (!this.verifySignature(signature, owner, inputs[i].txid)) {
        throw new Error(`Invalid signature for input ${i}`);
      }
    }
    
    return true;
  }
  
  extractTokenMetadata(scriptTree: TaprootTree): TokenMetadata {
    // Find metadata leaf (marked with "ARKTOK")
    const metadataLeaf = scriptTree.leaves.find(leaf => {
      const script = bitcoin.script.decompile(leaf);
      return script && 
             script[0] === bitcoin.opcodes.OP_RETURN &&
             script[1].equals(Buffer.from('ARKTOK', 'utf8'));
    });
    
    if (!metadataLeaf) {
      throw new Error('Token metadata not found');
    }
    
    // Decode metadata
    const script = bitcoin.script.decompile(metadataLeaf);
    return {
      version: script[2][0],
      tokenId: script[3],
      amount: bufferToBigInt(script[4]),
      decimals: script[5][0],
      owner: script[6],
    };
  }
}
```

### 4. Token Operations

#### Create Token
```typescript
async function createToken(
  wallet: ArkadeWallet,
  name: string,
  symbol: string,
  decimals: number,
  totalSupply: bigint
): Promise<string> {
  // 1. Generate unique token ID
  const tokenId = bitcoin.crypto.sha256(
    Buffer.concat([
      wallet.getPublicKey(),
      Buffer.from(name),
      Buffer.from(symbol),
      Buffer.from(Date.now().toString()),
    ])
  );
  
  // 2. Create initial supply VTXO
  const tokenVtxoId = await createTokenVTXO(
    wallet,
    tokenId,
    totalSupply,
    wallet.getPublicKey(),
    decimals
  );
  
  // 3. Register token with indexer
  await registerToken({
    tokenId,
    name,
    symbol,
    decimals,
    totalSupply,
    creator: wallet.getPublicKey(),
    creationTxId: tokenVtxoId,
  });
  
  return tokenId.toString('hex');
}
```

#### Transfer Tokens
```typescript
async function transferTokens(
  wallet: ArkadeWallet,
  tokenId: Buffer,
  recipient: Buffer,
  amount: bigint
): Promise<string> {
  // 1. Select input token VTXOs
  const tokenVtxos = await wallet.getTokenVtxos(tokenId);
  const selectedVtxos = selectVtxos(tokenVtxos, amount);
  
  const inputSum = selectedVtxos.reduce(
    (sum, vtxo) => sum + vtxo.metadata.amount,
    0n
  );
  
  // 2. Create output VTXOs
  const outputs = [];
  
  // Recipient output
  outputs.push(
    await createTokenVTXO(
      wallet,
      tokenId,
      amount,
      recipient,
      selectedVtxos[0].metadata.decimals
    )
  );
  
  // Change output (if needed)
  const change = inputSum - amount;
  if (change > 0n) {
    outputs.push(
      await createTokenVTXO(
        wallet,
        tokenId,
        change,
        wallet.getPublicKey(),
        selectedVtxos[0].metadata.decimals
      )
    );
  }
  
  // 3. Submit transfer to Arkade
  const txId = await wallet.transfer({
    inputs: selectedVtxos.map(v => v.id),
    outputs: outputs,
    metadata: { type: 'token-transfer', tokenId: tokenId.toString('hex') },
  });
  
  return txId;
}
```

## Architecture Diagram

```
┌──────────────────────────────────────────────────────────────┐
│                        User Wallet                            │
│  • Creates token VTXOs with embedded metadata                │
│  • Signs transactions                                         │
│  • Manages token balances                                     │
└────────────────┬─────────────────────────────────────────────┘
                 │
                 ▼
┌──────────────────────────────────────────────────────────────┐
│                   Arkade Service Provider                     │
│  ┌────────────────────────────────────────────────────────┐  │
│  │         Token Validator (Cooperative Path)             │  │
│  │  • Extracts metadata from VTXOs                        │  │
│  │  • Validates token conservation                        │  │
│  │  • Checks ownership signatures                         │  │
│  │  • Prevents double-spending                            │  │
│  └────────────────────────────────────────────────────────┘  │
│                                                                │
│  ┌────────────────────────────────────────────────────────┐  │
│  │              Virtual Mempool                           │  │
│  │  • Queues token transactions                           │  │
│  │  • Orders operations                                   │  │
│  └────────────────────────────────────────────────────────┘  │
│                                                                │
│  ┌────────────────────────────────────────────────────────┐  │
│  │           Batch Settlement Engine                      │  │
│  │  • Aggregates multiple token transfers                 │  │
│  │  • Creates single Bitcoin transaction                  │  │
│  └────────────────────────────────────────────────────────┘  │
└────────────────┬─────────────────────────────────────────────┘
                 │
                 ▼
┌──────────────────────────────────────────────────────────────┐
│                    Token Indexer                              │
│  • Tracks token balances                                      │
│  • Indexes token transfers                                    │
│  • Provides token history                                     │
│  • REST API for token data                                    │
└──────────────────────────────────────────────────────────────┘
```

## Trust Model

### What the Server Can Do:
1. **Validate** token operations (prevent invalid transfers)
2. **Order** transactions (prevent double-spending)
3. **Delay** settlement (within timelock window)
4. **Batch** multiple transfers for efficiency

### What the Server CANNOT Do:
1. **Cannot steal tokens** - User signatures required
2. **Cannot create tokens** - Requires creator signature
3. **Cannot change amounts** - Metadata is cryptographically committed
4. **Cannot prevent unilateral exit** - User can always exit to L1

### Security Properties:
- ✅ **User custody**: Keys never leave user's device
- ✅ **Unilateral exit**: Always available after 144 blocks
- ✅ **Cryptographic commitments**: Metadata tamper-proof
- ⚠️ **Server liveness**: Need server for instant settlement
- ⚠️ **Server honesty**: Server validates token rules

## Comparison: Metadata vs. Contracts

| Feature | VTXO Metadata | Arkade Contracts |
|---------|--------------|------------------|
| **Self-enforcing** | ❌ Server validates | ✅ Script enforces |
| **Composability** | ⚠️ Limited | ✅ Full |
| **Privacy** | ✅ Good | ✅ Excellent |
| **Complexity** | ✅ Simple | ⚠️ Complex |
| **Implementation** | ✅ Days | ⏳ Waiting on compiler |
| **Migration path** | ✅ Clear | N/A |
| **Trust required** | ⚠️ Server honesty | ✅ Minimal |
| **Unilateral exit** | ✅ Yes | ✅ Yes |

## Migration Path to Contracts

When the Arkade compiler supports advanced features, we can migrate:

```
Phase 1: VTXO Metadata (Now)
  • Get to market quickly
  • Build user base
  • Test token economics
  ↓
Phase 2: Dual System (Transition)
  • Deploy covenant contracts
  • Run both systems in parallel
  • Offer migration tool to users
  ↓
Phase 3: Full Contracts (Future)
  • Sunset metadata approach
  • All new tokens use contracts
  • Better composability & security
```

## Advantages of This Approach

1. **No Compiler Dependency**: Works with current Arkade SDK
2. **Fast Implementation**: 3-5 days to working product
3. **Battle-tested**: Uses standard Taproot techniques
4. **Clear Migration**: Path to contracts when ready
5. **Good Security**: Unilateral exit always available
6. **Market Ready**: Can launch quickly

## Implementation Checklist

- [ ] Implement `TokenMetadata` encoding/decoding
- [ ] Build `TokenVTXOBuilder` class
- [ ] Integrate with Arkade SDK's `settle()` method
- [ ] Update token indexer to parse metadata from VTXOs
- [ ] Implement server-side `TokenValidator`
- [ ] Add token operations to wallet UI
- [ ] Test on Mutinynet
- [ ] Deploy to production

## Next Steps

Ready to implement this approach? We can start with the `TokenMetadata` encoder and build up from there.
