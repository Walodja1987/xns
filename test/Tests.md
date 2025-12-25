# Test cases

The following test cases are implemented in [XNS.test.ts](./XNS.test.ts) file.

## XNS

### Constructor

#### Functionality

- Should initialize owner correctly.
- Should set `deployedAt` to current block timestamp.
- Should register special namespace "x" with correct price (100 ETH).
- Should set special namespace creator to owner.
- Should emit `NamespaceRegistered` event for special namespace.
- Should map SPECIAL_NAMESPACE_PRICE to "x" namespace.

---

### Constants

#### Functionality

- Should have correct `NAMESPACE_REGISTRATION_FEE` (200 ether).
- Should have correct `NAMESPACE_CREATOR_EXCLUSIVE_PERIOD` (30 days).
- Should have correct `INITIAL_OWNER_NAMESPACE_REGISTRATION_PERIOD` (1 year).
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
- Should map price to namespace correctly.
- Should allow owner to register namespace without fee (msg.value = 0) during initial period (1 year).
- Should allow owner to register namespace with fees during initial period (optional payment).
- Should distribute fees correctly when owner chooses to pay fees during initial period.
- Should allow anyone to register namespace with correct fee after initial period.
- Should allow anyone to register namespace with correct fee even during initial period (non-owner).
- Should emit `NamespaceRegistered` event with correct parameters.
- Should distribute fees correctly (90% burnt, 5% to namespace creator, 5% to contract owner) when fee is paid.
- Should credit pending fees to namespace creator (5%).
- Should credit pending fees to contract owner (5%).
- Should not distribute fees when owner registers with msg.value = 0 during initial period.

#### Reverts

- Should revert with `XNS: invalid namespace` error for empty namespace.
- Should revert with `XNS: invalid namespace` error for namespace longer than 4 characters.
- Should revert with `XNS: invalid namespace` error for namespace with invalid characters.
- Should revert with `XNS: 'eth' namespace forbidden` error when trying to register "eth" namespace.
- Should revert with `XNS: pricePerName must be > 0` error for zero price.
- Should revert with `XNS: price must be multiple of 0.001 ETH` error for non-multiple price.
- Should revert with `XNS: price already in use` error when price is already mapped to another namespace.
- Should revert with `XNS: namespace already exists` error when namespace already exists.
- Should revert with `XNS: wrong namespace fee` error when non-owner pays incorrect fee during initial period.
- Should revert with `XNS: wrong namespace fee` error when non-owner pays incorrect fee after initial period.

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

- Should revert with `XNS: invalid label` error for invalid label.
- Should revert with `XNS: zero price` error when msg.value is zero.
- Should revert with `XNS: non-existent namespace` error when price doesn't map to a namespace.
- Should revert with `XNS: not namespace creator during exclusive period` error when non-creator tries to register during exclusive period.
- Should revert with `XNS: address already has a name` error when address already owns a name.
- Should revert with `XNS: name already registered` error when name is already registered.

---

### registerNameWithAuthorization

#### Functionality

- Should register a name for recipient when sponsor pays and recipient authorizes via signature.
- Should set name owner to recipient (not msg.sender).
- Should map name to recipient address correctly.
- Should map recipient address to name correctly (reverse lookup).
- Should prevent recipient from having multiple names (one name per address).
- Should prevent duplicate name registration.
- Should emit `NameRegistered` event with recipient as owner.
- Should distribute fees correctly (90% burnt via DETH, 5% to namespace creator, 5% to contract owner).
- Should credit pending fees to namespace creator (5%).
- Should credit pending fees to contract owner (5%).
- Should allow namespace creator to sponsor registrations during exclusive period (30 days).
- Should allow anyone to sponsor registrations after exclusive period (30 days).
- Should burn ETH correctly via DETH contract (sponsor gets DETH credit).
- Should work correctly with EOA signatures.
- Should work correctly with EIP-1271 contract wallet signatures (Safe, Argent, etc.).
- Should work correctly with special namespace "x" (100 ETH).
- Should validate EIP-712 signature correctly.

#### Reverts

- Should revert with `XNS: invalid label` error for invalid label.
- Should revert with `XNS: 0x recipient` error when recipient is address(0).
- Should revert with `XNS: zero price` error when msg.value is zero.
- Should revert with `XNS: namespace not found` error for non-existent namespace.
- Should revert with `XNS: price mismatch` error when msg.value doesn't match namespace price.
- Should revert with `XNS: only creator can sponsor during exclusivity` error when non-creator tries to sponsor during exclusive period.
- Should revert with `XNS: recipient already has a name` error when recipient already owns a name.
- Should revert with `XNS: name already registered` error when name is already registered.
- Should revert with `XNS: bad authorization` error for invalid signature.
- Should revert with `XNS: bad authorization` error when signature is from wrong recipient.

