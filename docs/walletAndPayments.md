# Arkade Wallet & Payments Learning Notes - Batch 2

## Studied Documents:
- https://docs.arkadeos.com/wallets/v0.3/introduction
- https://docs.arkadeos.com/wallets/v0.3/setup
- https://docs.arkadeos.com/wallets/v0.3/ark-addresses
- https://docs.arkadeos.com/wallets/v0.3/receiving-payments
- https://docs.arkadeos.com/wallets/v0.3/balances
- https://docs.arkadeos.com/wallets/v0.3/sending-payments
- https://docs.arkadeos.com/wallets/v0.3/payment-history
- https://docs.arkadeos.com/wallets/v0.3/settlement
- https://docs.arkadeos.com/wallets/v0.3/ramps
- https://docs.arkadeos.com/wallets/v0.3/vtxo-management
- https://docs.arkadeos.com/wallets/v0.3/storage-adapters
- https://docs.arkadeos.com/wallets/v0.3/service-worker
- https://docs.arkadeos.com/wallets/v0.3/expo-react-native

---

## SDK Overview

### Available SDKs
- **TypeScript SDK**: Browser, React Native, Node.js support
- **Rust SDK**: High-performance systems programming
- **Go SDK**: Server-side applications
- **Reference Wallet**: Best practices implementation on GitHub

### Key Design Philosophy
- Direct integration without external daemons
- Self-custodial by design
- Flexible for both own custody and user-facing wallets
- Standard Bitcoin-compatible infrastructure

## Wallet Setup

### Installation
```bash
npm install @arkade-os/sdk
```

### Available Arkade Operator Instances
- **Bitcoin Mainnet**: https://arkade.computer (Active)
- **Mutinynet**: https://mutinynet.arkade.sh (Active)
- **Signet**: https://signet.arkade.sh (Active)
- **Local Regtest**: http://localhost:7070 (via `nigiri start --ark`)

### Basic Wallet Creation
```javascript
import { SingleKey, Wallet } from '@arkade-os/sdk'

const identity = SingleKey.fromHex('secret')
const wallet = await Wallet.create({
  identity,
  arkServerUrl: 'https://arkade.computer',
})

const address = await wallet.getAddress()
```

## Arkade Addresses

### Address Structure
Bech32m encoding containing:
1. **Network prefix**: `ark` (mainnet) or `tark` (testnet)
2. **Version number**: `0` (only version currently)
3. **Server's x-only public key**: 32 bytes
4. **P2TR output key**: 32 bytes with taproot scripts

### VTXO Script Paths in Addresses
1. **Collaborative Path**: `checkSig(userPK) && checkSig(operatorPK)`
2. **Exit Path**: `checkSig(userPK) && relativeTimelock(exitDelay)`

Key path: Always unspendable (`TAPROOT_UNSPENDABLE_KEY`)

### How Addresses Work
1. **Address Generation**: SDK generates address encoding user + server pubkeys
2. **Receiving Funds**: Creates VTXO that can be spent collaboratively offchain
3. **Collaborative Spending**: Both user + server sign (automatic in SDK)
4. **Unilateral Exit**: User can withdraw after timelock if server unavailable

## Receiving Payments

### Getting Address
```javascript
const offchainAddress = await wallet.getAddress()
// Returns ark1... (mainnet) or tark1... (testnet)
```

### Monitoring Incoming Payments
```javascript
const stop = wallet.notifyIncomingFunds((notification) => {
  switch (notification.type) {
    case 'vtxo':
      // Offchain Arkade payments
      for (const vtxo of notification.vtxos) {
        console.log(`Received ${vtxo.amount} sats`)
      }
      break
    case 'utxo':
      // Onchain boarding UTXOs
      for (const utxo of notification.utxos) {
        console.log(`Received ${utxo.amount} sats on boarding address`)
      }
      break
  }
})

// Stop subscription when needed
stop()
```

### Payment Sources
- **Arkade addresses**: Instant, near-zero fees, no online requirement
- **Lightning Network**: Via submarine swaps (instant)
- **Onchain Bitcoin**: Via boarding addresses (2+ confirmations)

## Balance Management

### Balance Structure
```javascript
const balance = await wallet.getBalance()
// {
//   preconfirmed: 0,      // Cosigned offchain, not yet settled
//   settled: 20000,       // Bitcoin-anchored via batch swap
//   available: 20000,     // settled + preconfirmed (spendable)
//   recoverable: 5000,    // Expired VTXOs, subdust
//   total: 25000,         // available + recoverable
//   boarding: {
//     unconfirmed: 0,     // Unconfirmed onchain UTXOs
//     confirmed: 0,       // Confirmed onchain UTXOs
//     total: 0
//   }
// }
```

