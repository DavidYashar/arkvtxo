# Arkade Token Contract Implementation Guide

## Overview

This guide explains how to implement fungible tokens on Arkade using **state-carrying VTXOs** with Arkade Script contracts.

## Architecture

### 1. Token as State-Carrying VTXO

Each token VTXO contains:
- **Token ID**: Unique identifier (bytes32)
- **Amount**: Token balance in this VTXO
- **Owner**: Public key of owner
- **Decimals**: Decimal places

The VTXO itself **IS** the token. Token state lives in the script.

### 2. Two Contract Types

**A. TokenMetadata Contract** (One-time use)
- Deployed when creating a new token
- Mints initial supply
- Generates unique token ID
- Consumed after first use

**B. FungibleToken Contract** (Recursive)
- Each token VTXO uses this contract
- Enforces token transfer rules
- Self-replicating (covenant continuation)
- Enables: transfer, merge, burn

### 3. Covenant Continuation

Token contracts use **Taproot key tweaking** for covenant continuation:

```
tweakedKey = internalKey ⊕ hash(tokenId, amount, owner, decimals)
```

Each output must have the correct tweaked key, ensuring token state transitions are valid.

## Token Operations

### Create Token

```javascript
// 1. Deploy TokenMetadata contract
const metadata = new TokenMetadata(
  "My Token",        // name
  "MTK",            // symbol
  8,                // decimals
  1000000n,         // totalSupply
  creatorPubkey     // creator
);

// 2. Mint initial supply
const txid = await metadata.mint(creatorSig);

// 3. Initial supply appears as FungibleToken VTXO owned by creator
```

### Transfer Tokens

```javascript
// Transfer 100 tokens, keep 900 as change
const tx = await tokenVtxo.transfer(
  recipientPubkey,  // recipient
  100n,             // transferAmount
  900n,             // changeAmount
  ownerSig          // signature
);

// Result:
// - Output 0: 100 tokens to recipient
// - Output 1: 900 tokens back to sender (change)
```

### Merge Token VTXOs

```javascript
// Combine two token VTXOs into one
const tx = await tokenVtxo1.merge(
  tokenVtxo2.amount,  // amount from second VTXO
  ownerSig            // signature
);

// Result:
// - Single VTXO with combined amount
```

### Burn Tokens

```javascript
// Permanently destroy tokens
const tx = await tokenVtxo.burn(
  amount,    // amount to burn
  ownerSig   // signature
);

// Result:
// - Token VTXO consumed without continuation
```

## Implementation Steps

### Phase 1: Compile Contracts

```bash
# Install Arkade compiler
npm install -g @arkade-os/compiler

# Compile contracts
arkadec FungibleToken.ark -o FungibleToken.json
arkadec TokenMetadata.ark -o TokenMetadata.json
```

### Phase 2: TypeScript Integration

Create wrapper classes for contract interaction:

```typescript
// contracts/FungibleToken.ts
import { Wallet } from '@arkade-os/sdk';
import tokenContractArtifact from './FungibleToken.json';

export class FungibleTokenContract {
  constructor(
    private wallet: Wallet,
    private tokenId: string,
    private amount: bigint,
    private owner: string,
    private decimals: number
  ) {}

  async transfer(
    recipient: string,
    transferAmount: bigint,
    changeAmount: bigint
  ): Promise<string> {
    // Build transaction using compiled contract
    const tx = await this.wallet.buildContractTx({
      contract: tokenContractArtifact,
      function: 'transfer',
      params: {
        recipient,
        transferAmount,
        changeAmount,
        ownerSig: await this.wallet.sign(/* ... */)
      }
    });
    
    return await this.wallet.broadcast(tx);
  }

  async merge(otherVtxo: FungibleTokenContract): Promise<string> {
    // Merge two token VTXOs
    // ...
  }

  async burn(): Promise<string> {
    // Burn this token VTXO
    // ...
  }
}
```

