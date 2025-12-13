Perfect, thanks for the style guide — that helps a lot.
Below is **fresh documentation for the *current* XNS design**, written in the *same tone and structure*, but accurately reflecting what we actually built (no ENS migration, no transfers, no DETH, etc.).

I’ve intentionally kept it **clean, honest, and minimal**, aligned with your “v1 is a simple immutable registry” philosophy.

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

Once a name is registered, it is forever linked to the owner’s address.

---

## ✨ Core Properties

### 🔒 Permanent Ownership

XNS names never expire.

* No renewals
* No grace periods
* No risk of losing your name

If you register a name, it is yours **forever**.

---

### 🔥 ETH Burn–Based Registration

Names are registered by **burning ETH**.

* The ETH is burned via the **DETH** contract
* When ETH is burned, the sender is credited **DETH**
* Burned ETH is permanently removed from circulation
* The burn amount determines the **namespace** of the name

There is no secondary market and no resale incentive.

---

### 🧭 One Name per Address

Each Ethereum address may own **at most one XNS name**.

This guarantees:

* Clear identity mapping
* No name farming
* Simple reverse lookup (`address → name`)

---

### 🧠 Fully On-Chain Resolution

XNS supports both:

* **Forward lookup:** name → address
* **Reverse lookup:** address → name

Both are available via on-chain view functions and can be queried directly via Etherscan — no indexers required.

---

## 🏷 Names & Namespaces

An XNS name consists of:

```
<label>.<namespace>
```

Example:

```
vitalik.001
alice.yolo
nike.x
```

### 🔹 Labels

The label is the name chosen by the user.

Rules:

* 1–20 characters
* Lowercase letters `a–z`
* Numbers `0–9`
* Hyphen `-` allowed (not at start or end)

Examples:

* ✅ `vitalik`
* ✅ `my-name`
* ❌ `-name`
* ❌ `name-`

---

### 🔹 Namespaces

The namespace is determined by the **amount of ETH burned** during registration.

* Namespaces are **permissionless**
* Anyone can create a namespace by paying a one-time fee
* Each namespace has a fixed price per name

Namespace rules:

* 1–4 characters
* Lowercase letters `a–z` and digits `0–9`
* The namespace `"eth"` is forbidden to avoid confusion with ENS

---

## ⭐ The Special Namespace `.x`

XNS includes a **special namespace** called:

```
.x
```

This namespace represents **suffix-free names**.

### How it works:

* Registering `label` **without specifying a namespace** implicitly registers:

  ```
  label.x
  ```
* The `.x` namespace is intentionally **expensive** to ensure rarity.

### Pricing:

* `.x` names cost **100 ETH**
* Example:

  ```
  nike.x   → displayed simply as "nike"
  ```

The `.x` namespace is **not a default** — it is a **premium, special namespace**.

---

## 🔥 Namespace Pricing Model

Namespaces are mapped to **exact ETH amounts**, in increments of **0.001 ETH**.

Examples:

| ETH Burn  | Name                 |
| --------- | -------------------- |
| 0.001 ETH | alice.001            |
| 0.250 ETH | alice.250            |
| 0.999 ETH | alice.999            |
| 100 ETH   | alice (i.e. alice.x) |

The ETH amount uniquely determines the namespace.

---

## 👥 Namespace Creators & Free Names

When a new namespace is created:

* The creator receives **200 free name registrations**
* These can be assigned to any addresses
* Free names:

  * Do **not** require ETH
  * Are limited by a **remaining counter**

### Remaining Free Names

Each namespace tracks:

```
remainingFreeNames (starts at 200)
```

* Decreases with each free assignment
* Cannot go below zero
* Can be used **at any time**, even after public registration opens

---

## ⏳ Exclusive Period

For the first **30 days** after a namespace is created:

* **Only the namespace creator** can register paid names under that namespace

After 30 days:

* Anyone can register paid names
* The creator may still use any remaining free names

---

## 🔧 Key Functions

### Register a Name

```solidity
register(string label) payable
```

* Burns `msg.value` ETH
* Namespace is derived from the ETH amount
* Registers `label.namespace` for `msg.sender`

---

### Forward Lookup (Name → Address)

```solidity
getAddress(string label, string namespace)
getAddress(string fullName)
```

Examples:

```solidity
getAddress("vitalik", "001")
getAddress("vitalik.001")
getAddress("nike") // resolves nike.x
```

---

### Reverse Lookup (Address → Name)

```solidity
getName(address owner)
```

Returns:

```solidity
(label, namespace)
```

If the address has no name, empty strings are returned.

---

### Namespace Queries

```solidity
getNamespace(uint256 price)
getNamespaceInfo(string namespace)
getNamespaceInfo(uint256 price)
```

These functions allow users to:

* Determine which namespace corresponds to an ETH amount
* Inspect namespace metadata on-chain
* Query remaining free names and creator information

---

## 📡 Events

### `NameRegistered`

Emitted whenever a name is registered (paid or free):

```solidity
event NameRegistered(
    string label,
    string namespace,
    address owner
);
```

### `NamespaceRegistered`

Emitted when a new namespace is created:

```solidity
event NamespaceRegistered(
    string namespace,
    uint256 pricePerName,
    address creator
);
```

---

## 🧾 Contract Address

The XNS contract is deployed on Ethereum:

> **Address:** `TBD`
> (link to Etherscan will be added after deployment)

---

## 🧠 Design Philosophy

XNS is intentionally minimal:

* Immutable mappings
* No admin keys
* No upgrades
* No tokenization
* No off-chain trust

It is designed to be:

* Easy to reason about
* Easy to integrate
* Hard to abuse

---

If you want, next we can:

* Tighten language further (more playful vs more serious),
* Add a **“How to use XNS via Etherscan”** section,
* Or prepare a **short developer integration guide**.
