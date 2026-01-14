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

### Name registration (public namespaces)
- Users call `registerName(label, namespace)` and send ETH.
- `msg.value` must be >= the namespace's registered price (excess will be refunded).
- Each address can own at most one name.

### Sponsorship via authorization (EIP-712 + EIP-1271)
- `registerNameWithAuthorization` allows a sponsor to pay and register a name for a recipient
  who explicitly authorized it via signature.
- Public namespaces: during the creator's 30-day exclusivity window, only the creator may sponsor.
- Private namespaces: only the creator may sponsor forever (public registration disabled).
- Recipients sign an EIP-712 message authorizing the specific name registration, providing opt-in consent.
- Supports both EOA signatures and EIP-1271 contract wallet signatures (Safe, Argent, etc.).

### Bare names
- A bare name is a name without a namespace (e.g., "vitalik" or "bankless").
- Bare names are equivalent to names in the special "x" namespace, i.e., "vitalik" = "vitalik.x"
  or "bankless" = "bankless.x".
- Bare names are considered premium names and cost 100 ETH per name.

### Namespace registration
- Anyone can register new namespaces by paying a one-time fee.
- Namespaces can be public or private. Public namespaces are open to the public for registrations,
  while private namespaces are only open to the namespace creator and their authorized recipients.
- **Public namespaces:**
  - Fee: 200 ETH
  - Namespace creators receive a 30-day exclusive window for registering paid names within the registered namespace.
  - During this period, the creator can use `registerName` to register a name for themselves and sponsor registrations via
    `registerNameWithAuthorization` for others.
  - After the exclusivity period, the namespace is opened to the public for registrations.
- **Private namespaces:**
  - Fee: 10 ETH
  - Only the namespace creator may register names within their private namespace forever.
- The XNS contract owner can register namespaces for free in the first year following contract deployment.
- The XNS contract owner is set as the creator of the "x" namespace (bare names) at contract deployment.
- "eth" namespace is disallowed for both public and private namespaces to avoid confusion with ENS.

### Economics
- 90% of ETH sent is burnt via DETH.
- 10% is credited as fees.
  - Public namespaces: 5% to namespace creator + 5% to XNS owner
  - Private namespaces: 10% to XNS owner (creator share redirected to owner)






## Functions

### registerName


Function to register a paid name for `msg.sender` in a public namespace. To register a bare name
(e.g., "vitalik"), use "x" as the namespace parameter. Namespace creators have a 30-day exclusivity window
to register a name for themselves within their public namespace. Registrations are opened to the public after the 30-day
exclusivity period.

**Requirements:**
- Label must be valid (non-empty, length 1–20, consists only of [a-z0-9-], cannot start or end with '-',
  cannot contain consecutive hyphens)
- Namespace must exist and must be a public namespace.
- `msg.value` must be >= the namespace's registered price (excess will be refunded).
- Caller must be namespace creator if called during the 30-day exclusivity period.
- Caller must not already have a name.
- Name must not already be registered.

**Note:** Due to block reorganization risks, users should wait for a few blocks and verify
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
signature. Allows a third party to pay gas and registration fees while the recipient explicitly approves
via EIP-712 signature. 
For public namespaces, only namespace creator may sponsor registrations during exclusivity period. 
For private namespaces, only namespace creator may sponsor registrations forever.
Supports both EOA signatures and EIP-1271 contract wallet signatures.

**Requirements:**
- Label must be valid (non-empty, length 1–20, consists only of [a-z0-9-], cannot start or end with '-').
- `recipient` must not be the zero address.
- Namespace must exist (public or private).
- `msg.value` must be >= the namespace's registered price (excess will be refunded).
- Recipient must not already have a name.
- Name must not already be registered.
- Signature must be valid EIP-712 signature from `recipient` (EOA) or EIP-1271 contract signature.

**Note:** Due to block reorganization risks, users should wait for a few blocks and verify
the name resolves correctly using the `getAddress` or `getName` function before sharing it publicly.

```solidity
function registerNameWithAuthorization(struct XNS.RegisterNameAuth registerNameAuth, bytes signature) external payable
```


#### Parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| registerNameAuth | struct XNS.RegisterNameAuth | The argument for the function, including label, namespace, and recipient. |
| signature | bytes | EIP-712 signature by `recipient` (EOA) or EIP-1271 contract signature. |


