# Arkade Token Contracts

Fungible token implementation using Arkade Script smart contracts.

## Contracts

### 1. `FungibleToken.ark`
Main token contract implementing transfer, merge, and burn operations.
- **State**: tokenId, amount, owner, decimals
- **Functions**: transfer(), merge(), burn()
- **Type**: Recursive covenant (self-replicating)

### 2. `TokenMetadata.ark`
Token creation and initial minting contract.
- **State**: name, symbol, decimals, totalSupply, creator
- **Functions**: mint()
- **Type**: One-time use

## Quick Start

### Prerequisites
```bash
# Install Arkade compiler (when available)
npm install -g @arkade-os/compiler
```

### Compile Contracts
```bash
# Compile FungibleToken
arkadec FungibleToken.ark -o ../token-sdk/contracts/FungibleToken.json

# Compile TokenMetadata
arkadec TokenMetadata.ark -o ../token-sdk/contracts/TokenMetadata.json
```

### Usage Example
```typescript
import { FungibleTokenContract } from '@/contracts/FungibleToken';

// Create new token
const txid = await wallet.createToken({
  name: 'My Token',
  symbol: 'MTK',
  decimals: 8,
  totalSupply: 1000000n
});

// Transfer tokens
const tokenVtxo = await wallet.getTokenVtxo(tokenId);
await tokenVtxo.transfer(
  recipientPubkey,
  100n,    // transfer amount
  900n     // change amount
);
```

## Architecture

### Token as VTXO State
Each token VTXO contains its state in the script:
```
VTXO = {
  scriptPubKey: P2TR(tweakedKey),
  tweakedKey: ownerKey ⊕ hash(tokenId, amount, owner, decimals)
}
```

### Covenant Continuation
Token transfers create new VTXOs with updated state:
```
Input:  Token VTXO (1000 MTK, Alice)
Output: Token VTXO (100 MTK, Bob)    ← Recipient
        Token VTXO (900 MTK, Alice)  ← Change
```

### Self-Enforcement
Script validates state transitions:
- ✅ Amounts must sum correctly
- ✅ Token ID must be preserved
- ✅ Owner must sign
- ✅ Output scripts must be valid token contracts

## Benefits

1. **No OP_RETURN needed** - State lives in script
2. **Self-enforcing** - Bitcoin script validates transfers
3. **Composable** - Can interact with other contracts
4. **Private** - Amounts hidden in Taproot
5. **Scalable** - Benefits from VTXO instant settlement

## Files

```
arkade-contracts/
├── FungibleToken.ark       # Main token contract
├── TokenMetadata.ark       # Token creation contract
├── IMPLEMENTATION.md       # Detailed implementation guide
└── README.md              # This file
```

## Status

⚠️ **Experimental** - Arkade contracts are in early development

- ✅ Contracts written
- ⏳ Compiler installation pending
- ⏳ Integration with SDK pending
- ⏳ Testing on testnet pending

## Next Steps

1. Install Arkade compiler (once available)
2. Compile contracts to JSON artifacts
3. Implement TypeScript wrapper classes
4. Integrate with wallet and indexer
5. Test on Mutinynet
6. Deploy to production

## Resources

- [Arkade Contracts Documentation](https://docs.arkadeos.com/contracts/overview)
- [Arkade Script Language](https://docs.arkadeos.com/contracts/arkade-script)
- [Implementation Guide](./IMPLEMENTATION.md)

---

**Ready to compile and deploy!** 🚀
