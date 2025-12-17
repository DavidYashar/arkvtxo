# Arkade Learning Notes - Batch 1

## Studied Documents:
- https://docs.arkadeos.com/primer
- https://docs.arkadeos.com/learn/pillars/vtxos
- https://docs.arkadeos.com/learn/pillars/batch-outputs
- https://docs.arkadeos.com/learn/pillars/batch-expiry
- https://docs.arkadeos.com/learn/pillars/arkade-tx
- https://docs.arkadeos.com/learn/pillars/virtual-mempool
- https://docs.arkadeos.com/learn/pillars/batch-swaps
- https://docs.arkadeos.com/learn/pillars/connectors
- https://docs.arkadeos.com/learn/security/unilateral-exit
- https://docs.arkadeos.com/learn/security/transaction-finality
- https://docs.arkadeos.com/learn/security/liveness
- https://docs.arkadeos.com/learn/security/advanced-security
- https://docs.arkadeos.com/learn/security/risks-limitations

---

## Overview
Arkade is a Bitcoin execution layer that creates a programmable environment through a client-server architecture. It requires no consensus changes to Bitcoin and is available today.

## Core Architecture

### Client-Server Model
- Users/applications cooperate through an operator to access programmable Bitcoin
- Operator creates batch outputs, facilitates offchain transactions, and provides liquidity
- Users maintain sovereignty over funds with strict boundaries on operator control

### Virtual Transaction Outputs (VTXOs)
- Offchain abstractions mirroring Bitcoin's UTXO model
- Presigned Bitcoin transactions representing claims to portions of batch outputs
- Two spending paths:
  1. **Collaborative path**: Requires user + operator signatures (default, instant)
  2. **Unilateral exit path**: User-only control after CSV timelock delay
- States: Preconfirmed, Unconfirmed, Confirmed/Settled, Recoverable, Spent
- Include expiration mechanism tied to batch output lifetime

### Batch Outputs
- Single onchain UTXO containing multiple users' ownership claims
- Uses n-of-n MuSig2 multisig with all VTXO owners + operator
- Two script paths: sweep path (operator after expiry) and unroll path (splits into VTXO branches)
- Virtual transaction tree structure with VTXOs as leaves
- Selective unrolling enables independent exits without affecting others

### Batch Expiry
- VTXOs expire after defined timebound window
- Users must renew via batch swap to maintain unilateral exit rights
- Creates liveness requirement
- Delegation solutions available (wallet providers, third-party services, self-hosted)
- Expired VTXOs result in operator control, with recoverable Arkade Notes issued

## Offchain Execution

### Virtual Mempool
- DAG (Directed Acyclic Graph) structure for transaction organization
- Enables parallel execution of independent transaction branches
- No global state bottlenecks
- Process: Validation → Cosigning by Arkade Signer → Immediate DAG update
- Transactions instantly spendable upon cosigning

### Arkade Transactions
- Virtual Bitcoin transactions executing offchain
- Consume VTXOs as inputs, produce new VTXOs as outputs
- Instant confirmation through operator cosignature (preconfirmation)
- Support unlimited transaction chaining
- Follow Bitcoin Script semantics
- Longer chains increase unilateral exit costs

## Settlement & Finality

### Transaction Finality Levels
1. **Preconfirmation**: 
   - Instant execution with operator cosignature
   - Requires trust in operator integrity
   - VTXOs immediately spendable offchain
   - Risk of operator double-signing

2. **Bitcoin Finality**:
   - Achieved via batch swap (onchain commitment transaction)
   - Inherits Bitcoin's immutability and censorship resistance
   - Full security guarantees

### Batch Swaps
- Atomic process to transition VTXOs from preconfirmed to Bitcoin-settled
- Three reasons to settle: reduce trust surface, reset chain depth, renew VTXOs
- Process:
  1. Users submit intents (BIP322-based ownership proofs)
  2. Operator constructs commitment transaction (batch output + connector output)
  3. Virtual transaction tree setup with exit paths
  4. Forfeit transactions link old/new states
  5. Signing phase (users + Arkade Signer)
  6. Broadcast to Bitcoin

### Commitment Transactions
- Single onchain footprint containing:
  - Batch output (encapsulates multiple VTXOs in tree structure)
  - Connector output (dust-amount for atomicity via forfeit txs)

### Forfeit Transactions
- Enable atomic batch swaps
- Relinquish old VTXOs to operator only if new batch confirms onchain
- Inputs: VTXO being swapped + connector input
- Outputs: Forfeit output (to operator) + anchor output (CPFP fee bumping)

### Connectors
- Dust-amount outputs in commitment transactions
- Serve as inputs for forfeit transactions
- Ensure atomicity - operator can only claim forfeited VTXOs after broadcasting commitment tx
- Tree structure mapping one dust output to each VTXO requiring forfeit protection

## Security Properties