### batchRegisterNameWithAuthorization


Batch version of `registerNameWithAuthorization` to register multiple names with a single transaction.
All registrations must be in the same namespace. Skips registrations where the recipient already has a name
or the name is already registered. Skipped items are not charged; excess payment is refunded.

**Requirements:**
- All registrations must be in the same namespace.
- Array arguments must have equal length and be non-empty.
- `msg.value` must be >= `pricePerName * successfulCount` (excess will be refunded).
- All individual requirements from `registerNameWithAuthorization` apply to each registration.

```solidity
function batchRegisterNameWithAuthorization(struct XNS.RegisterNameAuth[] registerNameAuths, bytes[] signatures) external payable returns (uint256 successfulCount)
```

_**Note:** Input validation errors (invalid label, zero recipient, namespace mismatch, invalid signature)
cause the entire batch to revert. Errors that could occur due to front-running the batch tx (recipient already
has a name, or name already registered) are skipped to provide griefing protection._

#### Parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| registerNameAuths | struct XNS.RegisterNameAuth[] | Array of `RegisterNameAuth` structs, each including label, namespace, and recipient. |
| signatures | bytes[] | Array of EIP-712 signatures by recipients (EOA) or EIP-1271 contract signatures. |

#### Return Values

| Name | Type | Description |
| ---- | ---- | ----------- |
| successfulCount | uint256 | The number of names successfully registered. |

### registerPublicNamespace


Register a new public namespace.

**Requirements:**
- Namespace must be valid (length 1–20, consists only of [a-z0-9-], cannot start or end with '-', cannot contain consecutive hyphens).
- `msg.value` must be >= 200 ETH (excess refunded), except OWNER pays 0 ETH during initial period.
- Namespace must not already exist.
- Namespace must not equal "eth".
- `pricePerName` must be a multiple of 0.001 ETH.

**Note:**
- During the initial owner namespace registration period (1 year following contract deployment),
  the owner pays no namespace registration fee.
- Anyone can register a namespace for a 200 ETH fee within the initial owner
  namespace registration period.
- Front-running namespace registrations by the owner during the initial owner namespace
  registration period provides no economic benefit: the owner would only receive 5% of name
  registration fees (vs 200 ETH upfront fee), and users can mitigate this by waiting until
  after the 1-year period. This is an accepted design trade-off for simplicity.

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
- Namespace must be valid (length 1–20, consists only of [a-z0-9-],
  cannot start or end with '-', cannot contain consecutive hyphens).
- `msg.value` must be >= 10 ETH (excess refunded), except OWNER pays 0 ETH during initial period.
- Namespace must not already exist.
- Namespace must not equal "eth".
- `pricePerName` must be >= 0.001 ETH and a multiple of 0.001 ETH.

**Note:**
- During the initial owner namespace registration period (1 year following contract deployment),
  the owner pays no namespace registration fee.
- Anyone can register a namespace for a 10 ETH fee within the initial owner
  namespace registration period.
- Front-running namespace registrations by the owner during the initial owner namespace
  registration period provides no economic benefit: the owner would only receive 10% of name
  registration fees (vs 10 ETH upfront fee), and users can mitigate this by waiting until
  after the 1-year period. This is an accepted design trade-off for simplicity.

```solidity
function registerPrivateNamespace(string namespace, uint256 pricePerName) external payable
```


#### Parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
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


Function to resolve a name string like "nike", "nike.x", "vitalik.001", "alice.my-private" to an address.

```solidity
function getAddress(string fullName) external view returns (address addr)
```

_Returns `address(0)` for anything not registered or malformed. 
If `fullName` contains no '.', it is treated as a bare name._

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

```solidity
function getAddress(string label, string namespace) external view returns (address addr)
```

_This version is more gas efficient than `getAddress(string calldata fullName)` as it does not
require string splitting. Returns `address(0)` if not registered._

#### Parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| label | string | The label part of the name. |
| namespace | string | The namespace part of the name. |

#### Return Values

| Name | Type | Description |
| ---- | ---- | ----------- |
| addr | address | The address associated with the name, or `address(0)` if not registered. |

### getName


Function to lookup the XNS name for an address.

```solidity
function getName(address addr) external view returns (string)
```

_Returns an empty string if the address has no name. For bare names (namespace "x"),
returns just the label without the ".x" suffix. For regular names, returns the full name
in format "label.namespace"._

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

