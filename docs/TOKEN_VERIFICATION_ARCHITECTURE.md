# 🔐 Token Verification Architecture (Future Enhancement)

## Overview

A dual-verification system that allows anyone to verify token authenticity through both:
1. **Arkade ASP** - Validates the underlying VTXO transaction exists on-chain
2. **Token Indexer** - Validates the token metadata and operation details

This creates a trustless verification mechanism where users can independently confirm:
- Token creation legitimacy
- Token transfer authenticity
- Creator identity
- Operation timestamps

---

## Core Concept

### Token Creation Proof

When a token is created:

```typescript
// 1. User creates token
const vtxoId = await wallet.settle();  // Returns: "030b67bd..."

// 2. Generate verification proof
const creationProof = {
  txId: vtxoId,                        // ASP transaction ID
  creator: await wallet.getAddress(),  // Creator's public address
  timestamp: Date.now(),               // Creation timestamp
  tokenMetadata: {
    name: "MyToken",
    symbol: "MTK",
    totalSupply: "1000000",
    decimals: 8
  }
};

// 3. Create deterministic hash
const verificationHash = hash(
  txId + creator + timestamp + JSON.stringify(tokenMetadata)
);

// 4. Store in indexer
await indexer.registerToken({
  tokenId: verificationHash,           // Unique token identifier
  vtxoId: txId,                        // Link to ASP transaction
  creator: creator,
  createdAt: timestamp,
  metadata: tokenMetadata,
  proof: creationProof
});
```

---

## Verification Flow

### A. User Verification Process

Anyone can verify a token's authenticity:

```typescript
// Given a token's vtxoId (txId from ASP)
const vtxoId = "030b67bd40bd7788b13eec8008daaaa22eee146db0ab68fd37036839b9cefa94";

// Step 1: Verify with ASP (blockchain layer)
const aspResponse = await fetch(`https://mutinynet.arkade.sh/v1/vtxos/${vtxoId}:0`);
// Confirms: Transaction exists on Arkade blockchain

// Step 2: Verify with Token Indexer (metadata layer)
const indexerResponse = await fetch(`https://token-indexer.arkade.io/api/verify/${vtxoId}`);
// Returns:
{
  verified: true,
  token: {
    tokenId: "cc31bba8090947b435081cad1d77e59a3309cc698bec79c3fa496924587002b6",
    name: "MyToken",
    symbol: "MTK",
    creator: "tark1qra883hysahlkt0ujcwhv0x2n278849c3m7t3a08l7fdc40f4f2n6n...",
    createdAt: "2025-11-25T15:33:00.000Z",
    vtxoId: "030b67bd...",
    proof: {
      verified: true,
      creatorSignature: "...",
      blockHeight: 12345
    }
  }
}

// ✅ Both verifications pass = Token is authentic!
```

---

## Token Transfer Verification

### Transfer Proof Generation

When tokens are transferred:

```typescript
// 1. Transfer executes
const transferTxId = await wallet.sendBitcoin({
  to: recipientAddress,
  amount: tokenAmount
});  // Returns: "75dceb53..."

// 2. Generate transfer proof
const transferProof = {
  txId: transferTxId,                  // ASP transfer transaction
  tokenId: originalTokenId,            // Which token was transferred
  sender: senderAddress,               // From address
  receiver: recipientAddress,          // To address
  amount: transferAmount,              // How many tokens
  timestamp: Date.now(),               // When
  nonce: generateNonce(),              // Prevent replay attacks
};

// 3. Create verification hash
const transferHash = hash(
  txId + tokenId + sender + receiver + amount + timestamp + nonce
);

// 4. Store in indexer
await indexer.registerTransfer({
  transferId: transferHash,
  vtxoId: transferTxId,
  tokenId: tokenId,
  from: sender,
  to: receiver,
  amount: amount,
  timestamp: timestamp,
  proof: transferProof
});
```

### Transfer Verification

```typescript
// Given a transfer's vtxoId
const transferTxId = "75dceb53a5961dd8f1a2f3464b8862d7903e1c7ee091e13ffbb99a6bbaabafed";

// Step 1: Verify with ASP
const aspTransfer = await asp.getTransaction(transferTxId);
// Confirms: Transaction exists and is settled

