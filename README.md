# XNS – The Permanent Name Registry on Ethereum

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

**XNS** is a decentralized, Ethereum-native name registry that **maps human-readable names to Ethereum addresses**.

**Key properties:**
- **Permanent, immutable, and non-transferable**: Names are forever linked to the owner's address. There is no secondary market or resale mechanism.
- **One name per address**: Each address can own at most one XNS name, ensuring clear identity mapping and simple reverse lookup.
- **Fully on-chain**: All resolution is done via on-chain view functions and can be queried directly via **Etherscan**; no indexers required.

Registration works by **burning ETH**, supporting Ethereum's deflationary mechanism. Registrants receive DETH credits that can be used as burn attestations in downstream applications. See the [DETH contract repository](https://github.com/Walodja1987/deth) for details.


## 🏷 Name Format

XNS names follow the format `<label>.<namespace>`.

Examples:

```
vitalik.001
alice.yolo
nike.ape
```


XNS also supports **bare names**, i.e. names without a suffix (e.g., `nike`, `vitalik`, `alice`). Bare names are premium names costing 100 ETH per name.


## ✨ How It Works

### ®️ Registering a Name

1. Call the `registerName` function on the contract at [0x123..333](https://etherscan.io/) with the associated price tag for the chosen namespace.
2. After submitting your transaction, wait a few blocks for confirmation.
3. Then, use the `getAddress` and `getName` functions to ensure your chosen name correctly resolves to your address.

**Example:** To register `alice.xns`:
- Call `registerName` with `label = "alice"` and `namespace = "xns"`.
- Send the required price for the `"xns"` namespace (e.g., 0.001 ETH).

If you're unsure of a namespace's price, retrieve it with `getNamespaceInfo("your_namespace")` by replacing `"your_namespace"` with your desired namespace.

**Important:** 
- A valid label is:
   - Length 1–20
   - Consists only of [a-z0-9-]
   - Cannot start or end with `-`
   - Cannot contain consecutive hyphens (`--`)

- For a registration to succeed, 
   - The name must not be registered yet
   - The registering address does not have a name yet

- With `registerName(label, namespace)`, names are always linked to the caller's address and cannot be assigned to another address.

Examples:
- ✅ `alice.xns`
- ✅ `bob.yolo`
- ✅ `vitalik.100x`
- ✅ `garry.ape`
- ❌ `thisisaveryverylongname.xns` (label length is greater than 20)
- ❌ `Name.xns` (contains a capital letter)
- ❌ `-name.gm` (starts with hyphen)
- ❌ `name-.og` (ends with hyphen)
- ❌ `my--name.888` (consecutive hyphens)


### 💤 Register a namespace

1. Call the `registerNamespace` function on the contract at [0x123..333](https://etherscan.io/).
2. After submitting your transaction, wait a few blocks for confirmation.
3. Then, use the `getNamespaceInfo` function to verify your namespace was registered correctly with the intended price.

**Example:** To register a namespace "yolo" with a price of 0.250 ETH per name:
- Call `registerNamespace` with `namespace = "yolo"` and `pricePerName = 0.25 ether` (250000000000000000 wei).
- Send 200 ETH as the namespace registration fee (any excess will be refunded).

>**Note:** During the first year after contract deployment, the contract owner can register namespaces for free.

**Important:** 
- The price per name must be a multiple of 0.001 ETH (0.001, 0.002, 0.250, etc.).
- Each price can only be assigned to one namespace (price uniqueness is enforced).
- Namespaces must be 1–4 characters long and contain only lowercase letters and digits (`a-z`, `0-9`).
- The namespace must not exist yet.
- The namespace `"eth"` is forbidden to avoid confusion with ENS.
- As the namespace creator, you'll receive 5% of all name registration fees for names registered in your namespace.

Valid Examples:
✅ 100x
✅ bob.yolo
✅ vitalik.100x
✅ garry.ape

---

### Price list

## 🔥 XNS Price list

| Namespace | ETH Amount   |
| --------- | -----------  |
| xns       | 0.001 ETH    | 
| gm        | 0.002 ETH    |
| long      | 0.003 ETH    |
| wtf       | 0.004 ETH    |
| yolo      | 0.005 ETH    |
| bro       | 0.006 ETH    |
| chad      | 0.007 ETH    |
| og        | 0.008 ETH    |
| hodl      | 0.009 ETH    |
| maxi      | 0.010 ETH    |
| bull      | 0.015 ETH    |
| pump      | 0.025 ETH    |
| 100x      | 0.030 ETH    |
| xyz       | 0.035 ETH    |
| ape       | 0.040 ETH    |
| moon      | 0.045 ETH    |
| com       | 0.050 ETH    |
| io        | 0.055 ETH    |
| 888       | 0.888 ETH    |

---

### 🔥 ETH Burn–Based Registration

Names are registered by burning ETH. The amount of ETH burned determines the namespace.

- 90% of ETH sent is burned via the [DETH contract](https://github.com/Walodja1987/deth), contributing Ethereum's deflationary mechanism and ETH's value accrual
- The sender is credited DETH 1:1

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
- Hyphen **cannot** appear consecutively (e.g., `--`)

Examples:

- ✅ `vitalik`
- ✅ `my-name`
- ❌ `-name` (starts with hyphen)
- ❌ `name-` (ends with hyphen)
- ❌ `my--name` (consecutive hyphens)

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
registerName(string label, string namespace) payable
```

- Burns `msg.value` ETH (must be >= the namespace's registered price)
- Registers `label.namespace` for `msg.sender`
- Excess payment is refunded
- During the 30-day exclusivity period, only the namespace creator can use this function

Example:

```solidity
xns.registerName{value: 0.001 ether}("alice", "001");
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
) payable returns (uint256 successfulCount)
```

- Batch version of `registerNameWithAuthorization` to register multiple names in a single transaction
- All registrations must be in the same namespace
- Requires `msg.value >= pricePerName * successfulCount` (where `successfulCount` is the number of names actually registered)
- Payment is only processed for successful registrations; skipped items are not charged
- Excess payment is refunded
- Returns the number of successfully registered names (may be 0 if all registrations were skipped)
- If no registrations succeed, refunds all payment and returns 0
- Skips registrations where recipient already has a name or name is already registered (griefing resistance)
- More gas efficient than calling `registerNameWithAuthorization` multiple times
- During the 30-day exclusivity period, only the namespace creator can sponsor batch registrations
- Burns ETH only for successful registrations (90% burnt, 5% to namespace creator, 5% to contract owner)
- Registers names to recipients, not `msg.sender`
- Resistant to griefing attacks: if someone front-runs and registers a name for one recipient, that registration is skipped and others proceed

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


---

 ## 📚 Documentation
  
  - [API Reference](docs/API.md) - Complete function documentation
  - [Audit Information](docs/AUDIT.md) - For auditors and code reviewers