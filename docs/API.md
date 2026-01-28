# XNS Contract Documentation

This is an automatically generated documentation (using `solidity-docgen` package) for the XNS contract based on the NatSpec comments in the code.

## XNS


An Ethereum-native name registry that maps human-readable names to Ethereum addresses.
Names are **permanent, immutable, and non-transferable**.

Name format: [label].[namespace]

Examples:
- alice.xns
- bob.yolo
- vitalik.100x
- garry.ape

### String rules
Label and namespace string requirements:
- Must be 1–20 characters long
- Must consist only of [a-z0-9-] (lowercase letters, digits, and hyphens)
- Cannot start or end with '-'
- Cannot contain consecutive hyphens ('--')
- "eth" as namespace is disallowed to avoid confusion with ENS

### Namespaces
- Anyone can register new namespaces by paying a one-time fee.
- XNS features two types of namespaces: public and private.
- **Public namespaces (50 ETH):**
  - Open to everyone after a 7-day exclusivity period post namespace registration.
  - During exclusivity, only the namespace owner can register or sponsor names (via `registerNameWithAuthorization`
    or `batchRegisterNameWithAuthorization`).
  - After exclusivity, anyone can register or sponsor names (via `registerName`
    or `batchRegisterNameWithAuthorization`).
  - Namespace owners receive 10% of all name registration fees in perpetuity.
- **Private namespaces (10 ETH):**
  - Only the namespace owner can register names (via `registerNameWithAuthorization`
    or `batchRegisterNameWithAuthorization`).
  - Namespace owners do not receive fees; all fees go to the XNS contract owner.
- During the first year post XNS contract deployment, the contract owner can register
  namespaces for others at no cost.
- The "eth" namespace is disallowed to avoid confusion with ENS.
- The "x" namespace is associated with bare names (e.g. "vitalik" = "vitalik.x").
- The contract owner is set as the namespace owner of the "x" namespace at deployment.

### Bare Names
- Bare names are names without a namespace (e.g., "vitalik" instead of "vitalik.x").
- Internally, bare names use the special "x" namespace, so "vitalik" and "vitalik.x" resolve to the same address.
- Bare names are premium and cost 10 ETH per name.

### Name Registration
- Users can register names in public namespaces after the 7-day exclusivity period using `registerName`.
- Each address can own at most one name.
- Registration fees vary by namespace

### Authorized Name Registration
- XNS features authorized name registration via EIP-712 signatures.
- Allows sponsors to pay registration fees on behalf of recipients who authorize it via signature.
- Supports both EOA signatures and EIP-1271 contract wallet signatures.

### ETH Burn and Fee Distribution
- 80% of ETH sent is burnt via DETH.
- 20% is credited as fees:
  - Public namespaces: 10% to namespace owner, 10% to XNS contract owner
  - Private namespaces: 20% to XNS owner






## Functions

### registerName


Function to register a paid name for `msg.sender`. To register a bare name
(e.g., "vitalik"), use "x" as the namespace parameter.
This function only works for public namespaces after the exclusivity period (7 days) has ended.

**Requirements:**
- Label must be valid (non-empty, length 1–20, only lowercase letters, digits, and hyphens,
  cannot start or end with '-', cannot contain consecutive hyphens ('--')).
- Namespace must exist and be public.
- `msg.value` must be >= the namespace's registered price (excess will be refunded).
- Namespace must be past the exclusivity period (7 days after creation).
- Caller must not already have a name.
- Name must not already be registered.

**Fee Distribution:**
- 80% of ETH is permanently burned via DETH.
- 10% is credited to the contract owner.
- 10% is credited to the namespace owner.

**Note:**
- During the exclusivity period or for private namespaces, namespace owners must use
  `registerNameWithAuthorization` even for their own registrations.
- Due to block reorganization risks, users should wait for a few blocks and verify
  the name resolves correctly using the `getAddress` or `getName` function before sharing it publicly.

```solidity
function registerName(string label, string namespace) external payable
```


#### Parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| label | string | The label part of the name to register. |
| namespace | string | The namespace part of the name to register. |


### registerNameWithAuthorization


Function to sponsor a paid name registration for `recipient` who explicitly authorized it via
an EIP-712 signature.

This function is **required** for:
- All registrations in public namespaces during the exclusivity period (only namespace owner).
- All sponsored registrations in public namespaces after the exclusivity period (anyone).
- All registrations in private namespaces.

Supports both EOA signatures and EIP-1271 contract wallet signatures.

