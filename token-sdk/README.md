# Token SDK

Token protocol SDK for Arkade - extends Arkade SDK with token support via OP_RETURN.

## Features

- ✅ Create tokens with metadata (name, symbol, supply)
- ✅ Transfer tokens between addresses
- ✅ Burn tokens
- ✅ Query token balances
- ✅ Get transfer history
- ✅ OP_RETURN encoding/decoding
- ✅ Works with standard Arkade ASP (no modifications needed)

## Installation

```bash
npm install @arkade-token/sdk @arkade-os/sdk
```

## Usage

### Initialize Token Wallet

```typescript
import { Wallet } from '@arkade-os/sdk';
import { TokenWallet, TokenProvider } from '@arkade-token/sdk';

// Initialize Arkade wallet
const arkadeWallet = new Wallet({
  arkProvider: new RestArkProvider('https://your-asp.com'),
  indexerProvider: new RestIndexerProvider('https://arkade-indexer.com'),
  network: networks.bitcoin,
});

await arkadeWallet.unlock(mnemonic);

// Initialize token provider (connects to your token indexer)
const tokenProvider = new TokenProvider('https://your-token-indexer.com');

// Create token wallet
const tokenWallet = new TokenWallet(arkadeWallet, tokenProvider);
```

### Create a Token

```typescript
const txid = await tokenWallet.createToken({
  name: 'My Token',
  symbol: 'MTK',
  totalSupply: 1000000n,
  decimals: 8,
});

console.log('Token created in transaction:', txid);
```

### Transfer Tokens

```typescript
const txid = await tokenWallet.transferToken({
  tokenId: '0x123abc...',
  to: 'arkade1recipient...',
  amount: 100n,
});

console.log('Tokens transferred in transaction:', txid);
```

### Query Balance

```typescript
const balance = await tokenWallet.getTokenBalance('0x123abc...');
console.log('Balance:', balance);

// Get all token balances
const allBalances = await tokenWallet.getTokenBalances();
console.log('All balances:', allBalances);
```

### Get Transfer History

```typescript
const transfers = await tokenWallet.getTokenTransfers('0x123abc...');
transfers.forEach(tx => {
  console.log(`${tx.from} -> ${tx.to}: ${tx.amount}`);
});
```

## Architecture

This SDK uses **OP_RETURN outputs** to encode token operations:

1. User creates/transfers tokens using TokenWallet
2. SDK encodes token data in OP_RETURN (< 80 bytes)
3. Standard Arkade ASP confirms Bitcoin transaction
4. Token Indexer reads OP_RETURN and validates tokens
5. Token balances queryable via Token Provider

```
TokenWallet -> Arkade ASP -> Bitcoin Blockchain
                                    ↓
                             Token Indexer
                                    ↓
                             TokenProvider -> Query balances
```

## OP_RETURN Format

**CREATE Token:**
```
TKN | 0x01 | 0x01 | TOKEN_ID(32) | SUPPLY(varint) | DECIMALS(1) | NAME_LEN | NAME | SYMBOL_LEN | SYMBOL
```

**TRANSFER Token:**
```
TKN | 0x01 | 0x02 | TOKEN_ID(32) | AMOUNT(varint) | FROM_HASH(20) | TO_HASH(20)
```

**BURN Token:**
```
TKN | 0x01 | 0x03 | TOKEN_ID(32) | AMOUNT(varint) | BURNER_HASH(20)
```

Total size: ~40-80 bytes (fits in Bitcoin's 80-byte OP_RETURN limit)

## API Reference

See TypeScript types in `src/types.ts` for full API documentation.

## License

MIT
