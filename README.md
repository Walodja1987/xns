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
2. [How It Works](#-how-it-works) \
   2.1 [Name Registration](#name-registration) \
   2.2 [Name Resolution](#name-resolution) \
   2.3 [Name Registration With Authorization](#name-registration-with-authorization) \
   2.4 [Namespace Registration](#namespace-registration) \
   2.5 [Namespace Infos](#namespace-infos) \
   2.6 [Registration Fees](#registration-fees)
3. [XNS Price list](#-xns-price-list)
4. [Contract Address](#-contract-address)
5. [Integration Guide for Contract Developers](#-integration-guide-for-contract-developers)
6. [License and Deployment Policy](#-license-and-deployment-policy)
7. [API Reference](#-api-reference)
8. [Developer Notes](#-developer-notes)

## 🚀 Overview

**XNS** is an Ethereum-native name registry that **maps human-readable names to Ethereum addresses**. Share `vitalik.xns` or `my.token` instead of copying long hexadecimal strings.

**Key properties:**
- **Permanent:** Each name is irrevocably bound to an Ethereum address; no expiration, no transfer, no resale.
- **Universal naming:** Both EOAs and smart contracts can be named in the same unified registry.
- **Globally unique:** Each name is unique across all Ethereum addresses, preventing conflicts like duplicate ERC20 token names.
- **Permissionless namespaces:** Anyone can create their own namespace without requiring approval from any central party.
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
- ✅ `2-rich.4-real`

**Invalid name examples:**
- ❌ `thisisaveryverylongname.xns` (label too long)
- ❌ `Name.xns` (uppercase in label)
- ❌ `gm@web3.xyz` (special character in label)
- ❌ `-name.gm` (label cannot start with hyphen)
- ❌ `name-.og` (label cannot end with hyphen)
- ❌ `my--name.888` (label cannot have consecutive hyphens)

The same format rules apply to namespaces as well (e.g., `my.--name`, `info.$`, `-ns.xns` are all invalid).

### Bare Names

XNS supports **bare names**, i.e. names without a namespace suffix (e.g., `nike`, `vitalik`, `alice-walker`, `1xy`). Bare names are premium names costing 10 ETH per name.

> **Note:** Internally, all bare names are associated with the special namespace `"x"`. That is, `vitalik` and `vitalik.x` are the same and resolve to the same address.


## ✨ How It Works

### Name Registration

Registering an XNS name is straightforward:

1. **Check Available Namespaces**: Browse the [XNS price list](#-xns-price-list) to find available namespaces and their registration fees (e.g., names within the `xns` namespace cost 0.001 ETH).
2. **Choose a Name**: e.g., `alice.xns` (must not be registered yet).
3. **Register Name**: Send a transaction with the required ETH amount to register your name (see [`registerName`][api-registerName] in API docs). Any excess will be refunded.
4. **Verify Resolution**: Wait a few blocks, then verify your name is registered (see [`getAddress`][api-getAddress] and [`getName`][api-getName] in API docs).

**Note:** [`registerName`][api-registerName] only works for public namespaces after the exclusivity period (30 days). During the exclusivity period or for private namespaces, namespace creators must use [`registerNameWithAuthorization`][api-registerNameWithAuthorization] even for their own registrations.

**Example scripts:**
* [Name registration for EOA][script-registerName]
* [Name registration for ERC20 token (via constructor)][script-registerNameForERC20A]
* [Name registration for ERC20 token (via separate `registerName` function)][script-registerNameForERC20B]

#### Name Registration via Etherscan

You can register a name for your EOA directly via [Etherscan][etherscan-sepolia].

> ⚠️**Important:** Ensure you are connected to the wallet address that you want to name.

<img width="302" height="82" alt="image" src="https://github.com/user-attachments/assets/628791be-b647-4bcc-b85f-f75289afac1c" />

**Example 1:** Registering `bob.xns` in the `xns` namespace (costs 0.001 ETH):
<img width="670" height="301" alt="image" src="https://github.com/user-attachments/assets/2323cac5-060d-4cc8-abc6-0a27ea3f03d4" />

**Example 2:** Registering the bare name `vitalik` (costs 10 ETH):
<img width="664" height="296" alt="image" src="https://github.com/user-attachments/assets/a1fd1570-c946-4049-a812-528eed7c7878" />

> **Note:** As mentioned earlier, bare names are internally mapped to the special namespace `"x"`. If you register a bare name like `vitalik`, you have to specify `"x"` as the namespace. `vitalik` and `vitalik.x` are equivalent and resolve to the same address.


### Name Resolution

XNS provides simple on-chain resolution for names and addresses.

**Look up Address from Name: [`getAddress`][api-getAddress]**
- Resolve a name like `vitalik.001` or `nike` to its Ethereum address.
- Works directly on Etherscan or any Ethereum interface.
- Returns `0x0000...` if the name is not registered.

**Look up Name from Address: [`getName`][api-getName]**
- Find the XNS name for any Ethereum address.
- Returns the full name format (e.g., `alice.001` or just `vitalik` for bare names).
- Returns an empty string if the address has no name.

**Example scripts:**
* [Look up address from name][script-getAddress]
* [Look up name from address][script-getName]

### Name Registration With Authorization

XNS supports **authorized name registration** via [`registerNameWithAuthorization`][api-registerNameWithAuthorization], which allows a third party (sponsor) to pay the registration fee and gas costs while the recipient explicitly authorizes the registration via an EIP-712 signature.

**How it works:**
1. The recipient signs an EIP-712 message authorizing a specific name registration (label, namespace, and recipient address).
2. The sponsor calls [`registerNameWithAuthorization`][api-registerNameWithAuthorization] with the recipient's signature and pays the registration fee.
3. The name is registered to the recipient's address.

**Use cases:**
- Organizations registering names for their team members.
- Projects airdropping names to their community.
- Enabling contract wallets (EIP-1271) to register names, as contracts can't send transactions themselves.
- Any scenario where someone else pays registration fees on your behalf.

**Important restrictions:**
- For public namespaces: During the 30-day exclusivity period, only the namespace creator can sponsor registrations.
- For private namespaces: Only the namespace creator can sponsor registrations forever.

**Batch registration:** 
- XNS also supports [`batchRegisterNameWithAuthorization`][api-batchRegisterNameWithAuthorization] to register multiple names within the same namespace in a single transaction. See the API documentation for details.

**Example scripts:**
* [Name registration with authorization for EOA][script-registerNameWithAuthorization]
* [Name registration with authorization for ERC20 token][script-registerNameWithAuthorizationForERC20]
* [Batch name registration with authorization][script-batchRegisterNameWithAuthorization]

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
1. **Choose a Namespace:** Select an available namespace and set the desired price per name (must be >= 0.001 ETH and a multiple of 0.001 ETH).
2. **Register Namespace:** Submit a transaction with the required ETH to register the namespace (see [`registerPublicNamespace`][api-registerPublicNamespace] in the API docs). Any excess will be refunded.

As the public namespace creator, you have an exclusive 30-day window to register or sponsor any name within your namespace. After this period, anyone can freely register names. **During the exclusivity period, use [`registerNameWithAuthorization`][api-registerNameWithAuthorization] even for your own registrations.**

**How to register a private namespace:**
1. **Choose a Namespace:** Select an available namespace and set the desired price per name (must be >= 0.005 ETH and a multiple of 0.001 ETH).
2. **Register Namespace:** Submit a transaction with the required ETH to register the namespace (see [`registerPrivateNamespace`][api-registerPrivateNamespace] in the API docs). Any excess will be refunded.

The private namespace creator registers names via the authorized flow (see [`registerNameWithAuthorization`][api-registerNameWithAuthorization] in the API docs). **This is the only way to register names in private namespaces, including registrations for the creator themselves.**

**Quick Reference:**

| Namespace Type | Exclusivity Period | Use Function |
|----------------|-------------------|--------------|
| Public | After 30 days | [`registerName`][api-registerName] |
| Public | Within 30 days | [`registerNameWithAuthorization`][api-registerNameWithAuthorization] |
| Private | Always | [`registerNameWithAuthorization`][api-registerNameWithAuthorization] |

**Notes:**
- The `eth` namespace cannot be registered to avoid confusion with ENS.
- Regular users always pay the standard fees when registering namespaces via [`registerPublicNamespace`][api-registerPublicNamespace] or [`registerPrivateNamespace`][api-registerPrivateNamespace].
- During the onboarding period (first year after contract deployment), the XNS contract owner can optionally bootstrap namespaces for participants and integrators at no cost using [`registerPublicNamespaceFor`][api-registerPublicNamespaceFor] and [`registerPrivateNamespaceFor`][api-registerPrivateNamespaceFor]. These are OWNER-only functions that allow registering namespaces for other addresses during the onboarding period.

  **Example scripts:**
  * [Register public namespace for another address (OWNER-only)][script-registerPublicNamespaceFor]
  * [Register private namespace for another address (OWNER-only)][script-registerPrivateNamespaceFor]

#### Example: Public Namespace Registration via Etherscan

You can register a namespace directly via [Etherscan][etherscan-sepolia].

<img width="665" height="303" alt="image" src="https://github.com/user-attachments/assets/90b4cded-bb3c-468e-a645-5c6405bac0e0" />

> 💡**Note:** In the screenshot, `2000000000000000` (in wei) is the registration fee you set for users to pay when registering names in your namespace.

To register a private namespace, use the [`registerPrivateNamespace`][api-registerPrivateNamespace] function with the same input fields as the public version. The required registration fee is **10 ETH** (entered in the first field instead of 50); if you send more than 10 ETH, the excess will be automatically refunded.

**Example scripts:**
* [Public namespace registration][script-registerPublicNamespace]
* [Private namespace registration][script-registerPrivateNamespace]

### Namespace Infos

You can retrieve namespace details using [`getNamespaceInfo`][api-getNamespaceInfo]. The details include:
- Price per name
- Creator address
- Creation timestamp
- Whether it's private or public

You can also check if a namespace is within its exclusivity period using [`isInExclusivityPeriod`][api-isInExclusivityPeriod], which returns `true` if the namespace is still within the 30-day exclusivity window.

**Example scripts:**
* [Query namespace info][script-getNamespaceInfo]
* [Check exclusivity period][script-isInExclusivityPeriod]

### Registration Fees

**Name Registration Fees:**
- **90%** of ETH is permanently burned (supporting Ethereum's deflationary mechanism)
- **10%** is distributed as fees:
  - **Public namespaces**: 5% to namespace creator + 5% to XNS contract owner
  - **Private namespaces**: 10% to contract owner

**Namespace Registration Fees:**
- **90%** of ETH is permanently burned
- **10%** goes to the contract owner

>**Note:** Namespace creators only receive fees from name registrations in their namespace (public namespaces only).

All ETH burns are recorded via the [DETH contract](https://github.com/Walodja1987/deth), a global ETH sink and burn attestation registry. Burns are tracked and verifiable as non-transferrable DETH credits minted at a 1:1 ratio, providing proof of contribution to Ethereum's deflationary mechanism.

#### Claiming Fees

Fees earned by namespace creators and the XNS contract owner accumulate within the XNS contract and must be claimed to be withdrawn. You can:
- Check pending fees for any address ([`getPendingFees`][api-getPendingFees])
- Claim fees to yourself ([`claimFeesToSelf`][api-claimFeesToSelf])
- Claim fees to a different recipient ([`claimFees`][api-claimFees])

**Example scripts:**
* [Check pending fees][script-getPendingFees]
* [Claim fees to self][script-claimFeesToSelf]
* [Claim fees to a different recipient][script-claimFees]

## 🔥 XNS Price list

> **Note**: The price list may not be complete as new namespaces can be added over time. It also does not include private namespaces.

| Namespace        | ETH Amount   |
|------------------|-------------|
| xns              | 0.001 ETH   |
| more to come...  |             |


## 🧾 Contract Address

### Ethereum Mainnet

The official XNS contract is live on Ethereum mainnet at: [xxx][etherscan-mainnet]

This contract also owns the XNS "bare name": `xns`.

### Sepolia Testnet

For testing purposes, you can use the deployed contract on Sepolia at: [0x04c9AafC2d30857781dd1B3540411e24FA536e39][etherscan-sepolia-contract]

The testnet contract has been parametrized as follows:
- Public namespace registration fee: 0.1 ether (instead of 50 ether)
- Private namespace registration fee: 0.005 ether (instead of 10 ether)
- Namespace creator exclusive period: 60 seconds (instead of 30 days)
- Onboarding period: 60 seconds (instead of 365 days)
- Bare name price: 0.2 ether (instead of 10 ether)


## 🔧 Integration Guide for Contract Developers

XNS can be integrated into your smart contracts, allowing users to identify your contract by a human-readable name (e.g., `myprotocol.xns`) instead of a long address.

> **Note:** The naming of smart contracts via XNS applies to **new smart contracts** only, not existing ones. Existing contracts cannot be retroactively named.

This section includes examples of how to name your smart contracts on Ethereum, the canonical XNS chain, as well as a guide on using XNS with multi-chain deployments.

### Integration on Ethereum

There are three ways to integrate XNS:

> **Note:** The following examples demonstrate XNS integration for contracts that are only deployed on Ethereum. If you plan to deploy your contract on multiple chains, see the [Using XNS Names with Multi-Chain Deployments](#-using-xns-names-with-multi-chain-deployments) section below for important guidance and considerations.

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
    /// Not needed if the correct price is sent, without any excess.
    receive() external payable {}
}
```

Deploy with the `label`, `namespace`, and required payment to register the name during contract creation.

See [`MockERC20A`][contract-MockERC20A] and the [`registerNameForERC20A.ts`][script-registerNameForERC20A] script for an example of how to register a name for an ERC20 token using the constructor method.

> **Note:** Any excess payment is refunded by XNS to `msg.sender`, which will be your contract. Be sure to implement a `receive()` function to accept ETH payments, and provide a way to withdraw any refunded ETH if needed. To avoid receiving refunds altogether, send exactly the required payment when deploying the contract.

> **Important:** This option only works for **public namespaces** after the exclusivity period (30 days). For **private namespaces**, contracts must use Option 3 (EIP-1271).

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
    /// Not needed if the correct price is sent, without any excess.
    receive() external payable {}
}
```

After deployment, call `registerName("myprotocol", "xns")` with the required payment to register the name.

See [`MockERC20B`][contract-MockERC20B] and the [`registerNameForERC20B.ts`][script-registerNameForERC20B] script for an example of how to register a name for an ERC20 token using the separate [`registerName`][api-registerName] function approach.

> **Note:** Any excess payment is refunded by XNS to `msg.sender`, which will be your contract. Be sure to implement a `receive()` function to accept ETH payments, and provide a way to withdraw any refunded ETH if needed. To avoid receiving refunds altogether, send exactly the required payment when calling [`registerName`][api-registerName].

> **Important:** This option only works for **public namespaces** after the exclusivity period (30 days). For **private namespaces**, contracts must use Option 3 (EIP-1271).

#### Option 3: Sponsored Registration via EIP-1271

For contracts that implement EIP-1271, someone else can sponsor the name registration. **This is the only way for contracts to register names in private namespaces**, as `registerName` does not support private namespaces.

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
1. The contract (or its owner) signs an EIP-712 message authorizing the name registration. The recipient in the authorization must be the contract's address itself (the address of the `MyContractWallet` contract in this example).
2. A sponsor calls [`registerNameWithAuthorization`][api-registerNameWithAuthorization] on XNS, providing the contract as the recipient.
3. XNS validates the signature via the contract's `isValidSignature` function (EIP-1271).
4. The contract is assigned a name. The sponsor pays the registration fee.

**Use cases:**
- Contract wallets (Safe, Argent, etc.) that want to be named
- Contracts that can't send transactions themselves
- Contracts wanting to register names in **private namespaces** (required)
- Allow others to pay for your contract's name registration

**Note:** The contract must implement EIP-1271's `isValidSignature` function. The sponsor pays all fees and gas costs. Unlike Options 1 and 2 where `receive()` is optional (needed only if excess payment is sent), Option 3 does **not** need a `receive()` function because any refunds go to the sponsor (the transaction sender), not to the contract.

See [`MockERC20C`][contract-MockERC20C] and the [`registerNameWithAuthorizationForERC20C.ts`][script-registerNameWithAuthorizationForERC20C] script for an example of how to register a name for an ERC20 token using the EIP-1271 method.


### Using XNS Names with Multi-Chain Deployments

This section is intended for teams that:

* Deploy the **same contract** to multiple chains
* Ensure the contract has the **same address** across those chains (e.g. using `CREATE2`)
* Deploy at least one instance on **Ethereum mainnet**
* Want to use an XNS name as a **human-readable identifier** in documentation, dashboards, and address books instead of raw hexadecimal addresses

**Ethereum is the source of truth** for XNS names. Other chains do not resolve XNS names on-chain, but reference them off-chain for clarity.

#### Deployment Pattern

The recommended deployment pattern is to add a dedicated [`registerName`][api-registerName] function to your contract that performs XNS name registration on Ethereum mainnet (`chainId = 1`) and reverts on other chains. Once your contract is deployed, you invoke [`registerName`][api-registerName] on Ethereum mainnet to link the XNS name to your contract address.

Example:

```solidity
contract YourContract {
    // ... Your contract code ...
    
    function registerName(string calldata label, string calldata namespace) external payable {
        require(block.chainid == 1, "XNS only available on Ethereum mainnet");
        xns.registerName{value: msg.value}(label, namespace);
    }
}
```

>**Note:** Add access control as needed.


### Documentation and Address Books

When publishing contract addresses, use the XNS name (e.g., `myprotocol.xns`) if the contract address matches the Ethereum deployment. If the address is different on another chain, use the raw address instead.

Example:

| Network                         | XNS name / Address         |
|-------------------------------------|--------------------|
| Ethereum / Arbitrum / Optimism / Base | `myprotocol.xns`   |
| Avalanche                           | `0x1234…5678`      |


## 📄 License and Deployment Policy

XNS is licensed under the [Business Source License 1.1 (BUSL-1.1)][license].

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

## 📚 API Reference

See the [API Reference][api-reference] for complete documentation of all XNS contract functions, events, state variables, and types.

## 🔧 Developer Notes

See the [Developer Notes][dev-notes] for design decisions, code style guidelines, governance considerations, and known limitations. This document is primarily intended for auditors and developers working on the XNS contract.

<!-- Reference-style link definitions -->

[api-registerName]: https://github.com/Walodja1987/xns/blob/main/docs/API.md#registername
[api-getAddress]: https://github.com/Walodja1987/xns/blob/main/docs/API.md#getAddress
[api-getName]: https://github.com/Walodja1987/xns/blob/main/docs/API.md#getName
[api-getNamespaceInfo]: https://github.com/Walodja1987/xns/blob/main/docs/API.md#getnamespaceinfo
[api-isInExclusivityPeriod]: https://github.com/Walodja1987/xns/blob/main/docs/API.md#isinexclusivityperiod
[api-registerNameWithAuthorization]: https://github.com/Walodja1987/xns/blob/main/docs/API.md#registernamewithauthorization
[api-batchRegisterNameWithAuthorization]: https://github.com/Walodja1987/xns/blob/main/docs/API.md#batchregisternamewithauthorization
[api-registerPublicNamespace]: https://github.com/Walodja1987/xns/blob/main/docs/API.md#registerpublicnamespace
[api-registerPrivateNamespace]: https://github.com/Walodja1987/xns/blob/main/docs/API.md#registerprivatenamespace
[api-registerPublicNamespaceFor]: https://github.com/Walodja1987/xns/blob/main/docs/API.md#registerpublicnamespacefor
[api-registerPrivateNamespaceFor]: https://github.com/Walodja1987/xns/blob/main/docs/API.md#registerprivatenamespacefor
[api-getPendingFees]: https://github.com/Walodja1987/xns/blob/main/docs/API.md#getpendingfees
[api-claimFeesToSelf]: https://github.com/Walodja1987/xns/blob/main/docs/API.md#claimfeestoself
[api-claimFees]: https://github.com/Walodja1987/xns/blob/main/docs/API.md#claimfees

[script-registerName]: https://github.com/Walodja1987/xns/blob/main/scripts/examples/registerName.ts
[script-registerNameForERC20A]: https://github.com/Walodja1987/xns/blob/main/scripts/examples/registerNameForERC20A.ts
[script-registerNameForERC20B]: https://github.com/Walodja1987/xns/blob/main/scripts/examples/registerNameForERC20B.ts
[script-registerNameWithAuthorization]: https://github.com/Walodja1987/xns/blob/main/scripts/examples/registerNameWithAuthorization.ts
[script-registerNameWithAuthorizationForERC20]: https://github.com/Walodja1987/xns/blob/main/scripts/examples/registerNameWithAuthorizationForERC20.ts
[script-batchRegisterNameWithAuthorization]: https://github.com/Walodja1987/xns/blob/main/scripts/examples/batchRegisterNameWithAuthorization.ts
[script-registerPublicNamespace]: https://github.com/Walodja1987/xns/blob/main/scripts/examples/registerPublicNamespace.ts
[script-registerPrivateNamespace]: https://github.com/Walodja1987/xns/blob/main/scripts/examples/registerPrivateNamespace.ts
[script-registerPublicNamespaceFor]: https://github.com/Walodja1987/xns/blob/main/scripts/examples/registerPublicNamespaceFor.ts
[script-registerPrivateNamespaceFor]: https://github.com/Walodja1987/xns/blob/main/scripts/examples/registerPrivateNamespaceFor.ts
[script-getAddress]: https://github.com/Walodja1987/xns/blob/main/scripts/examples/getAddress.ts
[script-getName]: https://github.com/Walodja1987/xns/blob/main/scripts/examples/getName.ts
[script-getNamespaceInfo]: https://github.com/Walodja1987/xns/blob/main/scripts/examples/getNamespaceInfo.ts
[script-isInExclusivityPeriod]: https://github.com/Walodja1987/xns/blob/main/scripts/examples/isInExclusivityPeriod.ts
[script-getPendingFees]: https://github.com/Walodja1987/xns/blob/main/scripts/examples/getPendingFees.ts
[script-claimFeesToSelf]: https://github.com/Walodja1987/xns/blob/main/scripts/examples/claimFeesToSelf.ts
[script-claimFees]: https://github.com/Walodja1987/xns/blob/main/scripts/examples/claimFees.ts

[contract-MockERC20A]: https://github.com/Walodja1987/xns/blob/main/contracts/src/mocks/MockERC20A.sol
[contract-MockERC20B]: https://github.com/Walodja1987/xns/blob/main/contracts/src/mocks/MockERC20B.sol
[contract-MockERC20C]: https://github.com/Walodja1987/xns/blob/main/contracts/src/mocks/MockERC20C.sol

[etherscan-sepolia]: https://sepolia.etherscan.io/address/0x4f1d1F8C7C96C2798B0A473fE35633A47dad37f9
[etherscan-sepolia-contract]: https://sepolia.etherscan.io/address/0x04c9AafC2d30857781dd1B3540411e24FA536e39
[etherscan-mainnet]: https://etherscan.io/address/xxx

[license]: https://github.com/Walodja1987/xns/blob/main/LICENSE

[api-reference]: docs/API.md
[dev-notes]: docs/DEV_NOTES.md

[script-registerNameWithAuthorizationForERC20C]: https://github.com/Walodja1987/xns/blob/main/scripts/examples/registerNameWithAuthorizationForERC20C.ts