### Key Balance Fields
- **`available`**: What you can spend right now (primary field for everyday use)
- **`total`**: Full offchain balance including recoverable funds
- **`recoverable`**: VTXOs swept by server or subdust amounts (need recovery)
- **`boarding`**: Only relevant when using native onboarding

### Getting VTXOs
```javascript
const vtxos = await wallet.getVtxos()
// Each VTXO has:
// - txid, vout (identifier)
// - value (amount in sats)
// - virtualStatus.batchTxID
// - virtualStatus.state: "preconfirmed" | "settled" | "swept" | "spent"
```

### Getting Boarding UTXOs
```javascript
const boardingUtxos = await wallet.getBoardingUtxos()
// Each boarding UTXO has:
// - txid, vout
// - value
// - status.confirmed (boolean)
```

## Sending Payments

### To Arkade Addresses
```javascript
const txid = await wallet.sendBitcoin({
  address: 'tark12ld59yglpj...',
  amount: 50000,  // in satoshis
})
```
- Instant, near-zero fees
- Recipient doesn't need to be online
- Just like Bitcoin, but instant

### To Lightning Network
```javascript
const txid = await wallet.sendBitcoin({
  address: 'lnbc1...',  // Lightning invoice
  amount: 25000,
})
```
- Uses submarine swaps
- Low fees, instant
- See Lightning Swaps documentation

### To Bitcoin Addresses
```javascript
const txid = await wallet.sendBitcoin({
  address: 'bc1qxy2kgdygjrsqtzq2n0yrf2493p83kkfjhx0wlh',
  amount: 100000,
})
```
- Involves onchain swap
- Standard network fees apply
- Recipient doesn't need to be online
- For regular exits, prefer offboarding process for better control

## Payment History

### Retrieving Transaction History
```javascript
const history = await wallet.getTransactionHistory()
// Each transaction has:
// - key: { boardingTxid, arkTxid, commitmentTxid }
// - type: TxType.TxReceived | TxType.TxSent
// - amount: satoshis
// - settled: boolean
// - createdAt: Unix timestamp
```

### Transaction Types
- **Received payments**: Onchain and offchain
- **Sent payments**: To others
- **Boarding transactions**: Moving funds into Arkade
- **Exit transactions**: Moving funds out of Arkade

### Filtering Examples
```javascript
const receivedTxs = history.filter(tx => tx.type === TxType.TxReceived)
const sentTxs = history.filter(tx => tx.type === TxType.TxSent)
const settledTxs = history.filter(tx => tx.settled === true)
const largeTxs = history.filter(tx => tx.amount > 100000)
```

## Settlement Process

### Two States of VTXOs
1. **Preconfirmed**: Cosigned offchain, carries operator trust assumptions
2. **Settled**: Batched onchain via commitment transaction, full Bitcoin security

### Dynamic Settlement
Users choose when to settle:
- Keep offchain: Speed + cost efficiency
- Settle onchain: Security + immutability + censorship resistance

```javascript
const vtxos = await wallet.getVtxos()
const preconfirmedVtxos = vtxos.filter(v => v.virtualStatus.state === 'preconfirmed')
const settledVtxos = vtxos.filter(v => v.virtualStatus.state === 'settled')
```

## Ramps (Onboarding/Offboarding)

### Overview
- **Onboarding (Boarding)**: UTXO → VTXO (minimum 2 onchain txs)
- **Offboarding (Exiting)**: VTXO → UTXO (collaborative or unilateral)

### Cost Considerations
- Native ramps require multiple onchain transactions
- Wait for confirmations between steps
- Minimum amounts due to Bitcoin network fees
- **Recommended**: Use swap providers (Lightning, etc.) for faster operations

### When to Use Native Ramps
- Large amounts where fees are proportionally small
- Professional service providers managing liquidity
- Swap providers unavailable
- Need full control over process

### Onboarding Process
1. **Generate boarding address**: `await wallet.getBoardingAddress()`
2. **Send Bitcoin onchain**: To boarding address, wait for confirmation
3. **Initiate settlement**: `await new Ramps(wallet).onboard()`
4. **Server processes**: Includes UTXO in commitment transaction
5. **Receive VTXO**: Once commitment tx confirms

**Total Cost**: 2+ onchain transactions minimum

### Offboarding (Collaborative Exit)
1. **Specify destination**: Onchain Bitcoin address
2. **Request offboard**: `await new Ramps(wallet).offboard(destinationAddress, amount)`
3. **Server processes**: Includes in next commitment transaction
4. **Receive onchain**: Standard UTXO at destination

**Benefits**: Faster, cheaper than unilateral exit; batches multiple exits