**Requirements:**
- Label must be valid (non-empty, length 1–20, only lowercase letters, digits, and hyphens,
  cannot start or end with '-', cannot contain consecutive hyphens ('--')).
- `recipient` must not be the zero address.
- Namespace must exist.
- `msg.value` must be >= the namespace's registered price (excess will be refunded).
- `msg.sender` must be the namespace owner for public namespaces during the exclusivity period
  or the contract owner for private namespaces.
- Recipient must not already have a name.
- Name must not already be registered.
- Signature must be valid EIP-712 signature from `recipient` (EOA) or EIP-1271 contract signature.

**Fee Distribution:**
- 80% of ETH is permanently burned via DETH.
- For public namespaces: 10% is credited to the namespace owner and 10% to the contract owner.
- For private namespaces: 20% is credited to the contract owner.

**Note:**
- If the recipient is an EIP-7702 delegated account, their delegated implementation must implement ERC-1271
  for signature validation.
- Due to block reorganization risks, users should wait for a few blocks and verify
the name resolves correctly using the `getAddress` or `getName` function before sharing it publicly.

```solidity
function registerNameWithAuthorization(struct XNS.RegisterNameAuth registerNameAuth, bytes signature) external payable
```


#### Parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| registerNameAuth | struct XNS.RegisterNameAuth | The argument for the function, including recipient, label, and namespace. |
| signature | bytes | EIP-712 signature by `recipient` (EOA) or EIP-1271 contract signature. |


### batchRegisterNameWithAuthorization


Batch version of `registerNameWithAuthorization` to register multiple names with a single transaction.
All registrations must be in the same namespace. Skips registrations (i.e. does not revert) where the recipient already has
a name or the name is already registered (griefing protection). Skipped items are not charged; excess payment is refunded.

**Requirements:**
- Array arguments must have equal length and be non-empty.
- All registrations must be in the same namespace.
- `msg.value` must be >= `pricePerName * successfulCount` (excess will be refunded).
- All individual requirements from `registerNameWithAuthorization` apply to each registration.

**Fee Distribution:**
- 80% of ETH is permanently burned via DETH.
- For public namespaces: 10% is credited to the namespace owner and 10% to the contract owner.
- For private namespaces: 20% is credited to the contract owner.

**Note:** Input validation errors (invalid label, zero recipient, namespace mismatch, invalid signature)
cause the entire batch to revert. Errors that could occur due to front-running the batch tx (recipient already
has a name, or name already registered) are skipped (i.e. batch tx does not revert) to provide griefing protection.

```solidity
function batchRegisterNameWithAuthorization(struct XNS.RegisterNameAuth[] registerNameAuths, bytes[] signatures) external payable returns (uint256 successfulCount)
```


#### Parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| registerNameAuths | struct XNS.RegisterNameAuth[] | Array of `RegisterNameAuth` structs, each including recipient, label, and namespace. |
| signatures | bytes[] | Array of EIP-712 signatures by recipients (EOA) or EIP-1271 contract signatures. |

#### Return Values

| Name | Type | Description |
| ---- | ---- | ----------- |
| successfulCount | uint256 | The number of names successfully registered. |

### registerPublicNamespace


Register a new public namespace.

**Requirements:**
- `msg.value` must be >= 50 ETH (excess refunded).
- Namespace must be valid (non-empty, length 1–20, only lowercase letters, digits, and hyphens,
  cannot start or end with '-', cannot contain consecutive hyphens ('--')).
- Namespace must not equal "eth".
- Namespace must not already exist.
- `pricePerName` must be >= 0.001 ETH and a multiple of 0.001 ETH (0.001, 0.002, 0.003, etc.).

**Note:**
- During the onboarding period (1 year following contract deployment), the contract owner can
  register namespaces for free (via `registerPublicNamespaceFor`) to foster adoption.
- For the avoidance of doubt, anyone can register a new namespace during the onboarding period
  by paying the standard 50 ETH registration fee.

```solidity
function registerPublicNamespace(string namespace, uint256 pricePerName) external payable
```


#### Parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| namespace | string | The namespace to register. |
| pricePerName | uint256 | The price per name for the namespace. |


### registerPrivateNamespace


Register a new private namespace.

**Requirements:**
- `msg.value` must be >= 10 ETH (excess refunded).
- Namespace must be valid (non-empty, length 1–20, only lowercase letters, digits, and hyphens,
  cannot start or end with '-', cannot contain consecutive hyphens ('--')).
