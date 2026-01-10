# How to run

```bash
pnpm install
```

```bash
pnpm compile:hh
```

```bash
pnpm test:hh
``` 

# Design Decisions

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

During the first year after contract deployment (the initial owner namespace registration period), the contract owner is permitted to register namespaces at no cost, whereas all other users must pay a 200 ETH fee per namespace. This mechanism is intended to promote rapid ecosystem adoption by enabling the owner to grant free namespaces to participants and integrators. However, this privilege does introduce a theoretical front-running risk:

* **Theoretical scenario**: The owner could monitor the mempool for namespace registration transactions from other users and front-run them to register the namespace first.
* **Economic disincentive**: Front-running namespace registrations would negatively impact the system's reputation and the owner's future revenue.
* **User mitigation**: Users can mitigate this risk by waiting until after the 1-year period to register namespaces, at which point everyone pays the same 200 ETH fee (including the owner).

## Block Reorganization Risk

Block reorganizations (reorgs) pose a risk to name registrations. If a registration transaction is removed due to a block reorganization, an attacker could front-run and register the same name with a higher gas fee. If users do not wait for several confirmations before sharing their name, payers may send funds to the wrong address at a later stage.

**Mitigation:**
* **Wait for confirmations:** Users and integrators should wait for several block confirmations and ensure the name resolves as intended before publicly sharing or relying on it.
* **Attacker’s cost:** Attackers who attempt to front-run must pay the ETH burn cost, which may provide them no advantage as users are encouraged to delay sharing new names until they have confirmed correct resolution.
* **Use test transactions:** Before sharing a new name, users are encouraged to first make a small, low-risk test transaction (e.g., sending a small amount of assets to the new name) to verify correct resolution.
* **Irreversible ETH burns remain a deterrent:** Even in the event of a reorg or front-running attack, the necessity of burning ETH creates a significant economic disincentive for malicious actors.

The contract intentionally does not implement protocol-level reorg mitigation, as such mechanisms would force additional complexity on users and interfaces, such as requiring multiple confirmation or registration steps.

This is documented as a best practice recommendation rather than a protocol-level enforcement, as finality guarantees are ultimately a property of the underlying blockchain consensus mechanism.

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

### EIP-712 Authorization Without Nonce or Deadline

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