# Test cases

The following test cases are implemented in [XNS.test.ts](./XNS.test.ts) file.

## XNS

### Constructor

#### Functionality

- Should initialize owner correctly.
- Should set `deployedAt` to current block timestamp.
- Should register special namespace "x" with correct price (100 ETH).
- Should set special namespace creator to owner.
- Should initialize special namespace with 200 free names.
- Should emit `NamespaceRegistered` event for special namespace.
- Should map SPECIAL_NAMESPACE_PRICE to "x" namespace.

---

### Constants

#### Functionality

- Should have correct `NAMESPACE_REGISTRATION_FEE` (200 ether).
- Should have correct `MAX_FREE_NAMES_PER_NAMESPACE` (200).
- Should have correct `NS_CREATOR_EXCLUSIVE_PERIOD` (30 days).
- Should have correct `INITIAL_OWNER_NAMESPACE_REGISTRATION_PERIOD` (90 days).
- Should have correct `PRICE_STEP` (0.001 ether / 1e15).
- Should have correct `SPECIAL_NAMESPACE` ("x").
- Should have correct `SPECIAL_NAMESPACE_PRICE` (100 ether).
- Should have correct `DETH` address.

---

### isValidLabel

#### Functionality

- Should return `true` for valid labels with lowercase letters.
- Should return `true` for valid labels with digits.
- Should return `true` for valid labels with hyphens.
- Should return `true` for valid labels combining letters, digits, and hyphens.
- Should return `true` for minimum length (1 character).
- Should return `true` for maximum length (20 characters).

#### Reverts

- Should return `false` for empty string.
- Should return `false` for labels longer than 20 characters.
- Should return `false` for labels starting with hyphen.
- Should return `false` for labels ending with hyphen.
- Should return `false` for labels containing uppercase letters.
- Should return `false` for labels containing spaces.
- Should return `false` for labels containing special characters (except hyphen).
- Should return `false` for labels containing underscores.

---

### isValidNamespace

#### Functionality

- Should return `true` for valid namespaces with lowercase letters.
- Should return `true` for valid namespaces with digits.
- Should return `true` for valid namespaces combining letters and digits.
- Should return `true` for minimum length (1 character).
- Should return `true` for maximum length (4 characters).

#### Reverts

- Should return `false` for empty string.
- Should return `false` for namespaces longer than 4 characters.
- Should return `false` for namespaces containing uppercase letters.
- Should return `false` for namespaces containing hyphens.
- Should return `false` for namespaces containing spaces.
- Should return `false` for namespaces containing special characters.

---

### registerNamespace

#### Functionality

- Should register a new namespace correctly.
- Should set namespace creator to `msg.sender`.
- Should set `createdAt` to current block timestamp.
- Should initialize namespace with 200 free names.
- Should map price to namespace correctly.
- Should allow owner to register namespace without fee during initial period (90 days).
- Should allow anyone to register namespace with correct fee after initial period.
- Should allow anyone to register namespace with correct fee even during initial period (non-owner).
- Should emit `NamespaceRegistered` event with correct parameters.
- Should distribute fees correctly (90% burnt, 5% to namespace creator, 5% to contract owner) when fee is paid.
- Should credit pending fees to namespace creator (5%).
- Should credit pending fees to contract owner (5%).
- Should not distribute fees when owner registers during initial period (msg.value = 0).

#### Reverts

- Should revert with `invalid namespace` error for empty namespace.
- Should revert with `invalid namespace` error for namespace longer than 4 characters.
- Should revert with `invalid namespace` error for namespace with invalid characters.
- Should revert with `'eth' namespace forbidden` error when trying to register "eth" namespace.
- Should revert with `pricePerName must be > 0` error for zero price.
- Should revert with `price must be multiple of 0.001 ETH` error for non-multiple price.
- Should revert with `price already in use` error when price is already mapped to another namespace.
- Should revert with `namespace already exists` error when namespace already exists.
- Should revert with `wrong namespace fee` error when non-owner pays incorrect fee during initial period.
- Should revert with `wrong namespace fee` error when non-owner pays incorrect fee after initial period.
- Should revert with `creator pays no fee in first year` error when owner pays fee during initial period.

