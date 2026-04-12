# Test cases

The following matches [WalletChanXNSAdapter.tests.ts](./WalletChanXNSAdapter.tests.ts). Run: `npx hardhat test test/WalletChanXNSAdapter.tests.ts`

## WalletChanXNSAdapter

### Constructor

#### Functionality

- Should set `XNS` immutable to the address passed in.
- Should call `registerName` with label `walletchanadapter` and namespace `xns` using `msg.value`.

#### Reverts

- Should revert with `WalletChanAdapter: 0x XNS` when `xns` is `address(0)`.
- Should revert when `registerName` reverts (e.g. insufficient payment, wrong `msg.value` for `xns` price), if tested against a real XNS fixture.

---

### getAddress(fullName)

#### Functionality

- Should return `address(0)` when `fullName` ends with `.mega` (ASCII, lowercase).
- Should return `address(0)` when `fullName` ends with `.wei` (ASCII, lowercase).
- Should forward to `XNS.getAddress(fullName)` for bare names (no dot), including bare `mega` and bare `wei`.
- Should forward to XNS for names that do not end with `.mega` or `.wei` (e.g. `alice.x`, `foo.amega`).
- Should match XNS for names where the namespace after the last dot is not `mega` / `wei` (e.g. `alice.ommega` if registered in XNS).

#### Edge cases

- Should not read out of bounds for strings shorter than `.wei` / `.mega` (empty string forwards to XNS).
- Should forward `fullName` ending with uppercase `.MEGA` / `.WEI` to XNS unchanged (adapter suffix check is lowercase ASCII only); result should match `XNS.getAddress(fullName)` (typically `address(0)` if not registered).

---

### getAddress(label, namespace)

#### Functionality

- Should return `address(0)` when `namespace` is exactly `mega` (lowercase, per `keccak256` check).
- Should return `address(0)` when `namespace` is exactly `wei`.
- Should forward to `XNS.getAddress(label, namespace)` when `namespace` is empty (bare name semantics on XNS).
- Should forward for any other namespace (e.g. `x`, `xns`).

#### Edge cases

- Should forward to XNS when `namespace` is empty (`""` does not hash to `mega` / `wei`).
- Should forward when `namespace` is uppercase `MEGA` / `WEI` (not blocked; must match `XNS.getAddress(label, namespace)`).

---

### getName

#### Functionality

- Should return `""` when `XNS.getName(addr)` returns a name ending with `.mega`.
- Should return `""` when `XNS.getName(addr)` returns a name ending with `.wei`.
- Should return the same string as XNS when the primary name does not end with those suffixes.
- Should return `""` when `XNS.getName(addr)` is already empty.

---

### isBlockedNamespace

#### Functionality

- Should return `true` for `mega`.
- Should return `true` for `wei`.
- Should return `false` for empty string.
- Should return `false` for other namespaces (e.g. `eth`, `x`, `gm`).
- Should return `false` for uppercase `MEGA` / `WEI` if the contract compares lowercase hashes only (current implementation).

---