// Step 2: Verify with Token Indexer
const indexerTransfer = await indexer.verifyTransfer(transferTxId);
// Returns:
{
  verified: true,
  transfer: {
    transferId: "abc123...",
    token: {
      name: "MyToken",
      symbol: "MTK"
    },
    from: "tark1qra883...",
    to: "tark1qxyz789...",
    amount: "10000",
    timestamp: "2025-11-25T16:45:00.000Z",
    vtxoId: "75dceb53...",
    proof: {
      verified: true,
      senderSignature: "...",
      blockHeight: 12346
    }
  }
}
```

---

## Public Indexer API

The indexer can expose public endpoints:

### 1. Verify Token Creation

```bash
GET /api/verify/token/:vtxoId

# Returns:
{
  "verified": true,
  "token": {
    "tokenId": "...",
    "name": "MyToken",
    "symbol": "MTK",
    "creator": "tark1q...",
    "createdAt": "2025-11-25T15:33:00.000Z",
    "totalSupply": "1000000",
    "vtxoId": "030b67bd..."
  },
  "aspVerification": {
    "exists": true,
    "settled": true,
    "blockHeight": 12345
  }
}
```

### 2. Verify Token Transfer

```bash
GET /api/verify/transfer/:vtxoId

# Returns:
{
  "verified": true,
  "transfer": {
    "transferId": "...",
    "tokenId": "...",
    "tokenName": "MyToken",
    "from": "tark1q...",
    "to": "tark1q...",
    "amount": "10000",
    "timestamp": "2025-11-25T16:45:00.000Z",
    "vtxoId": "75dceb53..."
  },
  "aspVerification": {
    "exists": true,
    "settled": true,
    "blockHeight": 12346
  }
}
```

### 3. Query by Public Address

```bash
GET /api/tokens/by-address/:arkadeAddress

# Returns:
{
  "address": "tark1q...",
  "tokensCreated": [
    {
      "tokenId": "...",
      "name": "MyToken",
      "vtxoId": "030b67bd...",
      "createdAt": "2025-11-25T15:33:00.000Z"
    }
  ],
  "tokensReceived": [...],
  "tokensSent": [...]
}
```

---

## Security Benefits

### 1. **Dual Verification**
- ASP confirms the blockchain transaction exists
- Indexer confirms the token metadata is legitimate
- No single point of failure

### 2. **Creator Authentication**
- Only the creator's Arkade address can sign the initial token creation
- Indexer stores immutable proof linking txId → creator → metadata
- No one can claim someone else's token

### 3. **Transfer Validation**
- Every transfer creates a cryptographic proof
- Sender, receiver, amount, and timestamp are all verified
- Prevents token duplication or unauthorized transfers

### 4. **Public Auditability**
- Anyone can query the indexer to verify token legitimacy
- Transparent history of all token operations
- Builds trust in the token ecosystem

### 5. **Replay Attack Prevention**
- Nonce ensures each transfer proof is unique
- Can't reuse old transfer signatures
- Timestamp validation ensures recency

---

## Implementation Algorithm

### Hash Generation Function

```typescript
import { createHash } from 'crypto';

function generateTokenId(
  vtxoId: string,
  creator: string,
  timestamp: number,
  metadata: TokenMetadata
): string {
  const data = [
    vtxoId,
    creator,
    timestamp.toString(),
    metadata.name,
    metadata.symbol,
    metadata.totalSupply,
    metadata.decimals.toString()
  ].join('|');
  
  return createHash('sha256')
    .update(data)
    .digest('hex');
}

function generateTransferId(
  vtxoId: string,
  tokenId: string,
  sender: string,
  receiver: string,
  amount: string,
  timestamp: number,
  nonce: string
): string {
  const data = [
    vtxoId,
    tokenId,
    sender,
    receiver,
    amount,
    timestamp.toString(),
    nonce
  ].join('|');
  
  return createHash('sha256')
    .update(data)
    .digest('hex');
}
```

### Database Schema Extensions

```prisma
model Token {
  id                String   @id @default(cuid())
  tokenId           String   @unique  // SHA256 hash (verification ID)
  vtxoId            String   @unique  // ASP transaction ID
  name              String
  symbol            String
  totalSupply       String
  decimals          Int
  creator           String   // Arkade address
  createdAt         DateTime @default(now())
  
  // Verification data
  creationTimestamp BigInt   // Unix timestamp (ms)
  verificationHash  String   // For quick lookups
  creatorSignature  String?  // Optional: Creator's signature
  
  transfers         Transfer[]
  balances          TokenBalance[]
}

