# XNS – The Name Registry on Ethereum

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

## Table of contents

1. [Overview](#🚀-overview)
2. [How It Works](#✨-how-it-works)
3. [XNS Price list](#🔥-xns-price-list)
4. [Namespace Creator Privileges](#👥-namespace-creator-privileges)
5. [Contract Address](#🔗-contract-address)
6. [Fees](#💰-fees)
7. [Integration Guide for Contract Developers](#🔧-integration-guide-for-contract-developers)
8. [License and Deployment Policy](#📄-license-and-deployment-policy)

### API Reference

See the [API Reference](docs/API.md) for complete documentation of all XNS contract functions, events, state variables, and types.

### Developer Notes

See the [Developer Notes](docs/DEV_NOTES.md) for design decisions, code style guidelines, governance considerations, and known limitations. This document is primarily intended for auditors and developers working on the XNS contract.



## 🚀 Overview

**XNS** is a decentralized, Ethereum-native name registry that **maps human-readable names to Ethereum addresses**.

**Key properties:**
- **Permanent**: Names are permanently linked to an Ethereum address; no expiration, no secondary market or resale mechanism.
- **One name per address**: Each address can own at most one XNS name, ensuring a unique identity mapping and simple lookup.
- **Fully on-chain**: All resolution (name → address, address → name) is done via on-chain view functions; no indexers required.

Each name has a pre-defined price, denominated in ETH, determined by its namespace (see [XNS price list](#🔥-xns-price-list) below). **90% of the ETH paid** for name registration is **permanently burned**, supporting Ethereum's deflationary mechanism. Registrants receive [DETH credits](https://github.com/Walodja1987/deth) that can be used as burn attestations in downstream applications.

### 🏷 Name Format

XNS names follow the format `<label>.<namespace>`.

Examples:

```
vitalik.001
alice.yolo
nike.ape
```

Labels and namespaces are subject to the following format rules:
- Must be 1–20 characters long
- Must consist only of lowercase letters (`a-z`), digits (`0-9`), and hyphens (`-`)
- Cannot start or end with `-`
- Cannot contain consecutive hyphens (`--`)
- "eth" as namespace is disallowed to avoid confusion with ENS

**Valid name examples:**
- ✅ `alice.xns`
- ✅ `vitalik.100x`
- ✅ `crypto-degen.yolo`
- ✅ `to-the-moon.bull`
- ✅ `gm.wen-lambo`
- ✅ `2-rich.4-you`

**Invalid name examples:**
- ❌ `thisisaveryverylongname.xns` (too long - max 20 characters)
- ❌ `Name.xns` (uppercase not allowed)
- ❌ `gm@web3.xyz` (cannot have special characters)
- ❌ `-name.gm` (cannot start with hyphen)
- ❌ `name-.og` (cannot end with hyphen)
- ❌ `my--name.888` (cannot have consecutive hyphens)

XNS also supports **bare names**, i.e. names without a namespace suffix (e.g., `nike`, `vitalik`, `alice-walker`, `1xy`). Bare names are premium names costing 10 ETH per name.


## ✨ How It Works

### ®️ Name Registration

Registering an XNS name is straightforward:

1. **Choose a name**: Pick a label (like `alice`) and a namespace (like `xns`) to create your name (`alice.xns`)
2. **Check the price**: Each namespace has a set price per name (see [price list](#🔥-xns-price-list) below)
3. **Register**: Send a transaction with the required ETH amount to register your name
4. **Verify**: Wait a few blocks, then verify your name is registered

**Important notes:**
- Each address can own **only one name**
- Names are **permanent** and cannot be changed or transferred
- For **public namespaces**: Anyone can register after the 30-day exclusivity period
- For **private namespaces**: Only the namespace creator can register names

> 💡 **For detailed technical information**, see the [API Reference](docs/API.md) for function signatures, parameters, and return values.

### Name Registration via Etherscan

You can register your name directly via [Etherscan](https://sepolia.etherscan.io/address/0x4f1d1F8C7C96C2798B0A473fE35633A47dad37f9).

> ⚠️**Important:** Ensure you are connected to the wallet address that you want to associate with the name.

<img width="302" height="82" alt="image" src="https://github.com/user-attachments/assets/628791be-b647-4bcc-b85f-f75289afac1c" />

**Example 1:** Registering `bob.xns` in the `xns` namespace (costs 0.001 ETH):
<img width="670" height="301" alt="image" src="https://github.com/user-attachments/assets/2323cac5-060d-4cc8-abc6-0a27ea3f03d4" />

**Example 2:** Registering the bare name `vitalik` (costs 10 ETH):
<img width="664" height="296" alt="image" src="https://github.com/user-attachments/assets/a1fd1570-c946-4049-a812-528eed7c7878" />


### 💤 Namespace Registration

XNS supports two types of namespaces: **public** and **private**. Each has different rules, fees, and use cases.

#### Public Namespaces

**What they are:**
- Open to everyone after a 30-day exclusivity period
- Anyone can register names in public namespaces (after exclusivity period)
- Creator receives 5% of all name registration fees forever

**How to register:**
- Pay a one-time fee of **50 ETH** (contract owner pays 0 ETH during the first year)
- Set your desired price per name (must be a multiple of 0.001 ETH)
- You get 30 days of exclusive registration rights

**Examples of valid namespaces:**
- ✅ `yolo`, `100x`, `ape`, `001`
- ✅ `my-public-ns`, `test-123` (hyphens allowed)
- ❌ `YOLO` (uppercase not allowed)
- ❌ `eth` (reserved to avoid confusion with ENS)

**Examples:**
- ✅ `yolo`
- ✅ `100x`
- ✅ `ape`
- ✅ `001`
- ✅ `my-public-ns` (hyphens allowed)
- ✅ `test-123` (hyphens with digits)
- ❌ `YOLO` (uppercase)
- ❌`this-is-too-long-namespace` (more than 20 characters)
- ❌`eth` (forbidden)
- ❌`-my-ns` (starts with hyphen)
- ❌`my-ns-` (ends with hyphen)
- ❌`my--ns` (consecutive hyphens)

**Additional comments:**
- As the public namespace creator, you'll receive 5% of all name registration fees for names registered in your namespace forever.
- After a 30-day exclusivity period, anyone can register names in your public namespace via `registerName`.

#### Private Namespaces

**What they are:**
- Restricted to the creator forever
- Only the creator can register names (no time limit)
- Creator receives 0% of name registration fees (contract owner receives 10%)

**How to register:**
- Pay a one-time fee of **10 ETH** (contract owner pays 0 ETH during the first year)
- Set your desired price per name (minimum 0.001 ETH, must be a multiple of 0.001 ETH)
- You get **permanent exclusive rights** to register names in this namespace

**Use cases:**
- Organizations wanting to control who gets names in their namespace
- Projects that want branded namespaces for their community
- Any scenario where you want complete control over name registrations

> 💡 **For technical details**, see the [API Reference](docs/API.md) for `registerPublicNamespace` and `registerPrivateNamespace` functions.

### Namespace Registration via Etherscan

You can register your name directly via [Etherscan](https://sepolia.etherscan.io/address/0x04c9AafC2d30857781dd1B3540411e24FA536e39).

<img width="666" height="302" alt="image" src="https://github.com/user-attachments/assets/1bcea62d-4591-42f5-8507-665c0b5e59e2" />

> 💡**Note:** In the screenshot, `2000000000000000` represents the registration price (in wei) for the namespace.

### Name Resolution

XNS provides simple on-chain resolution for names and addresses.

**Forward Lookup (Name → Address):**
- Resolve a name like `vitalik.001` or `nike` to its Ethereum address
- Works directly on Etherscan or any Ethereum interface
- Returns `0x0000...` if the name is not registered

**Reverse Lookup (Address → Name):**
- Find the XNS name for any Ethereum address
- Returns the full name format (e.g., `alice.001` or just `vitalik` for bare names)
- Returns an empty string if the address has no name

> 💡 **For technical details**, see the [API Reference](docs/API.md) for `getAddress` and `getName` functions.



### Namespace Queries

Query any namespace to get information about:
- Price per name
- Creator address
- Creation timestamp
- Whether it's private or public

> 💡 **For technical details**, see the [API Reference](docs/API.md) for `getNamespaceInfo` function.




## 🔥 XNS Price list

| Namespace | ETH Amount   |
|  | --  |
| xns       | 0.001 ETH    | 
| more to come...        |     |




## 👥 Namespace Creator Privileges

**Important:** The namespace creator address is set at namespace creation time and **never changes**.

- Creator privileges are tied to the specific address that created the namespace
- These privileges are **immutable** and cannot be transferred

### Public Namespace Creators

- During the 30-day exclusivity period, only the creator can:
  - Register paid names for themselves via `registerName`
  - Sponsor paid name registrations for others via `registerNameWithAuthorization`
- After 30 days, anyone can register names in the public namespace
- Public namespace creators receive **5%** of all name registration fees forever

### Private Namespace Creators

- **Permanent exclusive rights**: Only the creator can register names forever (no time limit)
- The creator can register names for themselves via `registerName`, or sponsor registrations for others via `registerNameWithAuthorization`
- Private namespace creators receive **0%** of name registration fees (contract owner receives 10%)



### Exclusive Period

#### Public Namespaces

For the first **30 days** after a public namespace is created:

- **Only the namespace creator** may register paid names under that namespace
- The creator can:
  - Register a name for themselves using `registerName`
  - Sponsor name registrations for others using `registerNameWithAuthorization` (requires recipient's EIP-712 signature)
- Public `registerName` is **disabled** for non-creators during this period

After 30 days:

- Anyone may register paid names via `registerName`
- Anyone may sponsor name registrations via `registerNameWithAuthorization`

#### Private Namespaces

- **Permanent exclusivity**: Only the namespace creator can register names forever
- The creator can register names for themselves via `registerName`, or sponsor registrations for others via `registerNameWithAuthorization`
- Non-creators cannot use `registerName` for private namespaces (they must be sponsored by the creator)



## 🧾 Contract Address

The XNS contract is deployed on Ethereum at the following address: [xxx](https://etherscan.io/address/xxx)

<!-- [Contract deployment transaction](https://etherscan.io/tx/xxx) -->

For testing purposes, you can use the deployed contract on Sepolia at: [0x04c9AafC2d30857781dd1B3540411e24FA536e39](https://sepolia.etherscan.io/address/0x04c9AafC2d30857781dd1B3540411e24FA536e39)

The testnet contract has been parametrized as follows:
- Public namespace registration fee: 0.1 ether (instead of 50 ether)
- Private namespace registration fee: 0.005 ether (instead of 10 ether)
- Namespace creator exclusive period: 60 seconds (instead of 30 days)
- Onboarding period: 60 seconds (instead of 365 days)
- Bare name price: 0.2 ether (instead of 10 ether)



## 💰 Fees

**Name Registration Fees:**
- **90%** of ETH is permanently burned (supporting Ethereum's deflationary mechanism)
- **10%** is distributed as fees:
  - **Public namespaces**: 5% to namespace creator + 5% to contract owner
  - **Private namespaces**: 10% to contract owner (creator receives 0%)

**Namespace Registration Fees:**
- **90%** of ETH is permanently burned
- **10%** goes to the contract owner (namespace creator receives 0%)

**Important:** Namespace creators only receive fees from name registrations in their namespace (public namespaces only), not from the namespace registration fee itself.

### Claiming Fees

Fees accumulate automatically and must be claimed to be withdrawn. You can:
- Check pending fees for any address
- Claim fees to yourself (`claimFeesToSelf`)
- Claim fees to a different recipient (`claimFees`)

> 💡 **For technical details**, see the [API Reference](docs/API.md) for `getPendingFees`, `claimFees`, and `claimFeesToSelf` functions.



## 🔧 Integration Guide for Contract Developers

XNS can be integrated into your smart contracts, allowing users to identify your contract by a human-readable name (e.g., `myprotocol.xns`) instead of a long address.

**Important:** XNS only exists on Ethereum mainnet. If your contract is deployed to the same address on multiple chains, you can register the name on Ethereum and reference it in your documentation for other chains.

> 💡 **Full integration examples** and code samples are provided below. For complete function documentation, see the [API Reference](docs/API.md).

### Integration on Ethereum

For contracts deployed only on Ethereum, there are three ways to integrate XNS:

#### Option 1: Register via Constructor

```solidity
// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {IXNS} from "./interfaces/IXNS.sol";

contract MyProtocol {
    constructor(address _xns, string memory label, string memory namespace) payable {
        IXNS(_xns).registerName{value: msg.value}(label, namespace);
    }

    /// @notice Optional: Accept ETH refunds from XNS if excess payment is sent.
    /// Not needed if correct prices is sent, without any excess.
    receive() external payable {}
}
```

Deploy with the `label`, `namespace`, and required payment to register the name during contract creation.

> **Note:** In both integration options, any excess payment is refunded by XNS to `msg.sender`, which will be your contract. Be sure to implement a `receive()` function to accept ETH payments, and provide a way to withdraw any refunded ETH if needed. To avoid receiving refunds altogether, send exactly the required payment when calling `registerName`.

See `contracts/src/mocks/MockERC20A` and `scripts/registerNameForERC20A.ts` for an example of how to register a name for an ERC20 token using the constructor method.

#### Option 2: Register via Separate Function

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

    /// @notice Optional: Accept ETH refunds from XNS if excess payment is sent.
    /// Not needed if correct prices is sent, without any excess.
    receive() external payable {}
}
```

After deployment, call `registerName("myprotocol", "xns")` with the required payment to register the name.

See `contracts/src/mocks/MockERC20B` and `scripts/registerNameForERC20B.ts` for an example of how to register a name for an ERC20 token using the separate `registerName` function approach.

#### Option 3: Sponsored Registration via EIP-1271

For contracts that implement EIP-1271 (like contract wallets), someone else can sponsor the name registration:

```solidity
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
```

**How it works:**
1. The contract (or its owner) signs an EIP-712 message authorizing the name registration
2. A sponsor calls `registerNameWithAuthorization` on XNS, providing the contract as the recipient
3. XNS validates the signature via the contract's `isValidSignature` function
4. The sponsor pays the registration fee

**Use cases:**
- Contract wallets (Safe, Argent, etc.) that want to be named
- Contracts that can't send transactions themselves
- Allow others to pay for your contract's name registration

**Note:** The contract must implement EIP-1271's `isValidSignature` function. The sponsor pays all fees and gas costs. Unlike Options 1 and 2 where `receive()` is optional (needed only if excess payment is sent), Option 3 does **not** need a `receive()` function because any refunds go to the sponsor (the transaction sender), not to the contract.

See `contracts/src/mocks/MockERC20C` and  `scripts/registerNameWithAuthorizationForERC20C.ts` for an example of how to register a name for an ERC20 token using the EIP-1271 method.

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


## 📄 License and Deployment Policy

XNS is licensed under the [Business Source License 1.1 (BUSL-1.1)](https://github.com/Walodja1987/xns/blob/main/LICENSE).

This choice is intentional and motivated by **technical and user-safety considerations**, not by a desire to restrict innovation.

### Why BUSL?

XNS is an identity and naming primitive. Names like `alice.x` or `bankless` are meant to be
**globally unique, permanent, and unambiguous**.

Allowing unrestricted third-party deployments of the XNS registry on other chains would lead to:
- the same name resolving to different addresses on different networks
- phishing and social-engineering risks
- user confusion about which contract deployment defines the canonical name-to-address mapping

For identity infrastructure, this is unacceptable.

The BUSL license ensures that:
- there is a **single canonical XNS registry** on Ethereum
- users can safely rely on name-address mappings
- the mental model of XNS remains simple and trustworthy

### What Is Allowed?

- Reading the code
- Auditing the code
- Building tools, wallets, indexers, and integrations
- Importing and using the public interfaces
- Non-production and research use

Interfaces and auxiliary files are intentionally kept under permissive licenses (MIT) to enable ecosystem adoption.

### Open Source Commitment

In line with BUSL-1.1, this codebase will automatically transition to an open-source license after the specified Change Date.

However, even after the Change Date, XNS remains **Ethereum-canonical**. The identity, meaning, and trust of XNS names derive from the original
deployment on Ethereum mainnet and its immutable history.

Deployments of this code on other chains after the Change Date are not recognized as XNS and do not share any continuity, guarantees, or
identity with the canonical registry.

XNS does not support cross-chain name equivalence.


 ## 📚 Documentation
  
  - [API Reference](docs/API.md) - Complete function documentation
  - [Audit Information](docs/AUDIT.md) - For auditors and code reviewers