- Namespace must not equal "eth".
- Namespace must not already exist.
- `pricePerName` must be >= 0.005 ETH and a multiple of 0.001 ETH (0.005, 0.006, 0.007, etc.).

**Note:**
- During the onboarding period (1 year following contract deployment), the contract owner can
  register namespaces for free (via `registerPrivateNamespaceFor`) to foster adoption.
- For the avoidance of doubt, anyone can register a new namespace during the onboarding period
  by paying the standard 10 ETH registration fee.

```solidity
function registerPrivateNamespace(string namespace, uint256 pricePerName) external payable
```


#### Parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| namespace | string | The namespace to register. |
| pricePerName | uint256 | The price per name for the namespace. |


### registerPublicNamespaceFor


Contract owner-only function to register a public namespace for another address during the onboarding period.
This function allows the contract owner to register namespaces for free during the first year to
foster adoption. No ETH is processed (function is non-payable) and no fees are charged.

**Requirements:**
- `msg.sender` must be the contract owner.
- Must be called during the onboarding period (first year after contract deployment).
- `nsOwner` must not be the zero address.
- No ETH should be sent (function is non-payable).
- All validation requirements from `registerPublicNamespace` apply.

```solidity
function registerPublicNamespaceFor(address nsOwner, string namespace, uint256 pricePerName) external
```


#### Parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| nsOwner | address | The address that will be assigned as the namespace owner (the account that shall receive namespace registration fees). |
| namespace | string | The namespace to register. |
| pricePerName | uint256 | The price per name for the namespace. |


### registerPrivateNamespaceFor


Contract owner-only function to register a private namespace for another address during the onboarding period.
This function allows the contract owner to register namespaces for free during the first year to
foster adoption. No ETH is processed (function is non-payable) and no fees are charged.

**Requirements:**
- `msg.sender` must be the contract owner.
- Must be called during the onboarding period (first year after contract deployment).
- `nsOwner` must not be the zero address.
- No ETH should be sent (function is non-payable).
- All validation requirements from `registerPrivateNamespace` apply.

```solidity
function registerPrivateNamespaceFor(address nsOwner, string namespace, uint256 pricePerName) external
```


#### Parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| nsOwner | address | The address that will be assigned as the namespace owner. |
| namespace | string | The namespace to register. |
| pricePerName | uint256 | The price per name for the namespace. |


### claimFees


Function to claim accumulated fees for `msg.sender` and send to `recipient`.
Withdraws all pending fees. Partial claims are not possible.

**Requirements:**
- `recipient` must not be the zero address.
- `msg.sender` must have pending fees to claim.

```solidity
function claimFees(address recipient) external
```


#### Parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| recipient | address | The address that will receive the claimed fees. |


### claimFeesToSelf


Function to claim accumulated fees for `msg.sender` and send to `msg.sender`.
Withdraws all pending fees. Partial claims are not possible.

```solidity
function claimFeesToSelf() external
```




### transferNamespaceOwnership


Start a 2-step transfer of namespace ownership to a new address.
The new namespace owner must call `acceptNamespaceOwnership` to complete the transfer.

Setting `newOwner` to the zero address is allowed; this can be used to cancel an initiated transfer.
Alternatively, a pending transfer can be overwritten by calling this function again with a different address.

**Requirements:**
- `msg.sender` must be the current namespace owner.
- Namespace must exist.

**Fee Accounting Note:** Ownership transfers do **not** migrate already-accrued `_pendingFees`.
Any fees accumulated before `acceptNamespaceOwnership()` remain claimable by the previous namespace owner address.
Only fees accrued **after** acceptance are credited to the new namespace owner address.

```solidity
function transferNamespaceOwnership(string namespace, address newOwner) external
```


#### Parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| namespace | string | The namespace to transfer ownership for. |
| newOwner | address | The address that will become the new namespace owner, or `address(0)` to cancel a pending transfer. |


### acceptNamespaceOwnership


Accept a pending namespace ownership transfer.
Completes the 2-step transfer process started by `transferNamespaceOwnership`.

**Requirements:**
- Namespace must exist.
- There must be a pending namespace owner transfer.
- `msg.sender` must be the pending namespace owner.

```solidity
function acceptNamespaceOwnership(string namespace) external
```


#### Parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| namespace | string | The namespace to accept ownership for. |


### getAddress


Function to resolve a name string like "vitalik", "bob.007", "alice.gm-web3" to an address.
Returns `address(0)` for anything not registered or malformed. 
If `fullName` contains no '.', it is treated as a bare name.

