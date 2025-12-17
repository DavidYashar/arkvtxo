# 🚀 Arkade Platform - Simplified Architecture

## Overview

The Arkade platform now runs on **2 services only**:

1. **Token Indexer** (Port 3002) - Token operations + ASP VTXO queries
2. **Wallet UI** (Port 3000) - User interface

The previous **verification-indexer** functionality has been merged into the token-indexer!

---

## 📦 Services

### 1. Token Indexer (Port 3002)

**Location:** `/token-indexer`

**Features:**
- ✅ Token creation and transfer indexing
- ✅ Token balance tracking
- ✅ ASP VTXO transaction history
- ✅ Wallet balance queries via SDK
- ✅ VTXO verification and lookup

**Endpoints:**

**Token Operations:**
- `GET /api/tokens` - List all tokens
- `GET /api/tokens/:tokenId` - Get token details
- `GET /api/balances/:address` - Get token balances
- `POST /api/transfers` - Record token transfer

**ASP VTXO (Public):**
- `GET /api/asp/history/:address` - Transaction history
- `GET /api/asp/vtxos/:address` - VTXOs for address
- `GET /api/asp/vtxo-chain/:txid/:vout` - VTXO chain info

**ASP SDK (Private Key Required):**
- `POST /api/asp/sdk/vtxos` - Get wallet VTXOs
- `POST /api/asp/sdk/balance` - Get wallet balance
- `POST /api/asp/sdk/history` - Get wallet history
- `POST /api/asp/sdk/address` - Derive Arkade address
- `POST /api/asp/sdk/verify-vtxo` - Verify VTXO in wallet

### 2. Wallet UI (Port 3000)

**Location:** `/wallet-ui`

**Features:**
- ✅ Wallet connection (private key / seed phrase)
- ✅ Token creation interface
- ✅ Token transfer interface
- ✅ Transaction history explorer
- ✅ VTXO lookup tool
- ✅ Balance display

**Components:**
- `TransactionExplorer` - View full transaction history
- `VtxoLookup` - Search and verify VTXOs
- `CreateToken` - Create new tokens
- `TransferToken` - Transfer tokens to other addresses

---

## 🚀 Quick Start

### Start Token Indexer

```bash
cd token-indexer
./start.sh
```

Or manually:
```bash
cd token-indexer
npm run dev
```

### Start Wallet UI

```bash
cd wallet-ui
npm run dev
```

---

## 🔧 Configuration

### Token Indexer (.env)

```env
PORT=3002
ARKADE_ASP_URL=https://mutinynet.arkade.sh
DATABASE_URL=postgresql://user:password@localhost:5432/token_indexer
```

### Wallet UI (.env.local)

```env
NEXT_PUBLIC_INDEXER_URL=http://localhost:3002
```

---

## 📊 Architecture Diagram

```
┌─────────────────────────────────────────────────────────┐
│                  Wallet UI (Port 3000)                  │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐ │
│  │ Transaction  │  │ VTXO Lookup  │  │ Token Create │ │
│  │  Explorer    │  │    Tool      │  │  & Transfer  │ │
│  └──────────────┘  └──────────────┘  └──────────────┘ │
└────────────────────────┬────────────────────────────────┘
                         │ HTTP API
                         ▼
┌─────────────────────────────────────────────────────────┐
│          Token Indexer + ASP VTXO (Port 3002)          │
├─────────────────────────────────────────────────────────┤
│  ┌──────────────────┐         ┌──────────────────────┐ │
│  │ Token Operations │         │  ASP VTXO Queries    │ │
│  │  - Create        │         │  - History           │ │
│  │  - Transfer      │         │  - Balance           │ │
│  │  - Balance       │         │  - VTXO Verify       │ │
│  └──────────────────┘         └──────────────────────┘ │
│           │                              │              │
│           ▼                              ▼              │
│  ┌──────────────────┐         ┌──────────────────────┐ │
│  │   PostgreSQL     │         │   Arkade SDK         │ │
│  │   (Token DB)     │         │   (@arkade-os/sdk)   │ │
│  └──────────────────┘         └──────────────────────┘ │
│                                          │              │
│                                          ▼              │
│                               ┌──────────────────────┐ │
│                               │   Arkade ASP         │ │
│                               │   (mutinynet)        │ │
│                               └──────────────────────┘ │
└─────────────────────────────────────────────────────────┘
```

---

## 🧪 Testing

### Test Token Indexer Health

```bash
curl http://localhost:3002/health
```

### Test Token List

```bash
curl http://localhost:3002/api/tokens
```

### Test ASP History (SDK)

```bash
curl -X POST http://localhost:3002/api/asp/sdk/history \
  -H "Content-Type: application/json" \
  -d '{"privateKey":"YOUR_PRIVATE_KEY"}'
```

### Test VTXO Verification

