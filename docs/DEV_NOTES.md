# 🎡 Installation

```bash
pnpm install
```

## Environment Variables Setup

The project uses Hardhat's `vars` system for managing environment variables. Set up the required variables using `npx hardhat vars set` (e.g., `npx hardhat vars set MNEMONIC`):

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
- [`registerName.ts`](../scripts/examples/registerName.ts) - Register a name for an EOA
- [`registerNamespace.ts`](../scripts/examples/registerNamespace.ts) - Register a public or private namespace
- [`registerNameWithAuthorization.ts`](../scripts/examples/registerNameWithAuthorization.ts) - Register a name with EIP-712 authorization
- [`batchRegisterNameWithAuthorization.ts`](../scripts/examples/batchRegisterNameWithAuthorization.ts) - Batch register names with authorization
- [`getAddress.ts`](../scripts/examples/getAddress.ts) - Resolve a name to an address
- [`getName.ts`](../scripts/examples/getName.ts) - Get the name for an address
- [`getNamespaceInfo.ts`](../scripts/examples/getNamespaceInfo.ts) - Query namespace information
- [`getPendingFees.ts`](../scripts/examples/getPendingFees.ts) - Check pending fees for an address
- [`claimFeesToSelf.ts`](../scripts/examples/claimFeesToSelf.ts) - Claim fees to yourself
- [`claimFees.ts`](../scripts/examples/claimFees.ts) - Claim fees to a different recipient
- [`registerNameForERC20A.ts`](../scripts/examples/registerNameForERC20A.ts) - Register name via constructor
- [`registerNameForERC20B.ts`](../scripts/examples/registerNameForERC20B.ts) - Register name via separate function
- [`registerNameWithAuthorizationForERC20.ts`](../scripts/examples/registerNameWithAuthorizationForERC20.ts) - Register name via EIP-1271
- [`deployMockERC20C.ts`](../scripts/examples/deployMockERC20C.ts) - Deploy a MockERC20C contract
- [`generateSignature.ts`](../scripts/examples/generateSignature.ts) - Generate EIP-712 signature for Etherscan execution

> **Note:** Each example script contains a `USER INPUTS` section at the top where you can customize parameters (e.g., label, namespace, signer index) before running the script. Modify these values directly in the script file as needed.


# 🎨 Design Decisions

This document outlines the key design decisions regarding code style, governance, and specific contract features. It is primarily intended for auditors and anyone interested in the code.

## Code Style

The contract was developed with simplicity and readability in mind, rather than gas optimization. This approach ensures the code is easy to understand and audit.

### Error Handling

The contract uses `require` statements with descriptive error messages for error handling, rather than custom Solidity errors. This approach increases gas costs during deployment and reverts, but it ensures that revert reasons are clear. It also keeps the codebase simpler by avoiding the need for additional error type declarations.

### Interface Organization

`XNS.sol` intentionally does not inherit from the `IXNS.sol` interface to keep all struct definitions grouped together within the implementation contract to make it easier to read. If `XNS.sol` inherited from the interface, the `RegisterNameAuth` struct definition would need to reside in `IXNS.sol` while all the other structs would remain in `XNS.sol`. This separation would scatter data structures between files, making the code harder to read. 

### Assembly

Although using inline assembly for hash computations could save gas, the code deliberately avoids it to prioritize clarity and ease of auditing.

## Governance

The contract assigns a fixed owner at deployment, with no mechanism for ownership transfer. This design simplifies the contract and reduces governance complexity. If the owner wallet is ever compromised, fee claiming by the owner remains possible regardless, although increased gas costs may be required to front-run the attacker. Since the designated owner is intended to be a multisig wallet, the risk of a compromise is considered manageable.

### XNS Contract Owner Privileges

The contract owner has specific privileges that differ from regular users:

**During Onboarding Period (First Year After Deployment):**

* **Free namespace registration for others**: The owner can register public or private namespaces for any address at no cost using `registerPublicNamespaceFor` and `registerPrivateNamespaceFor`. These functions are OWNER-only and only available during the onboarding period (first year after contract deployment).
* **Purpose**: This privilege is intended to enable rapid ecosystem adoption by allowing the owner to bootstrap namespaces for participants and integrators without requiring upfront payment.
* **Limitations**: These functions cannot be called after the onboarding period expires. After the first year, the owner must use the same self-service functions as all other users (`registerPublicNamespace` and `registerPrivateNamespace`) and pay the standard fees.

**Always (Regardless of Time Period):**

* **Fee collection**: The owner receives 5% of fees from every name registration transaction:
  * **Public namespaces**: Owner receives 5% of registration fees (namespace creator receives the other 5%)
  * **Private namespaces**: Owner receives 10% of registration fees (private namespace creators receive 0%)
* **Fee claiming**: The owner can claim accumulated fees using `claimFees` or `claimFeesToSelf`, just like any other address with pending fees. The owner does not have special privileges for claiming fees—they can only claim fees that were credited to the owner address.

**What the Owner Cannot Do:**

* **Cannot transfer ownership**: The owner address is immutable and cannot be changed after deployment.
* **Cannot register namespaces for free after onboarding**: After the first year, the owner must pay standard fees like all other users.
* **Cannot claim fees that aren't theirs**: The owner can only claim fees that were credited to the owner address, same as any other address.

This design balances the need for ecosystem bootstrapping with long-term decentralization, as the owner's special privileges are time-limited and focused on onboarding.

## Chains