### Unilateral Exit
1. **Create onchain wallet**: To pay miner fees for unroll process
2. **Unroll VTXO**: Publish chain of virtual transactions sequentially
3. **Wait for CSV locktime**: CHECKSEQUENCEVERIFY relative timelock
4. **Complete exit**: Claim Bitcoin after locktime expires

**When to use**: 
- Server permanently unavailable
- Cannot reach server for collaborative exit
- Need to exercise trustless exit rights

**Costs**: Multiple sequential onchain transactions, substantial fees

## VTXO Management

### VtxoManager Features
- **Renewal**: Renew VTXOs before expiry to maintain unilateral control
- **Recovery**: Reclaim expired and swept VTXOs

### Creating Manager
```javascript
import { VtxoManager } from '@arkade-os/sdk'

const manager = new VtxoManager(wallet, {
  enabled: true,
  thresholdPercentage: 10  // Alert when 10% of lifetime remains
})
```

### Checking & Renewing Expiring VTXOs
```javascript
const expiringVtxos = await manager.getExpiringVtxos()
// Check remaining time
expiringVtxos.forEach(vtxo => {
  const timeLeft = vtxo.virtualStatus.batchExpiry - Date.now()
  const hoursLeft = Math.floor(timeLeft / (1000 * 60 * 60))
})

// Renew all expiring VTXOs
const txid = await manager.renewVtxos()
```

### Checking & Recovering VTXOs
```javascript
const balance = await manager.getRecoverableBalance()
// {
//   recoverable: bigint,  // recoverable amount in sats
//   subdust: bigint,      // subdust amount
//   includesSubdust: boolean,
//   vtxoCount: number
// }

// Recover swept VTXOs and subdust
if (balance.recoverable > 0n) {
  const txid = await manager.recoverVtxos((event) => {
    console.log('Settlement event:', event.type)
  })
}
```

### Best Practices
- Set up automatic renewal checks (daily recommended)
- Renew when threshold reached
- Monitor recoverable balance
- Configure appropriate threshold based on use case

## Storage Adapters

### Available Adapters
- **InMemoryStorageAdapter**: Default, loses data on restart
- **LocalStorageAdapter**: Browser/PWA persistent storage
- **IndexedDBStorageAdapter**: Browser/PWA/Service Worker advanced storage
- **AsyncStorageAdapter**: React Native persistent storage
- **FileSystemStorageAdapter**: Node.js file-based storage

### Storage Adapter Interface
```javascript
interface StorageAdapter {
  getItem(key: string): Promise<string | null>
  setItem(key: string, value: string): Promise<void>
  removeItem(key: string): Promise<void>
  clear(): Promise<void>
}
```

### Browser LocalStorage Example
```javascript
import { LocalStorageAdapter } from '@arkade-os/sdk/adapters/localStorage'

const storage = new LocalStorageAdapter()

let privateKeyHex = await storage.getItem('private-key')
if (!privateKeyHex) {
  const newIdentity = SingleKey.fromRandomBytes()
  privateKeyHex = newIdentity.toHex()
  await storage.setItem('private-key', privateKeyHex)
}

const wallet = await Wallet.create({
  identity: SingleKey.fromHex(privateKeyHex),
  arkServerUrl: 'https://mutinynet.arkade.sh',
  storage
})
```

### IndexedDB (Recommended for Service Workers)
```javascript
import { IndexedDBStorageAdapter } from '@arkade-os/sdk/adapters/indexedDB'

const storage = new IndexedDBStorageAdapter('my-app', 1)
```

### Repository Pattern (v0.3)
```javascript
// VTXO management (automatically cached)
const vtxos = await wallet.walletRepository.getVtxos(addr)
await wallet.walletRepository.saveVtxos(addr, vtxos)

// Contract data
await wallet.contractRepository.setContractData('my-contract', 'status', 'active')
const status = await wallet.contractRepository.getContractData('my-contract', 'status')

// Collection management
await wallet.contractRepository.saveToContractCollection(
  'swaps',
  { id: 'swap-1', amount: 50000, type: 'reverse' },
  'id'
)
const swaps = await wallet.contractRepository.getContractCollection('swaps')
```

## Service Worker Support

### Benefits
- **Background Processing**: Wallet active when app closed
- **Persistent Storage**: IndexedDB for reliability
- **Event Handling**: Process incoming payments/settlements in background
- **Improved UX**: Faster response times

### Quick Setup
```javascript
// main.js
import { ServiceWorkerWallet, SingleKey } from '@arkade-os/sdk'

const identity = SingleKey.fromHex('your_private_key_hex')

const wallet = await ServiceWorkerWallet.setup({
  serviceWorkerPath: '/service-worker.js',
  arkServerUrl: 'https://mutinynet.arkade.sh',
  identity
})

// Ready to use immediately
const address = await wallet.getAddress()
const balance = await wallet.getBalance()
```

