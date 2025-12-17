# Arkade Contracts & Applications Learning Notes - Batch 3

## Studied Documents:
- https://docs.arkadeos.com/contracts/overview
- https://docs.arkadeos.com/contracts/background
- https://docs.arkadeos.com/contracts/smart-contracts-utxo
- https://docs.arkadeos.com/contracts/arkade-script
- https://docs.arkadeos.com/contracts/arkade-compiler
- https://docs.arkadeos.com/contracts/arkade-syntax
- https://docs.arkadeos.com/contracts/arkade-types
- https://docs.arkadeos.com/contracts/arkade-functions
- https://docs.arkadeos.com/contracts/lightning-swaps
- https://docs.arkadeos.com/contracts/chain-swaps
- https://docs.arkadeos.com/contracts/oracle-dlc
- https://docs.arkadeos.com/contracts/spilman-channels
- https://docs.arkadeos.com/contracts/escrow
- https://docs.arkadeos.com/contracts/non-interactive-swaps
- https://docs.arkadeos.com/contracts/synthetic-assets
- https://docs.arkadeos.com/contracts/automated-market-makers
- https://docs.arkadeos.com/contracts/prediction-market

---

## ⚠️ IMPORTANT: Experimental Technology

**ALL code and concepts are for exploration and proof of concept ONLY**
- NOT ready for production use
- Active development, subject to significant changes
- Examples are for research purposes only

---

## Background & Motivation

### Bitcoin's Limitations
1. **UTXO Model**: Local, composable, DAG structure BUT requires onchain confirmation
2. **Mempool Constraints**: Ancestor limits, relay policies limit UTXO contracts
3. **Fee Market**: Unpredictable costs, slow (10 min blocks), expensive
4. **Result**: Rules out efficient onchain contract execution entirely

### Arkade's Solution: Offchain Execution Layer

**VTXOs (Virtual UTXOs)**:
- Transact like regular UTXOs: spend as inputs, create new outputs
- Execute instantly offchain, bypassing mempool congestion and fees
- Follow Bitcoin's UTXO model (local validation, composability, DAG structure)
- Tracked and validated by operator in Virtual Mempool

**Batch Settlement Model**:
- Aggregates multiple offchain transfers into single Bitcoin transaction
- Operator collects and cosigns valid VTXO transfers
- Entire batch settles in one block
- Drastically reduces fees and block space usage

### Key Benefits
- **Latency**: Instant preconfirmation, bypass block delays
- **Fee Volatility**: Batch settlement spreads cost across participants
- **Mempool Constraints**: VTXOs live outside Bitcoin mempool
- **Composable Contracts**: Chaining and multi-party coordination via presigned commitments

**Security Model**:
- VTXOs cryptographically tied to Bitcoin UTXOs via commitment transactions
- Users can always unilaterally exit to L1 using presigned transactions
- Operator cannot steal funds, only facilitate or delay
- Misbehavior is detectable and punishable

**Important**: Preconfirmation offers speed without Bitcoin-level finality. Security improves only once VTXOs are settled onchain.

---

## Smart Contracts in UTXO Model

### The UTXO Paradigm
- Each transaction consumes UTXOs as inputs
- Each transaction creates new UTXOs as outputs
- Each UTXO can only be spent once
- Each UTXO has script defining spending conditions

**Challenge**: Excellent security and scalability, but creates challenges for stateful applications

### Traditional Commit-Reveal Pattern

**Classic approach**:
1. **Commit Phase**: Lock funds with specific spending conditions
2. **Reveal Phase**: Reveal committed values when spending

**Example: HTLC (Hash Time-Locked Contract)**:
```
OP_IF
    OP_SHA256 <hash> OP_EQUALVERIFY
    <receiver_pubkey> OP_CHECKSIG
OP_ELSE
    <timeout> OP_CHECKLOCKTIMEVERIFY OP_DROP
    <sender_pubkey> OP_CHECKSIG
OP_ENDIF
```

**Limitation**: Traditional script can only verify spending conditions, cannot directly enforce conditions on outputs being created

