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

Label and namespace string requirements:
- Must be 1–20 characters long
- Must consist only of [a-z0-9-] (lowercase letters, digits, and hyphens)
- Cannot start or end with '-'
- Cannot contain consecutive hyphens ('--')
- "eth" as namespace is disallowed to avoid confusion with ENS

### Name registration with public namespaces
- Users call `registerName(label, namespace)` and send ETH.
- This function only works for public namespaces **after** the exclusivity period (30 days).
- `msg.value` must be >= the namespace's registered price (excess will be refunded).
- Each address can own at most one name.

### Sponsorship via authorization (EIP-712 + EIP-1271)
- `registerNameWithAuthorization` is **required** for:
  - All registrations during the exclusivity period (even namespace creators registering for themselves)
  - All registrations in private namespaces (even namespace creators registering for themselves)
  - All sponsored registrations (when someone else pays the fee)
- `registerNameWithAuthorization` allows a sponsor to pay and register a name for a recipient
  who explicitly authorized it via an EIP-712 signature.
- Public namespaces: during the creator's 30-day exclusivity window, only the creator may sponsor.
- Private namespaces: only the creator may sponsor forever. Public registrations are disabled.
- Supports both EOA signatures and EIP-1271 contract wallet signatures.

### Bare names
- A bare name is a name without a namespace (e.g., "vitalik" or "bankless").
- Bare names are equivalent to names in the special "x" namespace, i.e., "vitalik" = "vitalik.x"
  or "bankless" = "bankless.x". That is, both "vitalik" and "vitalik.x" resolve to the same address.
- Bare names are considered premium names and cost 10 ETH per name.

### Namespace registration
- Anyone can register new namespaces by paying a one-time fee.
- Namespaces can be public or private. Public namespaces are open to the public for registrations,
  while private namespaces are only open to the namespace creator and their authorized recipients.
- **Public namespaces:**
  - Fee: 50 ETH
  - Namespace creators receive a 30-day exclusive window for registering paid names within the registered namespace.
  - During this period, the creator must use `registerNameWithAuthorization` to register names (even for themselves)
    and sponsor registrations for others.
  - After the exclusivity period, the namespace is opened to the public for registrations using `registerName`.
- **Private namespaces:**
  - Fee: 10 ETH
  - Only the namespace creator may register names within their private namespace forever.
- During the onboarding period (first year after contract deployment), the XNS contract owner can optionally
  bootstrap namespaces for participants and integrators at no cost using `registerPublicNamespaceFor` and
  `registerPrivateNamespaceFor`. Regular users always pay standard fees via `registerPublicNamespace` and
  `registerPrivateNamespace`, including the owner when using self-service functions.
- The XNS contract owner is set as the creator of the "x" namespace (bare names) at contract deployment.
- "eth" namespace is disallowed for both public and private namespaces to avoid confusion with ENS.

### Economics
- 90% of ETH sent is burnt via DETH.
- 10% is credited as fees.
  - Public namespaces: 5% to namespace creator + 5% to XNS owner
  - Private namespaces: 10% to XNS owner






## Functions

### registerName


Function to register a paid name for `msg.sender`. To register a bare name
(e.g., "vitalik"), use "x" as the namespace parameter.
This function only works for public namespaces after the exclusivity period (30 days) has ended.

**Requirements:**
- Label must be valid (non-empty, length 1–20, only lowercase letters, digits, and hyphens,
  cannot start or end with '-', cannot contain consecutive hyphens ('--')).
- Namespace must exist and be public.
- `msg.value` must be >= the namespace's registered price (excess will be refunded).
- Namespace must be past the exclusivity period (30 days after creation).
- Caller must not already have a name.
- Name must not already be registered.

**Fee Distribution:**
- 90% of ETH is permanently burned via DETH.
- 5% is credited to the `OWNER`.
- 5% is credited to the namespace creator.