---

### registerName

#### Functionality

- Should register a name correctly.
- Should set name owner to `msg.sender`.
- Should map name to address correctly.
- Should map address to name correctly (reverse lookup).
- Should prevent address from registering multiple names (one name per address).
- Should prevent duplicate name registration.
- Should emit `NameRegistered` event with correct parameters.
- Should distribute fees correctly (90% burnt via DETH, 5% to namespace creator, 5% to contract owner).
- Should credit pending fees to namespace creator (5%).
- Should credit pending fees to contract owner (5%).
- Should allow namespace creator to register paid names during exclusive period (30 days).
- Should allow anyone to register paid names after exclusive period (30 days).
- Should burn ETH correctly via DETH contract.
- Should work correctly with special namespace "x" (100 ETH).

#### Reverts

- Should revert with `invalid label` error for invalid label.
- Should revert with `zero price` error when msg.value is zero.
- Should revert with `non-existent namespace` error when price doesn't map to a namespace.
- Should revert with `namespace in exclusive period` error when non-creator tries to register during exclusive period.
- Should revert with `address already has a name` error when address already owns a name.
- Should revert with `name already registered` error when name is already registered.

---

### claimFreeNames

#### Functionality

- Should assign free names to specified addresses.
- Should set name owners correctly.
- Should map names to addresses correctly.
- Should map addresses to names correctly (reverse lookup).
- Should decrease `remainingFreeNames` counter correctly.
- Should allow multiple claims in one transaction.
- Should emit `NameRegistered` event for each free name.
- Should allow assigning names to different addresses in one call.
- Should allow namespace creator to claim free names at any time (even after exclusive period).
- Should correctly handle multiple free name assignments up to the limit (200).

#### Reverts

- Should revert with `no ETH for free registration` error when msg.value > 0.
- Should revert with `empty claims` error when claims array is empty.
- Should revert with `namespace not found` error for non-existent namespace.
- Should revert with `not namespace creator` error when called by non-creator.
- Should revert with `free name quota exceeded` error when claiming more than remaining free names.
- Should revert with `invalid label` error for invalid label in claims.
- Should revert with `0x owner` error when owner address is zero.
- Should revert with `owner already has a name` error when target owner already has a name.
- Should revert with `name already registered` error when name is already registered.

---

### getAddress (label, namespace)

#### Functionality

- Should return correct owner address for registered name.
- Should return `address(0)` for unregistered name.
- Should return correct address for names registered via `registerName`.
- Should return correct address for names registered via `claimFreeNames`.
- Should handle special namespace "x" correctly.

---

### getAddress (fullName)

#### Functionality

- Should resolve full name with dot notation correctly (e.g., "alice.001").
- Should resolve bare label as special namespace "x" (e.g., "nike" -> "nike.x").
- Should resolve explicit ".x" namespace (e.g., "nike.x").
- Should find dot from right within last 5 characters.
- Should return correct owner address for registered names.
- Should return `address(0)` for unregistered names.
- Should return `address(0)` for empty string.

---

### getName

#### Functionality

- Should return correct label and namespace for registered address.
- Should return empty strings for address without a name.
- Should return correct name for addresses registered via `registerName`.
- Should return correct name for addresses registered via `claimFreeNames`.

---

### getNamespaceInfo (namespace string)

#### Functionality

- Should return correct `pricePerName` for namespace.
- Should return correct `creator` address for namespace.
- Should return correct `createdAt` timestamp for namespace.
- Should return correct `remainingFreeNames` count for namespace.
- Should return correct values for special namespace "x".

#### Reverts

- Should revert with `namespace not found` error for non-existent namespace.

---

### getNamespaceInfo (price)

#### Functionality