### Phase 3: Update Token Indexer

The indexer needs to recognize and track token VTXOs:

```typescript
// token-indexer/src/services/contractIndexer.ts
export class ContractTokenIndexer {
  
  async indexVtxo(vtxo: VTXO) {
    // Check if VTXO is a token contract
    const tokenData = this.parseTokenVtxo(vtxo);
    
    if (tokenData) {
      await this.db.token.upsert({
        where: { id: tokenData.tokenId },
        update: {},
        create: {
          id: tokenData.tokenId,
          name: tokenData.name,
          symbol: tokenData.symbol,
          decimals: tokenData.decimals,
          totalSupply: tokenData.totalSupply,
          creatorAddress: tokenData.creator
        }
      });
      
      await this.db.tokenBalance.upsert({
        where: {
          tokenId_address: {
            tokenId: tokenData.tokenId,
            address: tokenData.owner
          }
        },
        update: {
          balance: { increment: tokenData.amount }
        },
        create: {
          tokenId: tokenData.tokenId,
          address: tokenData.owner,
          balance: tokenData.amount
        }
      });
    }
  }
  
  parseTokenVtxo(vtxo: VTXO): TokenData | null {
    // Extract token state from VTXO script
    // Parse Taproot key tweak to recover token parameters
    // Return null if not a token VTXO
    // ...
  }
}
```

### Phase 4: Update Wallet UI

```typescript
// wallet-ui/src/lib/contractTokenWallet.ts
import { FungibleTokenContract } from '@/contracts/FungibleToken';

export class ContractTokenWallet {
  
  async createToken(params: CreateTokenParams): Promise<string> {
    // Deploy TokenMetadata contract
    const metadata = new TokenMetadataContract(
      this.wallet,
      params.name,
      params.symbol,
      params.decimals,
      params.totalSupply,
      await this.wallet.getAddress()
    );
    
    return await metadata.mint();
  }
  
  async transferToken(params: TransferTokenParams): Promise<string> {
    // Find token VTXO for this tokenId
    const tokenVtxo = await this.findTokenVtxo(params.tokenId);
    
    // Execute transfer
    return await tokenVtxo.transfer(
      params.to,
      params.amount,
      tokenVtxo.amount - params.amount // change
    );
  }
  
  async getTokenBalance(tokenId: string): Promise<bigint> {
    // Query indexer for token balance
    const response = await fetch(
      `${this.indexerUrl}/api/balances/${address}/${tokenId}`
    );
    return response.json().then(r => BigInt(r.balance));
  }
}
```

## Advantages of This Approach

### ✅ Self-Enforcing
- Token rules enforced by Bitcoin script
- Server cannot violate token logic
- No trust in indexer for validation

### ✅ Composable
- Can interact with other Arkade contracts
- Enable DeFi: swaps, lending, AMMs
- Cross-contract state transitions

### ✅ Scalable
- Benefits from VTXO instant settlement
- Low fees (batch settlement)
- No blockchain bloat

### ✅ Private
- Token amounts hidden in Taproot
- Only owner can see balance
- Optional selective disclosure

## Technical Details

### Taproot Key Tweaking

```typescript
function tweakKey(internalKey: Buffer, tweak: Buffer): Buffer {
  // P_output = P_internal + hash(P_internal || tweak) * G
  const tweakHash = sha256(Buffer.concat([internalKey, tweak]));
  return secp256k1.publicKeyTweakAdd(internalKey, tweakHash);
}

function createTokenCommitment(
  tokenId: string,
  amount: bigint,
  owner: string,
  decimals: number
): Buffer {
  return sha256(
    Buffer.concat([
      Buffer.from(tokenId, 'hex'),
      bigIntToBuffer(amount),
      Buffer.from(owner, 'hex'),
      Buffer.from([decimals])
    ])
  );
}
```

### VTXO Structure