```bash
curl -X POST http://localhost:3002/api/asp/sdk/verify-vtxo \
  -H "Content-Type: application/json" \
  -d '{
    "privateKey":"YOUR_PRIVATE_KEY",
    "vtxoId":"TXID_TO_CHECK"
  }'
```

---

## 📝 Usage Example

### 1. Start Services

```bash
# Terminal 1 - Token Indexer
cd token-indexer
./start.sh

# Terminal 2 - Wallet UI
cd wallet-ui
npm run dev
```

### 2. Access Wallet

Open browser: **http://localhost:3000**

### 3. Login

Enter your:
- Private key, OR
- Seed phrase (12/24 words)

### 4. View Transaction History

- Automatically loads on login
- Shows SENT vs RECEIVED
- Displays amounts, timestamps, TXIDs
- Color-coded: Green (received), Red (sent)

### 5. Lookup VTXO

- Enter any TXID
- Check if it exists in your wallet
- View full VTXO details

### 6. Create Token

- Enter token name, symbol, supply
- Select decimals
- Create on Arkade L2

### 7. Transfer Token

- Enter token ID
- Recipient address
- Amount to send

---

## 🔐 Security Notes

- Private keys only sent to localhost services
- Keys never logged or stored persistently
- SDK endpoints require authentication
- Public endpoints have limited data access

---

## 📂 Project Structure

```
ARKADE/
├── token-indexer/              # Combined token + ASP service
│   ├── src/
│   │   ├── api/
│   │   │   └── server.ts       # API endpoints (tokens + ASP)
│   │   ├── services/
│   │   │   ├── arkSdk.ts       # Arkade SDK integration
│   │   │   └── arkadeClient.ts # ASP client
│   │   ├── token/              # Token processing logic
│   │   ├── index.ts            # Main entry point
│   │   └── indexer.ts          # Token indexing
│   ├── prisma/                 # Database schema
│   ├── .env                    # Configuration
│   ├── start.sh                # Startup script
│   └── package.json
│
├── wallet-ui/                  # Next.js frontend
│   ├── src/
│   │   ├── components/
│   │   │   ├── TransactionExplorer.tsx  # Transaction history
│   │   │   ├── VtxoLookup.tsx          # VTXO search
│   │   │   ├── CreateToken.tsx          # Token creation
│   │   │   ├── TransferToken.tsx        # Token transfer
│   │   │   └── WalletConnect.tsx        # Main wallet UI
│   │   ├── lib/
│   │   │   └── wallet.ts       # Wallet SDK wrapper
│   │   └── app/
│   │       ├── page.tsx        # Main page
│   │       └── layout.tsx      # App layout
│   └── package.json
│
├── verification-indexer/       # [DEPRECATED - merged into token-indexer]
│
└── docs/
    ├── ASP_VTXO_INDEXER.md    # ASP VTXO documentation
    └── SIMPLIFIED_SETUP.md     # This file
```

---

## ✅ Benefits of Simplified Architecture

### Before (3 Services):
- ❌ Token Indexer (Port 3002)
- ❌ Verification Indexer (Port 3003)
- ❌ Wallet UI (Port 3000)

### After (2 Services):
- ✅ Token Indexer + ASP VTXO (Port 3002)
- ✅ Wallet UI (Port 3000)

**Improvements:**
- ✅ One less service to manage
- ✅ Simplified deployment
- ✅ Reduced port management
- ✅ Unified API endpoint
- ✅ Easier maintenance
- ✅ Better resource utilization

---

## 🛠️ Development

### Token Indexer Development

```bash
cd token-indexer

# Install dependencies
npm install

# Run in development mode
npm run dev

# Build for production
npm run build

# Run production build
npm start
```

### Wallet UI Development

```bash
cd wallet-ui

# Install dependencies
npm install

# Run development server
npm run dev

# Build for production
npm run build

# Start production server
npm start
```

---

## 🐛 Troubleshooting

### Port Already in Use

```bash
# Kill process on port 3002
lsof -ti:3002 | xargs kill -9

# Or use the start script which auto-kills
cd token-indexer
./start.sh
```

### Database Connection Issues

```bash
# Check PostgreSQL is running
sudo service postgresql status

# Start if not running
sudo service postgresql start

# Check connection
psql -U your_user -d token_indexer -c "SELECT 1;"
```

### SDK Wallet Initialization Slow

This is normal - first wallet creation takes 5-10 seconds to connect to ASP.

---

## 📚 Additional Resources

- [Arkade Documentation](https://docs.arklabs.xyz)
- [Arkade SDK](https://github.com/arkade-os/arkade-sdk)
- [ASP API Reference](https://docs.arklabs.xyz/integrate/api)

---

## ✅ Status

**Current:** ✅ **Fully Operational**

- Token Indexer: Running on port 3002
- ASP VTXO endpoints: Integrated
- Wallet UI: Ready on port 3000
- Documentation: Complete

**Ready to use!** Just run 2 services instead of 3.
