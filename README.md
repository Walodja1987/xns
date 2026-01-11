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

### ®️ Name Registration

To register an XNS name, follow the following steps:

1. Call `registerName` on the contract at [0x123..333](https://etherscan.io/) with the namespace's required price (see [price list](#🔥-xns-price-list) below).
2. Wait a few blocks for confirmation, then verify with `getAddress` and `getName`.

**Example:** 
- To register `alice.xns`, call `registerName("alice", "xns")` with the required price (check with `getNamespaceInfo("xns")`).

**Requirements:** 
- **Registration**: Name must be unregistered, and your address must not already have a name.
- **Label:**
   - 1–20 characters
   - Lowercase letters/digits/hypens only
   - Cannot start/end with hyphen (`-`)
   - Cannot contain consecutive hyphens (`--`)

**Examples:**
- ✅ `alice.xns`
- ✅ `bob.yolo`
- ✅ `vitalik.100x`
- ✅ `garry.ape`
- ❌ `thisisaveryverylongname.xns` (label length is greater than 20)
- ❌ `Name.xns` (contains a capital letter)
- ❌ `-name.gm` (starts with hyphen)
- ❌ `name-.og` (ends with hyphen)
- ❌ `my--name.888` (consecutive hyphens)

**Additional comments:**
- If you're unsure of a namespace's price, check the [price list](#-xns-price-list) below or retrieve it with `getNamespaceInfo("your_namespace")` by replacing `"your_namespace"` with your desired namespace.
- Calling `registerName(label, namespace)` always links names to the caller's address.

### Name Registration via Etherscan

You can register your name directly via [Etherscan](https://sepolia.etherscan.io/address/0x04c9AafC2d30857781dd1B3540411e24FA536e39).

> ⚠️**Important:** Ensure you are connected to the wallet address that you want to associate with the name.

<img width="302" height="82" alt="image" src="https://github.com/user-attachments/assets/628791be-b647-4bcc-b85f-f75289afac1c" />

**Example 1:** Registering `bob.xns` in the `xns` namespace (costs 0.001 ETH):
<img width="670" height="301" alt="image" src="https://github.com/user-attachments/assets/2323cac5-060d-4cc8-abc6-0a27ea3f03d4" />

**Example 2:** Registering the bare name `vitalik` (costs 100 ETH):
<img width="664" height="296" alt="image" src="https://github.com/user-attachments/assets/a1fd1570-c946-4049-a812-528eed7c7878" />



### 💤 Namespace Registration

To register a namespace, follow the following steps:

1. Call `registerNamespace` on the contract at [0x123..333](https://etherscan.io/) with 200 ETH (or 0 ETH if you're the contract owner in the first year).
2. Wait a few blocks for confirmation, then verify with `getNamespaceInfo`.

**Example:** 
- To register namespace `"yolo"` with a price of 0.250 ETH per name, call `registerNamespace("yolo", 0.25 ether)` with 200 ETH (any excess will be refunded).

**Requirements:** 
- **Namespace:**
   - 1–4 characters
   - Lowercase letters/digits only (`a-z`, `0-9`)
   - Must not exist yet
   - Cannot be `"eth"` (forbidden to avoid confusion with ENS)
- **Price per name:**
   - Must be a multiple of 0.001 ETH (0.001, 0.002, 0.250, etc.)
   - Each price can only be assigned to one namespace (price uniqueness is enforced)
- **Fee:** 200 ETH registration fee (contract owner pays 0 ETH during the first year after deployment)

**Examples:**
- ✅ `yolo`
- ✅ `100x`
- ✅ `ape`
- ✅ `001`
- ❌ `YOLO` (uppercase)
- ❌`toolong` (more than 4 characters)
- ❌`eth` (forbidden)
- ❌`my-n` (contains hyphen)

**Additional comments:**
- As the namespace creator, you'll receive 5% of all name registration fees for names registered in your namespace forever.

### Namespace Registration via Etherscan

You can register your name directly via [Etherscan](https://sepolia.etherscan.io/address/0x04c9AafC2d30857781dd1B3540411e24FA536e39).

<img width="666" height="302" alt="image" src="https://github.com/user-attachments/assets/1bcea62d-4591-42f5-8507-665c0b5e59e2" />

> 💡**Note:** In the screenshot, `2000000000000000` represents the registration price (in wei) for the namespace.

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

Every namespace has a distinct price, always set as a multiple of 0.001 ETH.

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

## 🔗 Address

The XNS contract is deployed on Ethereum at the following address: [xxx](https://etherscan.io/address/xxx)

<!-- [Contract deployment transaction](https://etherscan.io/tx/xxx) -->

For testing purposes, you can use the deployed contract on Sepolia at: [0x04c9AafC2d30857781dd1B3540411e24FA536e39](https://sepolia.etherscan.io/address/0x04c9AafC2d30857781dd1B3540411e24FA536e39)

The testnet contract has been parametrized as follows:
- Namespace registration fee: 0.1 ether (instead of 200 ether)
- Namespace creator exclusive period: 60 seconds (instead of 30 days)
- Initial owner namespace registration period: 60 seconds (instead of 365 days)
- Bare name price: 0.2 ether (instead of 100 ether)

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

## 🔧 Integration Guide for Contract Developers

### Overview

XNS can be integrated into your smart contracts. This allows your contract to register an XNS name (e.g., `myprotocol.xns`), making it easier for users to identify your contract address.

Since XNS only exists on Ethereum mainnet, **your contract must be deployed on Ethereum** to use XNS. If your contract is deployed to the same address on other chains (e.g., using CREATE2 with the same salt), you can use the XNS name registered on Ethereum for those chains in your Address Book documentation, as the name will resolve to the correct address.

### Integration on Ethereum

For contracts deployed only on Ethereum, there are two ways to integrate XNS:

#### Option 1: Register via Separate Function

```solidity
// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {IXNS} from "./interfaces/IXNS.sol";

contract MyProtocol {
    IXNS public immutable xns;

    constructor(address _xns) {
        xns = IXNS(_xns);
    }

    /// @notice Register an XNS name for this contract
    /// @param label The label to register (e.g., "myprotocol")
    /// @param namespace The namespace to register in (e.g., "xns")
    function registerName(string calldata label, string calldata namespace) external payable {
        xns.registerName{value: msg.value}(label, namespace);
    }
}
```

After deployment, call `registerName("myprotocol", "xns")` with the required payment to register the name.

#### Option 2: Register via Constructor

```solidity
// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {IXNS} from "./interfaces/IXNS.sol";

contract MyProtocol {
    constructor(address _xns, string memory label, string memory namespace) payable {
        IXNS(_xns).registerName{value: msg.value}(label, namespace);
    }
}
```

Deploy with the `label`, `namespace`, and required payment to register the name during contract creation.

> **Note:** In both integration options, any excess payment is refunded by XNS to `msg.sender`, which will be your contract. Be sure to implement a `receive()` function to accept ETH payments, and provide a way to withdraw any refunded ETH if needed. To avoid receiving refunds altogether, send exactly the required payment when calling `registerName`.

#### Option 3: Sponsored Registration via EIP-1271

For contracts that implement EIP-1271 (like contract wallets), someone else can sponsor the name registration:

// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {ECDSA} from "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";

contract MyContractWallet {
    using ECDSA for bytes32;
    
    address public owner;
    bytes4 public constant MAGIC_VALUE = bytes4(0x1626ba7e);
    bytes4 public constant INVALID_SIGNATURE = bytes4(0xffffffff);

    constructor(address _owner) {
        owner = _owner;
    }

    /// @notice EIP-1271 function to validate signatures
    /// @param hash The message hash that was signed
    /// @param signature The signature to validate
    /// @return magicValue Returns MAGIC_VALUE if signature is valid
    function isValidSignature(bytes32 hash, bytes memory signature) 
        external 
        view 
        returns (bytes4 magicValue) 
    {
        address signer = hash.recover(signature);
        if (signer == owner) {
            return MAGIC_VALUE;
        }
        return INVALID_SIGNATURE;
    }
}
**How it works:**
1. The contract (or its owner) signs an EIP-712 message authorizing the name registration
2. A sponsor calls `registerNameWithAuthorization` on XNS, providing the contract as the recipient
3. XNS validates the signature via the contract's `isValidSignature` function
4. The sponsor pays the registration fee

**Use cases:**
- Contract wallets (Safe, Argent, etc.) that want to be named
- Contracts that can't send transactions themselves
- Allow others to pay for your contract's name registration

**Note:** The contract must implement EIP-1271's `isValidSignature` function. The sponsor pays all fees and gas costs.

### Multi-Chain Deployment Considerations

If your protocol will be deployed across multiple chains, follow these best practices:

#### 1. **Use a Separate Registration Function (Recommended)**

Avoid registering names in the constructor. Instead, use a separate `registerName` function that can be called after deployment once you've confirmed your contract address on Ethereum:

**Why?**
- Deploying on the same address across multiple chains requires identical constructor arguments (e.g., using CREATE2 with the same salt)
- If your contract has different addresses on different chains, registering in the constructor could bind a name to an address that doesn't match on other chains
- A separate function allows you to verify address consistency before registration

**Implementation:**

To maintain the same address across chains, you must pass the same constructor arguments. As XNS does not exist outside of Ethereum and would revert when calling `registerName`, use a `chainId` check to fail gracefully on non-Ethereum chains:

```solidity
IXNS public immutable xns;

constructor(address _xns) {
    // Pass the same XNS address (or address(0)) on all chains to maintain same address
    require(address(_xns) != address(0), "XNS contract address not set");
    xns = IXNS(_xns);
}

function registerName(string calldata label, string calldata namespace) external payable {
    // Guard: XNS only exists on Ethereum mainnet
    require(block.chainid == 1, "XNS only available on Ethereum mainnet");
    xns.registerName{value: msg.value}(label, namespace);
}
```

#### 3. **Constructor Registration (Alternative)**

While less flexible, constructor registration is acceptable if you:
- Ensure consistent deployment addresses across chains (e.g., using CREATE2 with same salt)
- Document which chains share the same address
- Accept that the name will only be meaningful on Ethereum and chains with the same address

**Example:**
```solidity
IXNS public immutable xns;

constructor(address _xns, string memory label, string memory namespace) payable {
    // Only set xns on Ethereum mainnet
    if (block.chainid == 1) {
        xns = IXNS(_xns);
        // Register name if label provided
        if (bytes(label).length > 0) {
            xns.registerName{value: msg.value}(label, namespace);
        }
    }
}
```

### Documentation Strategy for Address Books

When documenting your protocol's contract addresses across multiple chains:

1. **For chains where the contract address matches the one on Ethereum:**
   - Register the XNS name on Ethereum mainnet
   - Use the XNS name in your documentation/address book (e.g., `myprotocol.xns`)
   - Example: "Deployed on Ethereum, Polygon, Arbitrum, Optimism, and Base at `myprotocol.xns`"

2. **For chains where the contract address differs:**
   - Use the actual contract address (not the XNS name)
   - Example: "Deployed on Avalanche at `0x1234...5678`"

### Access Control

Consider adding access control to your `registerName` function to prevent unauthorized registrations:

```solidity
address public owner;

modifier onlyOwner() {
    require(msg.sender == owner, "Not owner");
    _;
}

function registerName(string calldata label, string calldata namespace) external payable onlyOwner {
    require(address(xns) != address(0), "XNS not available on this chain");
    xns.registerName{value: msg.value}(label, namespace);
}
```

### Getting the XNS Contract Address

After contract deployment, applications can query the address via `getAddress("myprotocol.xns")` on Ethereum.

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