### Advancing Beyond Commit-Reveal

**1. Transaction Introspection**
- Script can examine properties of transaction spending it
- Including outputs being created
- Enables verification of state transitions, covenant enforcement

```javascript
// Verify output maintains contract with updated state
require(tx.outputs[0].scriptPubKey == updatedContractScript, "Invalid state transition");
require(tx.outputs[0].value >= minValue, "Insufficient value in next state");
```

**2. Taproot and Key Tweaking**
- Complex script conditions while maintaining privacy
- Verification of output commitment to specific contract terms
- Efficient verification of contract continuation

```javascript
bytes expectedTweakedKey = tweakKey(internalKey, contractHash);
require(tx.outputs[0].scriptPubKey == new P2TR(expectedTweakedKey), "Invalid continuation");
```

### State-Carrying Contract Primitives

**Token Support**:
- Fungible tokens for value representation
- Non-fungible tokens for unique assets
- Token transfers as state transitions

**Recursive Covenants**:
- Contracts enforce conditions on future spending
- Self-replicating contract logic
- Enforced state machine transitions
- Preservation of invariants across transactions

```javascript
function updateState(int newValue, signature userSig, pubkey user) {
  int currentValue = tx.input.current.value;
  require(newValue > currentValue, "New value must be greater");
  require(tx.outputs[0].scriptPubKey == tx.input.current.scriptPubKey, "Contract must be preserved");
  require(tx.outputs[0].value == newValue, "Output must contain new value");
  require(checkSig(userSig, user), "Invalid user signature");
}
```

### The VTXO Paradigm

**Two execution paths**:
1. **Immediate Execution Path**: Cooperative with server co-signature for instant finality
2. **Timelock Unilateral Path**: Fallback for onchain redemption with timelock

---

## Arkade Script

### Overview
Bitcoin scripting language for VTXO model with two execution paths:
1. **Immediate Execution**: Server co-signature for instant finality
2. **Timelock Unilateral Path**: Onchain redemption fallback

### Tapscript Opcodes

**Resource Limits in Taproot**:
- No script size limit (bounded by block weight)
- No 201 non-push opcode limit
- Per-script sigops budget: 50 + witness size in bytes
- Stack limits: 1,000 element stack+altstack
- Stack element size: 520 byte maximum

**Streaming Hash Opcodes** (overcomes 520-byte limitation):
- `OP_SHA256INITIALIZE` (OP_SUCCESS196): Initialize SHA256 context
- `OP_SHA256UPDATE` (OP_SUCCESS197): Update SHA256 context
- `OP_SHA256FINALIZE` (OP_SUCCESS198): Finalize and push hash value

**Transaction Introspection Opcodes**:

*Input Introspection*:
- `OP_INSPECTINPUTOUTPOINT` (OP_SUCCESS199)
- `OP_INSPECTINPUTASSET` (OP_SUCCESS200)
- `OP_INSPECTINPUTVALUE` (OP_SUCCESS201)
- `OP_INSPECTINPUTSCRIPTPUBKEY` (OP_SUCCESS202)
- `OP_INSPECTINPUTSEQUENCE` (OP_SUCCESS203)
- `OP_INSPECTINPUTISSUANCE` (OP_SUCCESS204)
- `OP_PUSHCURRENTINPUTINDEX` (OP_SUCCESS205)

*Output Introspection*:
- `OP_INSPECTOUTPUTASSET` (OP_SUCCESS206)
- `OP_INSPECTOUTPUTVALUE` (OP_SUCCESS207)
- `OP_INSPECTOUTPUTNONCE` (OP_SUCCESS208)
- `OP_INSPECTOUTPUTSCRIPTPUBKEY` (OP_SUCCESS209)

*Transaction Introspection*:
- `OP_INSPECTVERSION` (OP_SUCCESS210)
- `OP_INSPECTLOCKTIME` (OP_SUCCESS211)
- `OP_INSPECTNUMINPUTS` (OP_SUCCESS212)
- `OP_INSPECTNUMOUTPUTS` (OP_SUCCESS213)
- `OP_TXWEIGHT` (OP_SUCCESS214)

