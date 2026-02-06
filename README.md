# XNS – The Name Layer on Ethereum

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
   2.2 [Name Registration With Authorization](#name-registration-with-authorization) \
   2.3 [Name Resolution](#name-resolution) \
   2.4 [Namespace Registration](#namespace-registration)
3. [XNS Price list](#-xns-price-list)
4. [Contract Address](#-contract-address)
5. [Integration Guide for Contract Developers](#-integration-guide-for-contract-developers)
6. [Contract Ownership Transfer](#-contract-ownership-transfer)
7. [Namespace Owner Transfer](#-namespace-owner-transfer)
8. [Privacy Considerations](#-privacy-considerations)
9. [License and Deployment Policy](#-license-and-deployment-policy)
10. [API](#-api)
11. [Developer Notes](#-developer-notes)

## 🚀 Overview

**XNS** is an Ethereum-native name registry that **maps human-readable names to Ethereum addresses**. Receive funds by sharing `vitalik.xns` instead of copying long hexadecimal strings like `0x8AdEFeb576dcF52F5220709c1B267d89d5208E78`. Display names instead of addresses in your dApp for a cleaner, more user-friendly experience.

**Key properties:**
- **Permanent:** Each name is irrevocably bound to an Ethereum address; no expiration, no transfer, no resale.
- **Universal naming:** Both EOAs and smart contracts can be named in the same unified registry.
- **Globally unique:** Each name is unique across all Ethereum addresses, preventing conflicts like duplicate ERC20 token names.
- **Permissionless namespaces:** Anyone can create their own namespace without requiring approval from any central party.
- **Private namespaces:** Supports private namespaces where the namespace owner maintains exclusive control over name registrations within their namespace.
- **ETH burning:** 80% of registration fees are permanently burned, supporting Ethereum's deflationary mechanism.

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

The same format rules apply to namespaces. For example, `--name`, `$rich`, and `-ns` are all invalid and cannot be registered.

### Bare Names

XNS supports **bare names**, i.e. names without a namespace suffix (e.g., `bob`, `vitalik`, `alice-walker`, `1xy`). Bare names are premium names costing 10 ETH per name.

> **Note:** Internally, all bare names are associated with the special namespace `"x"`. That is, `vitalik` and `vitalik.x` are the same and resolve to the same address.

### Namespaces

XNS features two types of namespaces: **public** and **private**.

**Public Namespaces:**
- Anyone can register names within a public namespace after a 7-day exclusivity period after namespace creation has ended.
- During the exclusivity period, only the namespace owner can register or sponsor names.
- Namespace owners receive 10% of all name registration fees in perpetuity.
- Registration fee: 50 ETH.

**Private Namespaces:**
- Only the namespace owner can register names forever.
- Namespace owners do not receive fees; all fees go to the XNS contract owner.
- Registration fee: 10 ETH.

Anyone can register a new namespace by paying the one-time registration fee. The `eth` namespace is disallowed to avoid confusion with ENS.

### ETH Burn and Fee Distribution

- **80%** of ETH sent is **burnt** via DETH.
- **20%** is credited as **fees**:
  - Public namespaces: 10% to namespace owner, 10% to XNS contract owner
  - Private namespaces: 20% to XNS owner

**Notes:**
* Namespace owners only receive fees from name registrations in their namespace (public namespaces only).
* All ETH burns are recorded via the [DETH contract](https://github.com/Walodja1987/deth), a global ETH sink and burn attestation registry. Burns are tracked and verifiable as non-transferrable DETH credits minted at a 1:1 ratio, providing proof of contribution to Ethereum's deflationary mechanism.

## ✨ How It Works

### Name Registration

Registering an XNS name in a public namespace is straightforward:

1. **Check Available Namespaces**: Browse the [XNS price list](#-xns-price-list) to find available namespaces and their registration fees (e.g., names within the `xns` namespace cost 0.001 ETH).
2. **Choose a Name**: e.g., `alice.xns` (must not be registered yet).
3. **Register Name**: Send a transaction with the required ETH amount to register a name (see [`registerName`][api-registerName] in API docs). Any excess will be refunded.
4. **Verify Resolution**: Wait a few blocks, then verify the name is registered (see [`getAddress`][api-getAddress] and [`getName`][api-getName] in API docs).

**Note:** [`registerName`][api-registerName] only works for public namespaces after the exclusivity period (7 days) has ended. During the exclusivity period or for private namespaces, namespace owners must use [`registerNameWithAuthorization`][api-registerNameWithAuthorization] even for their own registrations.

**Example scripts:**
* [Name registration for EOA][script-registerName]
* [Name registration for ERC20 token (via constructor)][script-registerNameForERC20A]
* [Name registration for ERC20 token (via separate `registerName` function)][script-registerNameForERC20B]

#### Name Registration via Etherscan

Names can be registered for EOAs directly via [Etherscan][etherscan-mainnet].

> ⚠️**Important:** Ensure the connected wallet address is the one to be named.

<img width="302" height="82" alt="image" src="https://github.com/user-attachments/assets/628791be-b647-4bcc-b85f-f75289afac1c" />

**Example 1:** Registering `bob.xns` in the `xns` namespace (costs 0.001 ETH):
<img width="670" height="301" alt="image" src="https://github.com/user-attachments/assets/2323cac5-060d-4cc8-abc6-0a27ea3f03d4" />

**Example 2:** Registering the bare name `vitalik` (costs 10 ETH):
<img width="664" height="296" alt="image" src="https://github.com/user-attachments/assets/a1fd1570-c946-4049-a812-528eed7c7878" />

> **Note:** As mentioned earlier, bare names are internally mapped to the special namespace `"x"`. When registering a bare name like `vitalik`, specify `"x"` as the namespace. `vitalik` and `vitalik.x` are equivalent and resolve to the same address.


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
- Any scenario where someone else pays registration fees on behalf of recipients.

**Important restrictions:**
- For public namespaces: During the 7-day exclusivity period, only the namespace owner can sponsor registrations.
- For private namespaces: Only the namespace owner can sponsor registrations forever.

**Batch registration:** 
- XNS also supports [`batchRegisterNameWithAuthorization`][api-batchRegisterNameWithAuthorization] to register multiple names within the same namespace in a single transaction. See the API documentation for details.

**Example scripts:**
* [Name registration with authorization for EOA][script-registerNameWithAuthorization]
* [Name registration with authorization for ERC20 token][script-registerNameWithAuthorizationForERC20]
* [Batch name registration with authorization][script-batchRegisterNameWithAuthorization]

### Name Resolution

XNS provides simple on-chain resolution for names and addresses.

**Look up Address from Name: [`getAddress`][api-getAddress]**
- Resolve a name like `vitalik.001` or `bob` to its Ethereum address.
- Works directly on Etherscan or any Ethereum interface.
- Returns zero address if the name is not registered.

**Look up Name from Address: [`getName`][api-getName]**
- Find the XNS name for any Ethereum address.
- Returns the full name format (e.g., `alice.001` or just `vitalik` for bare names).
- Returns an empty string if the address has no name.

**Example scripts:**
* [Look up address from name][script-getAddress]
* [Look up name from address][script-getName]


### Namespace Registration

**How to register a public namespace:**
1. **Choose a Namespace:** Select an available namespace and set the desired price per name (must be >= 0.001 ETH and a multiple of 0.001 ETH).
2. **Register Namespace:** Submit a transaction with the required ETH to register the namespace (see [`registerPublicNamespace`][api-registerPublicNamespace] in the API docs). Any excess will be refunded.

Public namespace owners have an exclusive 7-day window to register or sponsor any name within their namespace. After this period, anyone can freely register names via [`registerName`][api-registerName]. **During the exclusivity period, use [`registerNameWithAuthorization`][api-registerNameWithAuthorization] even for their own registrations.**

**How to register a private namespace:**
1. **Choose a Namespace:** Select an available namespace and set the desired price per name (must be >= 0.005 ETH and a multiple of 0.001 ETH).
2. **Register Namespace:** Submit a transaction with the required ETH to register the namespace (see [`registerPrivateNamespace`][api-registerPrivateNamespace] in the API docs). Any excess will be refunded.

The private namespace owner registers names via the authorized flow (see [`registerNameWithAuthorization`][api-registerNameWithAuthorization] in the API docs). **This is the only way to register names in private namespaces, including registrations for the namespace owner themselves.**

**Notes:**
* Regular users always pay the standard fees when registering namespaces via [`registerPublicNamespace`][api-registerPublicNamespace] or [`registerPrivateNamespace`][api-registerPrivateNamespace].
* During the onboarding period (first year after contract deployment), the XNS contract owner can register public and private namespaces at no cost using [`registerPublicNamespaceFor`][api-registerPublicNamespaceFor] and [`registerPrivateNamespaceFor`][api-registerPrivateNamespaceFor], respectively, to foster adoption. These are OWNER-only functions that allow registering namespaces for other addresses during the onboarding period.
* **Security recommendation:** Namespace owners should consider using multisig wallets to reduce the risk of wallet access loss or compromise. This is especially important for public namespace owners who receive ongoing fee rewards, and for private namespace owners who maintain exclusive control over their namespace.

  **Example scripts:**
  * [Register public namespace for another address (OWNER-only)][script-registerPublicNamespaceFor]
  * [Register private namespace for another address (OWNER-only)][script-registerPrivateNamespaceFor]

#### Example: Public Namespace Registration via Etherscan

Namespaces can be registered directly via [Etherscan][etherscan-mainnet].

<img width="665" height="303" alt="image" src="https://github.com/user-attachments/assets/90b4cded-bb3c-468e-a645-5c6405bac0e0" />

> 💡**Note:** In the screenshot, `2000000000000000` (in wei) is the registration fee set by the namespace owner for users to pay when registering names in the namespace.

To register a private namespace, use the [`registerPrivateNamespace`][api-registerPrivateNamespace] function with the same input fields as the public version. The required registration fee is **10 ETH** (entered in the first field instead of 50); if more than 10 ETH is sent, the excess will be automatically refunded.

**Example scripts:**
* [Public namespace registration][script-registerPublicNamespace]
* [Private namespace registration][script-registerPrivateNamespace]

#### Querying Namespace Information

Namespace details can be retrieved using [`getNamespaceInfo`][api-getNamespaceInfo]. The details include:
- Price per name
- Namespace owner address
- Creation timestamp
- Whether it's private or public

The exclusivity period can be checked using [`isInExclusivityPeriod`][api-isInExclusivityPeriod], which returns `true` if the namespace is still within the 7-day exclusivity window.

**Example scripts:**
* [Query namespace info][script-getNamespaceInfo]
* [Check exclusivity period][script-isInExclusivityPeriod]


#### Claiming Fees

Fees earned by namespace owners and the XNS contract owner accumulate within the XNS contract and must be claimed to be withdrawn. Available actions:
- Check pending fees for any address ([`getPendingFees`][api-getPendingFees])
- Claim fees to caller ([`claimFeesToSelf`][api-claimFeesToSelf])
- Claim fees to a different recipient ([`claimFees`][api-claimFees])

**Example scripts:**
* [Check pending fees][script-getPendingFees]
* [Claim fees to self][script-claimFeesToSelf]
* [Claim fees to a different recipient][script-claimFees]

## 🔥 XNS Price list

| Namespace        | Price (ETH)   | Example Name   |
|------------------|-------------|---------------|
| xns              | 0.001 ETH   | bob.xns        |
| trb              | 0.001 ETH   | my-oracle.trb        |
| auditor          | 0.001 ETH   | best.auditor        |
| diamond          | 0.001 ETH   | nick.diamond        |
| facet            | 0.001 ETH   | 0x77.facet        |
| give             | 0.002 ETH   | impact.give        |
| impact           | 0.002 ETH   | safe-dogs.impact        |
| gm               | 0.002 ETH   | max.gm     |
| me               | 0.002 ETH   | its.me     |
| dev              | 0.002 ETH   | front.dev     |
| diva             | 0.003 ETH   | miss.diva     |
| mana             | 0.003 ETH   | give.mana     |
| yolo             | 0.005 ETH   | alice.yolo     |
| bot              | 0.006 ETH   | wallee.bot     |
| chad             | 0.007 ETH   | crypto.chad        |
| og               | 0.008 ETH   | punk.og        |
| ape              | 0.008 ETH   | 100x.ape        |
| long             | 0.008 ETH   | leveraged.long        |
| gwei             | 0.009 ETH   | give-me.gwei        |
| gu               | 0.010 ETH   | king.gu      |
| token            | 0.010 ETH   | uni.token      |
| coin             | 0.010 ETH   | pepe.coin      |
| web3             | 0.010 ETH   | cool-app.web3      |
| bull             | 0.015 ETH   | cyber.bull      |
| ai               | 0.015 ETH   | x12d.ai      |
| brrr             | 0.018 ETH   | printer-goes.brrr      |
| alpha            | 0.020 ETH   | soros.alpha      |
| ag               | 0.020 ETH   | company.ag      |
| ltd              | 0.020 ETH   | company.ltd      |
| company          | 0.020 ETH   | tech.company      |
| pay              | 0.020 ETH   | charity.pay      |
| 0x               | 0.025 ETH   | my-protocol.0x      |
| 100x             | 0.030 ETH   | pump.100x      |
| 67               | 0.067 ETH   | meme.67      |
| dao              | 0.200 ETH   | dev.dao      |
| xxx              | 0.666 ETH   | duck.xxx      |
| 888              | 0.888 ETH   | lucky.888      |
| defi             | 1.000 ETH   | myprotocol.defi      |
| 1                | 1.000 ETH   | one.1      |
| x                | 10.000 ETH  | vitalik (bare name) |

> The "x" namespace is special and associated with bare names. "vitalik.x" is equivalent to "vitalik" (bare name).


**Notes:**
* The price list only shows public namespaces.
* The price list may not be complete as new namespaces can be added over time. If you notice a missing namespace, feel free to [open an issue](https://github.com/Walodja1987/xns/issues) to request an update to the table.
* Prices on Sepolia may differ from mainnet. To obtain the current price for any namespace, use the [`getNamespaceInfo`][api-getNamespaceInfo] or [`getNamespacePrice`][api-getNamespaceInfo] functions.

## 🧾 Contract Address

### Ethereum Mainnet

The official XNS contract is live on Ethereum mainnet at: [0x648E4F05aF2b7eB85109A8dc8AE81D8E006457D8][etherscan-mainnet]

This contract also owns the XNS "bare name": `xns`.

### Sepolia Testnet

For testing purposes, the deployed contract on Sepolia can be used at: [0x708a6a410Ea26E536F6534Ac5c98FDD73a4BFe23][etherscan-sepolia-contract]

The testnet contract has been parametrized as follows:
- Public namespace registration fee: 0.05 ether (instead of 50 ether)
- Private namespace registration fee: 0.01 ether (instead of 10 ether)
- Namespace owner exclusive period: 300 seconds (instead of 7 days)
- Onboarding period: 100 days (instead of 365 days)
- Bare name price: 0.01 ether (instead of 10 ether)


## 🔧 Integration Guide for Contract Developers

XNS can be integrated into smart contracts, allowing users to identify contracts by a human-readable name (e.g., `myprotocol.xns`) instead of a long address.

> **Note:** Existing contracts without EIP-1271 support cannot register names retroactively. For contracts that implement EIP-1271, see [Option 3](#option-3-sponsored-registration-via-eip-1271) for instructions on how to register names.

This section includes examples of how to name smart contracts on Ethereum, the canonical XNS chain, as well as a guide on using XNS with multi-chain deployments.

### Integration on Ethereum

There are three ways to integrate XNS:

> **Note:** The following examples demonstrate XNS integration for contracts that are only deployed on Ethereum. For contracts deployed on multiple chains, see the [Using XNS Names with Multi-Chain Deployments](#-using-xns-names-with-multi-chain-deployments) section below for important guidance and considerations.

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

**Notes:** 
- Any excess payment is refunded by XNS to `msg.sender`, which will be the contract. Be sure to implement a `receive()` function to accept ETH payments, and provide a way to withdraw any refunded ETH if needed. To avoid receiving refunds altogether, send exactly the required payment when deploying the contract.
- The `registerName` function only works for **public namespaces** after the exclusivity period (7 days) has ended. For **private namespaces**, contracts must use [Option 3 (EIP-1271)](#option-3-sponsored-registration-via-eip-1271).

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

>**Note:** Add access control as needed.

After deployment, call `registerName("myprotocol", "xns")` with the required payment to register the name.

See [`MockERC20B`][contract-MockERC20B] and the [`registerNameForERC20B.ts`][script-registerNameForERC20B] script for an example of how to register a name for an ERC20 token using the separate [`registerName`][api-registerName] function approach.

**Notes:**
- Any excess payment is refunded by XNS to `msg.sender`, which will be the contract. Be sure to implement a `receive()` function to accept ETH payments, and provide a way to withdraw any refunded ETH if needed. To avoid receiving refunds altogether, send exactly the required payment when calling [`registerName`][api-registerName].
- The `registerName` function only works for **public namespaces** after the exclusivity period (7 days) has ended. For **private namespaces**, contracts must use [Option 3 (EIP-1271)](#option-3-sponsored-registration-via-eip-1271).

#### Option 3: Sponsored Registration via EIP-1271

For contracts that implement EIP-1271, someone else can sponsor the name registration. **This is the only way for contracts to register names in private namespaces and public namespaces during the exclusivity period**.

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
- Any smart contract that want to be named
- Contracts that can't send transactions themselves
- Contracts wanting to register names in **private namespaces** (required)
- Allow others to pay for a contract's name registration

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

The recommended deployment pattern is to add a dedicated [`registerName`][api-registerName] function to the contract that performs XNS name registration on Ethereum mainnet (`chainId = 1`) and reverts on other chains. After deployment, invoke [`registerName`][api-registerName] on Ethereum mainnet to link the XNS name to the contract address.

Example:

```solidity
contract YourContract {
    // ... Contract code ...
    
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


## 🔐 Contract Ownership Transfer

The XNS contract uses OpenZeppelin's `Ownable2Step` for 2-step contract ownership transfers. The initial owner is set at deployment and can be transferred using the following process:

**Ownership Transfer Process:**
1. Current owner calls `transferOwnership(newOwner)` to initiate transfer.
2. Pending owner calls `acceptOwnership()` to complete transfer.
3. Only after acceptance does the new owner gain control.

**Cancellation:**
- The current owner can cancel a pending transfer by calling `transferOwnership(address(0))`.
- Alternatively, the owner can overwrite a pending transfer by calling `transferOwnership(differentAddress)` again.

**Fee Accounting:**
Ownership transfers do **not** migrate already-accrued `_pendingFees`. Any fees accumulated before `acceptOwnership()` remain claimable by the previous owner address. Only fees accrued **after** acceptance are credited to the new owner address.

**Example scripts:**
* [Query current owner][script-owner]
* [Query pending owner][script-pendingOwner]
* [Initiate ownership transfer][script-transferOwnership]
* [Accept ownership transfer][script-acceptOwnership]

## 🔐 Namespace Owner Transfer

Namespace owners can transfer their namespace (and future fee streams) using a 2-step process (`transferNamespaceOwnership` → `acceptNamespaceOwnership`), following the same pattern as contract ownership transfer.

**Namespace Owner Transfer Process:**
1. Current namespace owner calls `transferNamespaceOwnership(namespace, newOwner)` to initiate transfer.
2. Pending namespace owner calls `acceptNamespaceOwnership(namespace)` to complete transfer.
3. Only after acceptance does the new namespace owner gain control.

**Cancellation:**
- The current namespace owner can cancel a pending transfer by calling `transferNamespaceOwnership(namespace, address(0))`.
- Alternatively, the namespace owner can overwrite a pending transfer by calling `transferNamespaceOwnership(namespace, differentAddress)` again.

**Fee Accounting:**
Namespace owner transfers do **not** migrate already-accrued `_pendingFees`. Any fees accumulated before `acceptNamespaceOwnership()` remain claimable by the previous namespace owner address. Only fees accrued **after** acceptance are credited to the new namespace owner address.

**Example scripts:**
* [Query pending namespace owner][script-getPendingNamespaceOwner]
* [Initiate namespace ownership transfer][script-transferNamespaceOwnership]
* [Accept namespace ownership transfer][script-acceptNamespaceOwnership]

## 🔒 Privacy Considerations

XNS names can enhance privacy when used thoughtfully, but the privacy implications depend on your name choice and how you share it.

### Off-Chain Communication Benefit

Traditional Ethereum addresses (e.g., `0x8AdEFeb576dcF52F5220709c1B267d89d5208E78`) are long hexadecimal strings that are typically shared through digital channels like email, messaging apps, or social media. This creates a **digital trail** that links your identity to your address, which can be monitored, analyzed, and potentially used for surveillance or correlation attacks.

With XNS, you can share addresses **off-chain** (verbally or in person) using memorable names like `alice.xns` or `1x45.xns`. The counterparty can easily remember and use the name without needing to copy-paste a long address, reducing digital traces that link your identity to your address.

### Name Choice Matters

**⚠️ Important:** The privacy benefit is **conditional** and depends on your name choice:

- ✅ **Privacy-enhancing:** Using pseudonymous names (e.g., `1x45.xns`, `alice.xns`, `crypto123.xns`) that don't reveal your real identity, combined with off-chain sharing, can reduce identity-address correlation.
- ❌ **Privacy-reducing:** Using identifiable names (e.g., `frank-walter.xns`, `john-smith.xns`) that reveal your real identity can actually **worsen** privacy compared to random addresses, as they create a direct, permanent link between your name and address on-chain.

### Best Practices for Privacy-Conscious Users

- Use **pseudonymous or random-looking names** that don't reveal your identity
- Share names **off-chain** (verbally or in person) when possible
- Avoid using your real name, email, social media handles (e.g., @yourhandle), or other identifiable information in your XNS name
- Consider the privacy implications before choosing a name, as names are permanent and non-transferable

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

## 📚 API

See [API.md][api] for a complete documentation of all XNS contract functions, events, state variables, and types.

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
[script-owner]: https://github.com/Walodja1987/xns/blob/main/scripts/examples/owner.ts
[script-pendingOwner]: https://github.com/Walodja1987/xns/blob/main/scripts/examples/pendingOwner.ts
[script-transferOwnership]: https://github.com/Walodja1987/xns/blob/main/scripts/examples/transferOwnership.ts
[script-acceptOwnership]: https://github.com/Walodja1987/xns/blob/main/scripts/examples/acceptOwnership.ts
[script-getPendingNamespaceOwner]: https://github.com/Walodja1987/xns/blob/main/scripts/examples/getPendingNamespaceOwner.ts
[script-transferNamespaceOwnership]: https://github.com/Walodja1987/xns/blob/main/scripts/examples/transferNamespaceOwnership.ts
[script-acceptNamespaceOwnership]: https://github.com/Walodja1987/xns/blob/main/scripts/examples/acceptNamespaceOwnership.ts

[contract-MockERC20A]: https://github.com/Walodja1987/xns/blob/main/contracts/src/mocks/MockERC20A.sol
[contract-MockERC20B]: https://github.com/Walodja1987/xns/blob/main/contracts/src/mocks/MockERC20B.sol
[contract-MockERC20C]: https://github.com/Walodja1987/xns/blob/main/contracts/src/mocks/MockERC20C.sol

[etherscan-mainnet]: https://etherscan.io/address/0x648E4F05aF2b7eB85109A8dc8AE81D8E006457D8
[etherscan-sepolia-contract]: https://sepolia.etherscan.io/address/0x708a6a410Ea26E536F6534Ac5c98FDD73a4BFe23
[etherscan-mainnet]: https://etherscan.io/address/xxx

[license]: https://github.com/Walodja1987/xns/blob/main/LICENSE

[api]: docs/API.md
[dev-notes]: docs/DEV_NOTES.md

[script-registerNameWithAuthorizationForERC20C]: https://github.com/Walodja1987/xns/blob/main/scripts/examples/registerNameWithAuthorizationForERC20C.ts
