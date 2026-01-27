# 🎡 Installation

```bash
pnpm install
```

## Environment Variables Setup

The project uses Hardhat's `vars` system for managing environment variables. Set up the required variables as follows:

**Network Independent Variables:**
```bash
# Mnemonic for account derivation
npx hardhat vars set MNEMONIC

# Etherscan API key for contract verification (only relevant for deployment)
npx hardhat vars set ETHERSCAN_API_KEY
```

**Network Specific Variables:**
```bash
# Sepolia testnet RPC URL
npx hardhat vars set ETH_SEPOLIA_TESTNET_URL

# Ethereum mainnet RPC URL
npx hardhat vars set ETH_MAINNET_URL
```

**Compile and Test:**
```bash
pnpm compile:hh
```

```bash
pnpm test:hh
```

## Running Example Scripts

This repository contains example scripts that allow you to execute and interact with contract functions directly from the terminal. These scripts demonstrate how to perform core actions such as registering names or namespaces, resolving addresses, claiming fees, and more. They are designed to provide practical, ready-to-run examples for both developers and auditors wishing to test XNS functionality without writing new scripts from scratch.

Example scripts are located in `scripts/examples/`. To run an example script:

```bash
npx hardhat run scripts/examples/<script_name>.ts --network <network_name>
```

**Example:**
```bash
# Run registerName example on Sepolia testnet
npx hardhat run scripts/examples/registerName.ts --network sepolia
```

Replace `sepolia` with `ethMain` to run the script on Ethereum Mainnet.

Available example scripts:

**Name Registration:**
- [`registerName.ts`](../scripts/examples/registerName.ts) - Register a name for an EOA
- [`registerNameForERC20A.ts`](../scripts/examples/registerNameForERC20A.ts) - Register name via constructor
- [`registerNameForERC20B.ts`](../scripts/examples/registerNameForERC20B.ts) - Register name via separate function

**Name Registration With Authorization:**
- [`registerNameWithAuthorization.ts`](../scripts/examples/registerNameWithAuthorization.ts) - Register a name with EIP-712 authorization
- [`registerNameWithAuthorizationForERC20.ts`](../scripts/examples/registerNameWithAuthorizationForERC20.ts) - Register name via EIP-1271
- [`batchRegisterNameWithAuthorization.ts`](../scripts/examples/batchRegisterNameWithAuthorization.ts) - Batch register names with authorization

**Namespace Registration:**
- [`registerPublicNamespace.ts`](../scripts/examples/registerPublicNamespace.ts) - Register a public namespace
- [`registerPrivateNamespace.ts`](../scripts/examples/registerPrivateNamespace.ts) - Register a private namespace
- [`registerPublicNamespaceFor.ts`](../scripts/examples/registerPublicNamespaceFor.ts) - Register a public namespace for another address (OWNER-only)
- [`registerPrivateNamespaceFor.ts`](../scripts/examples/registerPrivateNamespaceFor.ts) - Register a private namespace for another address (OWNER-only)

**Query Functions:**
- [`getAddress.ts`](../scripts/examples/getAddress.ts) - Resolve a name to an address
- [`getName.ts`](../scripts/examples/getName.ts) - Get the name for an address
- [`getNamespaceInfo.ts`](../scripts/examples/getNamespaceInfo.ts) - Query namespace information
- [`getNamespacePrice.ts`](../scripts/examples/getNamespacePrice.ts) - Query namespace price per name
- [`isInExclusivityPeriod.ts`](../scripts/examples/isInExclusivityPeriod.ts) - Check if a namespace is in exclusivity period
- [`getPendingFees.ts`](../scripts/examples/getPendingFees.ts) - Check pending fees for an address

**Fee Management:**
- [`claimFeesToSelf.ts`](../scripts/examples/claimFeesToSelf.ts) - Claim fees to yourself
- [`claimFees.ts`](../scripts/examples/claimFees.ts) - Claim fees to a different recipient

**Governance:**
- [`owner.ts`](../scripts/examples/owner.ts) - Query the current contract owner
- [`pendingOwner.ts`](../scripts/examples/pendingOwner.ts) - Query the pending contract owner
- [`transferOwnership.ts`](../scripts/examples/transferOwnership.ts) - Initiate contract ownership transfer
- [`acceptOwnership.ts`](../scripts/examples/acceptOwnership.ts) - Accept contract ownership transfer
- [`getPendingNamespaceCreator.ts`](../scripts/examples/getPendingNamespaceCreator.ts) - Query the pending namespace creator
- [`transferNamespaceCreator.ts`](../scripts/examples/transferNamespaceCreator.ts) - Initiate namespace creator transfer
- [`acceptNamespaceCreator.ts`](../scripts/examples/acceptNamespaceCreator.ts) - Accept namespace creator transfer

