# XNS - The On-Chain Name Service
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

XNS is a decentralized name registry where users burn ETH to acquire permanent ownership of names for their Externally Owned Accounts (EOA) accounts. 
The suffix attached to a name is determined by the amount of ETH burned during registration. As users burn more ETH, they unlock
increasingly prestigious suffixes. At the highest tier of 100 ETH, users can register suffix-free names (e.g., "Vitalik", "Trump").
The crown jewel of XNS is the legendary single-character name "X" which requires 1,000,000 ETH to be burned before it can be claimed for 1000 ETH.
Below is a breakdown of all available suffixes and their ETH burn requirements:

## 🔥 XNS Name Tiers

| ETH Burned | Name Format | Level |
|------------|-------------|-----------------|
| 0.001 ETH | diva.001 | 🐣 Baby steps (we all start somewhere) |
| 0.500 ETH | diva.500 | 🐢 Slow and steady |
| 0.999 ETH | diva.999 | 🧙‍♂️ Almost there... |
| 1 ETH | diva.eth | 𖢻 "I'm in it for the tech" |
| 2 ETH | diva.gm | 🌞 Checks portfolio before brushing teeth |
| 3 ETH | diva.degen | 🎰 Thinks sleep is a bear market strategy|
| 4 ETH | diva.wtf | 🤯 Bought LUNA and FTT "just in case" |
| 5 ETH | diva.yolo | 🎲 Sold house for ETH (wife doesn't know) |
| 6 ETH | diva.bro | 🤝 Gives crypto tips at divorce hearings |
| 7 ETH | diva.chad | 💪 Measures gains in lambos per minute |
| 8 ETH | diva.og | 🎖 Has more failed ICO tokens than friends |
| 9 ETH | diva.hodl | 💎 Married to their bags (literally, had a ceremony) |
| 10 ETH | diva.maxi | ⚡ "Solana is a SQL database" |
| 15 ETH | diva.bull | 🦬 Red candles are just discounts |
| 20 ETH | diva.whale | 🐋 Causes bear markets by taking profits |
| 25 ETH | diva.pump | 🚀 Thinks sell walls are conspiracy theories |
| 30 ETH | diva.100x | 💯 Uses leverage to leverage leverage |
| 35 ETH | diva.defi | 📱 Buidling YOLO contracts |
| 40 ETH | diva.ape | 🦍 Gets liquidated just to feel something |
| 45 ETH | diva.moon | 🌕 Earth's gravity can't hold these gains |
| 50 ETH | diva.X | 👔 CZ's financial advisor |
| 100 ETH | diva | ⚪ Makes "vitalik.eth" look verbose |
| 1,000 ETH | X  | 👑 Vitalik asks you for ETH back |

<!-- Calls Saylor "paper hands" -->
<!-- Makes Warren Buffett look like a savings account -->

### 🌿 Community Domains
Communities can permissionlessly register custom suffixes (e.g., .uni, .aave) in exchange for 200 ETH and allow their members to purchase names under their domain - strengthening community identity on-chain.

## 🚀 Core Features

### 🔹 Permanent Ownership
In ENS, you don't own your name - you rent it. If you forget to renew, someone else can take it. That's like renting the account number for your bank account - if you forget to renew, someone else can claim it, and anyone who previously sent funds to your ENS name might unknowingly send assets to the new owner. Absurd? We agree.

✅ XNS names are permanent:
- No expiration, no renewals
- Once purchased, the name is yours forever

### 🔹 Transferable, But Not Resellable 
Typically, the ability to transfer names enables resale, which leads to speculation and name sniping. However, users who purchase valuable names should still be able to move them between their own accounts.

✅ XNS names are fully transferrable while preventing resale:
- Names can be migrated between accounts controlled by the original owner
- Original owner retains transfer rights, making ownership by external parties worthless
- Eliminates speculative purchases, creating a fair and utility-driven naming system

### 🔹 Community Domains
Communities can permissionlessly register custom suffixes (e.g., .uni, .aave) in exchange for 200 ETH and allow their members to purchase names under their domain - strengthening community identity on-chain.

### 🔹 Free ENS Migration
To enable a seamless migration of your .eth ENS name (e.g., vitalik.eth) users can claim their .eth names on XNS for free (normally requires burning 1 ETH).

### 🔹 DETH Integration: Verifiable ETH Burns
XNS integrates with DETH, a global ETH burn registry that permanently tracks ETH burns.

✅ How it works:
- When users burn ETH to register a name, the burn is attested in DETH
- Users receive non-transferable DETH credits, recorded 1:1 with ETH burned
- These credits prove value destruction and can be leveraged in downstream applications like governance or rewards distributions (e.g., airdrops)

### 🔹 X - The Ultimate Name
The legendary single-letter name "X" - without any suffixes - will be unlocked once 1,000,000 ETH have been burned. A symbol of ultimate prestige, it represents the highest tier of commitment within XNS.

### Additional Features
- Users can register multiple names for an address
- Users can specify the default name to display in frontend applications


## 🔗 Address

The XNS contract is deployed on Ethereum at the following address: [xxx](https://etherscan.io/address/xxx)

<!-- [Contract deployment transaction](https://etherscan.io/tx/...) -->

## ✨ Functions

### `registerName`

```solidity
...
```

Does ...

## ⛓ View Functions

### `getAddress`

```solidity
...
```

### `getName`

```solidity
...
```

Returns ...

## 🔍 Events

### `NameRegistered`

...