---

### batchRegisterNameWithAuthorization

#### Functionality

- Should register multiple names in a single transaction.
- Should require all registrations to be in the same namespace.
- Should set name owners to recipients (not msg.sender).
- Should map names to recipient addresses correctly.
- Should map recipient addresses to names correctly (reverse lookup).
- Should skip registrations where recipient already has a name (griefing resistance).
- Should skip registrations where name is already registered (griefing resistance).
- Should return the number of successful registrations.
- Should require at least one successful registration.
- Should only charge for successful registrations (refund excess payment).
- Should emit `NameRegistered` event for each successful registration.
- Should distribute fees correctly (90% burnt via DETH, 5% to namespace creator, 5% to contract owner) only for successful registrations.
- Should credit pending fees to namespace creator (5%).
- Should credit pending fees to contract owner (5%).
- Should allow namespace creator to sponsor batch registrations during exclusive period (30 days).
- Should allow anyone to sponsor batch registrations after exclusive period (30 days).
- Should burn ETH correctly via DETH contract (sponsor gets DETH credit).
- Should work correctly with EOA signatures.
- Should work correctly with EIP-1271 contract wallet signatures (Safe, Argent, etc.).
- Should work correctly with special namespace "x" (100 ETH).
- Should validate EIP-712 signatures correctly for all registrations.
- Should be more gas efficient than calling `registerNameWithAuthorization` multiple times.
- Should be resistant to griefing attacks (front-running) by skipping invalid registrations instead of reverting.

#### Reverts

- Should revert with `XNS: length mismatch` error when arrays have different lengths.
- Should revert with `XNS: empty array` error when arrays are empty.
- Should revert with `XNS: namespace not found` error for non-existent namespace.
- Should revert with `XNS: insufficient payment` error when msg.value is less than pricePerName * successfulCount.
- Should revert with `XNS: only creator can sponsor during exclusivity` error when non-creator tries to sponsor during exclusive period.
- Should revert with `XNS: namespace mismatch` error when registrations are in different namespaces.
- Should revert with `XNS: invalid label` error for invalid label in any registration.
- Should revert with `XNS: 0x recipient` error when any recipient is address(0).
- Should revert with `XNS: bad authorization` error for invalid signature in any registration.
- Should revert with `XNS: bad authorization` error when any signature is from wrong recipient.
- Should revert with `XNS: no successful registrations` error when all registrations are skipped.

---

### isValidSignature

#### Functionality

- Should return `true` for valid EOA signature.
- Should return `true` for valid EIP-1271 contract wallet signature.
- Should return `false` for invalid signature.
- Should return `false` for signature from wrong recipient.
- Should return `false` for signature with wrong label.
- Should return `false` for signature with wrong namespace.
- Should correctly validate EIP-712 typed data signature.

#### Reverts

- (This is a view function, so no reverts expected)

---

### getAddress (label, namespace)

#### Functionality

- Should return correct owner address for registered name.
- Should return `address(0)` for unregistered name.
- Should return correct address for names registered via `registerName`.
- Should return correct address for names registered via `registerNameWithAuthorization`.
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

- Should return correct full name string for registered address.
- Should return empty string for address without a name.
- Should return correct name for addresses registered via `registerName`.
- Should return correct name for addresses registered via `registerNameWithAuthorization`.
- Should return bare name without ".x" suffix for names in the "x" namespace (e.g., returns "vitalik" not "vitalik.x").
- Should return full name with namespace for regular names (e.g., returns "alice.001").

---

### getNamespaceInfo (namespace string)

#### Functionality

- Should return correct `pricePerName` for namespace.
- Should return correct `creator` address for namespace.
- Should return correct `createdAt` timestamp for namespace.
- Should return correct values for special namespace "x".

#### Reverts

- Should revert with `XNS: namespace not found` error for non-existent namespace.

---

### getNamespaceInfo (price)

#### Functionality

- Should return correct namespace string for price.
- Should return correct `pricePerName` for price.
- Should return correct `creator` address for price.
- Should return correct `createdAt` timestamp for price.
- Should return correct values for SPECIAL_NAMESPACE_PRICE.