**64-bit Arithmetic Opcodes**:

*Basic Operations*:
- `OP_ADD64`, `OP_SUB64`, `OP_MUL64`, `OP_DIV64`, `OP_NEG64` (OP_SUCCESS215-219)
- All with overflow detection

*Comparison Operations*:
- `OP_LESSTHAN64`, `OP_LESSTHANOREQUAL64` (OP_SUCCESS220-221)
- `OP_GREATERTHAN64`, `OP_GREATERTHANOREQUAL64` (OP_SUCCESS222-223)

**Conversion Opcodes**:
- `OP_SCRIPTNUMTOLE64` (OP_SUCCESS224): CScriptNum → 8-byte LE
- `OP_LE64TOSCRIPTNUM` (OP_SUCCESS225): 8-byte LE → CScriptNum
- `OP_LE32TOLE64` (OP_SUCCESS226): 4-byte unsigned LE → 8-byte signed LE

**Crypto Opcodes**:
- `OP_ECMULSCALARVERIFY` (OP_SUCCESS227): Verify EC scalar multiplication (Q = k*P)
- `OP_TWEAKVERIFY` (OP_SUCCESS228): Verify Taproot key tweaking (Q = P + k*G)

**Enhanced Existing Opcodes**:
- `OP_CHECKSIGFROMSTACK` and `OP_CHECKSIGFROMSTACKVERIFY`: BIP340 Schnorr semantics

---

## Arkade Compiler

### Architecture
1. **Lexer**: Tokenizes source code
2. **Parser**: Builds abstract syntax tree (AST)
3. **Type Checker**: Verifies type correctness
4. **Optimizer**: Optimizes AST for efficient execution
5. **Code Generator**: Generates Bitcoin Script from optimized AST

### Compilation Process
1. Parse Arkade Script source
2. Analyze contract structure and dependencies
3. For each function: Generate cooperative path (with server signature) and unilateral path (with timelock)
4. Optimize generated scripts
5. Generate Taproot output structure
6. Output compiled contract in JSON format

### Usage
```bash
arkadec contract.ark

# With options
arkadec --opt-level=2 contract.ark
arkadec --output=asm contract.ark
arkadec --debug contract.ark
arkadec --output-file=contract.json contract.ark
```

### Compilation Artifacts (JSON Output)
- Contract metadata (name, version)
- Constructor parameters
- Function definitions
- Generated script for each function (cooperative + unilateral paths)
- Source map for debugging

### Script Optimization
- Constant folding: Evaluate constants at compile time
- Dead code elimination: Remove unreachable code
- Stack optimization: Minimize stack operations
- Script size reduction: Compress generated script

---

## Arkade Syntax

### Influences
- **CashScript**: High-level language for Bitcoin Cash
- **Ivy**: Smart contract language for Bitcoin
- **Solidity**: Most widely used smart contract language (Ethereum)

### Basic Structure
```javascript
// Optional configuration
options {
  server = serverPubkey;
  exit = 144; // Exit timelock in blocks
}

// Contract declaration
contract MyContract(
  pubkey user,
  pubkey server
) {
  // Function declarations (spending paths)
  function spend(signature userSig) {
    require(checkSig(userSig, user));
  }
}
```

### Comments
```javascript
// Single-line comment

/*
  Multi-line comment
*/
```

### Options Block
```javascript
options {
  server = server;    // Server key parameter
  renew = 1008;       // Renewal timelock (7 days)
  exit = 144;         // Exit timelock (24 hours)
}
```

### Functions
```javascript
// Spending path
function spend(signature userSig) {
  require(checkSig(userSig, user));
}

// Internal helper (not a spending path)
function verifyCondition(bytes preimage, bytes32 hash) internal returns (bool) {
  return sha256(preimage) == hash;
}
```

### Control Flow
```javascript
if (amount > threshold) {
  // Code for amounts above threshold
} else {
  // Code for amounts below or equal to threshold
}
```