**Utility Scripts:**
- [`generateSignature.ts`](../scripts/examples/generateSignature.ts) - Generate EIP-712 signature for Etherscan execution
- [`deployMockERC20C.ts`](../scripts/examples/deployMockERC20C.ts) - Deploy a MockERC20C contract

> **Note:** Each example script contains a `USER INPUTS` section at the top where you can customize parameters (e.g., label, namespace, signer index) before running the script. Modify these values directly in the script file as needed.


# 🎨 Design Decisions

This section outlines the key design decisions regarding code style, governance, and specific contract features. It is primarily intended for auditors and anyone interested in the code.

## Code Style

The contract was developed with simplicity and readability in mind, rather than gas optimization. This approach ensures the code is easy to understand and audit.

### Error Handling

The contract uses `require` statements with descriptive error messages for error handling, rather than custom Solidity errors. This approach increases gas costs during deployment and reverts, but it ensures that revert reasons are clear. It also keeps the codebase simpler by avoiding the need for additional error type declarations.

### Interface Organization

`XNS.sol` intentionally does not inherit from the `IXNS.sol` interface to keep all struct definitions grouped together within the implementation contract to make it easier to read. If `XNS.sol` inherited from the interface, the `RegisterNameAuth` struct definition would need to reside in `IXNS.sol` while all the other structs would remain in `XNS.sol`. This separation would scatter data structures between files, making the code harder to read. 

### Assembly

Although using inline assembly for hash computations could save gas, the code deliberately avoids it to prioritize clarity and ease of auditing.

## XNS Contract Owner Privileges

The contract owner has specific privileges that differ from regular users:

**During Onboarding Period (First Year After Deployment):**

* **Free namespace registration for others**: The owner can register public or private namespaces for any address at no cost using `registerPublicNamespaceFor` and `registerPrivateNamespaceFor`. These functions are OWNER-only and only available during the onboarding period (first year after contract deployment).
* **Purpose**: This privilege is intended to enable rapid ecosystem adoption by allowing the owner to bootstrap namespaces for participants and integrators without requiring upfront payment.
* **Limitations**: These functions cannot be called after the onboarding period expires. After the first year, the owner must use the same self-service functions as all other users (`registerPublicNamespace` and `registerPrivateNamespace`) and pay the standard fees.

**Always (Regardless of Time Period):**

* **Fee claiming**: The owner can claim accumulated fees using `claimFees` or `claimFeesToSelf`, just like any other address with pending fees.


## Chains

The contract is intended to be deployed exclusively on Ethereum mainnet (with a testnet environment for development and testing). This design choice ensures that a single name cannot be associated with different addresses on separate chains, thereby avoiding confusion and preserving the uniqueness and integrity of the registry.

While it cannot be technically prevented that someone deploys a similar contract on another chain, XNS establishes its canonical status through multiple layers of protection:
- **First deployment:** The original deployment on Ethereum mainnet establishes the canonical registry, with its immutable history serving as the source of truth for name-address mappings.
- **Clear documentation:** This documentation and `README.md` explicitly state that XNS is Ethereum-canonical and that deployments on other chains are not recognized as XNS.
- **BUSL license:** The Business Source License 1.1 (BUSL-1.1) legally restricts production deployments on other chains, ensuring there is a single canonical XNS registry on Ethereum. Even after the license transitions to open-source, XNS remains Ethereum-canonical—the identity, meaning, and trust of XNS names derive from the original deployment on Ethereum mainnet and its immutable history. Deployments on other chains after the Change Date are not recognized as XNS and do not share any continuity, guarantees, or identity with the canonical registry.

## Features

### Batch Registration

* The `batchRegisterNameWithAuthorization` function intentionally only supports batching within the same namespace, as this matches the most common use case—especially after a new namespace is registered.
* **Error Handling in Batch Registration:** The `batchRegisterNameWithAuthorization` function uses a hybrid error-handling approach:
  * **Input validation errors** (invalid label, zero recipient, namespace mismatch, invalid signature) cause the entire batch to revert
  * **State-based conflicts** (recipient already has a name, name already registered) are skipped to allow processing to continue
* This design provides griefing resistance: if someone front-runs the transaction and registers a name for one recipient, that specific registration is skipped while other valid registrations proceed. The function only charges for successful registrations.
* **Event emission**: Events are emitted for every successfully processed item. If the returned count doesn't match the expected number, users can inspect events to identify which registrations were skipped.

## Front-Running

Front-running is possible but not considered a significant problem because:

* Front-runners must burn ETH to register the name and cannot sell or transfer it (names are permanent, immutable, and non-transferable)
* Users can choose alternative namespaces to secure their preferred name (e.g., if `vitalik.x` is taken, they can register `vitalik.yolo` or another namespace)
* Users can use private RPCs.

### Front-Running during the First Year

During the first year after contract deployment (the onboarding period), the contract owner can register namespaces for free using dedicated OWNER-only functions (`registerPublicNamespaceFor` and `registerPrivateNamespaceFor`) in order to foster protocol adoption.

There exists a theoretical front-running risk:

