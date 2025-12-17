# 🏦 Understanding Arkade Addresses & Mutinynet

## 📡 What is Mutinynet?

**Mutinynet is a Bitcoin signet** - a special type of Bitcoin testnet, NOT the Lightning Network itself.

### Bitcoin Test Networks Explained

| Network | Type | Purpose | Block Time |
|---------|------|---------|-----------|
| **Mainnet** | Production | Real Bitcoin, real money | ~10 min |
| **Testnet** | Public test | Free test Bitcoin, public | ~10 min |
| **Signet** | Controlled test | Reliable test network | Controlled |
| **Mutinynet** | Signet instance | Lightning + L2 optimized | Controlled |
| **Regtest** | Local | Developer testing | Instant |

### Why Mutinynet Exists

**Problem with regular Testnet:**
- Unpredictable block times
- Sometimes no blocks for hours
- Hard to test Lightning/Layer 2

**Mutinynet Solution:**
- Predictable, fast blocks
- Reliable infrastructure
- Built for Lightning Network + Layer 2 testing
- Free testnet BTC
- Active Arkade ASP server

**Mutinynet Infrastructure:**
- Bitcoin signet nodes
- Lightning Network nodes
- **Arkade ASP**: `https://mutinynet.arkade.sh`
- Faucets: `https://faucet.mutinynet.com/`
- Explorer: `https://mutinynet.com/`

---

## 🏦 Arkade's Three Address Types

When you create an Arkade wallet, you get **THREE different addresses**, each serving a different purpose.

### 1️⃣ Offchain Address (Arkade Address)

**Format**: `tark1...` (testnet) or `ark1...` (mainnet)

**Purpose**: 
- Receive payments **within Arkade** network
- These are VTXO (Virtual UTXO) transfers
- Instant settlement
- Near-zero fees

**When to use:**
- Receiving payments from other Arkade users
- Fast transfers between Arkade wallets
- When speed matters more than Bitcoin finality

**Example:**
```
tark1qxyz...abc123
```

**Technical:**
- Not a Bitcoin address
- Represents ownership of VTXOs in Arkade
- Backed by Bitcoin but settled offchain
- Can convert to Bitcoin by settling/exiting

---

### 2️⃣ Onchain Address (Bitcoin Address)

**Format**: `bc1q...` (mainnet) or `tb1q...` (testnet) - Bech32

**Purpose**:
- Receive **regular Bitcoin** on the blockchain
- Standard Bitcoin address
- Full Bitcoin security

**When to use:**
- Getting Bitcoin from faucets ✅
- Receiving from exchanges
- Accepting regular Bitcoin payments
- When you need Bitcoin L1 security

**Example:**
```
tb1q2xr...def456
```

**Technical:**
- Standard Bitcoin P2WPKH or P2WSH address
- Appears on Bitcoin blockchain
- ~10 minute confirmations
- Normal Bitcoin network fees
- This is what faucets send to!

---

### 3️⃣ Boarding Address (Same as Onchain!)

**Format**: Same as onchain (`bc1q...` or `tb1q...`)

**Important**: The boarding address **IS** your onchain Bitcoin address!

**Purpose**:
- **Move Bitcoin FROM blockchain INTO Arkade**
- One-way bridge: Bitcoin → Arkade VTXOs
- When BTC arrives here, Arkade ASP detects it and creates VTXOs

**When to use:**
- After receiving Bitcoin from faucet
- When you want to enter Arkade network
- To get VTXOs for fast transfers

**How it works:**
```
1. Get BTC from faucet → your onchain address
2. Click "Board to Arkade" in wallet
3. BTC automatically sent to boarding address (same address!)
4. Arkade ASP detects payment
5. ASP creates VTXOs for you
6. VTXOs appear in your offchain balance
```

**Example:**
```
tb1q3zw...ghi789
(This is the SAME address as your onchain address!)
```

**Technical:**
- Same Bitcoin Taproot address as onchain
- Retrieved via `wallet.getBoardingAddress()`
- ASP monitors this address for incoming BTC
- Creates VTXOs when BTC confirmed
- Not a separate address - just a different use!

---

## 🔄 Complete Flow: Faucet → Arkade

Here's the complete journey:

### Step 1: Get Testnet Bitcoin
```
Faucet → Your ONCHAIN address
```
- Visit: https://faucet.mutinynet.com/
- Paste your **onchain address** (tb1q...)
- Wait ~1 minute for confirmation
- Bitcoin appears in your onchain balance

### Step 2: Board to Arkade
```
Your Onchain BTC → Boarding Address → Arkade VTXOs
```
- In wallet, click "Board to Arkade"
- Specify amount (e.g., 100,000 sats)
- Wallet generates boarding address
- Sends BTC from onchain → boarding
- Wait ~10 minutes
- VTXOs appear in offchain balance

### Step 3: Use Arkade
```
Your Offchain Address ⟷ Other Arkade Users
```
- Share your **offchain address** (tark1...)
- Receive instant payments
- Send instant payments
- Enjoy near-zero fees