### Expressions
```javascript
// Arithmetic
int sum = a + b;
int difference = a - b;
int product = a * b;
int quotient = a / b;
int remainder = a % b;

// Comparison
bool isEqual = a == b;
bool isNotEqual = a != b;
bool isGreater = a > b;

// Logical
bool andResult = condition1 && condition2;
bool orResult = condition1 || condition2;
bool notResult = !condition;

// Bitwise
int andResult = a & b;
int orResult = a | b;
int xorResult = a ^ b;
int leftShift = a << b;
```

### Transaction Introspection
```javascript
// Access transaction time
require(tx.time >= lockTime);

// Access outputs
require(tx.outputs[0].value == amount);
require(tx.outputs[0].scriptPubKey == script);

// Access inputs
require(tx.inputs[0].value == amount);

// Access current input
require(tx.input.current.value == amount);
```

---

## Arkade Types

### Primitive Types
```javascript
bool isValid = true;
int amount = 1000;  // 64-bit signed integer (-2^63 to 2^63-1)
```

### Cryptographic Types
```javascript
pubkey user;
pubkey oracle = 0x03aabbcc...;
signature userSig;
```

### Byte Arrays
```javascript
bytes data = 0x00112233;
bytes message = "Hello, world!";

// Fixed-size
bytes20 hash160Value = hash160(pubkey);
bytes32 sha256Value = sha256(message);
bytes33 compressedPubkey;
```

### Asset Types
```javascript
asset token;  // Provides identifiers and terms (supply, etc.)
```

### Complex Types
```javascript
// Arrays
int[] amounts = [100, 200, 300];
pubkey[] signers = [alice, bob, charlie];
int firstAmount = amounts[0];
int signerCount = signers.length;

// Structs
struct Payment {
  int amount;
  pubkey recipient;
  int timestamp;
}

Payment payment = Payment(1000, recipientPk, tx.time);
int paymentAmount = payment.amount;
```

### Special Types
```javascript
// Transaction
int locktime = tx.time;
int inputCount = tx.inputs.length;
int outputCount = tx.outputs.length;

// Input
int inputValue = tx.inputs[0].value;
bytes inputScript = tx.inputs[0].scriptPubKey;
int currentValue = tx.input.current.value;

// Output
int outputValue = tx.outputs[0].value;
bytes outputScript = tx.outputs[0].scriptPubKey;
```

### Type Conversion
```javascript
// Explicit
bytes32 hash = sha256("data");
bytes hashBytes = bytes(hash);

// Implicit
// Integer literals → int
// String literals → bytes
// Hex literals → bytes or fixed-size byte arrays
```

### Type Safety
Statically typed with compile-time checking:
```javascript
int amount = "invalid"; // Compile error: Type mismatch
```

### Memory Layout
- `bool`: 1 byte
- `int`: 8 bytes (little-endian)
- `pubkey`: 33 bytes (compressed) or 65 bytes (uncompressed)
- `signature`: 64 bytes (Schnorr) or 71-73 bytes (ECDSA)
- `bytes`: Variable length with size prefix

---

## Arkade Functions

### Signature Verification
```javascript
bool isValid = checkSig(signature, pubkey);
bool isValid = checkMultisig([alice, bob], [aliceSig, bobSig]);
bool isValid = checkSigFromStack(signature, pubkey, message);
```

### Hash Functions
```javascript
bytes32 hash = sha256(data);
bytes20 hash = ripemd160(data);
bytes20 hash = hash160(data);  // SHA256 → RIPEMD160
bytes32 hash = hash256(data);  // Double SHA256
```

### Timelock Functions
```javascript
bool isValid = checkLockTime(locktime);
bool isValid = checkSequence(sequence);
```

### Conversion Functions
```javascript
bytes intBytes = int2bytes(value);
int value = bytes2int(bytes);
```

### Script Generation
```javascript
bytes script = new P2PKH(pubkey);
bytes script = new P2SH(redeemScript);
bytes script = new P2WPKH(pubkey);
bytes script = new P2WSH(witnessScript);
bytes script = new P2TR(internalKey, scriptTree);
```