```solidity
function getAddress(string fullName) external view returns (address addr)
```


#### Parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| fullName | string | The name string to resolve. |

#### Return Values

| Name | Type | Description |
| ---- | ---- | ----------- |
| addr | address | The address associated with the name, or `address(0)` if not registered. |

### getAddress


Function to resolve a name to an address taking separate label and namespace parameters.
This version is more gas efficient than `getAddress(string calldata fullName)` as it does not
require string splitting. Returns `address(0)` if not registered.
If `namespace` is empty, it is treated as a bare name (equivalent to "x" namespace).

```solidity
function getAddress(string label, string namespace) external view returns (address addr)
```


#### Parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| label | string | The label part of the name. |
| namespace | string | The namespace part of the name. Use empty string "" for bare names. |

#### Return Values

| Name | Type | Description |
| ---- | ---- | ----------- |
| addr | address | The address associated with the name, or `address(0)` if not registered. |

### getName


Function to lookup the XNS name for an address.
Returns an empty string if the address has no name. For bare names (namespace "x"),
returns just the label without the ".x" suffix. For regular names, returns the full name
in format "label.namespace".

```solidity
function getName(address addr) external view returns (string)
```


#### Parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| addr | address | The address to lookup the XNS name for. |

#### Return Values

| Name | Type | Description |
| ---- | ---- | ----------- |
| [0] | string | name The XNS name for the address, or empty string if the address has no name. |

### getNamespaceInfo


Function to retrieve the namespace metadata associated with `namespace`.

```solidity
function getNamespaceInfo(string namespace) external view returns (uint256 pricePerName, address owner, uint64 createdAt, bool isPrivate)
```


#### Parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| namespace | string | The namespace to retrieve the metadata for. |

#### Return Values

| Name | Type | Description |
| ---- | ---- | ----------- |
| pricePerName | uint256 | The price per name for the namespace. |
| owner | address | The namespace owner of the namespace. |
| createdAt | uint64 | The timestamp when the namespace was created. |
| isPrivate | bool | Whether the namespace is private. |

### getNamespacePrice


Function to retrieve only the price per name for a given namespace.
More gas efficient than `getNamespaceInfo` if only the price is needed.

```solidity
function getNamespacePrice(string namespace) external view returns (uint256 pricePerName)
```


#### Parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| namespace | string | The namespace to retrieve the price for. |

#### Return Values

| Name | Type | Description |
| ---- | ---- | ----------- |
| pricePerName | uint256 | The price per name for the namespace. |

### isInExclusivityPeriod


Function to check if a namespace is currently within its exclusivity period.
Returns `true` if `block.timestamp <= createdAt + EXCLUSIVITY_PERIOD`, `false` otherwise.
For private namespaces, this function will return `false` after the exclusivity period, but private namespaces
remain namespace-owner-only forever regardless of this value.

```solidity
function isInExclusivityPeriod(string namespace) external view returns (bool inExclusivityPeriod)
```


#### Parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| namespace | string | The namespace to check. |

#### Return Values

| Name | Type | Description |
| ---- | ---- | ----------- |
| inExclusivityPeriod | bool | `true` if the namespace is within its exclusivity period, `false` otherwise. |

### isValidLabelOrNamespace


Function to check if a label or namespace is valid (returns bool, does not revert).

**Requirements:**
- Must be 1–20 characters long
- Must consist only of [a-z0-9-] (lowercase letters, digits, and hyphens)
- Cannot start or end with '-'
- Cannot contain consecutive hyphens ('--')

```solidity
function isValidLabelOrNamespace(string labelOrNamespace) external pure returns (bool isValid)
```


#### Parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| labelOrNamespace | string | The label or namespace to check if is valid. |

#### Return Values

| Name | Type | Description |
| ---- | ---- | ----------- |
| isValid | bool | True if the labelOrNamespace is valid, false otherwise. |

### isValidSignature


Function to check if a signature is valid (be used in `registerNameWithAuthorization`
or `batchRegisterNameWithAuthorization`).

```solidity
function isValidSignature(struct XNS.RegisterNameAuth registerNameAuth, bytes signature) external view returns (bool isValid)
```


#### Parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| registerNameAuth | struct XNS.RegisterNameAuth | The struct containing recipient, label, and namespace. |
| signature | bytes | The signature to check. |

#### Return Values

| Name | Type | Description |
| ---- | ---- | ----------- |
| isValid | bool | True if the signature is valid, false otherwise. |

### getPendingFees


Function to retrieve the amount of pending fees that can be claimed by an address.