### isValidSlug


Function to check if a label or namespace is valid (returns bool, does not revert).

**Requirements:**
- Must be 1–20 characters long
- Must consist only of [a-z0-9-] (lowercase letters, digits, and hyphens)
- Cannot start or end with '-'
- Cannot contain consecutive hyphens ('--')

```solidity
function isValidSlug(string slug) external pure returns (bool isValid)
```


#### Parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| slug | string | The label or namespace to check if is valid. |

#### Return Values

| Name | Type | Description |
| ---- | ---- | ----------- |
| isValid | bool | True if the slug is valid, false otherwise. |

### isValidSignature


Function to check if a signature, to be used in `registerNameWithAuthorization`
or `batchRegisterNameWithAuthorization`, is valid.

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





### NAMESPACE_CREATOR_EXCLUSIVE_PERIOD


Duration of the exclusive namespace-creator window for paid registrations (relevant for public only).

```solidity
uint256 NAMESPACE_CREATOR_EXCLUSIVE_PERIOD
```





### INITIAL_OWNER_NAMESPACE_REGISTRATION_PERIOD


Period after contract deployment during which the owner pays no namespace registration fee.

```solidity
uint256 INITIAL_OWNER_NAMESPACE_REGISTRATION_PERIOD
```





### PRICE_STEP


Unit price step (0.001 ETH).

```solidity
uint256 PRICE_STEP
```





### SPECIAL_NAMESPACE


Special namespace used for bare labels (e.g. "nike" = "nike.x").

```solidity
string SPECIAL_NAMESPACE
```





### SPECIAL_NAMESPACE_PRICE


Price-per-name for the special namespace (bare names).