### Key Functions
```javascript
pubkey tweakedKey = tweakKey(pubkey, tweak);
pubkey aggregatedKey = aggregateKeys([alice, bob, charlie]);
```

### Array Functions
```javascript
int arrayLength = array.length;
bytes[] combined = concat(array1, array2);
```

### Utility Functions
```javascript
require(condition, "Error message");
int minimum = min(a, b);
int maximum = max(a, b);
```

### Advanced Functions
```javascript
bool isValid = verifyTaprootSignature(sig, key, msg, leafHash);
bytes32 root = computeMerkleRoot(hashes);
```

---

## Applications & Contract Examples

### 1. Lightning Swaps

**Integration with Lightning Network via Boltz submarine swaps**

#### Installation
```bash
npm install @arkade-os/sdk @arkade-os/boltz-swap
```

#### Setup
```javascript
import { ArkadeLightning, BoltzSwapProvider, StorageProvider } from '@arkade-os/boltz-swap';

const swapProvider = new BoltzSwapProvider({
  apiUrl: 'https://api.ark.boltz.exchange',
  network: 'bitcoin',
});

const storageProvider = await StorageProvider.create();

const arkadeLightning = new ArkadeLightning({
  wallet,
  swapProvider,
  storageProvider,
});
```

#### Receiving from Lightning
```javascript
// Create Lightning invoice
const result = await arkadeLightning.createLightningInvoice({
  amount: 50000,
  description: 'Payment to Arkade wallet',
});

console.log('Invoice:', result.invoice);

// Monitor and auto-claim
const receivalResult = await arkadeLightning.waitAndClaim(result.pendingSwap);
console.log('Received, TXID:', receivalResult.txid);
```

#### Sending to Lightning
```javascript
import { decodeInvoice } from '@arkade-os/boltz-swap';

const invoiceDetails = decodeInvoice('lnbc500u1pj...');

const paymentResult = await arkadeLightning.sendLightningPayment({
  invoice: 'lnbc500u1pj...',
  maxFeeSats: 1000,  // Optional
});

console.log('Payment successful!');
console.log('Preimage:', paymentResult.preimage);
```

#### Error Handling
Detailed error types:
- `SwapError`, `SchemaError`, `NetworkError`
- `SwapExpiredError`, `InvoiceExpiredError`
- `InvoiceFailedToPayError`, `InsufficientFundsError`
- `TransactionFailedError`

Supports refunds when applicable via `error.isRefundable`.

---

### 2. Spilman Channels

**Unidirectional payment channels for scalable, private payment streams**

#### Overview
Classic design where Alice incrementally pays Bob offchain using monotonically increasing state updates. Implemented as virtual channels using VTXOs instead of onchain funding.

#### Channel Lifecycle
1. **Setup**: Alice locks funds; Bob can claim increasing amounts, or Alice reclaims after timeout
2. **Offchain Updates**: Each payment = new presigned transaction paying more to Bob
3. **Closing**:
   - **Cooperative Close**: Bob adds signature to latest state
   - **Refund Path**: Alice waits for CLTV/CSV expiry and reclaims

#### Spending Paths (Taproot Tree)

| Path | Type | Signers | Purpose |
|------|------|---------|---------|
| updateScript | MultiSig | Alice + Bob + Server | Cooperative offchain updates |
| refundScript | CLTV MultiSig | Alice + Server | Refund after absolute locktime |
| unilateralUpdateScript | CSV MultiSig | Alice + Bob | Unilateral closure after short delay |
| unilateralRefundScript | CSV SingleSig | Alice | Fallback refund after longer delay |

**Timelock ordering**: `unilateralUpdateDelay < unilateralRefundDelay`
This ensures Bob can always close with latest valid state before Alice's refund becomes valid.

#### Integration with Arkade
- Channels expressed as VTXOs
- Server participates in cooperative branches only
- Cannot unilaterally spend or steal funds
- Properties: Private, Cheap, Safe, Compositional

