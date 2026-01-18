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

1. [Overview](#-overview)
2. [How It Works](#-how-it-works)
3. [XNS Price list](#-xns-price-list)
4. [Contract Address](#-contract-address)
5. [Registration Fees](#-registration-fees)
6. [Integration Guide for Contract Developers](#-integration-guide-for-contract-developers)
7. [License and Deployment Policy](#-license-and-deployment-policy)

### API Reference

See the [API Reference](docs/API.md) for complete documentation of all XNS contract functions, events, state variables, and types.

### Developer Notes

See the [Developer Notes](docs/DEV_NOTES.md) for design decisions, code style guidelines, governance considerations, and known limitations. This document is primarily intended for auditors and developers working on the XNS contract.



## 🚀 Overview

**XNS** is an Ethereum-native name registry that **maps human-readable names to Ethereum addresses**. Share `vitalik.xns` or `my.token` instead of copying long hexadecimal strings.

**Key properties:**
- **Permanent:** Each name is irrevocably bound to an Ethereum address; no expiration, no transfer, no resale.
- **Universal naming:** Both EOAs and smart contracts can be named in the same unified registry.
- **Globally unique:** Each name is unique across all Ethereum addresses, preventing conflicts like duplicate ERC20 token names.
- **Permissionless namespaces:** Anyone can create and launch their own namespace without requiring approval from any central party.
- **Private namespaces:** Supports private namespaces where the creator maintains exclusive control over name registrations within their namespace.
- **ETH burning:** 90% of registration fees are permanently burned, supporting Ethereum's deflationary mechanism.

### Name Format

XNS names follow the format `<label>.<namespace>`.

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
- ❌ `gm@web3.xyz` (special characters not allowed)
- ❌ `-name.gm` (cannot start with hyphen)
- ❌ `name-.og` (cannot end with hyphen)
- ❌ `my--name.888` (cannot have consecutive hyphens)


### Bare Names

XNS supports **bare names**, i.e. names without a namespace suffix (e.g., `nike`, `vitalik`, `alice-walker`, `1xy`). Bare names are premium names costing 10 ETH per name.

> **Note:** Internally, all bare names are associated with the special namespace `"x"`. That is, `vitalik` and `vitalik.x` are the same and resolve to the same address.


## ✨ How It Works

### Name Registration

Registering an XNS name is straightforward:

1. **Check Available Namespaces**: Browse the [XNS price list](#-xns-price-list) to find available namespaces and their registration fees (e.g., names within the `xns` namespace cost 0.001 ETH).
2. **Choose a Name**: e.g., `alice.xns` (must not be registered yet).
3. **Register Name**: Send a transaction with the required ETH amount to register your name (see [`registerName`](https://github.com/Walodja1987/xns/blob/main/docs/API.md#registername) in API docs). Any excess will be refunded.
4. **Verify Resolution**: Wait a few blocks, then verify your name is registered (see [`getAddress`](https://github.com/Walodja1987/xns/blob/main/docs/API.md#getAddress) and [`getName`](https://github.com/Walodja1987/xns/blob/main/docs/API.md#getName) in API docs).

**Example scripts:**
* [Name registration for EOA](https://github.com/Walodja1987/xns/blob/main/scripts/examples/registerName.ts)
* [Name registration for ERC20 token (via constructor)](https://github.com/Walodja1987/xns/blob/main/scripts/examples/registerNameForERC20A.ts)
* [Name registration for ERC20 token (via separate `registerName` function)](https://github.com/Walodja1987/xns/blob/main/scripts/examples/registerNameForERC20B.ts)

#### Name Registration via Etherscan

You can register your name directly via [Etherscan](https://sepolia.etherscan.io/address/0x4f1d1F8C7C96C2798B0A473fE35633A47dad37f9).

> ⚠️**Important:** Ensure you are connected to the wallet address that you want to name.

<img width="302" height="82" alt="image" src="https://github.com/user-attachments/assets/628791be-b647-4bcc-b85f-f75289afac1c" />

**Example 1:** Registering `bob.xns` in the `xns` namespace (costs 0.001 ETH):
<img width="670" height="301" alt="image" src="https://github.com/user-attachments/assets/2323cac5-060d-4cc8-abc6-0a27ea3f03d4" />

**Example 2:** Registering the bare name `vitalik` (costs 10 ETH):
<img width="664" height="296" alt="image" src="https://github.com/user-attachments/assets/a1fd1570-c946-4049-a812-528eed7c7878" />

> **Note:** As mentioned earlier, bare names are internally mapped to the special namespace `"x"`. If you register a bare name like `vitalik`, you have to specify `"x"` as the namespace. `vitalik` and `vitalik.x` are equivalent and resolve to the same address.


### Name Resolution

XNS provides simple on-chain resolution for names and addresses.

**Look up Address from Name: [`getAddress`](https://github.com/Walodja1987/xns/blob/main/docs/API.md#getAddress)**
- Resolve a name like `vitalik.001` or `nike` to its Ethereum address
- Works directly on Etherscan or any Ethereum interface
- Returns `0x0000...` if the name is not registered

**Look up Name from Address: [`getName`](https://github.com/Walodja1987/xns/blob/main/docs/API.md#getName)**
- Find the XNS name for any Ethereum address
- Returns the full name format (e.g., `alice.001` or just `vitalik` for bare names)
- Returns an empty string if the address has no name

### Namespace Queries

Query namespace information via [`getNamespaceInfo`](https://github.com/Walodja1987/xns/blob/main/docs/API.md#getnamespaceinfo) to get information about:
- Price per name
- Creator address
- Creation timestamp
- Whether it's private or public


### Name Registration With Authorization

XNS supports **authorized name registration** via [`registerNameWithAuthorization`](https://github.com/Walodja1987/xns/blob/main/docs/API.md#registernamewithauthorization), which allows a third party (sponsor) to pay the registration fee and gas costs while the recipient explicitly authorizes the registration via an EIP-712 signature.

**How it works:**
1. The recipient signs an EIP-712 message authorizing a specific name registration (label, namespace, and recipient address).
2. The sponsor calls `registerNameWithAuthorization` with the recipient's signature and pays the registration fee.
3. The name is registered to the recipient's address.

**Use cases:**
- Organizations registering names for their team members.
- Projects airdropping names to their community.
- Enabling contract wallets (EIP-1271) to register names, as contracts can't send transactions themselves.
- Any scenario where someone else pays registration fees on your behalf.

**Important restrictions:**
- For public namespaces: Only the namespace creator can sponsor registrations during the 30-day exclusivity period.
- For private namespaces: Only the namespace creator can sponsor registrations forever.

**Batch registration:** XNS also supports [`batchRegisterNameWithAuthorization`](https://github.com/Walodja1987/xns/blob/main/docs/API.md#batchregisternamewithauthorization) to register multiple names in a single transaction. See the API documentation for details.

**Example scripts:**
* [Name registration with authorization for EOA](https://github.com/Walodja1987/xns/blob/main/scripts/examples/registerNameWithAuthorization.ts)
* [Name registration via authorization for ERC20 token](https://github.com/Walodja1987/xns/blob/main/scripts/examples/registerNameWithAuthorizationForERC20.ts)
* [Batch name registration with authorization](https://github.com/Walodja1987/xns/blob/main/scripts/examples/batchRegisterNameWithAuthorization.ts)

### Namespace Registration

XNS supports public and private namespaces:

#### Public Namespaces
- **Open Registration:** Anyone can register names in a public namespace, but the creator enjoys an exclusive 30-day period after creation in which only they can register or sponsor names.
- **Creator Rewards:** Public namespace creators receive 5% of all registration fees for names within their namespace, in perpetuity.
- **Registration Fee:** The cost to register a public namespace is **50 ETH**.

#### Private Namespaces
- **Exclusive Registrations:** Only the creator may register names within a private namespace.
- **No Creator Rewards:** The creator does not receive a share of name registration fees; it goes to the XNS contract owner.
- **Registration Fee:** The cost to register a private namespace is **10 ETH**.

**Typical use cases for private namespaces include:**
- Organizations seeking to control who receives names under their brand.
- Companies issuing tokenized assets that require a dedicated namespace (e.g., `ethereum-etf.blackrock`, `multi-asset-fund.blackrock`).
- Projects wanting exclusive, branded namespaces for their communities.
- Any situation requiring full control over registration rights and name allocation.

**How to register a public namespace:**
1. **Choose a Namespace:** Select an available namespace and set the desired price per name (must be a multiple of 0.001 ETH).
2. **Register Namespace:** Submit a transaction with the required ETH to register the namespace (see [`registerPublicNamespace`](https://github.com/Walodja1987/xns/blob/main/docs/API.md#registerpublicnamespace) in the API docs). Any excess will be refunded.

As the public namespace creator, you have an exclusive 30-day window to register or sponsor any name within your namespace. After this period, anyone can freely register names.

**How to register a private namespace:**
1. **Choose a Namespace:** Select an available namespace and set the desired price per name (must be a multiple of 0.001 ETH).
2. **Register Namespace:** Submit a transaction with the required ETH to register the namespace (see [`registerPrivateNamespace`](https://github.com/Walodja1987/xns/blob/main/docs/API.md#registerprivatenamespace) in the API docs). Any excess will be refunded.

The private namespace creator registers names via the authorized flow (see [`registerNameWithAuthorization`](https://github.com/Walodja1987/xns/blob/main/docs/API.md#registernamewithauthorization) in the API docs). The namespace creator can also use the [`registerName`](https://github.com/Walodja1987/xns/blob/main/docs/API.md#registername) function to register a name for themselves.

**Notes:**
- The `eth` namespace cannot be registered to avoid confusion with ENS.
- The XNS contract owner may register namespaces for free during the first year after contract deployment in order to bootstrap the system.

#### Example: Public Namespace Registration via Etherscan

You can register your name directly via [Etherscan](https://sepolia.etherscan.io/address/0x4f1d1F8C7C96C2798B0A473fE35633A47dad37f9).

<img width="665" height="303" alt="image" src="https://github.com/user-attachments/assets/90b4cded-bb3c-468e-a645-5c6405bac0e0" />

> 💡**Note:** In the screenshot, `2000000000000000` (in wei) is the registration fee you set for users to pay when registering names in your namespace.

To register a private namespace, use the [`registerPrivateNamespace`](https://github.com/Walodja1987/xns/blob/main/docs/API.md#registerprivatenamespace) function with the same input fields as the public version. The required registration fee is **10 ETH** (entered in the first field instead of 50); if you send more than 10 ETH, the excess will be automatically refunded.

**Example script:**
* [Public/Private namespace registration](https://github.com/Walodja1987/xns/blob/main/scripts/examples/registerNamespace.ts)

## 🔥 XNS Price list

> **Note**: The [price list](#🔥-xns-price-list) may not be complete as new namespaces can be added over time. It also does not include private namespaces.

| Namespace        | ETH Amount   |
|------------------|-------------|
| xns              | 0.001 ETH   |
| more to come...  |             |


## 🧾 Contract Address

### Ethereum Mainnet

The official XNS contract is live on Ethereum mainnet at: [xxx](https://etherscan.io/address/xxx)

This contract also owns the XNS "bare name": `xns`.

### Sepolia Testnet

For testing purposes, you can use the deployed contract on Sepolia at: [0x04c9AafC2d30857781dd1B3540411e24FA536e39](https://sepolia.etherscan.io/address/0x04c9AafC2d30857781dd1B3540411e24FA536e39)

The testnet contract has been parametrized as follows:
- Public namespace registration fee: 0.1 ether (instead of 50 ether)
- Private namespace registration fee: 0.005 ether (instead of 10 ether)
- Namespace creator exclusive period: 60 seconds (instead of 30 days)
- Onboarding period: 60 seconds (instead of 365 days)
- Bare name price: 0.2 ether (instead of 10 ether)


## 💰 Registration Fees

**Name Registration Fees:**
- **90%** of ETH is permanently burned (supporting Ethereum's deflationary mechanism)
- **10%** is distributed as fees:
  - **Public namespaces**: 5% to namespace creator + 5% to XNS contract owner
  - **Private namespaces**: 10% to contract owner

**Namespace Registration Fees:**
- **90%** of ETH is permanently burned
- **10%** goes to the contract owner

>**Note:** Namespace creators only receive fees from name registrations in their namespace (public namespaces only).

### Claiming Fees

Fees earned by namespace creators and the XNS contract owner accumulate withitn the XNS contract and must be claimed to be withdrawn. You can:
- Check pending fees for any address ([`getPendingFees`](https://github.com/Walodja1987/xns/blob/main/docs/API.md#getpendingfees))
- Claim fees to yourself ([`claimFeesToSelf`](https://github.com/Walodja1987/xns/blob/main/docs/API.md#claimfeestoself))
- Claim fees to a different recipient ([`claimFees`](https://github.com/Walodja1987/xns/blob/main/docs/API.md#claimfees))

**Example script:**
* [Claim fees to self](https://github.com/Walodja1987/xns/blob/main/scripts/examples/claimFeesToSelf.ts)
* [Claim fees to a different recipient](https://github.com/Walodja1987/xns/blob/main/scripts/examples/claimFees.ts)

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

See [`contracts/src/mocks/MockERC20A`](https://github.com/Walodja1987/xns/blob/main/contracts/src/mocks/MockERC20A.sol) and [`scripts/examples/registerNameForERC20A.ts`](https://github.com/Walodja1987/xns/blob/main/scripts/examples/registerNameForERC20A.ts) for an example of how to register a name for an ERC20 token using the constructor method.

> **Note:** Any excess payment is refunded by XNS to `msg.sender`, which will be your contract. Be sure to implement a `receive()` function to accept ETH payments, and provide a way to withdraw any refunded ETH if needed. To avoid receiving refunds altogether, send exactly the required payment when deploying the contract.

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

See [`contracts/src/mocks/MockERC20B`](https://github.com/Walodja1987/xns/blob/main/contracts/src/mocks/MockERC20B.sol) and [`scripts/examples/registerNameForERC20A.ts`](https://github.com/Walodja1987/xns/blob/main/scripts/examples/registerNameForERC20B.ts) for an example of how to register a name for an ERC20 token using the separate `registerName` function approach.

> **Note:** Any excess payment is refunded by XNS to `msg.sender`, which will be your contract. Be sure to implement a `receive()` function to accept ETH payments, and provide a way to withdraw any refunded ETH if needed. To avoid receiving refunds altogether, send exactly the required payment when calling `registerName`.

#### Option 3: Sponsored Registration via EIP-1271

For contracts that implement EIP-1271, someone else can sponsor the name registration:

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

See [`contracts/src/mocks/MockERC20C`](https://github.com/Walodja1987/xns/blob/main/contracts/src/mocks/MockERC20C.sol) and [`scripts/examples/registerNameWithAuthorizationForERC20C.ts`](https://github.com/Walodja1987/xns/blob/main/scripts/examples/registerNameWithAuthorizationForERC20C.ts) for an example of how to register a name for an ERC20 token using the EIP-1271 method.


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