```solidity
function getPendingFees(address recipient) external view returns (uint256 amount)
```


#### Parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| recipient | address | The address to retrieve the pending fees for. |

#### Return Values

| Name | Type | Description |
| ---- | ---- | ----------- |
| amount | uint256 | The amount of pending fees that can be claimed by the address. |

### getPendingNamespaceOwner


Get the pending namespace owner for a given namespace.
Returns `address(0)` if there is no pending transfer.

```solidity
function getPendingNamespaceOwner(string namespace) external view returns (address pendingOwner)
```


#### Parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| namespace | string | The namespace to check for pending namespace owner. |

#### Return Values

| Name | Type | Description |
| ---- | ---- | ----------- |
| pendingOwner | address | The address of the pending namespace owner, or `address(0)` if none. |


## Events

### NameRegistered




```solidity
event NameRegistered(string label, string namespace, address owner)
```

_Emitted in name registration functions._




### NamespaceRegistered




```solidity
event NamespaceRegistered(string namespace, uint256 pricePerName, address owner, bool isPrivate)
```

_Emitted in constructor when "x" namespace is registered, and in namespace registration functions._




### FeesClaimed




```solidity
event FeesClaimed(address recipient, uint256 amount)
```

_Emitted in fee claiming functions._




### NamespaceOwnerTransferStarted




```solidity
event NamespaceOwnerTransferStarted(string namespace, address oldOwner, address newOwner)
```

_Emitted when a namespace owner starts a transfer to a new namespace owner (address that shall receive the nsOwnerFee).
When `newOwner` is `address(0)`, this indicates cancellation of a pending transfer._




### NamespaceOwnerTransferAccepted




```solidity
event NamespaceOwnerTransferAccepted(string namespace, address newOwner)
```

_Emitted when a pending namespace owner accepts the transfer._







## State Variables

### DEPLOYED_AT


XNS contract deployment timestamp.

```solidity
uint64 DEPLOYED_AT
```





### PUBLIC_NAMESPACE_REGISTRATION_FEE


Fee to register a public namespace.

```solidity
uint256 PUBLIC_NAMESPACE_REGISTRATION_FEE
```





### PRIVATE_NAMESPACE_REGISTRATION_FEE


Fee to register a private namespace.

```solidity
uint256 PRIVATE_NAMESPACE_REGISTRATION_FEE
```





### EXCLUSIVITY_PERIOD


Duration of the exclusive namespace-owner window for paid registrations
(relevant for public namespace registrations only).

```solidity
uint256 EXCLUSIVITY_PERIOD
```





### ONBOARDING_PERIOD


Period after contract deployment during which the owner can use `registerPublicNamespaceFor` and
`registerPrivateNamespaceFor` to bootstrap namespaces for participants at no cost. After this period, all
namespace registrations (including by the owner) require standard fees via `registerPublicNamespace` or
`registerPrivateNamespace`.

```solidity
uint256 ONBOARDING_PERIOD
```





### PRICE_STEP


Unit price step (0.001 ETH).

```solidity
uint256 PRICE_STEP
```





### PUBLIC_NAMESPACE_MIN_PRICE


Minimum price per name for public namespaces (0.001 ETH).

```solidity
uint256 PUBLIC_NAMESPACE_MIN_PRICE
```





### PRIVATE_NAMESPACE_MIN_PRICE


Minimum price per name for private namespaces (0.005 ETH = 5x public minimum).

```solidity
uint256 PRIVATE_NAMESPACE_MIN_PRICE
```





### BARE_NAME_NAMESPACE


Namespace associated with bare names (e.g. "vitalik" = "vitalik.x").

```solidity
string BARE_NAME_NAMESPACE
```





### BARE_NAME_PRICE


Price for registering a bare name (e.g. "vitalik").

```solidity
uint256 BARE_NAME_PRICE
```





### DETH


Address of DETH contract used to burn ETH and credit the recipient.

```solidity
address DETH
```






## Types

### NamespaceData

```solidity
struct NamespaceData {
  uint256 pricePerName;
  address owner;
  uint64 createdAt;
  bool isPrivate;
```




_Data structure to store namespace metadata._




### Name

```solidity
struct Name {
  string label;
  string namespace;
```




_Data structure to store a name (label, namespace) associated with an address._




### RegisterNameAuth

```solidity
struct RegisterNameAuth {
  address recipient;
  string label;
  string namespace;
```




_Argument for `registerNameWithAuthorization` function (EIP-712 based)._