```solidity
uint256 SPECIAL_NAMESPACE_PRICE
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





## XNS


An Ethereum-native name registry that maps human-readable names to Ethereum addresses.
Names are **permanent, immutable, and non-transferable**.

Name format: [label].[namespace]

Examples:
- alice.xns
- bob.yolo
- vitalik.100x
- garry.ape

### Name registration
- To register a name, users call `registerName(label, namespace)` and send ETH.
- The amount of ETH sent must be >= the namespace's registered price (excess will be refunded).
- For example, if the "100x" namespace was registered with price 0.1 ETH, then calling
  `registerName("vitalik", "100x")` with 0.1 ETH registers "vitalik.100x".
- Each address can own at most one name.
- With `registerName(label, namespace)`, names are always linked to the caller's address and cannot
  be assigned to another address.

### Sponsorship via authorization (EIP-712 + EIP-1271)
- `registerNameWithAuthorization` allows a sponsor (`msg.sender`) to pay and register a name for a recipient
  who explicitly authorized it via signature.
- During the namespace creator exclusivity window, only the namespace creator may sponsor registrations
  in that namespace (public `registerName` is disabled for non-creators).
- Recipients sign an EIP-712 message authorizing the specific name registration, providing opt-in consent.
- Supports both EOA signatures and EIP-1271 contract wallet signatures (Safe, Argent, etc.).

### Bare names
- A bare name is a name without a namespace (e.g., "vitalik" or "bankless").
- Bare names are equivalent to names in the special "x" namespace, i.e., "vitalik" = "vitalik.x"
  or "bankless" = "bankless.x".
- Bare names are considered premium names and cost 100 ETH per name.

### Namespace registration
- Anyone can register new namespaces by paying a one-time fee of 200 ETH.
- Namespace creators receive a 30-day exclusive window for registering paid names within the registered namespace.
  During this period, only the creator can use `registerName` for themselves or sponsor registrations via
  `registerNameWithAuthorization` for others.
- The XNS contract owner can register namespaces for free in the first year following contract deployment.
- The XNS contract owner is set as the creator of the "x" namespace (bare names) at contract deployment.
- "eth" namespace is disallowed to avoid confusion with ENS.

### Ethereum-native economics
- 90% of ETH sent during name / namespace registration is burnt via the DETH contract,
  supporting Ethereum's deflationary mechanism and ETH's value accrual.
- 10% is credited as fees to the namespace creator and the XNS contract owner (5% each).






## Functions

### registerName


Function to register a paid name for `msg.sender`. To register a bare name
(e.g., "vitalik"), use "x" as the namespace parameter. Namespace creators
have a 30-day exclusivity window to register a name for themselves within their
registered namespace, following namespace registration. Registrations are
opened to the public after the 30-day exclusivity period.

**Requirements:**
- Label must be valid (non-empty, length 1–20, consists only of [a-z0-9-], cannot start or end with '-',
  cannot contain consecutive hyphens)
- Namespace must be valid and exist.
- `msg.value` must be >= the namespace's registered price (excess will be refunded).
- Caller must be namespace creator if called during the 30-day exclusivity period.
- Caller must not already have a name.
- Name must not already be registered.

**Note:** Due to block reorganization risks, users should wait for a few blocks and verify
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
signature. Allows a third party to pay gas and registration fees while the recipient explicitly
approves via EIP-712 signature. During the namespace creator exclusivity period, only the namespace creator
may sponsor registrations in that namespace.

**Requirements:**
- Label must be valid (non-empty, length 1–20, consists only of [a-z0-9-], cannot start or end with '-')
- `recipient` must not be the zero address.
- `msg.value` must be >= the namespace's registered price (excess will be refunded).
- Namespace must exist.
- During exclusivity: only namespace creator can call this function.
- Recipient must not already have a name.
- Name must not already be registered.
- Signature must be valid EIP-712 signature from `recipient`.

**Note:** Due to block reorganization risks, users should wait for a few blocks and verify
the name resolves correctly using the `getAddress` or `getName` function before sharing it publicly.

```solidity
function registerNameWithAuthorization(struct XNS.RegisterNameAuth registerNameAuth, bytes signature) external payable
```


#### Parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| registerNameAuth | struct XNS.RegisterNameAuth | The argument for the function, including label, namespace, and recipient. |
| signature | bytes | EIP-712 signature by `recipient` (EOA) or EIP-1271 contract signature. |


### batchRegisterNameWithAuthorization


Batch version of `registerNameWithAuthorization` to register multiple names with a single transaction.
All registrations must be in the same namespace. Skips registrations where the recipient already has a name
or the name is already registered. Skipped items are not charged; excess payment is refunded.

**Requirements:**
- All registrations must be in the same namespace.
- Array arguments must have equal length and be non-empty.
- `msg.value` must be >= `pricePerName * successfulCount` (excess will be refunded).
- All individual requirements from `registerNameWithAuthorization` apply to each registration.

```solidity
function batchRegisterNameWithAuthorization(struct XNS.RegisterNameAuth[] registerNameAuths, bytes[] signatures) external payable returns (uint256 successfulCount)
```

_**Note:** Input validation errors (invalid label, zero recipient, namespace mismatch, invalid signature)
cause the entire batch to revert. Errors that could occur due to front-running the batch tx (recipient already
has a name, or name already registered) are skipped to provide griefing protection._

#### Parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| registerNameAuths | struct XNS.RegisterNameAuth[] | Array of `RegisterNameAuth` structs, each including label, namespace, and recipient. |
| signatures | bytes[] | Array of EIP-712 signatures by recipients (EOA) or EIP-1271 contract signatures. |

#### Return Values

| Name | Type | Description |
| ---- | ---- | ----------- |
| successfulCount | uint256 | The number of names successfully registered (may be 0 if all registrations were skipped). |

### registerNamespace


Function to register a new namespace and assign a price-per-name.

**Requirements:**
- Namespace must be valid (non-empty, length 1–4, consists only of [a-z0-9])
- `msg.value` must be >= 200 ETH (excess will be refunded). Owner pays 0 ETH during initial period.
- Price per name must be a multiple of 0.001 ETH.
- Price per name must not already be in use.
- Namespace must not equal "eth".

**Note:**
- During the initial owner namespace registration period (1 year following contract deployment),
  the owner pays no namespace registration fee.
- Anyone can register a namespace for a 200 ETH fee, even within the initial owner
  namespace registration period.
- Front-running namespace registrations by the owner during the initial owner namespace
  registration period provides no economic benefit: the owner would only receive 5% of name
  registration fees (vs 200 ETH upfront fee), and users can mitigate this by waiting until
  after the 1-year period. This is an accepted design trade-off for simplicity.

```solidity
function registerNamespace(string namespace, uint256 pricePerName) external payable
```


#### Parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| namespace | string | The namespace to register. |
| pricePerName | uint256 | The price per name to assign to the namespace. |


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

**Requirements:**
- `msg.sender` must have pending fees to claim.

```solidity
function claimFeesToSelf() external
```




### getAddress


Function to resolve a name string like "nike", "nike.x", "vitalik.001" to an address.

```solidity
function getAddress(string fullName) external view returns (address addr)
```

_Returns `address(0)` for anything not registered or malformed._

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

```solidity
function getAddress(string label, string namespace) external view returns (address addr)
```

_This version is more gas efficient than `getAddress(string calldata fullName)` as it does not
require string splitting. Returns `address(0)` if not registered._

#### Parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| label | string | The label part of the name. |
| namespace | string | The namespace part of the name. |

#### Return Values

| Name | Type | Description |
| ---- | ---- | ----------- |
| addr | address | The address associated with the name, or `address(0)` if not registered. |

### getName


Function to lookup the XNS name for an address.

```solidity
function getName(address addr) external view returns (string)
```

_Returns an empty string if the address has no name. For bare names (namespace "x"),
returns just the label without the ".x" suffix. For regular names, returns the full name
in format "label.namespace"._

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
function getNamespaceInfo(string namespace) external view returns (uint256 pricePerName, address creator, uint64 createdAt)
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

### getNamespaceInfo


Function to retrieve the namespace metadata associated with `price`.

```solidity
function getNamespaceInfo(uint256 price) external view returns (string namespace, uint256 pricePerName, address creator, uint64 createdAt)
```


#### Parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| price | uint256 | The price to retrieve the namespace metadata for. |

#### Return Values

| Name | Type | Description |
| ---- | ---- | ----------- |
| namespace | string | The namespace string. |
| pricePerName | uint256 | The price per name for the namespace. |
| creator | address | The creator of the namespace. |
| createdAt | uint64 | The timestamp when the namespace was created. |

### isValidLabel


Function to check if a label is valid (returns bool, does not revert).

**Requirements:**
- Label must be 1–20 characters long
- Label must consist only of [a-z0-9-] (lowercase letters, digits, and hyphens)
- Label cannot start or end with '-'
- Label cannot contain consecutive hyphens ('--')

```solidity
function isValidLabel(string label) external pure returns (bool isValid)
```


#### Parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| label | string | The label to check if is valid. |

#### Return Values

| Name | Type | Description |
| ---- | ---- | ----------- |
| isValid | bool | True if the label is valid, false otherwise. |

### isValidNamespace


Function to check if a namespace is valid (returns bool, does not revert).

**Requirements:**
- Namespace must be 1–4 characters long
- Namespace must consist only of [a-z0-9] (lowercase letters and digits)

```solidity
function isValidNamespace(string namespace) external pure returns (bool isValid)
```


#### Parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| namespace | string | The namespace to check if is valid. |

#### Return Values

| Name | Type | Description |
| ---- | ---- | ----------- |
| isValid | bool | True if the namespace is valid, false otherwise. |

### isValidSignature


Function to check if a signature, to be used in `registerNameWithAuthorization`
or `batchRegisterNameWithAuthorization`, is valid.

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
event NamespaceRegistered(string namespace, uint256 pricePerName, address creator)
```

_Emitted in constructor when "x" namespace is registered, and in `registerNamespace` function._




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





### NAMESPACE_REGISTRATION_FEE


Fee to register a new namespace.

```solidity
uint256 NAMESPACE_REGISTRATION_FEE
```





### NAMESPACE_CREATOR_EXCLUSIVE_PERIOD


Duration of the exclusive namespace-creator window for paid registrations.

```solidity
uint256 NAMESPACE_CREATOR_EXCLUSIVE_PERIOD
```





### INITIAL_OWNER_NAMESPACE_REGISTRATION_PERIOD


Period after contract deployment during which the owner pays no namespace registration fee.

```solidity
uint256 INITIAL_OWNER_NAMESPACE_REGISTRATION_PERIOD
```





### PRICE_STEP


Unit price step (0.001 ETH).

```solidity
uint256 PRICE_STEP
```





### SPECIAL_NAMESPACE


Special namespace used for bare labels (e.g. "nike" = "nike.x").

```solidity
string SPECIAL_NAMESPACE
```





### SPECIAL_NAMESPACE_PRICE


Price-per-name for the special namespace (bare names).

```solidity
uint256 SPECIAL_NAMESPACE_PRICE
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





