# Resolution adapters

* Resolution adapters are contracts in front of the canonical [XNS](../contracts/src/XNS.sol) registry. They expose the same resolution API (`getAddress`, `getName`) and **exclude specific namespaces** from resolution for their callers.
* This is to avoid overlap with existing naming integrations that may use those namespaces.
* For excluded namespaces, `getAddress` returns `address(0)` and `getName` returns `""`; everything else is forwarded unchanged.
* Name or namespace registration are not available on resolution adapters.
* The registry can still hold names in those namespaces; the adapter only changes what this integration resolves or shows.
* `eth` is disallowed for registration in XNS itself and does not require special handling inside the resolution adapter contracts.
* Source: [`contracts/src/adapters/`](../contracts/src/adapters/).

---

## List of resolution adapters

| Adapter | Excluded namespaces|
|---------|-------------------------------------|
| [WalletChan XNS adapter](#walletchan-xns-adapter) | `mega`, `wei` |

---

## WalletChan XNS adapter

Excludes namespaces **`mega`** and **`wei`** for resolution.

**Deployed addresses:**

| Network | Address |
|---------|---------|
| Ethereum mainnet | *TBD — update after deployment* |
| Sepolia | [0x0489d46237AcDe4B2CA8A8Fde1BBf9a96282175a](https://sepolia.etherscan.io/address/0x0489d46237AcDe4B2CA8A8Fde1BBf9a96282175a) |

The adapter registers on each network’s XNS registry as **`walletchanadapter.xns`** and can be resolved with `getAddress` on the [XNS registry contract addresses for that network](../README.md#contract-address).

**Resources:** 

| | |
|---|---|
| **Solidity** | [`WalletChanXNSAdapter.sol`](../contracts/src/adapters/WalletChanXNSAdapter.sol) |
| **Interface** | [`IWalletChanXNSAdapter.sol`](../contracts/src/interfaces/IWalletChanXNSAdapter.sol) |
| **Tests** | [`test/WalletChanXNSAdapter.tests.ts`](../test/WalletChanXNSAdapter.tests.ts) |