---

### 3. Escrow Contracts

**Coming Soon** - Bitcoin-based escrow enabling parties to lock funds under predefined release conditions.

Future topics:
- Contract setup and funding
- Release conditions and dispute workflow
- Integration patterns (marketplaces, P2P trades)

---

### 4. Non-Interactive Swaps

**Trustless asset swaps without both parties being online simultaneously**

#### Overview
- One party creates swap offer takeable by anyone
- Takers complete swap at convenience without maker being online
- Automatic verification without trusted third parties

#### Contract Architecture
1. **Hash Preimage Verification**: Ensure correct asset being swapped
2. **Transaction Introspection**: Verify output amounts and destinations
3. **Timelock Mechanisms**: Allow maker to reclaim after expiration

#### Basic Implementation
```javascript
contract NonInteractiveSwap(
  pubkey maker,
  pubkey server,
  bytes32 assetIdHash,
  int amount,
  int expiryTime
) {
  // Maker cancels after expiry
  function cancel(signature makerSig) {
    require(tx.time >= expiryTime, "Not expired");
    require(checkSig(makerSig, maker), "Invalid maker sig");
  }
  
  // Anyone completes swap with correct asset
  function swap(bytes32 assetId, signature takerSig, pubkey taker) {
    require(sha256(assetId) == assetIdHash, "Asset mismatch");
    require(tx.outputs[0].value >= amount, "Amount too small");
    require(tx.outputs[0].asset == assetId, "Asset incorrect");
    
    bytes makerScript = new P2PKH(maker);
    require(tx.outputs[0].scriptPubKey == makerScript, "Not spendable by maker");
    require(checkSig(takerSig, taker), "Invalid taker sig");
  }
}
```

#### Advanced Features
- **Partial Fills**: Multiple takers fulfill portions of swap
- **Price Oracles**: Execute at market price rather than fixed rate

---

### 5. Synthetic Assets

**Tokenized derivatives mimicking value of other assets without direct ownership**

#### Overview
- Price exposure to traditional assets (stocks, commodities, forex)
- Novel financial instruments (options, futures, perpetuals)
- Collateralized debt positions with programmable liquidation
- Trustless oracle integration

#### Contract Architecture
1. **Collateral Vault**: Secures backing assets
2. **Price Oracle**: Provides trusted price data
3. **Issuance/Redemption Logic**: Manages minting/burning synthetic tokens

#### Basic Implementation
```javascript
contract SyntheticAsset(
  bytes32 collateralAssetId,
  int minCollateralRatio,     // e.g., 150% = 15000
  int liquidationThreshold,   // e.g., 120% = 12000
  pubkey oraclePk,
  bytes assetIdentifier,
  pubkey treasuryPk,
  pubkey borrowerPk
) {
  function mint(int collateralAmount, int syntheticAmount, int currentPrice, signature oracleSig, signature borrowerSig) {
    // Verify oracle signature
    bytes message = sha256(assetIdentifier + int2bytes(tx.time));
    require(checkSigFromStack(oracleSig, oraclePk, message), "Invalid oracle");
    
    // Calculate synthetic value
    int syntheticValue = syntheticAmount * currentPrice / 10000;
    
    // Verify collateralization ratio
    verifyCollateralization(collateralAmount, syntheticValue, minCollateralRatio);
    
    // Verify inputs/outputs, lock collateral, mint tokens
    // ...
  }
  
  function liquidate(...) {
    // Liquidate undercollateralized positions with discount incentive
    // ...
  }
}
```

#### Advanced Features
- **Interest Rate Mechanisms**: Dynamic rates based on collateralization
- **Multi-Collateral Support**: Different risk parameters per collateral type
- **Price Feed Aggregation**: Multiple oracles for reliability

---

### 6. Automated Market Makers (AMMs)

**Decentralized trading protocols using mathematical formulas for pricing**