#### Reverts

- Should revert with `XNS: price not mapped to namespace` error for unmapped price.
- Should revert with `XNS: namespace not found` error when price maps to non-existent namespace.

---

### getPendingFees

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

- Should claim all pending fees for msg.sender and transfer to recipient.
- Should reset pending fees to zero after claiming.
- Should emit `FeesClaimed` event with correct recipient and amount.
- Should allow claiming fees to different recipient addresses.
- Should allow claiming fees multiple times as they accumulate.
- Should work correctly for namespace creator.
- Should work correctly for contract owner.
- Should work correctly for any address with pending fees.

#### Reverts

- Should revert with `XNS: zero recipient` error when recipient is address(0).
- Should revert with `XNS: no fees to claim` error when caller has no pending fees.
- Should revert with `XNS: fee transfer failed` error when transfer fails (if applicable).

---

### claimFeesToSelf

#### Functionality

- Should claim all pending fees for msg.sender and transfer to msg.sender.
- Should reset pending fees to zero after claiming.
- Should emit `FeesClaimed` event with msg.sender as recipient.
- Should be equivalent to calling `claimFees(msg.sender)`.

#### Reverts

- Should revert with `XNS: no fees to claim` error when caller has no pending fees.
- Should revert with `XNS: fee transfer failed` error when transfer fails (if applicable).

---

### Fee Distribution

#### Functionality

- Should distribute 90% to DETH burn when registering namespace with fee.
- Should distribute 90% to DETH burn when registering name via `registerName`.
- Should distribute 90% to DETH burn when registering name via `registerNameWithAuthorization`.
- Should credit 5% to namespace creator when registering name.
- Should credit 5% to contract owner when registering name.
- Should credit 5% to namespace creator when registering namespace with fee.
- Should credit 5% to contract owner when registering namespace with fee.
- Should credit DETH to payer/sponsor (msg.sender) when burning ETH.
- Should handle exact division correctly (no rounding issues).
- Should correctly handle fee distribution for multiple registrations.

---

### Exclusive Period

#### Functionality

- Should allow only namespace creator to register paid names via `registerName` during first 30 days.
- Should allow only namespace creator to sponsor registrations via `registerNameWithAuthorization` during first 30 days.
- Should allow anyone to register paid names via `registerName` after 30 days.
- Should allow anyone to sponsor registrations via `registerNameWithAuthorization` after 30 days.
- Should correctly calculate exclusive period from namespace creation time.
- Should disable public `registerName` for non-creators during exclusive period.

#### Reverts

- Should revert with `XNS: not namespace creator during exclusive period` when non-creator tries to register during exclusive period.

---

### Initial Owner Namespace Registration Period

#### Functionality

- Should allow owner to register namespaces without fee (msg.value = 0) during first year.
- Should require owner to pay fee after 1 year.
- Should allow non-owners to register namespaces with fee even during initial period.
- Should correctly calculate period from contract deployment time.

#### Reverts

- Should revert with `XNS: wrong namespace fee` when non-owner pays incorrect fee.

---

### One Name Per Address

#### Functionality

- Should prevent address from registering second name.
- Should prevent address from receiving second name via `registerNameWithAuthorization`.
- Should allow address to have one name only.

#### Reverts

- Should revert with `XNS: address already has a name` when trying to register second name via `registerName`.
- Should revert with `XNS: recipient already has a name` when trying to register second name via `registerNameWithAuthorization`.

---

### Namespace Creator Immutability

#### Functionality

- Should preserve namespace creator privileges forever (immutable).
- Should allow original creator to register paid names via `registerName` during exclusive period.
- Should allow original creator to sponsor registrations via `registerNameWithAuthorization` during exclusive period.
- Should ensure namespace creator privileges cannot be transferred or revoked.

---

### Edge Cases

#### Functionality

- Should handle names with maximum length (20 characters for labels, 4 for namespaces).
- Should handle names with minimum length (1 character for both labels and namespaces).
- Should handle price at PRICE_STEP boundaries (0.001 ETH, 0.002 ETH, etc.).
- Should handle multiple namespaces with different prices.
- Should handle registering names in different namespaces from same address (not allowed).
- Should handle name resolution for names with multiple dots in full name format.
- Should handle EIP-712 signature validation for various wallet types (EOA, Safe, Argent, etc.).
- Should handle batch sponsorship scenarios (collect signatures off-chain, execute multiple registrations).
