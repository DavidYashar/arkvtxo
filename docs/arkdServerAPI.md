# Arkd Server and API Reference Documentation

**⚠️ WARNING: arkd is currently in alpha stage. It has undergone limited mainnet testing and should be considered experimental.**

## Table of Contents
1. [What is arkd](#what-is-arkd)
2. [Arkade Workflows](#arkade-workflows)
   - [Boarding](#boarding-arkade)
   - [Offchain Execution](#offchain-execution)
   - [Onchain Settlement](#onchain-settlement)
   - [Exiting](#exiting-arkade)
3. [API Layer Services](#api-layer-services)
   - [Overview](#overview)
   - [ArkService](#arkservice)
   - [IndexerService](#indexerservice)
4. [Components](#components)
   - [Scheduled Sessions](#scheduled-sessions)
   - [Intent System](#intent-system)
   - [Intent Delegation](#intent-delegation)
   - [Arkade Notes](#arkade-notes)
   - [Arkade PSBTs](#arkade-psbt-extensions)
5. [Server Security](#server-security)
   - [Forfeit Transactions](#forfeit-transactions)
   - [Checkpoint Transactions](#checkpoint-transactions)

---

## What is arkd

### Overview
`arkd` is the backbone of an Arkade instance, built on top of the Ark protocol. It facilitates **offchain transaction execution**, coordinates **onchain settlement**, and manages VTXOs through the **Intent System**.

### Core Architecture
`arkd` consists of two main executable processes:
- **`arkd`** - The primary server process that hosts all core services, manages the Virtual Mempool and the coordination for onchain settlements
- **`arkd-wallet`** - A separate wallet service process that provides Bitcoin wallet functionality and liquidity

**Supported Networks**: regtest, testnet3, signet, mutinynet, and has undergone mainnet testing.

### Main API Layer Services
The `arkd` server is always-on and exposes two public gRPC services for Arkade clients:
1. **ArkService** - Handles batch processing, intent registration, and multi-party signing
2. **IndexerService** - Provides data queries for VTXOs, transaction history, and real-time subscriptions

### Design Principles
The codebase follows a layered architecture with clear separation of concerns:
- **Application Layer** ([internal/core/application/](https://github.com/arkade-os/arkd/tree/4cabf95f33b0196c47518425e92efc089636aa20/internal/core/application)): Implements core business logic and service operations
- **Domain Layer** ([internal/core/domain/](https://github.com/arkade-os/arkd/tree/4cabf95f33b0196c47518425e92efc089636aa20/internal/core/domain)): Contains models, events, and domain rules
- **Ports Layer** ([internal/core/ports/](https://github.com/arkade-os/arkd/tree/4cabf95f33b0196c47518425e92efc089636aa20/internal/core/ports)): Defines interfaces for external dependencies
- **Infrastructure Layer** ([internal/infrastructure/](https://github.com/arkade-os/arkd/tree/4cabf95f33b0196c47518425e92efc089636aa20/internal/infrastructure)): Provides concrete implementations of port interfaces

---

## Arkade Workflows

### Boarding Arkade

#### What is Boarding?
Boarding enables users to bring external Bitcoin UTXOs into Arkade's execution environment and receive programmable Virtual Transaction Outputs (VTXOs) in return. This operation is coordinated through the **Intent System** and settles atomically within Arkade's standard batch processing flow.

#### Client API Overview
Clients interact with boarding functionality primarily through the **ArkService** gRPC interface. The service provides both gRPC and REST endpoints for all boarding operations.

#### Getting Boarding Configuration
Clients first need to understand the boarding parameters by calling `GetInfo()` which returns [GetInfoResponse](https://github.com/arkade-os/arkd/blob/4cabf95f33b0196c47518425e92efc089636aa20/api-spec/protobuf/ark/v1/service.proto#L127-L142) server configuration parameters like:
- Network settings
- Amount limits
- Timeouts (e.g. expiry, exit delays)
- Operator's signer key
- Current protocol version

#### Boarding Address Generation
Clients generate a boarding address with two script paths:
1. **User + Server** (collaborative)
2. **User + CSV** (unilateral exit after timeout)

Then send Bitcoin to that address.

**Reference**: [Ramps: Boarding Arkade - How to use a ramp for boarding Arkade](https://docs.arkadeos.com/wallets/v0.3/ramps#boarding)

#### Intent Registration and Batch Processing Participation
After funding the boarding address, clients participate in the standard batch processing flow:

1. **Registration**: Client registers an intent through `RegisterIntent()` with boarding inputs and a `BIP322` signature
2. **Confirmation**: Client confirms participation via `ConfirmRegistration()`
3. **Tree Signing**: Client submits nonces and signatures for the MuSig2 protocol
4. **Forfeit Transaction Submission**: Client submits signed forfeit transactions
5. **Commitment Transaction Signing**: Client signs commitment transaction for boarding inputs

The server validates boarding inputs during commitment transaction creation via [validateBoardingInput](https://github.com/arkade-os/arkd/blob/4cabf95f33b0196c47518425e92efc089636aa20/internal/core/application/service.go#L2211-L2284).

#### Event Stream Monitoring
Clients can monitor the boarding progress through `GetEventStream()`, which returns [GetEventStreamResponse](https://github.com/arkade-os/arkd/blob/4cabf95f33b0196c47518425e92efc089636aa20/api-spec/protobuf/ark/v1/service.proto#L191-L202) and provides real-time updates about batch processing phases and transaction confirmations.

**💡 TIP**: From the client perspective, boarding is seamlessly integrated into the standard Arkade transaction flow. No special boarding APIs are needed; clients include their Bitcoin UTXOs as inputs in their intents and follow the existing batch processing protocol.

---

### Offchain Execution

#### Overview
When transacting on Arkade, VTXOs don't need to be settled to Bitcoin with every transfer. Instead, they can remain offchain until the latest recipient decides to anchor them to Bitcoin for finality.

Such offchain transactions are processed in the **virtual mempool** and receive **preconfirmation status** through the Arkade operator cosigning the VTXO transfer.

#### Client Workflow: Transacting Offchain on Arkade

To spend offchain, the client sends a [SubmitTxRequest](https://github.com/arkade-os/arkd/blob/4cabf95f33b0196c47518425e92efc089636aa20/api-spec/protobuf/ark/v1/service.proto#L204-L207) with:
- A signed Arkade transaction
- Unsigned checkpoint transactions

**Process**:
1. The server verifies them and responds with:
   - The fully signed Arkade transaction
   - Its ID
   - Partially signed checkpoint transactions
2. The client adds the missing checkpoint signatures
3. The client finalizes the process via [FinalizeTx](https://github.com/arkade-os/arkd/blob/4cabf95f33b0196c47518425e92efc089636aa20/api-spec/protobuf/ark/v1/service.proto#L214-L217), sending the fully signed checkpoint transactions to the ArkService
4. Once the server verifies the final signatures, the spend is **preconfirmed**

![Sequence Diagram Offchain Transaction](https://mintcdn.com/arkade/fcFVDQ_Y_9hCg2a1/images/ark/sequenceoffchainlight.png?w=1650&fit=max&auto=format&n=fcFVDQ_Y_9hCg2a1&q=85&s=520eba9a95aeb2974ff2adada3464d97)

#### Workflow Monitoring
While the **IndexerService** doesn't directly handle offchain execution, it provides supporting query functions:

**VTXO Monitoring**:
- `GetVirtualTxs`: Retrieves virtual transactions in hex format for specified transaction IDs
- `GetVtxos`: Queries VTXO states by scripts or outpoints
- `GetVtxoChain`: Traces transaction chains for specific VTXOs

**Script Subscriptions**:
- `SubscribeForScripts`: Subscribe to notifications for specific VTXO scripts
- `GetSubscription`: Receive real-time notifications about subscribed scripts

**💡 TIP**: The IndexerService serves as a complementary query layer that clients can use to monitor the results of offchain transactions processed through the ArkService, but it's not part of the core offchain execution flow itself.

---

### Onchain Settlement

#### Overview
Offchain Arkade transactions in the virtual mempool operate under the **preconfirmation trust model**. If a user wants full **Bitcoin finality** for their funds, they need to settle them onchain via a **batch swap**.

Users accomplish this by submitting an **intent** that specifies:
- Which VTXOs they forfeit
- Which VTXOs they expect to receive in the upcoming batch

The operator coordinates the settlement process and broadcasts the associated **commitment transaction** onchain.

**💡 TIP**: Users can safely sign forfeit transactions because the commitment transaction atomically creates both the new VTXOs and the connector output that enables the operator to claim forfeited funds.

#### Client Workflow: Participating in a Batch Swap

![Sequence Diagram Onchain Transaction](https://mintcdn.com/arkade/RGSGoSsbs6NbQwBg/images/ark/sequenceonchainlight.png?w=1650&fit=max&auto=format&n=RGSGoSsbs6NbQwBg&q=85&s=b571bd0ca330766cee93a0339153d2a7)

##### Step by Step:

**1. Initial Setup and Information Gathering**
To participate in a batch swap, users begin by querying the server through the [GetInfo](https://github.com/arkade-os/arkd/blob/4cabf95f33b0196c47518425e92efc089636aa20/api-spec/protobuf/ark/v1/service.proto#L10-L13) endpoint to retrieve ([GetInfoResponse](https://github.com/arkade-os/arkd/blob/4cabf95f33b0196c47518425e92efc089636aa20/api-spec/protobuf/ark/v1/service.proto#L128-L143)) essential network parameters like:
- Round intervals
- Exit delays
- Amount limits

**2. Intent Registration**
- Client creates and registers an intent ([RegisterIntent](https://github.com/arkade-os/arkd/blob/4cabf95f33b0196c47518425e92efc089636aa20/api-spec/protobuf/ark/v1/service.proto#L145-L148)) as a PSBT signed with `BIP322`, defining inputs and outputs
- Server stores it under a unique `intent_id`
- Client can revoke an intent via `DeleteIntent`

**3. Batch Updates & Confirmation**
- Once selected for batch participation, client subscribes to [GetEventStream](https://github.com/arkade-os/arkd/blob/4cabf95f33b0196c47518425e92efc089636aa20/api-spec/protobuf/ark/v1/service.proto#L188-L202) for batch updates
- Client confirms participation ([ConfirmRegistration](https://github.com/arkade-os/arkd/blob/4cabf95f33b0196c47518425e92efc089636aa20/api-spec/protobuf/ark/v1/service.proto#L38-L45)) via the `intent_id`

**4. Tree Signing & Multi-Signature Coordination (MuSig2)**
- Server builds unsigned VTXO tree, commitment transaction, and connector outputs
- Server sends unsigned VTXO tree and commitment transaction to client
- Client verifies data and creates random nonces for every branch transaction
- Client submits tree nonces (`SubmitTreeNonces`)
- Server verifies tree nonces, aggregates and returns them
- Client submits tree signatures (`SubmitTreeSignatures`)
- Server verifies, aggregates and finalizes via signing the VTXO tree and connectors and returning them to the client
- Client verifies data

**5. Forfeit Transaction Handling**
- Client creates forfeit transactions with connector outputs
- Client submits signed forfeit transactions (`SubmitSignedForfeitTxs`)
- If initial boarding, users also sign the commitment transaction

**6. Onchain Broadcast**
Server broadcasts the signed commitment transaction on the Bitcoin mainchain.

**💡 TIP**: VTXO renewal undergoes the exact same process of participating in a batch swap. The renewal can either be done manually (which implies a liveness requirement of the user) or be delegated to a third party without key handoff.

#### Workflow Monitoring
The actual offchain execution workflow uses the ArkService. While the **IndexerService** doesn't directly handle offchain execution, it provides several supporting query functions:

**Commitment Tx Analysis**:
- `GetCommitmentTx`: Returns details of a commitment transaction (TxId), including batches, amounts, and timestamps
- `GetForfeitTxs`: Returns forfeit transactions linked to a commitment transaction
- `GetConnectors`: Returns the connector output tree with positioning details for a commitment transaction

**VTXO Monitoring**:
- `GetVirtualTxs`: Retrieves virtual transactions in hex format for specified transaction IDs
- `GetVtxos`: Queries VTXO states by scripts or outpoints
- `GetVtxoChain`: Traces transaction chains for specific VTXOs

**Transaction History**:
- `GetVirtualTxs`: Returns raw virtual transactions for given Arkade transaction IDs
- `GetVtxoChain`: Traces the lineage of Arkade transactions from a VTXO leaf spend to a specified VTXO outpoint, enabling full history reconstruction

**Batch Operations**:
- `GetBatchSweepTransactions`: Returns transactions swept from a given batch output, indicating whether the operator claimed it after expiry or a user unrolled the tree

**Script Subscriptions**:
- `SubscribeForScripts`: Subscribe to notifications for specific VTXO scripts
- `GetSubscription`: Receive real-time notifications about subscribed scripts

---

### Exiting Arkade

#### Overview
Offboarding enables users to convert their Virtual Transaction Outputs (VTXOs) back into standard Bitcoin UTXOs, allowing them to withdraw funds from Arkade's execution environment to the base layer. Users can choose between two main offboarding mechanisms: **collaborative** or **unilateral exit** (force redemption).

#### Client API Overview
Clients interact with exit functionality primarily through the **ArkService**. The service provides both gRPC and REST endpoints for all exit operations.

#### Getting Configuration
Clients first need to understand the parameters by calling `GetInfo()` which returns [GetInfoResponse](https://github.com/arkade-os/arkd/blob/4cabf95f33b0196c47518425e92efc089636aa20/api-spec/protobuf/ark/v1/service.proto#L127-L142) server configuration parameters.

#### Collaborative Exit Process
The preferred offboarding method where the operator cooperates to create an exit transaction:

1. **Offboarding Request**: Client calls [CollaborativeExit](https://github.com/arkade-os/arkd/blob/4cabf95f33b0196c47518425e92efc089636aa20/pkg/ark-cli/main.go#L412-L420) with onchain destination address and amount
2. **Tx creation**: The server creates an exit transaction spending selected VTXOs
3. **Batch Processing**: The exit is processed in the next batch round following the standard batch processing flow
4. **Settlement**: The exit transaction is broadcast and confirmed onchain

**Reference**: [Ramps: How to use a ramp for offboarding Arkade](https://docs.arkadeos.com/wallets/v0.3/ramps#exiting)

#### Unilateral Exit Process
When a collaborative exit fails or the operator is unresponsive, clients can force exit:

1. **Unroll Initiation**: Client initiates unilateral exit using the [--force flag](https://github.com/arkade-os/arkd/blob/4cabf95f33b0196c47518425e92efc089636aa20/pkg/ark-cli/main.go#L395-L397)
2. **Timelock Wait**: Client must wait for the unilateral exit delay period to expire
3. **Completion**: After timelock expires, client completes the exit ([`arkSdkClient.CompleteUnroll`](https://github.com/arkade-os/arkd/blob/4cabf95f33b0196c47518425e92efc089636aa20/pkg/ark-cli/main.go#L399-L407))

#### Exit Types and CLI Usage

**Collaborative Exit with Change**:
```bash
ark-cli redeem --amount 1000 --address <destination> --password <pwd>
```

**Collaborative Exit with full Balance**:
```bash
ark-cli redeem --amount <full_amount> --address <destination> --password <pwd>
```

**Unilateral Exit**:
```bash
ark-cli redeem --force --password <pwd>  
ark-cli redeem --complete --address <destination> --password <pwd>
```

#### Event Stream Monitoring
Clients can monitor exit progress through `GetEventStream()`, which returns [GetEventStreamResponse](https://github.com/arkade-os/arkd/blob/4cabf95f33b0196c47518425e92efc089636aa20/api-spec/protobuf/ark/v1/service.proto#L191-L202) and provides real-time updates about batch processing phases and transaction confirmations.

---

## API Layer Services

### Overview

The Arkade API layer is composed of two complementary services through which clients interact with the Arkade Operator:

#### ArkService
[ArkService](https://github.com/arkade-os/arkd/blob/72ea52fed01190a472ecbabffa06911d69a94377/api-spec/protobuf/ark/v1/service.proto#L125) – the primary access point for real-time coordination, batch participation, intent management, and transaction submission. It enables clients to:
- Register intents
- Coordinate multi-party batches
- Sign with MuSig2
- Spend VTXOs without relinquishing control of their funds

Event-driven endpoints like `GetEventStream` and `GetTransactionsStream` let clients stay synchronized with network activity.

#### IndexerService
[IndexerService](https://github.com/arkade-os/arkd/blob/72ea52fed01190a472ecbabffa06911d69a94377/api-spec/protobuf/ark/v1/indexer.proto#L121) – optimized for historical queries, auditing, and VTXO tree navigation. It provides functions for:
- VTXO lifecycle analysis
- Chain tracing
- Sweep monitoring
- Connector tree exploration

Use it to reconstruct offchain state, audit fund flows, and handle data-rich workflows.

#### Key Features
- All endpoints are available over **gRPC** and **REST**
- Follow consistent RESTful conventions with pagination
- Use **BIP322-compatible signatures** for secure proof of ownership
- Builders can combine real-time streams with script-level subscriptions for reactive applications
- Batch sweep tracking provides visibility into operator claims and onchain unroll scenarios

#### Complete Interfaces
The complete interfaces for both services are defined in the [protocol buffer specification](https://github.com/arkade-os/arkd/tree/master/api-spec/protobuf) and are available in the buf.build registry:
- [buf.build ArkService interface](https://buf.build/arkade-os/arkd/docs/fcb9f21ef69836e8ddadc2d070deb0c5be139336:ark.v1#ark.v1.ArkService) [(+ API reference)](https://docs.arklabs.xyz/integrate/api#tag/ArkService)
- [buf.build IndexerService interface](https://buf.build/arkade-os/arkd/docs/fcb9f21ef69836e8ddadc2d070deb0c5be139336:ark.v1#ark.v1.IndexerService) [(+ API reference)](https://docs.arklabs.xyz/integrate/api/#tag/IndexerService)

**💡 TIP**: Use **ArkService** for coordination, signing, and settlement and use **IndexerService** for querying, tracing, and auditing.

---

### ArkService

#### Overview
The [ArkService](https://github.com/arkade-os/arkd/blob/72ea52fed01190a472ecbabffa06911d69a94377/api-spec/protobuf/ark/v1/service.proto) handles the core business logic of the Ark protocol's batch processing system. Operations encompass:
- Onchain batch coordination and settlement
- Coordination of multi-party signing sessions using MuSig2
- Intent management
- Offchain VTXO spending operations

It provides a comprehensive set of gRPC and REST endpoints to facilitate client-side coordination.

**💡 TIP**: API references can be found [here](https://docs.arklabs.xyz/integrate/api#tag/ArkService) and a set of tools to handle protobuf specifications can be found [here](https://buf.build/arkade-os/arkd/docs/fcb9f21ef69836e8ddadc2d070deb0c5be139336:ark.v1#ark.v1.ArkService).

#### API Layer Logic

The `ArkService` abstracts much of the protocol logic, helping builders focus on client experiences.

| Category | Methods | Description |
|----------|---------|-------------|
| System Information | GetInfo | Server parameters and network information |
| Intent Management | RegisterIntent, DeleteIntent | Client intent registration |
| Batch Participation | ConfirmRegistration, GetEventStream | Multi-party batch processing coordination |
| Tree Signing | SubmitTreeNonces, SubmitTreeSignatures | MuSig2 multi-signature coordination |
| Forfeit Management | SubmitSignedForfeitTx | Forfeit tx submission and retrieval |
| Offchain Execution | SubmitTx, FinalizeTx | Offchain tx submission and finalization |
| Real-time Updates | GetTransactionsStream | Live tx notifications |

**⚠️ WARNING**: Building without the SDKs still requires a solid understanding of how to create, validate, and process batch events.

#### Notes for Builders

- The [complete ArkService interface is defined in the Protocol Buffers specification](https://github.com/arkade-os/arkd/blob/72ea52fed01190a472ecbabffa06911d69a94377/api-spec/protobuf/ark/v1/service.proto)
- All endpoints follow RESTful conventions using HTTP annotations
- Query `GetInfo` to verify server compatibility, network type, and version information before establishing connections
- `arkv1.GetEventStream` and `arkv1.GetTransactionsStream` are server-side streaming RPCs for event-driven clients that should be run in background processes to react in real-time
- All client-side operations involving intent submission should be signed using BIP322-compatible wallets
- Intent registration and confirmation are critical steps before a client can participate in a settlement

**💡 TIP**: The `ArkService` is complementary to the **IndexerService**. Use the `ArkService` for real-time updates and the `IndexerService` for historical transaction data and detailed analysis.

---

### IndexerService

#### Overview
The [IndexerService](https://github.com/arkade-os/arkd/blob/72ea52fe/api-spec/protobuf/ark/v1/indexer.proto#L7-L121) exposes a set of gRPC and REST endpoints that allow clients to:
- Query commitment transactions
- Inspect VTXO trees
- Monitor forfeit and sweep transactions
- Subscribe to real-time updates for script activity

The `IndexerService` supports both **point-in-time queries** and **real-time subscriptions**.

**💡 TIP**: API references can be found [here](https://docs.arklabs.xyz/integrate/api/#tag/IndexerService) and a set of tools to handle protobuf specifications can be found [here](https://buf.build/arkade-os/arkd/docs/fcb9f21ef69836e8ddadc2d070deb0c5be139336:ark.v1#ark.v1.IndexerService).

#### API Layer Logic

Client applications use the `IndexerService` to:

| Category | Methods | Description |
|----------|---------|-------------|
| Commitment Data | GetCommitmentTx, GetForfeitTxs, GetConnectors | Commitment tx analysis |
| VTXO Management | GetVtxos, GetVtxoTree, GetVtxoTreeLeaves | VTXO lifecycle and tree navigation |
| Transaction History | GetVtxoChain, GetVirtualTxs | Transaction chain analysis |
| Batch Operations | GetBatchSweepTransactions | Batch settlement tracking |
| Real-time Monitoring | SubscribeForScripts, GetSubscription | Script-based event subscriptions |

**💡 TIP**: This service is essential for builders who want to provide visibility into user funds, transaction history, or batch-level activity without relying on custom indexers or database infrastructure.

#### Notes for Builders

- Use script-level subscriptions to drive reactive clients or backend workflows
- VTXO queries and chain tracing allow for full lifecycle auditing of offchain funds
- Tree navigation is optimized - use `GetVtxoTreeLeaves` for efficiency when you only need final outputs, not the full tree structure
- Batch sweep tracking helps monitor operator claims - `GetBatchSweepTransactions` shows normal vs. partial sweep scenarios when leaves are unrolled onchain
- Real-time subscriptions are stateful - manage the subscription lifecycle with `SubscribeForScripts` / `UnsubscribeForScripts` before using `GetSubscription` streams
- All methods support both gRPC and REST interfaces through auto-generated gateway mappings
- All endpoints are paginated and follow REST conventions

**💡 TIP**: The `IndexerService` is complementary to the **ArkService**. Use the `IndexerService` for historical transaction data and detailed analysis and `ArkService` for real-time updates.

---

## Components

### Scheduled Sessions

#### Overview
Scheduled Sessions are configurable time windows in `arkd` during which the Arkade operator may offer **lower or zero-fee settlements**. They operate in addition to periodic settlement sessions, creating synchronized periods where many clients settle at the same time.

By participating in scheduled sessions, clients can take advantage of reduced or waived fees while helping aggregate activity into fewer onchain transactions, improving efficiency for both users and the operator.

#### Configuration
Scheduled Sessions are defined via [ScheduledSessionConfig](https://github.com/arkade-os/arkd/blob/e16538b52131080ef247f6fed176db0d15a378bc/api-spec/protobuf/ark/v1/admin.proto#L212-L220):

```go
message ScheduledSessionConfig {
  int64 start_time = 1;
  int64 end_time = 2;
  int64 period = 3;
  int64 duration = 4;
  int64 round_min_participants_count = 5;
  int64 round_max_participants_count = 6;
  FeeInfo fees = 7;
}
```

#### Key Parameters
- `start_time`: Start of scheduled session (Unix timestamp)
- `end_time`: End of scheduled session (Unix timestamp)
- `period`: Time interval between scheduled sessions (in seconds)
- `duration`: Duration of a scheduled session
- `round_min_participants_count`: Lower threshold for the number of users required for a scheduled session
- `round_max_participants_count`: Upper threshold for the number of users allowed for a scheduled session
- `fees`: Fee structure applied during the scheduled session (e.g. discounted or zero-fee rates)

By aligning client operations within these shared windows, scheduled sessions provide a more efficient and predictable framework for transaction processing in Arkade.

**💡 TIP**: Clients can query the `ArkService` via `GetInfo` which will return the announced session times.

---

### Intent System

#### Overview
When a user wants to settle their funds onchain via a **batch swap**, they submit an **intent** to the operator. Arkade intents are valid-but-unmineable Bitcoin transactions that encode:
- An ownership proof of the inputs a user wants to redeem (whether it's offchain VTXOs, an onchain UTXO, or recoverable coins)
- The outputs they wish to receive

Arkade intents are based on **BIP322**, a standardized Bitcoin message signing protocol. The system was introduced with the [v0.7.0 arkd release](https://github.com/arkade-os/arkd/releases/tag/v0.7.0?ref=blog.arklabs.xyz).

**💡 TIP**: The usage of BIP322 enables users to choose between renewing their expiring offchain funds themselves or delegating the renewal of such VTXOs. The delegated intent workflow can be found under [Intent Delegation](#intent-delegation).

#### Intent Structure

**Intent structure**:
Top-level fields that define the intent, including:
- Input VTXOs to spend
- Receiver outputs
- Intent message with execution parameters

**Receiver Structure**:
Format for specifying destination:
- Onchain address (for settlement to Bitcoin)
- Offchain pubkey (for VTXO transfer)

**IntentMessage Format**:
Captures execution parameters and the intent's validity window:
- Valid from timestamp
- Expiration timestamp
- Fee parameters
- Additional metadata

#### Intent Lifecycle

The Arkade event stream (`GetEventStream`) is a server-side streaming RPC method in the **ArkService** that provides real-time batch processing coordination events to clients including batch start, finalization, and failure notifications. The server uses this stream to indicate the next required action and corresponding API call.

**Full Intent lifecycle**:

**1. Create a BIP322 Signature**
Intents use BIP322 message signing protocol for proving ownership of coins.

Code example: BIP322 signature implementation from the TS-SDK

The `create` function takes a string message corresponding to the associated action described below ("Register" or "Delete").

**2. Register an Intent**
The core of intent registration is the `RegisterIntentRequest` which contains:
- A `Bip322Signature` field
- An intent message

The server then responds with a `RegisterIntentResponse` containing an `intent_id` string for tracking.

**3. Confirm Registration**
After receiving a `BatchStartedEvent` containing their intent ID hash, clients must call `ConfirmRegistration` with a `ConfirmRegistrationRequest` containing the `intent_id` to confirm participation. The server responds with an empty `ConfirmRegistrationResponse`.

**4. Delete Intent**
The `DeleteIntent` method accepts a `DeleteIntentRequest` with a `Bip322Signature` proof that demonstrates ownership of any input VTXOs from the original intent. The server responds with an empty `DeleteIntentResponse` upon successful deletion.

#### Recovery Mechanisms

The intent system provides additional options for edge cases like recoverable VTXOs:

- **Expired VTXOs**: Recover unspent and swept VTXOs ([recoverVtxos](https://github.com/arkade-os/arkd/blob/4cabf95f33b0196c47518425e92efc089636aa20/pkg/ark-cli/main.go#L423-L439))
- **Note Redemption**: Redeem Arkade notes ([redeemNotes](https://github.com/arkade-os/arkd/blob/4cabf95f33b0196c47518425e92efc089636aa20/pkg/ark-cli/main.go#L441-L459))
- **Sub-dust VTXOs**: Amounts below the Bitcoin dust threshold ([`SubDustScript`](https://github.com/arkade-os/arkd/blob/1d45ead6c3ec18bfe281baae5093000f56ffff3a/internal/core/application/service.go#L2257-L2258))

---

### Intent Delegation

#### Overview
Since Arkade batches expire, VTXOs need to be renewed regularly to enforce users' unilateral spending rights. To address the associated liveness challenges, **VTXO renewal can be delegated without the user relinquishing control over their funds**.

#### Intent Construction and Hand-Off

To delegate VTXO renewal, a user creates an **intent** which defines and locks in the exact inputs and outputs of a future transaction. This signed package includes a BIP322 signature and is bound by a `valid_at` and `expire_at` window, ensuring the delegate can only submit it within a specified timeframe.

The user eventually hands this intent to the delegate, who is responsible for submitting it to the Arkade server just before VTXO expiration.

**When a user registers an intent, they must inform the delegate and provide it with**:
1. The associated taproot address (so the delegate knows which VTXOs to watch, using IndexerService)
2. The taproot script tree (so the delegate can construct spending transactions)
3. A destination address for VTXO renewal

The delegate then watches all VTXOs owned by the address until the user unsubscribes from the delegation service.

**💡 TIP**: Users can configure multiple delegates or mix delegation with manual renewals.

**Forfeit Transaction Construction**:
The user also provides a **forfeit transaction** signed with the A+B+S delegation path using `SIGHASH_SINGLE | ANYONECANPAY`, which locks in their input and output while allowing the delegate to append the missing connector input and signature.

Example forfeit construction from the TS-SDK:

```javascript
// the forfeit transaction doesn't contain a connector input
// Alice signs the transaction with ALL_ANYONECANPAY sighash type to allow the delegator to add the connector input
const forfeitTx = buildForfeitTx(
    [
        {
            txid: delegatedVtxo.txid,
            index: delegatedVtxo.vout,
            witnessUtxo: {
                amount: BigInt(delegatedVtxo.value),
                script: VtxoScript.decode(delegatedVtxo.tapTree).pkScript,
            },
            sighashType: SigHash.ALL | SigHash.ALL_ANYONECANPAY,
            tapLeafScript: [forfeitTapLeafScript],
        },
    ],
    forfeitOutputScript
);
```

When the activation window (bound by `valid_at` and `expire_at`) arrives, the delegate submits the presigned intent to the Arkade operator. The operator includes it in the next batch, and if needed, finalizes the forfeit transaction.

**💡 TIP**: Using `SIGHASH_SINGLE | ANYONECANPAY` ensures the delegate cannot tamper with the transaction, changing inputs or outputs, but only complete what was authorized. This model ensures that the user retains unilateral control of their funds while enabling lightweight delegation.

#### Intent Delegation Workflow

The diagram illustrates the flow of a VTXO redemption and registration process between Alice, Bob, and the Server.

![Sequence Diagram Delegation](https://mintcdn.com/arkade/fcFVDQ_Y_9hCg2a1/images/ark/sequencedelegatelight.png?w=1650&fit=max&auto=format&n=fcFVDQ_Y_9hCg2a1&q=85&s=0cccf034d5945df9651aab166f3e9039)

**Process**:

1. **Initial Ownership**: Alice owns a VTXO, which can be spent using a script path such as A+S or A+CSV (exit)
2. **VTXO Transfer**: Alice submits a transaction with the following script paths: A+S or A+B+S or A+CSV (exit)
3. **Intent & Proof**: Alice sends an intent (signed using BIP322), providing a proof P that spends the VTXO. This proof uses the A+CSV (exit) path
4. **Signature Exchange**: Alice sends the A+B+S signature using `SIGHASH_ALL` to Bob
5. **Batch Registration**: After time t, Bob registers the VTXO with the server, using proof P, signs the VTXO tree and A+B+S script path using `SIGHASH_ALL`
6. **Batch Swap**: The intent is undergoing the standard onchain workflow

Settlement occurs atomically: the user's old VTXO gets consumed and a new VTXO gets created exactly as specified in the user's intent. The delegate receives their fee and the operator coordinates the entire batch process.

#### Security Properties

The delegation model is built on the following security principles:

- **No key handoff**: Delegates never hold user signing keys
- **Tamper-proof**: Intents are presigned and cannot be modified by the delegate
- **Verifiable**: All parties can validate ownership and authorization using BIP322

**💡 TIP - Preconfirmation trust model**: Delegated renewals keep your VTXOs in the **preconfirmation state** and do not achieve Bitcoin finality. While delegation provides convenience and eliminates liveness requirements, renewed VTXOs rely on the same preconfirmation security of Arkade's virtual mempool. For Bitcoin-level security guarantees, users should independently participate in batch settlement.

---

### Arkade Notes

#### Overview
An Arkade Note is a **recoverable VTXO** and is akin to a virtual voucher created by the server and redeemable for VTXOs.

Arkade Notes are designed for several purposes:
- **Smooth user onboarding**: An operator can issue Arkade Notes that users redeem for a VTXO
- **Offchain VTXO spending**: Arkade Notes can be sent via standard communication channels (e.g. messengers, NFC, etc.)

#### Arkade Note Structure

Each note starts with the prefix `arknote` and contains ([CreateNoteRequest](https://github.com/arkade-os/arkd/blob/4cabf95f33b0196c47518425e92efc089636aa20/api-spec/protobuf/ark/v1/admin.proto#L84-L87)):
- **A Unique ID (uint32)**: a distinct identifier for tracking each note
- **Value**: the amount this note is worth
- **Server Signature**: a signature on the `ID | amount` hash validating authenticity

Notes appear in the VTXO system as recoverable inputs. In the `GetVtxos` API, the [recoverable_only](https://github.com/arkade-os/arkd/blob/4cabf95f33b0196c47518425e92efc089636aa20/api-spec/protobuf/ark/v1/indexer.proto#L181-L183) filter specifically refers to notes, sub-dust, or swept VTXOs.

#### Redeeming Arkade Notes

Redeeming a note works much like **spending a VTXO offchain**. Instead of providing a VTXO as an input to an intent, the client includes the Arkade Note. The note is then marked as spent (ensuring double-spent protection) and replaced with a new VTXO belonging to the user.

#### Distribution and Use Cases

Arkade Notes are simple encoded text strings, making them highly portable. They can be:
- Sent via chat or email
- Printed as QR codes
- Transferred over contactless technologies like NFC

---

### Arkade PSBT Extensions

#### Overview
Arkade extends the standard Partially Signed Bitcoin Transaction (PSBT) format ([BIP 174](https://github.com/bitcoin/bips/blob/master/bip-0174.mediawiki)) to include custom fields required for its advanced contract logic and coordination mechanisms.

These fields allow Arkade to encode metadata such as:
- Taproot trees
- Relative timelocks
- Multi-signer coordination
- Custom witness data

Features that are not supported by standard PSBTs.

Arkade's PSBT extensions build on BIP 174's forward-compatible design. Because standard PSBT parsers simply ignore but preserve these unknown fields, Arkade transactions remain **fully interoperable** while adding richer contract semantics and coordination logic.

#### Input Fields

Arkade leverages the unknown field mechanism by introducing its own field namespace under key type **`222` (`0xDE`)**, enabling protocol-specific functionality while remaining interoperable with standard tooling.

Each field appears in the PSBT input map under key type `0xDE`, following the PSBT unknown-field encoding rules.

| Field Name | Key Type | Key Data | Description | Value Format |
|------------|----------|----------|-------------|--------------|
| **taptree** | 0xDE | 0x74617074726565 ("taptree") | A list of tapscript leaves | Sequence of tapscript leaves (depth + version + script) |
| **expiry** | 0xDE | 0x657870697279 ("expiry") | Specifies relative timelock (CSV) for input spending | BIP68 sequence encoding |
| **cosigner** | 0xDE | 0x636F7369676E6572 ("cosigner") + <uint32_key_index> | Identifies indexed Musig2 cosigner public keys | 33-byte compressed public key |
| **condition** | 0xDE | 0x636F6E646974696F6E ("condition") | Adds custom witness elements for script execution | raw witness bytes |

#### Field Details

**Taptree Field**:
- Encodes the complete taproot script tree structure
- Sequence of tapscript leaves with depth, version, and script data

**Expiry Field**:
- Specifies relative timelock (CSV) for input spending
- Uses BIP68 sequence encoding for time/block-based locks

**Cosigner Field**:
- Identifies indexed Musig2 cosigner public keys
- Used in multi-party signing coordination
- 33-byte compressed public key format

**Condition Field**:
- Adds custom witness elements for script execution
- Enables conditional spending paths in Arkade contracts

#### Reference Implementations

The reference implementations are available in the `arkd` codebase:
- [PSBT fields Core field definitions and encoding/decoding](https://github.com/arkade-os/arkd/blob/ark-psbt-fields-doc/pkg/ark-lib/txutils/psbt_fields.go)
- [TapTree TapTree encoding/decoding](https://github.com/arkade-os/arkd/blob/ark-psbt-fields-doc/pkg/ark-lib/txutils/taptree.go)
- [Expiry Relative Locktime handling](https://github.com/arkade-os/arkd/blob/ark-psbt-fields-doc/pkg/ark-lib/locktime.go)

---

## Server Security

### Forfeit Transactions

#### Overview

**ℹ️ INFO**: Once the server detects a double-spend attempt, it reacts in one of two ways, depending on the transaction state:
- **VTXO settled**: broadcast forfeit transaction
- **VTXO preconfirmed**: broadcast checkpoint transaction

**Forfeit transactions** are a critical security mechanism for Arkade operators that protect them from fraud attempts by users. When a user attempts to broadcast old pre-signed paths for a VTXO that was already spent in a previous batch swap, the operator broadcasts the corresponding forfeit transaction to claw back the funds.

The attacker burns their own transaction fees attempting this fraud while gaining no economic advantage - the operator immediately publishes the forfeit transaction to reclaim the onchain funds that belong to the server.

Forfeit transactions are created and managed during the **batch processing lifecycle**. Clients submit signed forfeit transactions via the [SubmitSignedForfeitTxs](https://github.com/arkade-os/arkd/blob/4cabf95f33b0196c47518425e92efc089636aa20/api-spec/protobuf/ark/v1/service.proto#L71-L79) RPC method as part of the batch finalization process.

#### Forfeit Transaction Structure

Forfeit transactions have a specific two-input, two-output structure ([BuildForfeitTx](https://github.com/arkade-os/arkd/blob/4cabf95f33b0196c47518425e92efc089636aa20/pkg/ark-lib/tree/forfeit_tx.go#L10-L23)) that requires both a VTXO input and a connector input:

- **Two inputs**: One VTXO input and one connector input
- **Two outputs**: Forfeit output (to operator) and anchor output
- **Timelock support**: Can include CLTV locks for time-based constraints

![Forfeit Transaction](https://mintcdn.com/arkade/fcFVDQ_Y_9hCg2a1/images/ark/forfeitlight.png?w=1650&fit=max&auto=format&n=fcFVDQ_Y_9hCg2a1&q=85&s=e2352bedb5eb272cbc4d5cca295b01f5)

The system validates this structure during forfeit transaction verification, ensuring the connector input is properly identified and paired with the corresponding VTXO input.

#### Fraud Detection and Response

The system monitors for fraud attempts (`reactToFraud`). When a user spends a VTXO offchain and then attempts to redeem the same VTXO onchain (fraud), the operator can broadcast ([broadcastForfeitTx](https://github.com/arkade-os/arkd/blob/4cabf95f33b0196c47518425e92efc089636aa20/internal/core/application/fraud.go#L101-L239)) the corresponding forfeit transaction to reclaim the funds:

1. Retrieve the commitment transaction containing the VTXO
2. Find the correct forfeit transaction and connector outpoint
3. Broadcast the connector branch ([broadcastConnectorBranch](https://github.com/arkade-os/arkd/blob/4cabf95f33b0196c47518425e92efc089636aa20/internal/core/application/fraud.go#L181-L196)) leading to the forfeit transaction
4. Sign and broadcast the forfeit transaction

**💡 TIP**: When fraud is detected, the system must broadcast the entire connector branch leading to the specific connector needed for the forfeit transaction. This process ensures the connector UTXO is available onchain before the forfeit transaction can be broadcast.

#### Security Considerations

1. **Timing**: Forfeit transactions must be submitted within the batch processing window
2. **Validation**: All signatures and transaction structures are verified before acceptance
3. **Connector Management**: Proper connector UTXO locking ([LockConnectorUtxos](https://github.com/arkade-os/arkd/blob/4cabf95f33b0196c47518425e92efc089636aa20/internal/core/application/fraud.go#L137-L139)) prevents double-spending
4. **Fee Bumping**: Forfeit transactions support fee bumping for reliable confirmation ([bumpAnchorTx](https://github.com/arkade-os/arkd/blob/4cabf95f33b0196c47518425e92efc089636aa20/internal/core/application/fraud.go#L161-L164))

**💡 TIP**: Forfeit transactions are essential for maintaining the security guarantees of the Arkade protocol. They ensure that operators can recover funds in fraud scenarios while maintaining the efficiency of offchain transactions.

---

### Checkpoint Transactions

#### Overview

**ℹ️ INFO**: Once the server detects a double-spend attempt, it reacts in one of two ways, depending on the transaction state:
- **VTXO settled**: broadcast forfeit transaction
- **VTXO preconfirmed**: broadcast checkpoint transaction

#### Warding Off Griefing Attacks

Checkpoint transactions are a core component of the Arkade protocol to ward off potential griefing attacks. They allow the operator to broadcast said transaction when detecting fraudulent user behaviour.

A malicious user could chain multiple offchain payments to itself, ultimately batch swap the resulting VTXO or exit the Ark entirely, but then broadcast a unilateral exit path from a prior VTXO of the transaction chain. This attack would force the operator to publish all prior Arkade transactions up to the batch output that anchors them or the unilateral exit, potentially resulting in significant costs.

**💡 TIP**: Checkpoint transactions allow the server to only broadcast one transaction to defend itself in case of a griefing attack. They are special transactions that serve as intermediate states in offchain transaction processing.

#### Checkpoint Transaction Structure

A checkpoint transaction is essentially a self-send of the user, but removing the exit script path from the VTXO script leaf, transferring it to the server. It uses a Taproot script with two paths:
- **A+S** (collaborative)
- **S+CSV** (server after timeout)

![Checkpoint](https://mintcdn.com/arkade/fcFVDQ_Y_9hCg2a1/images/ark/checkpointlight.png?w=1650&fit=max&auto=format&n=fcFVDQ_Y_9hCg2a1&q=85&s=d11577b1c0c71124416fd6de8445e8a6)

Checkpoints are signed by both the user and the operator before the related VTXO becomes eligible for a batch swap or a unilateral exit.

**⚠️ WARNING**: In the offchain environment no forfeit transaction is signed, but only once a VTXO is batch swapped. Until then, transactions operate under a **preconfirmation** trust model.

#### Potential Attack Scenarios

##### User broadcasts only part of tx chain

One type of attack against the operator could be that a user broadcasts only a part of an offchain transaction chain (orange), forcing the operator to broadcast all transactions of that chain (violet), resulting in high onchain cost:

![Chain Attack](https://mintcdn.com/arkade/fcFVDQ_Y_9hCg2a1/images/ark/chainattacklight.png?w=1650&fit=max&auto=format&n=fcFVDQ_Y_9hCg2a1&q=85&s=ae4fc2a29f6fb81cbf46d978c1b75965)

With checkpoint transactions, it suffices for the operator to broadcast one single onchain transaction, reducing the defense cost significantly:

![Chain Attack with Checkpoint](https://mintcdn.com/arkade/fcFVDQ_Y_9hCg2a1/images/ark/chaindefenselight.png?w=1650&fit=max&auto=format&n=fcFVDQ_Y_9hCg2a1&q=85&s=cab53fed2afce9762485326e1d92cbe8)

##### User broadcasts only 1 input of a 2-input tx

Another way to attack the server would be if a user only broadcasts one input of a two-input offchain transaction, forcing the operator to broadcast the second branch of that DAG, resulting in high onchain cost:

![Two-Input Attack](https://mintcdn.com/arkade/fcFVDQ_Y_9hCg2a1/images/ark/multichainattacklight.png?w=1650&fit=max&auto=format&n=fcFVDQ_Y_9hCg2a1&q=85&s=ea5ee195670e721e08616ef73a754062)

With checkpoint transactions, again, it suffices for the operator to broadcast one single onchain transaction, reducing the defense cost significantly:

![Two-Input Attack with Checkpoint](https://mintcdn.com/arkade/fcFVDQ_Y_9hCg2a1/images/ark/multichaindefenselight.png?w=1650&fit=max&auto=format&n=fcFVDQ_Y_9hCg2a1&q=85&s=e829454a3cec7506ebfbc88c5e5bf699)

Overall, checkpoint transactions allow the operator to claim a VTXO, unless the VTXO holder posts the Arkade transaction following this exact checkpoint transaction.

**💡 TIP**: Checkpoint transactions provide the operator with a low‑cost mechanism to mitigate attacks, such as partial or selective broadcasting of offchain transaction chains.

---

## Summary

This documentation covers the complete arkd server architecture, including:
- Transaction workflows (boarding, offchain execution, onchain settlement, exiting)
- API layer services (ArkService, IndexerService)
- Core components (intent system, delegation, notes, PSBTs)
- Security mechanisms (forfeit and checkpoint transactions)

All components work together to enable Arkade's Bitcoin L2 functionality with VTXOs, batch processing, and offchain execution capabilities.
