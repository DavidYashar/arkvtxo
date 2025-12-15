# 🚀 ARKADE Production Deployment Report
**Date**: December 8, 2025  
**Status**: Ready for Production Deployment

---

## 📦 REQUIRED FOLDERS FOR PRODUCTION

### ✅ CORE APPLICATION (MUST DEPLOY)

#### 1. **token-indexer/** (Backend API & Database)
- **Size**: ~536KB (without node_modules)
- **Purpose**: REST API, WebSocket server, database management, token monitoring
- **Essential Files**:
  - `src/` - All source code
  - `prisma/` - Database schema and migrations
  - `package.json` & `package-lock.json`
  - `tsconfig.json`
  - `.env.example` (rename to `.env` on server)
  - `start.sh` (startup script)

#### 2. **wallet-ui/** (Frontend Application)
- **Size**: ~1.1MB (without node_modules/.next)
- **Purpose**: User interface for token creation, presale, transfers
- **Essential Files**:
  - `src/` - All source code
  - `public/` - Static assets
  - `package.json` & `package-lock.json`
  - `tsconfig.json`
  - `next.config.ts`
  - `postcss.config.mjs`
  - `.env.example` (rename to `.env.local` on server)

#### 3. **token-sdk/** (Shared SDK Library)
- **Size**: ~400KB (without node_modules)
- **Purpose**: Wallet operations, Bitcoin transactions, token creation
- **Essential Files**:
  - `src/` - All source code
  - `package.json` & `package-lock.json`
  - `tsconfig.json`
  - `README.md` (documentation)

---

## ❌ FOLDERS TO EXCLUDE (NOT NEEDED)

### 1. **verification-indexer/**
- **Reason**: Old/unused verification system, not part of current implementation
- **Action**: DO NOT DEPLOY

### 2. **arkade-compiler/**
- **Reason**: Rust compiler development files, not needed for runtime
- **Action**: DO NOT DEPLOY

### 3. **arkade-contracts/**
- **Reason**: Contract examples, not needed for production
- **Action**: DO NOT DEPLOY

### 4. **docs/**
- **Reason**: Internal documentation only
- **Action**: Optional - can deploy for reference but not required

---

## 🗑️ FILES TO DELETE BEFORE DEPLOYMENT

### Test & Development Scripts (DELETE THESE)

#### In token-indexer/:
```
analyze-rejected-payments.ts
analyze-round4.ts
check-four-wallets-v2.ts
check-four-wallets.ts
check-purchases.js
check-wallet-payments.ts
clean-presale-data.ts
cleanup-presale-data.ts
clear-token-data.js
find-phantom-tokens.ts
fix-token-decimals.js
investigate-token-mismatch.ts
sweep-pool-wallets.ts
test-round-system.ts
transfer-pool-sats.ts
verify-empty-wallets.ts
verify-purchase-data.js
verify-timeline.ts
token-indexer.log
PHASE1_COMPLETED.md
```

#### In wallet-ui/:
```
check-balances.js
consolidate-utxos.js
```

#### In token-sdk/:
```
complete-wallet-service.ts
create-token-test.js
example-usage.ts
generate-keys.js
get-bitcoin-address.js
monitor-bitcoin.js
show-addresses.js
test-create-token.js
test-keys.json
test-metadata.ts
vtxo-extraction-plan.ts
examples/
tests/
```

### Documentation Files (DELETE THESE - 22 files):
```
BUG-FIX-VERIFICATION.md
COMPLETE_SOLUTION.md
FINAL.md
FRONTEND_INTEGRATION_SUMMARY.md
GAS_FEE_AUDIT_REPORT.md
GAS_FEE_IMPLEMENTATION_COMPLETE.md
IMPLEMENTATION_PLAN.md
INTEGRATION_COMPLETE.md
INTEGRATION_GUIDE.md
MAINNET_DEPLOYMENT_GUIDE.md
MAINNET_MIGRATION_CHECKLIST.md
MAINNET_MIGRATION_COMPLETE.md
NEXT_STEPS.md
QUICKSTART.md
ROUND_BASED_ARCHITECTURE_REPORT.md
ROUND_SYSTEM_TEST_RESULTS.md
SETUP.md
TESTING-GUIDE.md
TESTING_GUIDE.md
TOKEN_STRATEGY_COMPLETE.md
WITHDRAWAL_GUIDE.md
```

**Keep only**: `README.md`

### Other Unnecessary Files:
```
PRESALE_POOL_ADDRESSES_SUMMARY.txt
PRESALE_POOL_WALLETS.txt
start-all.sh (root level)
package.json (root level - not needed)
package-lock.json (root level - not needed)
node_modules/ (root level - not needed)
```

---

## 📝 ESSENTIAL CONFIGURATION FILES

### 1. token-indexer/.env (Production)
```env
NODE_ENV=production
PORT=3001

# Database - PRODUCTION PostgreSQL
DATABASE_URL="postgresql://USER:PASSWORD@HOST:5432/arkade_tokens_mainnet?schema=public"

# Arkade ASP (MAINNET)
ARKADE_ASP_URL=https://arkade.computer
ARKADE_INDEXER_URL=https://arkade.computer

# Frontend URL
WALLET_UI_URL=https://yourdomain.com

# Logging
LOG_LEVEL=info
```

