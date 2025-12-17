# Token Protocol Implementation Plan
## Architecture: Standard Arkade ASP + External Token Indexer

---

## 📦 **Required GitHub Repositories**

### **1. Clone Existing Arkade Repositories (NO modifications needed)**

```bash
# Create workspace
mkdir -p ~/arkade-token-platform
cd ~/arkade-token-platform

# Clone Arkade SDK (will use as-is with minor extensions)
git clone https://github.com/arkade-os/ts-sdk.git
cd ts-sdk
npm install
npm run build

# Clone Arkade indexer (for reference, won't modify)
cd ..
git clone https://github.com/arkade-os/arkd.git
# We'll use the standard ASP, not modify it
```

**What we USE from these repos:**
- ✅ `ts-sdk`: Standard Arkade wallet functionality
- ✅ `ts-sdk`: VTXO management
- ✅ `ts-sdk`: Settlement transactions
- ✅ `arkd`: Reference for data structures
- ❌ We do NOT fork or modify arkd server

---

## 🏗️ **Build From Scratch: 3 New Services**

### **Service 1: Token Indexer (Backend)**
**Location:** `~/arkade-token-platform/token-indexer/`

```
token-indexer/
├── package.json
├── tsconfig.json
├── .env
├── prisma/
│   └── schema.prisma          # Database schema
├── src/
│   ├── index.ts               # Main entry point
│   ├── indexer.ts             # Core indexer logic
│   ├── blockchain/
│   │   ├── arkade-client.ts   # Connect to Arkade indexer
│   │   └── bitcoin-client.ts  # Connect to Bitcoin node
│   ├── token/
│   │   ├── parser.ts          # Parse OP_RETURN data
│   │   ├── validator.ts       # Validate token transfers
│   │   └── processor.ts       # Process token operations
│   ├── database/
│   │   ├── tokens.ts          # Token CRUD operations
│   │   ├── balances.ts        # Balance tracking
│   │   └── transfers.ts       # Transfer history
│   ├── api/
│   │   ├── server.ts          # Express API server
│   │   └── routes/
│   │       ├── tokens.ts      # GET /api/tokens
│   │       ├── balances.ts    # GET /api/balances/:address
│   │       └── transfers.ts   # GET /api/transfers
│   └── utils/
│       ├── encoding.ts        # Encode/decode OP_RETURN
│       └── logger.ts          # Logging utilities
└── docker-compose.yml         # PostgreSQL + Redis
```

**Technologies:**
- **Language**: TypeScript/Node.js
- **Database**: PostgreSQL
- **Cache**: Redis (optional)
- **Web Framework**: Express.js
- **ORM**: Prisma
- **Bitcoin RPC**: bitcoinjs-lib or btc-rpc-client

---

### **Service 2: Token SDK (Client Library)**
**Location:** `~/arkade-token-platform/token-sdk/`

```
token-sdk/
├── package.json
├── tsconfig.json
├── src/
│   ├── index.ts               # Main exports
│   ├── token-wallet.ts        # Token wallet class (extends Arkade Wallet)
│   ├── token-provider.ts      # Connect to token indexer
│   ├── operations/
│   │   ├── create-token.ts    # Create new token
│   │   ├── transfer-token.ts  # Transfer tokens
│   │   └── burn-token.ts      # Burn tokens (optional)
│   ├── encoding/
│   │   ├── op-return.ts       # Encode token data in OP_RETURN
│   │   └── decoder.ts         # Decode OP_RETURN data
│   └── types.ts               # TypeScript interfaces
├── examples/
│   ├── create-token.ts
│   └── transfer-token.ts
└── test/
    └── token-wallet.test.ts
```

**Key Features:**
- Extends `@arkade-os/sdk` Wallet class
- Adds token-specific methods
- Handles OP_RETURN encoding
- Queries token indexer for balances

---

### **Service 3: Frontend Wallet UI**
**Location:** `~/arkade-token-platform/wallet-ui/`

```
wallet-ui/
├── package.json
├── next.config.js             # Next.js config
├── tailwind.config.js         # Tailwind CSS
├── public/
│   └── favicon.ico
├── src/
│   ├── app/
│   │   ├── layout.tsx         # Root layout
│   │   ├── page.tsx           # Dashboard
│   │   ├── tokens/
│   │   │   ├── page.tsx       # Token list
│   │   │   └── create/
│   │   │       └── page.tsx   # Create token form
│   │   ├── transfer/
│   │   │   └── page.tsx       # Transfer form
│   │   └── history/
│   │       └── page.tsx       # Transaction history
│   ├── components/
│   │   ├── wallet/
│   │   │   ├── Balance.tsx
│   │   │   ├── TokenList.tsx
│   │   │   └── TransferForm.tsx
│   │   ├── ui/
│   │   │   ├── Button.tsx
│   │   │   ├── Input.tsx
│   │   │   └── Card.tsx
│   │   └── providers/
│   │       └── WalletProvider.tsx
│   ├── hooks/
│   │   ├── useWallet.ts
│   │   ├── useTokens.ts
│   │   └── useBalances.ts
│   ├── lib/
│   │   ├── wallet.ts          # Initialize token wallet
│   │   └── api.ts             # API client
│   └── types/
│       └── tokens.ts
└── .env.local
```