- Should return correct namespace string for price.
- Should return correct `pricePerName` for price.
- Should return correct `creator` address for price.
- Should return correct `createdAt` timestamp for price.
- Should return correct `remainingFreeNames` count for price.
- Should return correct values for SPECIAL_NAMESPACE_PRICE.

#### Reverts

- Should revert with `price not mapped to namespace` error for unmapped price.
- Should revert with `namespace not found` error when price maps to non-existent namespace.

---

### pendingFees

#### Functionality

- Should return zero for address with no pending fees.
- Should return correct amount for address with pending fees.
- Should return updated amount after fees are credited.
- Should return zero after fees are claimed.
- Should track fees separately for different addresses.
- Should correctly track fees for namespace creator.
- Should correctly track fees for contract owner.

---

### claimFees

#### Functionality

- Should transfer all pending fees to caller.
- Should reset pending fees to zero after claiming.
- Should emit `FeesClaimed` event with correct parameters.
- Should allow claiming fees multiple times as they accumulate.
- Should work correctly for namespace creator.
- Should work correctly for contract owner.
- Should work correctly for any address with pending fees.

#### Reverts

- Should revert with `no fees to claim` error when caller has no pending fees.
- Should revert with `fee transfer failed` error when transfer fails (if applicable).

---

### Fee Distribution

#### Functionality

- Should distribute 90% to DETH burn when registering namespace with fee.
- Should distribute 90% to DETH burn when registering name.
- Should credit 5% to namespace creator when registering name.
- Should credit 5% to contract owner when registering name.
- Should credit 5% to namespace creator when registering namespace with fee.
- Should credit 5% to contract owner when registering namespace with fee.
- Should handle exact division correctly (no rounding issues).
- Should correctly handle fee distribution for multiple registrations.

---

### Exclusive Period

#### Functionality

- Should allow only namespace creator to register paid names during first 30 days.
- Should allow anyone to register paid names after 30 days.
- Should correctly calculate exclusive period from namespace creation time.
- Should not affect free name claiming (can be done at any time by creator).

#### Reverts

- Should revert with `namespace in exclusive period` when non-creator tries to register during exclusive period.

---

### Initial Owner Namespace Registration Period

#### Functionality

- Should allow owner to register namespaces without fee during first 90 days.
- Should require owner to pay fee after 90 days.
- Should allow non-owners to register namespaces with fee even during initial period.
- Should correctly calculate period from contract deployment time.

#### Reverts

- Should revert with `wrong namespace fee` when owner tries to pay fee during initial period.
- Should revert with `wrong namespace fee` when non-owner pays incorrect fee.

---

### One Name Per Address

#### Functionality

- Should prevent address from registering second name.
- Should prevent address from receiving second name via `claimFreeNames`.
- Should allow address to have one name only.

#### Reverts

- Should revert with `address already has a name` when trying to register second name.
- Should revert with `owner already has a name` when trying to assign second name via `claimFreeNames`.

---

### Namespace Creator Immutability

#### Functionality

- Should preserve namespace creator privileges after contract ownership transfer.
- Should allow original creator to claim free names after ownership transfer.
- Should allow original creator to register paid names during exclusive period after ownership transfer.
- Should not grant new owner namespace creator privileges.

---

### Ownership Transfer

#### Functionality

- Should follow the two-step transfer process correctly (Ownable2Step).

#### Reverts

- Should revert if non-owner tries to transfer ownership.
- Should revert if non-pending owner tries to accept ownership.

---

### Edge Cases

#### Functionality

- Should handle names with maximum length (20 characters for labels, 4 for namespaces).
- Should handle names with minimum length (1 character for both labels and namespaces).
- Should handle registering exactly 200 free names (maximum).
- Should handle price at PRICE_STEP boundaries (0.001 ETH, 0.002 ETH, etc.).
- Should handle multiple namespaces with different prices.
- Should handle registering names in different namespaces from same address (not allowed).
- Should handle name resolution for names with multiple dots in full name format.