```
Token VTXO:
├─ Taproot Output (P2TR)
│  └─ Tweaked Key = P_owner ⊕ hash(tokenId, amount, owner, decimals)
│
├─ Script Tree
│  ├─ Cooperative Path (instant with server)
│  │  └─ transfer() / merge() / burn()
│  │
│  └─ Unilateral Path (144 blocks delay)
│     └─ Exit to Bitcoin L1
│
└─ Witness Data (optional metadata)
   └─ Token name, symbol (for indexing)
```

### Transaction Flow

```
Transfer Transaction:

Inputs:
  [0] Token VTXO (1000 MTK, Alice)

Outputs:
  [0] Token VTXO (100 MTK, Bob)    ← Recipient gets tokens
  [1] Token VTXO (900 MTK, Alice)  ← Change back to sender

Witness:
  - Alice's signature
  - Contract parameters
  - Function: transfer(Bob, 100, 900, sig)
```

## Security Considerations

### ✅ Protected Against
- **Double-spend**: UTXO model prevents
- **Invalid transfers**: Script enforces amounts
- **Unauthorized minting**: Only metadata contract can mint
- **Balance manipulation**: State commitment prevents tampering

### ⚠️ Limitations
- **Metadata trust**: Indexer must correctly parse metadata (can be verified)
- **Server availability**: Need server for instant settlement (unilateral exit available)
- **Script complexity**: More complex than OP_RETURN approach

## Testing Strategy

### Unit Tests
```typescript
describe('FungibleToken Contract', () => {
  it('should transfer tokens correctly', async () => {
    const token = new FungibleTokenContract(wallet, tokenId, 1000n, alice, 8);
    const txid = await token.transfer(bob, 100n, 900n);
    
    // Verify outputs
    const tx = await getTransaction(txid);
    expect(tx.outputs[0].amount).toBe(100n);
    expect(tx.outputs[1].amount).toBe(900n);
  });
  
  it('should reject invalid amount splits', async () => {
    const token = new FungibleTokenContract(wallet, tokenId, 1000n, alice, 8);
    
    await expect(
      token.transfer(bob, 100n, 800n) // Sum != 1000
    ).rejects.toThrow('Amounts must sum to total');
  });
});
```

### Integration Tests
```typescript
describe('Token Creation Flow', () => {
  it('should create token and mint initial supply', async () => {
    const txid = await wallet.createToken({
      name: 'Test Token',
      symbol: 'TST',
      decimals: 8,
      totalSupply: 1000000n
    });
    
    await waitForConfirmation(txid);
    
    const balance = await wallet.getTokenBalance(tokenId);
    expect(balance).toBe(1000000n);
  });
});
```

## Next Steps

1. **Install Arkade Compiler**
   ```bash
   npm install -g @arkade-os/compiler
   ```

2. **Compile Contracts**
   ```bash
   cd arkade-contracts
   arkadec FungibleToken.ark -o ../token-sdk/contracts/FungibleToken.json
   arkadec TokenMetadata.ark -o ../token-sdk/contracts/TokenMetadata.json
   ```

3. **Implement TypeScript Wrappers**
   - Create contract wrapper classes
   - Integrate with Arkade SDK
   - Add to TokenWallet

4. **Update Indexer**
   - Add contract VTXO parsing
   - Track token state transitions
   - Maintain balance database

5. **Test on Mutinynet**
   - Deploy test tokens
   - Execute transfers
   - Verify state transitions

6. **Deploy to Production**
   - Audit contracts
   - Deploy to mainnet
   - Monitor operations

## Resources

- **Arkade Contracts Docs**: https://docs.arkadeos.com/contracts/overview
- **Arkade Script Reference**: https://docs.arkadeos.com/contracts/arkade-script
- **Example Contracts**: https://github.com/arkade-os/contracts/tree/main/examples
- **Compiler Repo**: https://github.com/arkade-os/compiler

---

**Status**: ✅ Contracts written and ready for compilation!

**Next Action**: Install Arkade compiler and test contract compilation.