* **Theoretical scenario**: The owner could monitor the mempool for namespace registration transactions from other users and front-run them to register the namespace first for a different address.

**Mitigation:**
* **Economic disincentive**: Front-running namespace registrations would negatively impact the system's reputation and the owner's future revenue.
* **Postpone namespace registration**: Users can mitigate this risk by waitng until after the 1-year onboarding period to register namespaces, at which point everyone pays the same fees (including the owner, who must use the self-service functions).
* **Request free registration**: During the onboarding period, users may also reach out to [Walodja1987](https://x.com/Walodja1987) on X and ask for a free namespace registration by the contract owner.

## Block Reorganization Risk

Block reorganizations (reorgs) pose a risk to name registrations. If a registration transaction is removed due to a block reorganization, an attacker could front-run and register the same name with a higher gas fee. If users do not wait for several confirmations before sharing their name, payers may send funds to the wrong address at a later stage.

**Mitigation:**
* **Wait for confirmations:** Users and integrators should wait for several block confirmations and ensure the name resolves as intended before publicly sharing or relying on it.
* **Use test transactions:** Before sharing a new name, users are encouraged to first make a small, low-risk test transaction (e.g., sending a small amount of assets to the new name) to verify correct resolution.
* **Attacker’s cost:** Even in the event of a reorg or front-running attack, the necessity of burning ETH creates an economic disincentive for malicious actors.

The contract intentionally does not implement protocol-level reorg mitigation, as such mechanisms would force additional complexity on users and interfaces, such as requiring multiple confirmation or registration steps.

## EIP-712 Signature Revocation

The `RegisterNameAuth` struct does not include a `nonce` or `deadline` field, and there is no on-chain mechanism to revoke authorization signatures. As a result, signatures can, in theory, be used indefinitely after they are issued. The following explains the reasoning behind this design decision.

**Why `nonce` is not needed:**

Replay attacks are not considered a problem because:

- **No financial loss for recipients**: If someone sponsors a registration for a recipient's name using an old signature, the recipient incurs no cost—the sponsor pays the registration fee. The worst that can happen is that the recipient address might get a name assigned that they no longer want.
- **One-name-per-address limit**: Each address can have exactly one name. Once a name is registered to an address, any subsequent authorization attempts for different names will fail due to the existing name check. Incrementing a nonce on successful use would not provide meaningful protection beyond what already exists.

**Why `deadline` is not needed:**

A `deadline` parameter does not any value. A user who is confident about receiving a specific name via the authorization flow may choose a `deadline` far in the future. If they later change their mind, the `deadline` provides no practical way to cancel the authorization. As a result, adding a `deadline` parameter does not materially reduce risk and adds protocol complexity without clear benefit.

**Why explicit on-chain revocation is not implemented:**

An explicit on-chain invalidation function that accepts the `RegisterNameAuth` struct and signature, and invalidates the authorization if the recovered signer matches the recipient, was considered but rejected. This approach does not work for contract recipients (e.g., ERC20 token contracts) that rely on the EIP-1271 authorization flow (e.g., name registrations within private namespaces) but do not expose an execution mechanism to call the invalidation function. In such cases, revocation would be impossible, leading to inconsistent behavior across recipient types.

**Mitigation:**

- Recipients should only sign authorizations they are comfortable with executing at any point in the future.
- Recipients can register a name themselves to prevent any sponsored registration attempts.

## EIP-7702 Compatibility

XNS supports EIP-7702 delegated accounts for authorized name registration. If a recipient is an EIP-7702 delegated account, their delegated implementation must implement EIP-1271 for signature validation to work correctly with `registerNameWithAuthorization` and `batchRegisterNameWithAuthorization`.

## Refund Failure

The refund logic requires that refunds succeed. If the sponsoring contract cannot accept ETH transfers (no `receive()`/`fallback()` or intentional revert), the refund will fail and cause the transaction to revert.

This DoS scenario is acknowledged but not considered a critical issue given the following:

- **Alternative sponsorship paths:** If a contract cannot accept ETH for refunds, sponsors can use an EOA or another contract that can receive ETH to sponsor registrations instead.

A more robust alternative would be to implement a pending refunds mechanism, requiring `msg.sender` to explicitly claim any refund in a separate transaction. However, this approach introduces additional contract complexity and negatively impacts user experience. The current design is viewed as a reasonable trade-off.

## Gas Griefing in Signature Verification

The contract uses OpenZeppelin's `SignatureChecker` which forwards all remaining gas to EIP-1271 contract wallets during signature verification. A malicious contract wallet could consume all gas, causing the transaction to fail.

**Impact:**
- Single registrations: Recipient would grief themselves (unlikely)
- Batch registrations: One malicious recipient could cause entire batch to fail

**Mitigation:**
- Batch operations are expected to be rare and involve trusted recipients
- Recipients should use trusted wallet implementations
- If needed, gas limiting can be added in future versions