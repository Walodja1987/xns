# XNS Contract Documentation

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
- To register a name, users call `registerName(label)` and send ETH.
- The amount of ETH sent determines the namespace. It must match a namespace's registered price. 
- For example, if the "100x" namespace was registered with price 0.1 ETH, then calling `registerName("vitalik")` with 0.1 ETH
  registers "vitalik.100x".
- Each address can own at most one name.
- Names are always linked to the caller's address and cannot be assigned to another address,
  except namespace creators can assign free names (see Namespace registration section).

### Bare names
- A bare name is a name without a namespace (e.g., "vitalik" or "bankless").
- Bare names are equivalent to names in the special "x" namespace, i.e., "vitalik" = "vitalik.x" or "bankless" = "bankless.x".
- Bare names are considered premium names and cost 100 ETH per name.

### Namespace registration
- Anyone can register new namespaces by paying a one-time fee of 200 ETH.
- Namespace creators receive two privileges:
    i)  The right to assign up to 200 free names to any address that does not already have a name (no time limit), and 
    ii) A 30-day exclusive window for registering paid names within the registered namespace.
- The exclusive window is useful if a creator exhausts their 200 free names and wants to register additional names
  before the namespace becomes publicly available.
- The XNS contract owner can register namespaces for free in the first year following contract deployment.
- The XNS contract owner is set as the creator of the "x" namespace (bare names) at contract deployment.
- "eth" namespace is disallowed to avoid confusion with ENS.

### Ethereum-native economics
- 90% of ETH sent during name / namespace registration is burnt via the DETH contract,
  supporting Ethereum's deflationary mechanism and ETH's value accrual.
- 10% is credited as fees to the namespace creator and the XNS contract owner (5% each).






## Functions

### registerName


Function to register a paid name for `msg.sender`. Namespace is determined by `msg.value`.
Namespace creators have a 30-day exclusivity window for registering names
within their registered namespace, following namespace registration.

**Requirements:**
- Label must be valid (non-empty, length 1–20, consists only of [a-z0-9-], cannot start or end with '-')
- `msg.value` must be > 0.
- Namespace must exist.
- Caller must not already have a name.
- Name must not already be registered.

```solidity
function registerName(string label) external payable
```


#### Parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| label | string | The label part of the name to register. |


### registerNamespace


Function to register a new namespace and assign a price-per-name.

**Requirements:**
- Namespace must be valid (non-empty, length 1–4, consists only of [a-z0-9])
- `msg.value` must be 200 ETH.
- Price per name must be a multiple of 0.001 ETH.
- Price per name must not already be in use.
- Namespace must not equal "eth".

**Note:**
- During the initial owner namespace registration period (1 year following contract deployment), the owner pays no namespace registration fee.
- Anyone can register a namespace for a 200 ETH fee, even within the initial owner namespace registration period.
- Front-running namespace registrations by the owner during the initial owner namespace registration period provides no economic benefit: 
the owner would only receive 5% of name registration fees (vs 200 ETH upfront fee), and users can mitigate this by waiting until after the 1-year period. This is an accepted design trade-off for simplicity.

```solidity
function registerNamespace(string namespace, uint256 pricePerName) external payable
```


#### Parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| namespace | string | The namespace to register. |
| pricePerName | uint256 | The price per name to assign to the namespace. |


### assignFreeNames


Function to assign free names to arbitrary addresses.

**Requirements:**
- Caller must be the creator of the specified namespace.
- Each recipient address must not own a name already.
- Cannot exceed the total quota of 200 free names per namespace.

```solidity
function assignFreeNames(string namespace, struct XNS.Assignment[] assignments) external
```


#### Parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| namespace | string | The namespace to assign free names to. |
| assignments | struct XNS.Assignment[] | An array of assignments, each containing a label and an address. |


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

**Requirements:**
- `fullName` must not be empty.
- `fullName` must be a valid name string (label.namespace).

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


Function to resolve a name string like "nike", "nike.x", "vitalik.001" to an address.
More gas efficient variant of `getAddress(string calldata fullName)`.

```solidity
function getAddress(string label, string namespace) external view returns (address addr)
```

_Returns `address(0)` if not registered._

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

_Returns empty string if the address has no name. For bare names (namespace "x"), 
returns just the label without the ".x" suffix. For regular names, returns the full name in format "label.namespace"._

#### Parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| addr | address | The address to lookup the XNS name for. |

#### Return Values

| Name | Type | Description |
| ---- | ---- | ----------- |
| [0] | string | name The XNS name for the address, or empty string if the address has no name. |

### getNamespaceInfo


Get namespace metadata by namespace string.

```solidity
function getNamespaceInfo(string namespace) external view returns (uint256 pricePerName, address creator, uint64 createdAt, uint16 remainingFreeNames)
```




### getNamespaceInfo


Function to retrieve the namespace metadata based on price.

```solidity
function getNamespaceInfo(uint256 price) external view returns (string namespace, uint256 pricePerName, address creator, uint64 createdAt, uint16 remainingFreeNames)
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
| remainingFreeNames | uint16 | The remaining number of free names in the namespace that can be assigned by the namespace creator. |

### isValidLabel


Function to check if a label is valid (returns bool, does not revert).

**Requirements:**
- Label must be non-empty
- Label must be 1–20 characters long
- Label must consist only of [a-z0-9-] (lowercase letters, digits, and hyphens)
- Label cannot start or end with '-'

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
- Namespace must be non-empty
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

_Emitted in `registerName` and `assignFreeNames` functions._




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





### MAX_FREE_NAMES_PER_NAMESPACE


Maximum number of free names the creator can mint in their namespace.

```solidity
uint16 MAX_FREE_NAMES_PER_NAMESPACE
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
  uint16 remainingFreeNames;
```




_Data structure to store namespace metadata._




### Assignment

```solidity
struct Assignment {
  string label;
  address to;
```




_Used as input to the `assignFreeNames` function, representing a name assignment
(label and recipient address) to be made by a namespace creator within their own namespace._




### Name

```solidity
struct Name {
  string label;
  string namespace;
```




_Data structure to store a name (label, namespace) associated with an address._