#### Overview
Recursive covenants enable:
- Self-enforcing liquidity pool contracts
- Continuous market making without intermediaries
- Complex pricing beyond constant product formulas
- Efficient capital with concentrated liquidity

#### Recursive Covenant Mechanism
Script enforces conditions on outputs:
1. Verify state transition from current UTXO to next
2. Ensure same covenant logic applied to next state
3. Maintain mathematical invariants across transactions

#### Basic Constant Product AMM
```javascript
contract ConstantProductAMM(
  bytes32 assetX,
  bytes32 assetY,
  bytes32 lpTokenId,
  int feeRate,  // e.g., 30 = 0.3%
  pubkey server
) {
  function verifyConstantProduct(int reserveX, int reserveY, int newReserveX, int newReserveY) internal {
    // K = x * y should remain constant or increase
    require(newReserveX * newReserveY >= reserveX * reserveY, "Constant product violated");
  }
  
  function addLiquidity(int amountX, int amountY, int mintLPTokens, signature userSig, pubkey user) {
    // Get current reserves
    int reserveX = tx.input.current.reserveX;
    int reserveY = tx.input.current.reserveY;
    int totalLPSupply = tx.input.current.lpSupply;
    
    // Calculate new reserves
    int newReserveX = reserveX + amountX;
    int newReserveY = reserveY + amountY;
    
    // Verify proportional liquidity provision
    // Verify inputs/outputs
    // ...
  }
  
  function swapXforY(int amountX, int minAmountY, signature userSig, pubkey user) {
    // Calculate output with fee
    int amountXWithFee = amountX * (10000 - feeRate) / 10000;
    int numerator = amountXWithFee * reserveY;
    int denominator = reserveX + amountXWithFee;
    int amountYOut = numerator / denominator;
    
    // Verify minimum output
    require(amountYOut >= minAmountY, "Below minimum");
    
    // Verify constant product invariant
    verifyConstantProduct(reserveX, reserveY, newReserveX, newReserveY);
    
    // ...
  }
}
```

#### Advanced Designs
- **Concentrated Liquidity**: Specify price ranges for capital
- **Multi-Asset Pools**: StableSwap with amplification coefficient
- **Customizable Fee Tiers**: Multiple fee levels based on volatility

#### Security Considerations
1. Numerical precision: Prevent rounding exploits
2. Flash loan attacks: Price manipulation prevention
3. Sandwich attacks: Transaction ordering protections
4. Covenant recursion depth: Bounded to prevent exhaustion
5. Liquidity fragmentation: Balance flexibility vs capital efficiency

---

### 7. Prediction Markets

**Decentralized price discovery for future events using LMSR**

#### Overview
Leverages:
- **Logarithmic Market Scoring Rule (LMSR)**: Automated market making with bounded losses
- **Recursive Covenants**: Maintain market invariants across state transitions
- **Control Token Architecture**: State carrying transactions

LMSR provides constant liquidity regardless of volume while ensuring bounded maximum loss.

#### Contract Architecture
Control token carries market state across transactions. State transitions enforced through Taproot key tweaking.

#### LMSR Implementation
```javascript
contract LMSRPredictionMarket(
  bytes32[] outcomeHashes,
  int liquidityParameter,
  int resolutionTime,
  pubkey oracle,
  // State parameters (change with each tx)
  int[] outcomeShares,
  int totalExpSum,
  bool isResolved,
  int winningOutcome
) {
  function buyShares(int outcome, int quantity, int maxCost, signature userSig, pubkey user) {
    // Get current share count
    int currentShare = outcomeShares[outcome];
    
    // Calculate new share and exponential sum
    int newShare = currentShare + quantity;
    int oldExp = expApprox(currentShare, liquidityParameter);
    int newExp = expApprox(newShare, liquidityParameter);
    int newExpSum = totalExpSum - oldExp + newExp;
    
    // Calculate trade cost using LMSR
    int cost = liquidityParameter * (lnApprox(newExpSum) - lnApprox(totalExpSum));
    require(cost <= maxCost, "Cost exceeds maximum");
    
    // Create new contract instance with updated state
    // Verify covenant continuation via Taproot key tweaking
    // ...
  }
  
  function resolve(int resolvedWinningOutcome, bytes resolutionData, signature oracleSig) {
    require(tx.time >= resolutionTime, "Resolution time not reached");
    
    // Verify oracle signature on resolution data
    bytes message = sha256(concat(outcomeHashes[resolvedWinningOutcome], resolutionData, int2bytes(tx.time)));
    require(checkSigFromStack(oracleSig, oracle, message), "Invalid oracle");
    
    // Create resolved covenant state
    // ...
  }
  
  function redeem(int redeemShares, signature userSig, pubkey user) {
    require(isResolved, "Market not resolved");
    
    // Calculate proportional payout
    int payout = (redeemShares * poolValue) / totalWinningShares;
    
    // Verify user burning winning tokens
    // Update remaining pool if shares remain
    // ...
  }
}
```