**Note:**
- During the exclusivity period or for private namespaces, namespace creators must use
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
- All registrations in public namespaces during the exclusivity period (only namespace creator).
- All sponsored registrations in public namespaces after the exclusivity period (anyone).
- All registrations in private namespaces.

Supports both EOA signatures and EIP-1271 contract wallet signatures.

**Requirements:**
- Label must be valid (non-empty, length 1–20, only lowercase letters, digits, and hyphens,
  cannot start or end with '-', cannot contain consecutive hyphens ('--')).
- `recipient` must not be the zero address.
- Namespace must exist.
- `msg.value` must be >= the namespace's registered price (excess will be refunded).
- `msg.sender` must be the namespace creator for public namespaces during the exclusivity period
  or the `OWNER` for private namespaces.
- Recipient must not already have a name.
- Name must not already be registered.
- Signature must be valid EIP-712 signature from `recipient` (EOA) or EIP-1271 contract signature.

**Fee Distribution:**
- 90% of ETH is permanently burned via DETH.
- For public namspaces: 5% is credited to the namespace creator and 5% to the `OWNER`.
- For private namespaces: 10% is credited to the `OWNER`.

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
- 90% of ETH is permanently burned via DETH.
- For public namspaces: 5% is credited to the namespace creator and 5% to the `OWNER`.
- For private namespaces: 10% is credited to the `OWNER`.

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


OWNER-only function to register a public namespace for another address during the onboarding period.
This function allows the contract owner to register namespaces for free during the first year to
foster adoption. No ETH is processed (function is non-payable) and no fees are charged.

**Requirements:**
- `msg.sender` must be the contract owner.
- Must be called during the onboarding period (first year after contract deployment).
- `creator` must not be the zero address.
- No ETH should be sent (function is non-payable).
- All validation requirements from `registerPublicNamespace` apply.

```solidity
function registerPublicNamespaceFor(address creator, string namespace, uint256 pricePerName) external
```


#### Parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| creator | address | The address that will be assigned as the namespace creator (who will receive creator fees). |
| namespace | string | The namespace to register. |
| pricePerName | uint256 | The price per name for the namespace. |


### registerPrivateNamespaceFor


OWNER-only function to register a private namespace for another address during the onboarding period.
This function allows the contract owner to register namespaces for free during the first year to
foster adoption. No ETH is processed (function is non-payable) and no fees are charged.

**Requirements:**
- `msg.sender` must be the contract owner.
- Must be called during the onboarding period (first year after contract deployment).
- `creator` must not be the zero address.
- No ETH should be sent (function is non-payable).
- All validation requirements from `registerPrivateNamespace` apply.

```solidity
function registerPrivateNamespaceFor(address creator, string namespace, uint256 pricePerName) external
```


#### Parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| creator | address | The address that will be assigned as the namespace creator. |
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
function getNamespaceInfo(string namespace) external view returns (uint256 pricePerName, address creator, uint64 createdAt, bool isPrivate)
```


#### Parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| namespace | string | The namespace to retrieve the metadata for. |

#### Return Values

| Name | Type | Description |
| ---- | ---- | ----------- |
| pricePerName | uint256 | The price per name for the namespace. |
| creator | address | The creator of the namespace. |
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
remain creator-only forever regardless of this value.

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


## Events

### NameRegistered




```solidity
event NameRegistered(string label, string namespace, address owner)
```

_Emitted in `registerName`, `registerNameWithAuthorization`,
and `batchRegisterNameWithAuthorization` functions._




### NamespaceRegistered




```solidity
event NamespaceRegistered(string namespace, uint256 pricePerName, address creator, bool isPrivate)
```

_Emitted in constructor when "x" namespace is registered, and in namespace registration functions._




### FeesClaimed




```solidity
event FeesClaimed(address recipient, uint256 amount)
```

_Emitted in `claimFees` and `claimFeesToSelf` functions._







## State Variables

### OWNER


XNS contract owner address (immutable, set at deployment).

```solidity
address OWNER
```





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


Duration of the exclusive namespace-creator window for paid registrations
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
  address creator;
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