### 2. wallet-ui/.env.local (Production)
```env
PORT=3000

# MAINNET ARK SERVER
NEXT_PUBLIC_ARK_SERVER_URL=https://arkade.computer

# Backend indexer URL
NEXT_PUBLIC_INDEXER_URL=https://api.yourdomain.com

# Network
NEXT_PUBLIC_NETWORK=mainnet

# Whitelisted addresses (production addresses)
NEXT_PUBLIC_WHITELISTED_ADDRESSES=ark1qq...
```

---

## 🏗️ PRODUCTION FOLDER STRUCTURE

```
ARKADE-PRODUCTION/
├── token-indexer/          # Backend API
│   ├── src/
│   ├── prisma/
│   ├── package.json
│   ├── tsconfig.json
│   ├── .env               # DO NOT COMMIT
│   └── start.sh
│
├── wallet-ui/             # Frontend
│   ├── src/
│   ├── public/
│   ├── package.json
│   ├── next.config.ts
│   └── .env.local         # DO NOT COMMIT
│
├── token-sdk/             # Shared SDK
│   ├── src/
│   ├── package.json
│   └── tsconfig.json
│
└── README.md              # Main documentation
```

---

## 📊 SIZE COMPARISON

| Component | With Dev Files | Production Ready |
|-----------|---------------|------------------|
| token-indexer | ~536KB | ~400KB |
| wallet-ui | ~1.1MB | ~800KB |
| token-sdk | ~400KB | ~300KB |
| **Total** | **~2MB** | **~1.5MB** |

*Excluding node_modules, .next, dist (installed on server)*

---

## 🔒 SECURITY CHECKLIST

### Files to NEVER commit to Git:
- ✅ `.env` files (add to .gitignore)
- ✅ `node_modules/`
- ✅ `.next/` build output
- ✅ `dist/` compiled output
- ✅ Database credentials
- ✅ Private keys (test-keys.json)
- ✅ Log files (*.log)

### Files to Git Ignore:
```gitignore
# Environment
.env
.env.local
.env.production

# Dependencies
node_modules/

# Build output
.next/
dist/
build/

# Logs
*.log
npm-debug.log*

# Database
prisma/migrations/*.sql

# Test files
test-*.js
test-*.ts
*test*.json
```

---

## 🚀 DEPLOYMENT STEPS

### 1. Clean Local Project
```bash
cd /home/cryptoaya33/ARKADE

# Remove test files
rm -rf verification-indexer/ arkade-compiler/ arkade-contracts/
rm -f *.md (except README.md)
rm -f token-indexer/*.ts (test files)
rm -f token-indexer/*.js (test files)
rm -f wallet-ui/*.js
rm -f token-sdk/test* token-sdk/example* token-sdk/*.js
```

### 2. Create Production Build
```bash
# Build SDK
cd token-sdk && npm run build

# Build Backend
cd ../token-indexer && npm run build

# Build Frontend
cd ../wallet-ui && npm run build
```

### 3. Package for Server
```bash
cd /home/cryptoaya33
tar -czf arkade-production.tar.gz \
  --exclude='node_modules' \
  --exclude='.next' \
  --exclude='dist' \
  --exclude='.git' \
  ARKADE/token-indexer \
  ARKADE/wallet-ui \
  ARKADE/token-sdk \
  ARKADE/README.md
```

---

## 🗄️ DATABASE REQUIREMENTS

### PostgreSQL Database:
- **Version**: PostgreSQL 14+
- **Database Name**: `arkade_tokens_mainnet`
- **Required**: Run migrations on production
  ```bash
  cd token-indexer
  npx prisma migrate deploy
  ```

---

## 🌐 SERVER REQUIREMENTS

### Node.js Application:
- **Node Version**: 18.x or 20.x
- **Package Manager**: npm or yarn
- **Process Manager**: PM2 (recommended)

### Ports Required:
- **3000** - Frontend (Next.js)
- **3001** - Backend API + WebSocket
- **5432** - PostgreSQL (or your DB port)

### Install Dependencies on Server:
```bash
# In each directory
npm ci --production

# Or with PM2
pm2 start ecosystem.config.js
```

---

## ✅ FINAL CHECKLIST

- [ ] Delete all test files
- [ ] Delete all markdown documentation except README.md
- [ ] Remove verification-indexer, arkade-compiler, arkade-contracts
- [ ] Configure production .env files (DO NOT commit)
- [ ] Build all projects (SDK, backend, frontend)
- [ ] Test locally before deployment
- [ ] Setup PostgreSQL on production server
- [ ] Run database migrations
- [ ] Configure reverse proxy (Nginx)
- [ ] Setup SSL certificates (Let's Encrypt)
- [ ] Configure PM2 for process management
- [ ] Setup monitoring and logging
- [ ] Backup strategy for database

---

## 📦 ESTIMATED PRODUCTION SIZE

- **Source Code**: ~1.5MB
- **node_modules** (production): ~200-300MB (installed on server)
- **Database**: Variable (grows with usage)
- **Total Deployment Package**: <2MB (excluding node_modules)

---

## 🎯 NEXT ACTIONS

1. **Clean the project** - Remove all unnecessary files
2. **Test production build** - Ensure everything builds correctly
3. **Prepare environment files** - Create production configs
4. **Package for deployment** - Create tar.gz
5. **Deploy to server** - Upload and configure
6. **Run migrations** - Setup production database
7. **Go live** - Start services and monitor

---

**This report identifies exactly what's needed for production deployment.**