The contract is intended to be deployed exclusively on Ethereum mainnet (and a testnet environment for development and testing). This design choice prevents the possibility of the same address registering different names on multiple chains, ensuring global uniqueness and consistency of name ownership.

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

During the first year after contract deployment (the onboarding period), the contract owner can optionally bootstrap namespaces for participants and integrators at no cost using dedicated OWNER-only functions (`registerPublicNamespaceFor` and `registerPrivateNamespaceFor`). This mechanism is intended to promote rapid ecosystem adoption by enabling the owner to grant free namespaces to participants and integrators.

**Design Decision: Separation of Self-Service and Onboarding Functions**

The contract separates self-service namespace registration (which always charges fees) from owner-only onboarding functions (which are free during the onboarding period). This design provides several benefits:

* **Clear separation of concerns**: Regular users always pay standard fees via `registerPublicNamespace` and `registerPrivateNamespace`, while onboarding is handled through dedicated functions.
* **Transparency**: The distinction between self-service and onboarding functions makes the system's behavior explicit and easier to audit.
* **Consistent fee enforcement**: Self-service functions consistently enforce fees, eliminating conditional logic that could introduce bugs or confusion.

**Front-Running Considerations:**

Even with this separation, there remains a theoretical front-running risk:

* **Theoretical scenario**: The owner could monitor the mempool for namespace registration transactions from other users and front-run them using `registerPublicNamespaceFor` or `registerPrivateNamespaceFor` to register the namespace first for a different address.
* **Economic disincentive**: Front-running namespace registrations would negatively impact the system's reputation and the owner's future revenue.
* **User mitigation**: Users can mitigate this risk by waiting until after the 1-year onboarding period to register namespaces, at which point everyone pays the same fees (including the owner, who must use the self-service functions).

## Block Reorganization Risk

Block reorganizations (reorgs) pose a risk to name registrations. If a registration transaction is removed due to a block reorganization, an attacker could front-run and register the same name with a higher gas fee. If users do not wait for several confirmations before sharing their name, payers may send funds to the wrong address at a later stage.

**Mitigation:**
* **Wait for confirmations:** Users and integrators should wait for several block confirmations and ensure the name resolves as intended before publicly sharing or relying on it.
* **Attacker’s cost:** Attackers who attempt to front-run must pay the ETH burn cost, which may provide them no advantage as users are encouraged to delay sharing new names until they have confirmed correct resolution.
* **Use test transactions:** Before sharing a new name, users are encouraged to first make a small, low-risk test transaction (e.g., sending a small amount of assets to the new name) to verify correct resolution.
* **Irreversible ETH burns remain a deterrent:** Even in the event of a reorg or front-running attack, the necessity of burning ETH creates a significant economic disincentive for malicious actors.

The contract intentionally does not implement protocol-level reorg mitigation, as such mechanisms would force additional complexity on users and interfaces, such as requiring multiple confirmation or registration steps.

This is documented as a best practice recommendation rather than a protocol-level enforcement, as finality guarantees are ultimately a property of the underlying blockchain consensus mechanism.

## EIP-712 Authorization Without Nonce or Deadline

The `RegisterNameAuth` struct does not include a `nonce` or `deadline` field, meaning signatures can theoretically be used indefinitely after being issued. 

**Why `nonce` is not needed:**

Replay attacks are not considered a problem because:

- **No financial loss for recipients**: If someone sponsors a registration for a recipient's name using an old signature, the recipient incurs no cost—the sponsor pays the registration fee. The worst that can happen is that the recipient address might get a name assigned, that they no longer want.
- **One-name-per-address limit**: Each address can have exactly one name. Once a name is registered to an address, any subsequent authorization attempts for different names will fail due to the existing name check. Incrementing a nonce on successful use would not provide meaningful protection beyond what already exists.

**Why `deadline` is not needed:**

While adding an optional deadline field could provide users with additional control over signature validity, this would be primarily about user optionality rather than security. Even with an optional deadline, users could choose an "infinite" deadline, resulting in the same scenario.

**Mitigation:**
- Recipients should only sign authorizations they are comfortable with executing at any point in the future
- Recipients can register a name themselves to prevent any sponsored registration attempts
- The one-name-per-address constraint naturally limits the impact of replay attacks

## Refund Failure

The refund logic requires that refunds succeed. If the sponsoring contract cannot accept ETH transfers (no `receive()`/`fallback()` or intentional revert), the refund will fail and cause the transaction to revert.

This DoS scenario is acknowledged but not considered a critical issue given the following:

- **Alternative sponsorship paths:** If a contract cannot accept ETH for refunds, sponsors can use an EOA or another contract that can receive ETH to sponsor registrations instead.

A more robust alternative would be to implement a pending refunds mechanism, requiring `msg.sender` to explicitly claim any refund in a separate transaction. However, this approach introduces additional contract complexity and negatively impacts user experience. The current design is viewed as a reasonable trade-off.

## Known Limitations

### Gas Griefing in Signature Verification

The contract uses OpenZeppelin's `SignatureChecker` which forwards all remaining gas to EIP-1271 contract wallets during signature verification. A malicious contract wallet could consume all gas, causing the transaction to fail.

**Impact:**
- Single registrations: Recipient would grief themselves (unlikely)
- Batch registrations: One malicious recipient could cause entire batch to fail

**Mitigation:**
- Batch operations are expected to be rare and involve trusted recipients
- Recipients should use trusted wallet implementations
- If needed, gas limiting can be added in future versions