### Step 4: Exit Arkade (Optional)
```
Arkade VTXOs → Settlement → Bitcoin Blockchain
```
- Click "Settle" or "Exit"
- VTXOs converted back to Bitcoin
- Appears in onchain address
- ~10 minutes for confirmation

---

## 💡 Visual Comparison

```
┌─────────────────────────────────────────────────────────┐
│                    BITCOIN LAYER 1                       │
│  Onchain Address: tb1q2xr...def456                      │
│  - Receives Bitcoin from faucets                         │
│  - Slow (~10 min)                                        │
│  - Normal fees                                           │
│  - Full Bitcoin security                                 │
└────────────────────┬────────────────────────────────────┘
                     │
                     │ (Boarding)
                     ↓
┌─────────────────────────────────────────────────────────┐
│                    BOARDING BRIDGE                       │
│  Boarding Address: tb1q3zw...ghi789                     │
│  - One-way bridge into Arkade                           │
│  - Generated per boarding                                │
│  - ASP processes and creates VTXOs                       │
└────────────────────┬────────────────────────────────────┘
                     │
                     │ (Creates VTXOs)
                     ↓
┌─────────────────────────────────────────────────────────┐
│                    ARKADE LAYER 2                        │
│  Offchain Address: tark1qxyz...abc123                   │
│  - Instant payments                                      │
│  - Near-zero fees                                        │
│  - Can settle back to L1                                 │
└─────────────────────────────────────────────────────────┘
```

---

## 🎯 Which Address for What?

| Scenario | Use This Address | Why |
|----------|-----------------|-----|
| Faucet requests | **Onchain/Boarding** | Faucets send regular Bitcoin (same address!) |
| Exchange withdrawals | **Onchain/Boarding** | Exchanges send to Bitcoin addresses (same!) |
| Entering Arkade | **Onchain/Boarding** | Just send BTC to your onchain address - it boards automatically |
| Receiving from Arkade user | **Offchain** | For instant VTXO transfers |
| Sharing for payments | **Offchain** | Fast, cheap Arkade payments |
| Receiving regular BTC | **Onchain/Boarding** | Standard Bitcoin receiving (same address!)|

---

## 🔐 Security Considerations

### Onchain Address
- ✅ Full Bitcoin security
- ✅ You control private keys
- ✅ Can recover even if Arkade disappears
- 🔒 Standard Bitcoin security model

### Offchain Address
- ⚠️ Trusts Arkade ASP for instant settlement
- ✅ Can always settle to Bitcoin L1
- ✅ Exit mechanism if ASP disappears
- 🔒 Bitcoin-backed but requires cooperation

### Boarding Address
- ⚠️ One-way: Bitcoin → Arkade only
- ✅ ASP must create VTXOs (automated)
- ✅ Transaction on Bitcoin blockchain
- 🔒 Protected by Bitcoin finality

---

## 🛠️ In the Wallet UI

When you connect your wallet, you'll now see:

### Default View
Shows your main **offchain address** for daily use.

### Expanded View (Click "Show All")
Shows all three:
1. **Offchain** (green) - For Arkade payments
2. **Onchain** (yellow) - For Bitcoin/faucets
3. **Boarding** (purple) - For entering Arkade

---

## 📚 Quick Reference

### Faucet Instructions
```bash
1. Click "Show All (3)" in wallet
2. Copy your ONCHAIN/BOARDING address (yellow/purple - same address!)
3. Visit https://faucet.mutinynet.com/
4. Paste the address
5. Click "Send"
6. Wait ~1 minute
7. BTC arrives at your onchain address
8. Arkade ASP automatically detects it and creates VTXOs
9. See balance in your offchain wallet!
```

### Manual Boarding Instructions (If Needed)
```bash
1. Have BTC in onchain address (from faucet)
2. Click "Board to Arkade" button
3. Enter amount (e.g., 100000 sats)
4. Transaction sent from your onchain address
5. Wait ~10 minutes for confirmation
6. VTXOs appear in offchain balance

Note: In many cases, Arkade ASP auto-boards when it detects
incoming BTC to your onchain address!
```

### Receiving Arkade Payment
```bash
1. Click "Show All (3)" in wallet
2. Copy your OFFCHAIN address (green)
3. Share with sender
4. Receive instantly!
```

---

## 🎓 Summary

**Mutinynet** = Bitcoin signet optimized for Lightning/Layer 2 testing

**Actually TWO unique addresses** (boarding = onchain):
- **Onchain/Boarding**: Regular Bitcoin address (use for faucets) - `tb1q...`
- **Offchain**: Arkade address for instant payments - `tark1...`

**Flow**: Faucet → Onchain (auto-boards) → Offchain VTXOs → Fast payments!

---

## 🔗 Resources

- **Mutinynet Explorer**: https://mutinynet.com/
- **Mutinynet Faucet**: https://faucet.mutinynet.com/
- **Arkade ASP (Mutinynet)**: https://mutinynet.arkade.sh
- **Arkade Docs**: https://arkade.io/docs
- **Bitcoin Signet Info**: https://en.bitcoin.it/wiki/Signet

---

**Now you understand the difference! Use the right address for the right purpose.** 🎯
