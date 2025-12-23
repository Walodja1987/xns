---

# XNS – The On-Chain Name Service

```
//////////////////////////////
//                          //
//    __   ___   _  _____   //
//   \ \ / / \ | |/ ____|   //
//    \ V /|  \| | (___     //
//     > < | . ` |\___ \    //
//    / . \| |\  |____) |   //
//   /_/ \_\_| \_|_____/    //
//                          //
//////////////////////////////
```

## 🚀 Overview

**XNS** is a decentralized, Ethereum-native name registry that maps **human-readable names to Ethereum addresses**.

Names are acquired by **burning ETH** and are **permanent, immutable, and non-transferable**.

XNS is intentionally simple:

* No expirations
* No renewals
* No transfers
* No speculation
* No off-chain dependencies

Once a name is registered, it is **forever** linked to the owner’s address.

---

## ✨ Core Properties

### 🔒 Permanent Ownership

XNS names never expire.

- No renewals
- No grace periods
- No risk of losing your name

If you register a name, it is yours **forever**.

---

### 🔥 ETH Burn–Based Registration

Names are registered by burning ETH. The amount of ETH burned determines the namespace.

- 90% of ETH sent is burned via the [DETH contract](https://github.com/Walodja1987/deth)
- The sender is credited DETH 1:1
- Burned ETH is permanently removed from circulation, contributing Ethereum's deflationary mechanism and ETH's value accrual

There is no secondary market and no resale incentive.

---

### 🧭 One Name per Address

Each Ethereum address may own **at most one XNS name**.

This guarantees:

- Clear identity mapping
- No name farming
- Simple reverse lookup (`address → name`)

---

### 🧠 Fully On-Chain Resolution

XNS supports:

- **Forward lookup:** name → address
- **Reverse lookup:** address → name

All resolution is done via on-chain view functions and can be queried directly via **Etherscan** — no indexers required.

---

## 🏷 Names & Namespaces

An XNS name consists of:

```
<label>.<namespace>
```

Examples:

```
vitalik.001
alice.yolo
nike.x
```

---

### 🔹 Labels

The label is the user-chosen part of the name.

Rules:

- Length: **1–20 characters**
- Allowed characters:
  - `a–z`
  - `0–9`
  - `-` (hyphen)

- Hyphen **cannot** be the first or last character

Examples:

- ✅ `vitalik`
- ✅ `my-name`
- ❌ `-name`
- ❌ `name-`

---

### 🔹 Namespaces

Namespaces are determined **entirely by the ETH amount burned** during registration.

- Namespaces are **permissionless**
- Anyone can create a namespace by paying a one-time fee
- Each namespace has a **fixed price per name**

Namespace rules:

- Length: **1–4 characters**
- Allowed characters: `a–z`, `0–9`
- The namespace `"eth"` is **forbidden** to avoid confusion with ENS

---

## ⭐ The Special Namespace `.x`

XNS includes a **special premium namespace**:

```
.x
```

This namespace represents **suffix-free names**.

### How it works

- Registering a label **without a dot** implicitly registers:

  ```
  label.x
  ```

- Resolution treats both forms as equivalent:

  ```
  getAddress("nike")  == getAddress("nike.x")
  ```

### Pricing

- `.x` names cost **100 ETH**
- Example:

  ```
  nike.x  → displayed simply as "nike"
  ```

The `.x` namespace is **not a default** — it is a **premium, scarce namespace**.

---

## 🔥 Namespace Pricing Model

Namespaces are mapped to **exact ETH amounts**, in increments of **0.001 ETH**.

Examples:

|  ETH Burn | Name                 |
| --------: | -------------------- |
| 0.001 ETH | alice.001            |
| 0.250 ETH | alice.250            |
| 0.999 ETH | alice.999            |
|   100 ETH | alice (i.e. alice.x) |

The ETH amount uniquely determines the namespace.

---

## 👥 Namespace Creators

**Important:** The namespace creator address is set at namespace creation time and **never changes**.

- Creator privileges are tied to the specific address that created the namespace
- These privileges are **immutable** and cannot be transferred
- During the 30-day exclusivity period, only the creator can:
  - Register paid names for themselves via `registerName`
  - Sponsor paid name registrations for others via `registerNameWithAuthorization`

This ensures that namespace creators maintain full control over their namespaces during the exclusivity period.

---

## ⏳ Exclusive Period

For the first **30 days** after a namespace is created:

- **Only the namespace creator** may register paid names under that namespace
- The creator can:
  - Register a name for themselves using `registerName`
  - Sponsor name registrations for others using `registerNameWithAuthorization` (requires recipient's EIP-712 signature)
- Public `registerName` is **disabled** for non-creators during this period

After 30 days:

- Anyone may register paid names via `registerName`
- Anyone may sponsor name registrations via `registerNameWithAuthorization`

---

## 🔧 Key Functions

### Register a Name

```solidity
registerName(string label) payable
```

- Burns `msg.value` ETH
- Namespace is derived from `msg.value`
- Registers `label.namespace` for `msg.sender`
- During the 30-day exclusivity period, only the namespace creator can use this function

Example:

```solidity
xns.registerName{value: 0.001 ether}("alice");
```

---

### Register a Name with Authorization (Sponsorship)

```solidity
registerNameWithAuthorization(
    RegisterNameAuth calldata registerNameAuth,
    bytes calldata signature
) payable
```

- Allows a sponsor (tx sender) to pay and register a name for a recipient
- Recipient must explicitly authorize via EIP-712 signature
- Supports both EOA signatures and EIP-1271 contract wallet signatures (Safe, Argent, etc.)
- During the 30-day exclusivity period, only the namespace creator can sponsor registrations
- Burns `msg.value` ETH (must match namespace price)
- Registers name to `recipient`, not `msg.sender`

The `RegisterNameAuth` struct contains:

- `recipient`: Address that will receive the name (must sign the EIP-712 message)
- `label`: The label part of the name
- `namespace`: The namespace part of the name

Use cases:

- Community onboarding: Users sign once, sponsor covers gas and fees
- Gasless registration: Recipient doesn't need ETH
- Batch registrations: Collect signatures off-chain, execute in one tx
- Front-running protection: Creator can atomically register reserved names

---

### Batch Register Names with Authorization

```solidity
batchRegisterNameWithAuthorization(
    RegisterNameAuth[] calldata registerNameAuths,
    bytes[] calldata signatures
) payable
```

- Batch version of `registerNameWithAuthorization` to register multiple names in a single transaction
- All registrations must be in the same namespace
- Requires `msg.value` equal to `pricePerName * registerNameAuths.length`
- More gas efficient than calling `registerNameWithAuthorization` multiple times
- During the 30-day exclusivity period, only the namespace creator can sponsor batch registrations
- Burns `msg.value` ETH (must match namespace price * count)
- Registers names to recipients, not `msg.sender`
- Distributes fees once for all registrations (90% burnt, 5% to namespace creator, 5% to contract owner)

Use cases:
- Community onboarding: Batch register multiple community members at once
- Launch campaigns: Register reserved names atomically before public launch
- Gas efficiency: Save gas by batching multiple registrations

---

### Register a Namespace

```solidity
registerNamespace(string namespace, uint256 pricePerName) payable
```

- Registers a new namespace
- Binds it to `pricePerName`
- During the initial 1-year period, the contract owner can register namespaces for free
- All others must pay the namespace registration fee (200 ETH)

---

## 💰 Fee Management

### Fee Distribution

When names are registered (via `registerName` or `registerNameWithAuthorization`) or namespaces are created with fees:

- **90%** of ETH is burned via DETH contract
- The payer/sponsor is credited DETH 1:1 for the burned amount
- **5%** is credited to the namespace creator
- **5%** is credited to the contract owner

Fees accumulate and must be explicitly claimed.

---

### Claim Fees

```solidity
claimFees(address recipient)
```

- Claims all accumulated fees for `msg.sender`
- Transfers fees to the specified `recipient` address
- Resets pending fees to zero
- Emits `FeesClaimed` event

```solidity
claimFeesToSelf()
```

- Convenience function that claims fees for `msg.sender` and sends them to `msg.sender`
- Equivalent to `claimFees(msg.sender)`

---

### Check Pending Fees

```solidity
getPendingFees(address recipient)
```

- Returns the amount of pending fees that can be claimed by an address
- Returns zero if the address has no pending fees

---

### Validate Signature

```solidity
isValidSignature(
    RegisterNameAuth calldata registerNameAuth,
    bytes calldata signature
) view returns (bool)
```

- Checks if a signature is valid for a `RegisterNameAuth` struct
- Useful for off-chain validation before submitting transactions
- Supports both EOA signatures and EIP-1271 contract wallet signatures

---

## 🔍 Name Resolution

### Forward Lookup (Name → Address)

```solidity
getAddress(string fullName)
```

Examples:

```solidity
getAddress("vitalik.001");
getAddress("nike");      // resolves nike.x
```

Returns `address(0)` if the name is not registered.

---

### Reverse Lookup (Address → Name)

```solidity
getName(address addr)
```

Returns the full XNS name as a string:

- For bare names (registered in the "x" namespace): returns just the label (e.g., `"vitalik"`)
- For regular names: returns the full name in format `"label.namespace"` (e.g., `"alice.001"`)
- If the address has no name: returns an empty string `""`

Examples:

```solidity
getName(0x123...) // returns "vitalik" (bare name)
getName(0x456...) // returns "alice.001" (regular name)
getName(0x789...) // returns "" (no name)
```

---

## 🧠 Namespace Queries

### Query by Namespace

```solidity
getNamespaceInfo(string namespace)
```

Returns:

- `pricePerName`
- `creator`
- `createdAt`

---

### Query by Price

```solidity
getNamespaceInfo(uint256 price)
```

Returns:

- `namespace`
- `pricePerName`
- `creator`
- `createdAt`

---

## ⚠️ Front-Running & Design Choice

XNS **does not** use a commit–reveal pattern.

Why?

- On a public blockchain, **reveals are still front-runnable**
- Commit–reveal hides intent but does **not** prevent motivated actors from racing the final transaction
- Including commit–reveal would add complexity without providing real guarantees

**Design choice:**
XNS embraces simplicity and economic deterrence.

For high-value registrations, users may optionally use **private transaction submission**, but this is intentionally kept **outside the protocol**.

---

## 📡 Events

### `NameRegistered`

```solidity
event NameRegistered(string label, string namespace, address owner);
```

Emitted on paid or free registration.

---

### `NamespaceRegistered`

```solidity
event NamespaceRegistered(
  string namespace,
  uint256 pricePerName,
  address creator
);
```

Emitted when a namespace is created.

---

## 🧾 Contract Address

**Ethereum Mainnet**

> Address: `TBD`
> (Etherscan link will be added after deployment)

---

## 🧠 Design Philosophy

XNS is intentionally minimal:

- Immutable mappings
- Immutable ownership (set at deployment)
- No admin keys
- No upgrades
- No tokenization
- No off-chain trust

It is designed to be:

- Easy to reason about
- Easy to integrate
- Hard to abuse

---

If you want next, we can:

- Add a **“How to use XNS via Etherscan”** walkthrough
- Write a **short protocol integration guide**
- Or tighten the tone further (more playful vs more formal)