### Unilateral Exit
- Users can exit to Bitcoin without operator cooperation
- Requires broadcasting complete transaction path from batch output to specific VTXO
- Exit costs scale with chain length (depth in virtual tree)
- Base cost: 1 Bitcoin tx fee per level in tree
- Economic incentives to periodically refresh via batch settlement
- Presigned transactions ensure sovereignty

### Liveness Requirements
1. **Operator Liveness**: 
   - Downtime prevents new transactions but doesn't affect fund safety
   - Unilateral exit always available regardless of operator status

2. **User Liveness**: 
   - Must renew VTXOs before expiry
   - Can be delegated without losing sovereignty
   - Expired VTXOs lose unilateral exit capability

### Advanced Security Mechanisms

#### Arkade Signer
- Separate module from operator with isolated signing authority
- Single signing key protected in TEE (Trusted Execution Environment)
- Users communicate directly via E2EE
- Prevents operator from accessing keys or censoring transactions

#### Verifiable Execution
- TEE isolation prevents key exfiltration/tampering
- Remote attestation via open-source software and reproducible builds
- Cryptographic proof of expected code execution

#### End-to-End Encryption
- E2EE between users and Arkade Signer
- Operator cannot see transaction content or block based on content
- Protects against censorship and surveillance

#### Slashing
- Operator stakes Bitcoin collateral locked to Arkade Signer pubkey
- Double-signing triggers automatic collateral burn
- Economic deterrence against misbehavior

### Risk & Limitations

#### Mass Exit Scenarios
- Triggered by operator failure, regulatory intervention, or vulnerabilities
- Challenge: high Bitcoin fees make exits expensive, especially for small VTXOs
- Longer VTXO chains = higher exit costs
- Operators incentivized to restore service quickly (lost revenue)

#### Arkade Signer Compromise
- TEE breach could enable double-signing attacks
- Creates irreconcilable ownership disputes
- Detection via remote attestation failures
- Requires system halt and emergency exits

## User Journey

1. **Boarding**: Send Bitcoin to boarding addresses → operator converts to VTXOs in batch
2. **Offchain Activity**: Transact in Virtual Mempool with parallel execution
3. **Settlement**: Choose between preconfirmation speed or Bitcoin finality via batch swap
4. **Exit**: Unilateral (no operator needed) or collaborative (default, requires operator)

## Key Design Principles

- **No global state**: UTXO model enables parallel execution without bottlenecks
- **Dynamic settlement**: Users control when/if to anchor to Bitcoin
- **Self-custodial**: Users always maintain control via presigned exit transactions
- **Efficient batching**: Thousands of operations compress into single blockchain entry
- **Bitcoin Script compatibility**: Full programmability with familiar semantics

## Important Considerations

- Deep transaction chains increase unilateral exit costs
- Preconfirmed VTXOs require operator honesty until batch swapped
- Liveness requirement can be delegated without losing sovereignty
- Sub-dust VTXOs valid offchain but cannot be exited unilaterally
- VTXO expiry creates natural incentives for periodic settlement

---

## Next Batch: Ready for more documents
---

## Compiler Update (November 25, 2025)

### ✅ Arkade Compiler is Now Publicly Available

**Repository**: https://github.com/arkade-os/compiler

**Status**: 
- Successfully installed and built
- Binary located at: `arkade-compiler/target/release/arkadec`
- Rust-based compiler (Cargo v1.91.1)

**What It Can Do**:
- Compile `.ark` → `.json` artifacts
- Basic contracts (HTLC, simple VTXOs)
- Signature verification (`checkSig`, `checkMultisig`)
- Timelock checks (`tx.time >= value`)
- Hash preimage verification (`sha256(preimage) == hash`)

**What It Cannot Do Yet**:
- Transaction introspection (`tx.outputs[0].scriptPubKey`)
- Internal helper functions
- Script constructors (`new P2TR()`)
- Covenant enforcement logic
- Recursive contract patterns
- Complex arithmetic/comparisons

**Verdict**: **Early prototype stage** - Can compile simple contracts but not sophisticated token contracts with state-carrying VTXOs and recursive covenants.

### Impact on Token Implementation

Our token contracts (`FungibleToken.ark`, `TokenMetadata.ark`) **cannot be compiled yet** because they use:
- Transaction introspection for covenant enforcement
- Helper functions like `generateTokenScript()`
- Script constructors for Taproot outputs
- Advanced validation logic

### Recommended Path Forward

**Option C: VTXO Metadata Approach (Immediate)**
- Embed token data in VTXO tapscript leaves
- Server validates operations
- No compiler dependency
- Working product in 3-5 days
- Migration path to contracts when compiler matures

**Option A: Wait for Compiler (Future)**
- Monitor arkade-os/compiler repository
- Migrate when transaction introspection support added
- Timeline: Unknown (months?)

See `arkade-contracts/COMPILER_STATUS.md` for detailed analysis.