#### Mathematical Helpers
```javascript
function expApprox(int x, int b) internal returns (int) {
  // Taylor series: e^(x/b) ≈ 1 + x/b + (x/b)²/2 + (x/b)³/6
  // Compiler uses OP_MUL64, OP_DIV64 for overflow safety
  // ...
}

function lnApprox(int x) internal returns (int) {
  // Series expansion: ln(x) ≈ (x-1) - (x-1)²/2 + (x-1)³/3
  // ...
}
```

#### Security Considerations
- **Oracle Manipulation**: Single oracle trades decentralization for simplicity
- **Liquidity Extraction**: LMSR prevents infinite losses, but traders might exploit inefficiencies

---

### 8. Chain Swaps

**Coming Soon** - Secure cross-chain swaps enabling trustless asset exchange between blockchains using advanced cryptographic techniques.

---

### 9. Oracle DLC (Discreet Log Contracts)

**Coming Soon** - Conditional payouts based on external data provided by trusted oracles.

Future topics:
- Setting up oracle connections
- Crafting DLC payout structures
- Settlement and arbitration workflows
- Real-world examples (prediction markets, hedging)

---

## Key Takeaways

### Architecture Principles
1. **VTXO Paradigm**: Dual execution paths (immediate + unilateral fallback)
2. **Recursive Covenants**: Self-enforcing state transitions
3. **Transaction Introspection**: Verify and enforce state transitions
4. **Taproot Key Tweaking**: Efficient contract continuation verification

### Language Features
- **Statically Typed**: Compile-time type checking
- **Bitcoin Script Semantics**: Full compatibility with Bitcoin's UTXO model
- **Modern Syntax**: Inspired by Solidity, CashScript, Ivy
- **Extensive Opcodes**: 64-bit arithmetic, introspection, streaming hashes

### Security Model
- **Trust-Minimized**: Cryptographic guarantees via presigned transactions
- **Detectable Misbehavior**: Operator cannot steal, only delay
- **Unilateral Exit**: Always available after timelock
- **Bounded Losses**: Mathematical invariants enforced (e.g., LMSR)

### Application Patterns
1. **Simple Contracts**: Lightning swaps, Spilman channels, escrow
2. **Intermediate**: Non-interactive swaps, synthetic assets
3. **Advanced**: AMMs with concentrated liquidity, prediction markets with LMSR

### Development Status
- **Early Prototype**: Basic compiler, limited testing tools
- **Experimental**: NOT production-ready
- **Active Development**: Subject to significant changes
- **Repository**: [github.com/arkade-os/compiler](https://github.com/arkade-os/compiler)

---

## Important Reminders

1. **ALL CODE IS EXPERIMENTAL** - For research and exploration only
2. **Preconfirmation vs Finality** - Speed without Bitcoin-level finality until settled onchain
3. **Operator Role** - Can facilitate or delay, cannot steal funds
4. **Misbehavior Detection** - Cryptographically provable and punishable
5. **Unilateral Exit** - Always available via presigned transactions after timelock

---

## Next Steps: Continue Learning

Ready for more documentation batches to complete the comprehensive understanding of Arkade!