model Transfer {
  id                String   @id @default(cuid())
  transferId        String   @unique  // SHA256 hash (verification ID)
  vtxoId            String   @unique  // ASP transfer transaction ID
  tokenId           String
  token             Token    @relation(fields: [tokenId], references: [id])
  
  fromAddress       String
  toAddress         String
  amount            String
  timestamp         DateTime @default(now())
  
  // Verification data
  transferTimestamp BigInt   // Unix timestamp (ms)
  nonce             String   // Replay attack prevention
  verificationHash  String   // For quick lookups
  senderSignature   String?  // Optional: Sender's signature
  
  @@index([tokenId])
  @@index([fromAddress])
  @@index([toAddress])
  @@index([vtxoId])
}

// Track ASP verification results (cache)
model AspVerification {
  id           String   @id @default(cuid())
  vtxoId       String   @unique
  exists       Boolean
  settled      Boolean
  blockHeight  Int?
  lastChecked  DateTime @default(now())
  
  @@index([vtxoId])
}
```

---

## User Experience Flow

### Token Creation Verification UI

```typescript
// User creates token
const token = await tokenWallet.createToken({
  name: "MyToken",
  symbol: "MTK",
  totalSupply: "1000000"
});

// Show verification links
console.log(`
✅ Token created successfully!

Verify on Arkade ASP:
https://mutinynet.arkade.sh/v1/vtxos/${token.vtxoId}

Verify on Token Indexer:
https://token-indexer.arkade.io/verify/token/${token.vtxoId}

Share this link to prove token authenticity!
`);
```

### Transfer Verification UI

```typescript
// User transfers tokens
const transfer = await tokenWallet.transfer({
  tokenId: "cc31bba8...",
  to: "tark1q...",
  amount: "10000"
});

// Show verification links
console.log(`
✅ Transfer completed!

Verify on Arkade ASP:
https://mutinynet.arkade.sh/v1/transactions/${transfer.vtxoId}

Verify on Token Indexer:
https://token-indexer.arkade.io/verify/transfer/${transfer.vtxoId}

Sender: ${transfer.from}
Receiver: ${transfer.to}
Amount: ${transfer.amount} ${transfer.tokenSymbol}
`);
```

---

## Advantages of This Architecture

### 1. **Trustless Verification**
Users don't need to trust the indexer - they can verify against ASP directly.

### 2. **Transparency**
Every operation has a public, verifiable proof.

### 3. **Decentralization**
Multiple indexers can exist, all verifying against the same ASP.

### 4. **Auditability**
Complete history of token creation and transfers.

### 5. **Integration Friendly**
Other platforms can integrate verification into their systems.

---

## Future Enhancements

### 1. **Multi-Indexer Network**
- Multiple independent indexers verify tokens
- Consensus mechanism for disputed tokens
- Distributed trust

### 2. **Token Explorer**
- Public website to browse all tokens
- Search by creator, name, symbol, vtxoId
- Transaction history viewer

### 3. **API Rate Limiting & Authentication**
- Free tier for basic verification
- Paid tier for high-volume queries
- API keys for developers

### 4. **Mobile Verification App**
- Scan QR code with vtxoId
- Instantly verify token authenticity
- Push notifications for transfers

### 5. **Smart Contract Integration**
- Bridge to other blockchains
- Automated verification in smart contracts
- Cross-chain token verification

---

## Implementation Timeline (Suggested)

### Phase 1: Core Verification (MVP)
- [ ] Implement hash generation functions
- [ ] Add verification endpoints to indexer
- [ ] Create public verification UI
- [ ] Documentation and examples

### Phase 2: Enhanced Security
- [ ] Add signature verification
- [ ] Implement nonce system for transfers
- [ ] Add replay attack prevention
- [ ] Rate limiting and abuse prevention

### Phase 3: Public Launch
- [ ] Deploy public indexer API
- [ ] Create token explorer website
- [ ] Marketing and documentation
- [ ] Community feedback and iteration

### Phase 4: Ecosystem Growth
- [ ] Multi-indexer network
- [ ] Mobile verification app
- [ ] Developer API with rate limits
- [ ] Integration partnerships

---

## Conclusion

This architecture creates a **trustless token verification system** where:

1. **ASP** verifies the blockchain transaction exists ✅
2. **Indexer** verifies the token metadata and operations ✅
3. **Users** can independently verify everything ✅

The result is a **transparent, auditable, and secure token ecosystem** built on top of Arkade's VTXO technology.

---

**Status:** 💡 Conceptual - Ready for implementation when needed

**Next Steps:** Review this document, gather feedback, prioritize features, and begin Phase 1 when ready.