**Technologies:**
- **Framework**: Next.js 14 (App Router)
- **UI Library**: React + Tailwind CSS
- **State Management**: React Context + Hooks
- **Wallet**: Token SDK (built above)

---

## 📋 **Complete Project Structure**

```
~/arkade-token-platform/
│
├── ts-sdk/                    # ✅ CLONED (Arkade official SDK)
│   └── (use as dependency)
│
├── arkd/                      # ✅ CLONED (for reference only)
│   └── (don't modify, just reference)
│
├── token-indexer/             # 🔨 BUILD FROM SCRATCH
│   ├── src/
│   ├── prisma/
│   ├── package.json
│   └── docker-compose.yml
│
├── token-sdk/                 # 🔨 BUILD FROM SCRATCH
│   ├── src/
│   ├── examples/
│   └── package.json
│
└── wallet-ui/                 # 🔨 BUILD FROM SCRATCH
    ├── src/
    ├── public/
    └── package.json
```

---

## 🔧 **Dependencies Overview**

### **Token Indexer Dependencies**
```json
{
  "name": "arkade-token-indexer",
  "dependencies": {
    "@arkade-os/sdk": "^0.1.0",        // Connect to Arkade
    "@prisma/client": "^5.0.0",         // Database ORM
    "express": "^4.18.0",               // API server
    "bitcoinjs-lib": "^6.1.0",          // Bitcoin utilities
    "dotenv": "^16.0.0",                // Environment config
    "pino": "^8.0.0",                   // Logging
    "zod": "^3.22.0"                    // Schema validation
  },
  "devDependencies": {
    "@types/node": "^20.0.0",
    "@types/express": "^4.17.0",
    "typescript": "^5.0.0",
    "prisma": "^5.0.0"
  }
}
```

### **Token SDK Dependencies**
```json
{
  "name": "@your-org/token-sdk",
  "dependencies": {
    "@arkade-os/sdk": "^0.1.0",        // Base Arkade SDK
    "@scure/base": "^1.1.0",           // Encoding utilities
    "bitcoinjs-lib": "^6.1.0"          // Bitcoin script
  },
  "devDependencies": {
    "@types/node": "^20.0.0",
    "typescript": "^5.0.0",
    "vitest": "^1.0.0"
  }
}
```

### **Wallet UI Dependencies**
```json
{
  "name": "arkade-wallet-ui",
  "dependencies": {
    "next": "^14.0.0",
    "react": "^18.0.0",
    "react-dom": "^18.0.0",
    "@your-org/token-sdk": "workspace:*",  // Local token SDK
    "tailwindcss": "^3.4.0",
    "lucide-react": "^0.300.0"          // Icons
  }
}
```

---

## 🚀 **Build Order & Steps**

### **Phase 1: Token Indexer (Week 1-2)**

```bash
# 1. Create project
mkdir token-indexer && cd token-indexer
npm init -y
npm install @arkade-os/sdk @prisma/client express bitcoinjs-lib dotenv pino zod
npm install -D @types/node @types/express typescript prisma

# 2. Setup TypeScript
npx tsc --init

# 3. Setup Prisma
npx prisma init

# 4. Create database schema (prisma/schema.prisma)
# 5. Create indexer logic (src/indexer.ts)
# 6. Create API server (src/api/server.ts)
# 7. Setup Docker for PostgreSQL
# 8. Run migrations
npx prisma migrate dev

# 9. Start indexer
npm run dev
```

**Build from scratch:**
- ✅ Database schema
- ✅ OP_RETURN parser
- ✅ Token validator
- ✅ Balance tracker
- ✅ REST API
- ✅ WebSocket events (optional)

---

### **Phase 2: Token SDK (Week 2-3)**

```bash
# 1. Create SDK project
mkdir token-sdk && cd token-sdk
npm init -y
npm install @arkade-os/sdk @scure/base bitcoinjs-lib
npm install -D @types/node typescript vitest

# 2. Setup TypeScript
npx tsc --init

# 3. Create TokenWallet class (extends Wallet)
# 4. Create OP_RETURN encoding logic
# 5. Create TokenProvider class
# 6. Add examples
# 7. Write tests
npm test

# 8. Build library
npm run build
```

**Build from scratch:**
- ✅ TokenWallet class
- ✅ OP_RETURN encoding/decoding
- ✅ Token operations (create, transfer, burn)
- ✅ TypeScript types
- ✅ Tests

---

### **Phase 3: Wallet UI (Week 3-4)**