### Service Worker Implementation
```javascript
// service-worker.js
import { Worker } from '@arkade-os/sdk'

new Worker().start()
```

Worker automatically handles:
- Message routing
- Wallet state management
- Event processing
- Cleanup

### With IndexedDB Storage
```javascript
import { IndexedDBStorageAdapter } from '@arkade-os/sdk/adapters/indexedDB'

const storage = new IndexedDBStorageAdapter('wallet-db', 1)

const wallet = await ServiceWorkerWallet.setup({
  serviceWorkerPath: '/service-worker.js',
  arkServerUrl: 'https://mutinynet.arkade.sh',
  identity,
  storage
})
```

### Handling Events in Service Worker
```javascript
import { waitForIncomingFunds } from '@arkade-os/sdk'

const incomingFunds = await waitForIncomingFunds(wallet)

if (incomingFunds.type === "vtxo") {
  console.log("VTXOs received:", incomingFunds.vtxos)
} else if (incomingFunds.type === "utxo") {
  console.log("UTXOs received:", incomingFunds.coins)
}
```

## Expo / React Native Support

### Requirements
- Server-Sent Events (SSE) handling (standard EventSource doesn't work)
- JSON streaming via custom fetch
- `crypto.getRandomValues()` polyfill

### Installation
```bash
npm install @arkade-os/sdk
npx expo install expo-crypto
```

### Crypto Polyfill (MUST BE FIRST)
```javascript
// App.tsx or index.js - BEFORE any SDK imports
import * as Crypto from 'expo-crypto'

if (!global.crypto) global.crypto = {} as any
global.crypto.getRandomValues = Crypto.getRandomValues

// Now import SDK
import { Wallet, SingleKey } from '@arkade-os/sdk'
import { ExpoArkProvider, ExpoIndexerProvider } from '@arkade-os/sdk/adapters/expo'
```

### Basic Expo Setup
```javascript
import { ExpoArkProvider, ExpoIndexerProvider } from '@arkade-os/sdk/adapters/expo'
import { AsyncStorageAdapter } from '@arkade-os/sdk/adapters/asyncStorage'

const storage = new AsyncStorageAdapter()

let privateKeyHex = await storage.getItem('private-key')
if (!privateKeyHex) {
  const newIdentity = SingleKey.fromRandomBytes()
  privateKeyHex = newIdentity.toHex()
  await storage.setItem('private-key', privateKeyHex)
}

const wallet = await Wallet.create({
  identity: SingleKey.fromHex(privateKeyHex),
  esploraUrl: 'https://mutinynet.com/api',
  arkProvider: new ExpoArkProvider('https://mutinynet.arkade.sh'),
  indexerProvider: new ExpoIndexerProvider('https://mutinynet.arkade.sh'),
  storage
})
```

### Expo Providers
- **ExpoArkProvider**: Settlement events + transaction streaming via `expo/fetch`
- **ExpoIndexerProvider**: Address subscriptions + VTXO updates via `expo/fetch`

### Common Issues & Solutions
1. **Crypto not defined**: Ensure polyfill before SDK imports
2. **EventSource not available**: Use ExpoArkProvider/ExpoIndexerProvider
3. **AsyncStorage errors**: Use AsyncStorageAdapter from SDK
4. **Device testing**: Use publicly accessible server (not localhost)

## Key Takeaways

### Wallet Operations
- **Simple integration**: Direct, no external daemons
- **Self-custodial**: Always maintain control
- **Multi-platform**: Browser, Node.js, React Native support

### Payment Flows
- **Receiving**: Get address, monitor with `notifyIncomingFunds()`
- **Sending**: Supports Arkade addresses, Lightning, Bitcoin onchain
- **Instant**: Arkade-to-Arkade payments are instant, near-zero fees

### Balance & VTXO Management
- **Available balance**: What you can spend now
- **VTXO states**: Preconfirmed vs settled
- **Renewal**: Automated via VtxoManager to prevent expiry
- **Recovery**: Reclaim expired/swept VTXOs

### Ramps & Settlement
- **Native ramps**: Expensive, multi-step, for professionals
- **Swap providers**: Recommended for everyday users
- **Dynamic settlement**: Choose when to anchor to Bitcoin
- **Unilateral exit**: Trustless escape hatch (costly)

### Advanced Features
- **Storage adapters**: Platform-specific persistence
- **Service workers**: Background processing
- **Expo/React Native**: Mobile support with specialized providers
- **Repository pattern**: Low-level data management

---

## Next Batch: Ready for more documents