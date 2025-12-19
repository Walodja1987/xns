## XNS

An Ethereum-native name registry that maps human-readable names to Ethereum addresses.
Names are **permanent, immutable, and non-transferable**.
Each address can own at most one name.

Name format: **[label].[namespace]** (e.g., alice.xns, bob.yolo, vitalik.100x, garry.ape)


Name registration:
- To register a name, users call `registerName(label)` and send ETH.
- The amount of ETH sent determines the namespace. It must match a namespace's registered price. 
- For example, if the "100x" namespace was registered with price 0.1 ETH, then calling `registerName("vitalik")` with 0.1 ETH
  registers "vitalik.100x".
- Names are always linked to the caller's address and cannot be assigned to another address,
  except namespace creators can assign free names (see Namespace registration section).

Bare names:
- A bare name is a name without a namespace (e.g., "vitalik" or "bankless").
- Bare names are equivalent to names in the special "x" namespace, i.e., "vitalik" = "vitalik.x" or "bankless" = "bankless.x".
- Bare names are considered premium names and cost 100 ETH per name.

Namespace registration:
- Anyone can register new namespaces by paying a one-time fee of 200 ETH.
- Namespace creators receive two privileges:
    i)  The right to assign up to 200 free names to any address that does not already have a name (no time limit), and 
    ii) A 30-day exclusive window for registering paid names within the registered namespace.
- The exclusive window is useful if a creator exhausts their 200 free names and wants to register additional names
  before the namespace becomes publicly available.
- The XNS contract owner can register namespaces for free in the first year following contract deployment.
- The XNS contract owner is set as the creator of the "x" namespace (bare names) at contract deployment.
- "eth" namespace is disallowed to avoid confusion with ENS.

Ethereum-aligned:
- 90% of ETH sent during name / namespace registration is burnt via the DETH contract,
  supporting Ethereum's deflationary mechanism and ETH's value accrual.
- 10% is credited as fees to the namespace creator and the XNS contract owner (5% each).


## Functions

### registerName

```solidity
function registerName(string label) external payable
```

Registers a paid name for `msg.sender`. Namespace is determined by `msg.value`.

_Following namespace registration, the namespace creator has a 30-day exclusivity window for registering paid names.
A namespace creator would typically first assign free names via the `assignFreeNames` function
before registering paid names._

### registerNamespace

```solidity
function registerNamespace(string namespace, uint256 pricePerName) external payable
```

Register a new namespace and assign a price-per-name.

_During initial owner namespace registration period (1 year following contract deployment), the owner pays no namespace registration fee.
Anyone else can register a namespace for a fee, even within the initial owner namespace registration period.
Note: The owner could theoretically front-run namespace registrations during this period, but doing so provides no economic benefit:
the owner would only receive 5% of name registration fees (vs 200 ETH upfront fee), and users can mitigate this by
waiting until after the 1-year period. This is an accepted design trade-off for simplicity._

### assignFreeNames

```solidity
function assignFreeNames(string namespace, struct XNS.Assignment[] assignments) external
```

Creator-only free registration (can be used any time).
@dev
- `msg.sender` must be `namespace.creator`.
- Up to `MAX_FREE_NAMES_PER_NAMESPACE` total free names per namespace.
- Can assign names to arbitrary addresses, but each address must not already have a name.

### claimFees

```solidity
function claimFees(address recipient) external
```

Claim accumulated fees for `msg.sender` and send to recipient.

_Withdraws all pending fees credited to `msg.sender` and transfers them to `recipient`._

#### Parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| recipient | address | The address that will receive the claimed fees. |

### claimFeesToSelf

```solidity
function claimFeesToSelf() external
```

Claim accumulated fees for `msg.sender` and send to `msg.sender`.

_Convenience function that claims fees for `msg.sender` and sends them to `msg.sender`._

### getAddress

```solidity
function getAddress(string fullName) external view returns (address addr)
```

Resolves a name string like "nike", "nike.x", "vitalik.001" to an address.

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

```solidity
function getAddress(string label, string namespace) external view returns (address addr)
```

More gas efficient variant of `getAddress(string calldata fullName)`.

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

```solidity
function getName(address addr) external view returns (string)
```

Reverse lookup: get the XNS name for an address.

_Returns empty string if the address has no name.
For bare names (namespace "x"), returns just the label without the ".x" suffix.
For regular names, returns the full name in format "label.namespace"._

### getNamespaceInfo

```solidity
function getNamespaceInfo(string namespace) external view returns (uint256 pricePerName, address creator, uint64 createdAt, uint16 remainingFreeNames)
```

Get namespace metadata by namespace string.

### getNamespaceInfo

```solidity
function getNamespaceInfo(uint256 price) external view returns (string namespace, uint256 pricePerName, address creator, uint64 createdAt, uint16 remainingFreeNames)
```

Get namespace metadata by price (and also return the namespace string).

### isValidLabel

```solidity
function isValidLabel(string label) external pure returns (bool)
```

Check if a label is valid.

### isValidNamespace

```solidity
function isValidNamespace(string namespace) external pure returns (bool)
```

Check if a namespace is valid.

### getPendingFees

```solidity
function getPendingFees(address recipient) external view returns (uint256)
```

Get the amount of pending fees that can be claimed by an address.


## Events

### NameRegistered

```solidity
event NameRegistered(string label, string namespace, address owner)
```


### NamespaceRegistered

```solidity
event NamespaceRegistered(string namespace, uint256 pricePerName, address creator)
```


### FeesClaimed

```solidity
event FeesClaimed(address recipient, uint256 amount)
```





## State Variables

### owner

```solidity
address owner
```

Contract owner address (immutable, set at deployment).


### deployedAt

```solidity
uint64 deployedAt
```

XNS contract deployment timestamp.


### NAMESPACE_REGISTRATION_FEE

```solidity
uint256 NAMESPACE_REGISTRATION_FEE
```

Fee to register a new namespace.


### MAX_FREE_NAMES_PER_NAMESPACE

```solidity
uint16 MAX_FREE_NAMES_PER_NAMESPACE
```

Maximum number of free names the creator can mint in their namespace.


### NAMESPACE_CREATOR_EXCLUSIVE_PERIOD

```solidity
uint256 NAMESPACE_CREATOR_EXCLUSIVE_PERIOD
```

Duration of the exclusive namespace-creator window for paid registrations.


### INITIAL_OWNER_NAMESPACE_REGISTRATION_PERIOD

```solidity
uint256 INITIAL_OWNER_NAMESPACE_REGISTRATION_PERIOD
```

Period after contract deployment during which the owner pays no namespace registration fee.


### PRICE_STEP

```solidity
uint256 PRICE_STEP
```

Unit price step (0.001 ETH).


### SPECIAL_NAMESPACE

```solidity
string SPECIAL_NAMESPACE
```

Special namespace used for bare labels (e.g. "nike" = "nike.x").


### SPECIAL_NAMESPACE_PRICE

```solidity
uint256 SPECIAL_NAMESPACE_PRICE
```

Price-per-name for the special namespace (bare names).


### DETH

```solidity
address DETH
```

Address of DETH contract used to burn ETH and credit the recipient.



## Types

### NamespaceData

```solidity
struct NamespaceData {
  uint256 pricePerName;
  address creator;
  uint64 createdAt;
  uint16 remainingFreeNames;
}
```

### Assignment

```solidity
struct Assignment {
  string label;
  address to;
}
```

### Name

```solidity
struct Name {
  string label;
  string namespace;
}
```