```bash
# 1. Create Next.js app
npx create-next-app@latest wallet-ui
cd wallet-ui

# 2. Install dependencies
npm install @your-org/token-sdk tailwindcss lucide-react

# 3. Setup Tailwind CSS
npx tailwindcss init

# 4. Create wallet provider
# 5. Build UI components
# 6. Add token operations
# 7. Connect to indexer API

# 8. Run development server
npm run dev
```

**Build from scratch:**
- ✅ Wallet connection UI
- ✅ Token list display
- ✅ Token creation form
- ✅ Token transfer form
- ✅ Transaction history
- ✅ Balance display

---

## 🔗 **Integration Points**

### **1. Token SDK ↔ Arkade SDK**
```typescript
// token-sdk/src/token-wallet.ts
import { Wallet } from '@arkade-os/sdk';

export class TokenWallet extends Wallet {
  constructor(options, private tokenIndexer: TokenProvider) {
    super(options);
  }

  // Add token-specific methods
  async createToken(params: CreateTokenParams) {
    // Use base wallet's settle() + add OP_RETURN
    const opReturn = encodeTokenCreation(params);
    return this.settle({
      outputs: [{ opReturn }]
    });
  }

  async transferToken(params: TransferTokenParams) {
    // Query indexer for balance
    const balance = await this.tokenIndexer.getBalance(
      await this.getAddress(),
      params.tokenId
    );

    if (balance < params.amount) {
      throw new Error('Insufficient token balance');
    }

    // Create settlement with OP_RETURN
    const opReturn = encodeTokenTransfer(params);
    return this.settle({
      outputs: [
        { address: params.to, amount: this.dustAmount },
        { opReturn }
      ]
    });
  }

  async getTokenBalance(tokenId: string): Promise<bigint> {
    return this.tokenIndexer.getBalance(
      await this.getAddress(),
      tokenId
    );
  }
}
```

### **2. Token Indexer ↔ Arkade Indexer**
```typescript
// token-indexer/src/blockchain/arkade-client.ts
import { RestIndexerProvider } from '@arkade-os/sdk';

export class ArkadeClient {
  private arkadeIndexer: RestIndexerProvider;

  constructor(arkadeUrl: string) {
    this.arkadeIndexer = new RestIndexerProvider(arkadeUrl);
  }

  async subscribeToCommitments() {
    // Subscribe to new commitment transactions
    this.arkadeIndexer.subscribeTransactions((tx) => {
      this.processTransaction(tx);
    });
  }

  async getVtxoOwner(outpoint: string): Promise<string> {
    const vtxo = await this.arkadeIndexer.getVtxo(outpoint);
    return vtxo.script; // Script contains owner info
  }
}
```

### **3. Wallet UI ↔ Token SDK**
```typescript
// wallet-ui/src/hooks/useWallet.ts
import { TokenWallet } from '@your-org/token-sdk';

export function useWallet() {
  const [wallet, setWallet] = useState<TokenWallet | null>(null);

  useEffect(() => {
    const initWallet = async () => {
      const w = new TokenWallet({
        arkProvider: new RestArkProvider(ARKADE_ASP_URL),
        indexerProvider: new RestIndexerProvider(ARKADE_INDEXER_URL),
        network: networks.bitcoin
      }, new TokenProvider(TOKEN_INDEXER_URL));

      await w.unlock(mnemonic);
      setWallet(w);
    };

    initWallet();
  }, []);

  return wallet;
}
```

---

## 🎯 **Summary**

### **What to Clone (Arkade Official)**
1. ✅ `arkade-os/ts-sdk` - Use as dependency
2. ✅ `arkade-os/arkd` - Reference only (don't modify)

### **What to Build from Scratch**
1. 🔨 **Token Indexer** (Backend service)
   - Database schema
   - OP_RETURN parser
   - Token validator
   - REST API

2. 🔨 **Token SDK** (Client library)
   - TokenWallet class
   - OP_RETURN encoding
   - Token operations

3. 🔨 **Wallet UI** (Frontend)
   - Next.js app
   - Token management UI
   - Transfer forms

### **External Services Needed**
- ✅ Standard Arkade ASP (public or self-hosted)
- ✅ Bitcoin node (for OP_RETURN reading)
- ✅ PostgreSQL (for token indexer)
- ✅ Redis (optional, for caching)

---

## 📊 **Effort Estimate**

| Component | Lines of Code | Time |
|-----------|---------------|------|
| Token Indexer | ~2,000 LOC | 2 weeks |
| Token SDK | ~1,000 LOC | 1 week |
| Wallet UI | ~1,500 LOC | 2 weeks |
| Testing & Integration | - | 1 week |
| **Total** | **~4,500 LOC** | **6 weeks** |

---

## 🚦 **Next Steps**

1. **Review this architecture** - Confirm approach
2. **Setup development environment** - Clone repos
3. **Start with Token Indexer** - Core backend
4. **Build Token SDK** - Client library
5. **Create Wallet UI** - User interface
6. **Test on testnet** - Mutinynet/Signet
7. **Deploy to mainnet** - Production launch

Ready to start? I can generate the complete code for any component!
