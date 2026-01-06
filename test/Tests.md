# Test cases

The following test cases are implemented in [XNS.test.ts](./XNS.test.ts) file.

## XNS

### Contract initialization

#### Functionality

- Should initialize the contract correctly
  - Should initialize owner correctly.
  - Should set `deployedAt` to current block timestamp.
  - Should register special namespace "x" with correct price (100 ETH).
  - Should set special namespace creator to owner.
  - Should map SPECIAL_NAMESPACE_PRICE to "x" namespace.
  - Should register bare name "xns" for the XNS contract itself.
- Should have correct constants
  - Should have correct `NAMESPACE_REGISTRATION_FEE` (200 ether).
  - Should have correct `NAMESPACE_CREATOR_EXCLUSIVE_PERIOD` (30 days).
  - Should have correct `INITIAL_OWNER_NAMESPACE_REGISTRATION_PERIOD` (1 year).
  - Should have correct `PRICE_STEP` (0.001 ether / 1e15).
  - Should have correct `SPECIAL_NAMESPACE` ("x").
  - Should have correct `SPECIAL_NAMESPACE_PRICE` (100 ether).
  - Should have correct `DETH` address.

#### Events

- Should emit `NamespaceRegistered` event for special namespace.
- Should emit `NameRegistered` event for contract's own name "xns".

#### Reverts

- Should revert with `XNS: 0x owner` error when owner is `address(0)`.

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
- Should return `false` for labels containing consecutive hyphens.

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

- Should register a new namespace correctly
  - Should create namespace with correct price.
  - Should set namespace creator to `msg.sender`.
  - Should map price to namespace.
  - Should set `createdAt` timestamp.
- Should allow owner to register namespace without fee (`msg.value = 0`) during initial period (1 year).
- Should require owner to pay fee after 1 year.
- Should refund all ETH to owner if owner sends ETH during initial period.
- Should allow anyone (non-owner) to register namespace with fee during initial period.
- Should allow anyone (non-owner) to register namespace with fee after initial period.
- Should refund excess payment when non-owner pays more than 200 ETH.
- Should refund excess payment when owner pays more than required fee after initial period.
- Should process the ETH payment correctly (90% burnt, 5% to namespace creator, 5% to contract owner) when fee is paid.
- Should not distribute fees when owner registers with `msg.value > 0` during initial period.
- Should credit correct amount of DETH to non-owner registrant during initial period.
- Should credit correct amount of DETH to owner after initial period.
- Should credit correct amount of DETH to non-owner registrant after initial period.

#### Events

- Should emit `NamespaceRegistered` event with correct parameters.

#### Reverts

- Should revert with `XNS: invalid namespace` error for empty namespace.
- Should revert with `XNS: invalid namespace` error for namespace longer than 4 characters.
- Should revert with `XNS: invalid namespace` error for namespace with invalid characters.
- Should revert with `XNS: 'eth' namespace forbidden` error when trying to register "eth" namespace.
- Should revert with `XNS: pricePerName must be > 0` error for zero price.
- Should revert with `XNS: price must be multiple of 0.001 ETH` error for non-multiple price.
- Should revert with `XNS: price already in use` error when price is already mapped to another namespace.
- Should revert with `XNS: namespace already exists` error when namespace already exists.
- Should revert with `XNS: insufficient namespace fee` error when non-owner pays incorrect fee during initial period.
- Should revert with `XNS: insufficient namespace fee` error when non-owner pays incorrect fee after initial period.
- Should revert with `XNS: refund failed` error if refund to owner fails during initial period.

---

### registerName

#### Functionality

- Should register a name correctly
  - Should set name owner to `msg.sender`.
  - Should map name hash to owner address.
  - Should map owner address to name.
  - Should set correct label and namespace.
- Should allow namespace creator to register a paid name during exclusive period.
- Should allow anyone to register paid names after exclusive period (30 days).
- Should process the ETH payment correctly (90% burnt, 5% to namespace creator, 5% to contract owner) when fee is paid.
- Should refund excess payment when `msg.value` exceeds namespace price.
- Should permit anyone (non-namespace-creator) to register a name in the special "x" namespace (100 ETH) after the exclusive period ends.
- Should credit correct amount of DETH to `msg.sender`.
- Should credit correct amount of DETH to namespace creator (`msg.sender`) during exclusive period.
- Should allow a contract to register a name for itself via `registerName` (in constructor).
- Should allow a contract to register a name for itself via `registerName` (after deployment).

#### Events

- Should emit `NameRegistered` event with correct parameters.

#### Reverts

- Should revert with `XNS: invalid label` error for invalid label.
- Should revert with `XNS: namespace not found` error when namespace doesn't exist.
- Should revert with `XNS: insufficient payment` error when `msg.value` is less than namespace price.
- Should revert with `XNS: not namespace creator` error when non-creator tries to register during exclusive period.
- Should revert with `XNS: address already has a name` error when address already owns a name.
- Should revert with `XNS: name already registered` error when name is already registered.

---

### registerNameWithAuthorization

#### Functionality

- Should register a name for recipient when recipient authorizes via signature
  - Should set name owner to recipient, not `msg.sender`.
  - Should map name hash to recipient address.
  - Should map recipient address to name.
  - Should set correct label and namespace.
- Should allow namespace creator to sponsor registrations during exclusive period (30 days).
- Should allow anyone to sponsor registrations after exclusive period (30 days).
- Should process the ETH payment correctly (90% burnt, 5% to namespace creator, 5% to contract owner) when fee is paid.
- Should allow sponsoring a name registration for an EIP-1271 contract wallet recipient.
- Should refund excess payment when `msg.value` exceeds namespace price.
- Should permit anyone (non-namespace-creator) to register a name in the special "x" namespace (100 ETH) after the exclusive period ends.

#### Events

- Should emit `NameRegistered` event with recipient as owner.

#### Reverts

- Should revert with `XNS: invalid label` error for invalid label.
- Should revert with `XNS: 0x recipient` error when recipient is `address(0)`.
- Should revert with `XNS: namespace not found` error for non-existent namespace.
- Should revert with `XNS: insufficient payment` error when msg.value is less than namespace price.
- Should revert with `XNS: not namespace creator` error when non-creator tries to sponsor during exclusive period.
- Should revert with `XNS: recipient already has a name` error when recipient already owns a name.
- Should revert with `XNS: name already registered` error when name is already registered.
- Should revert with `XNS: bad authorization` error for invalid signature.
- Should revert with `XNS: bad authorization` error when signature is from wrong recipient.

---

### batchRegisterNameWithAuthorization

#### Functionality

- Should register multiple names in a single transaction
  - Should set name owners to recipients, not `msg.sender`.
  - Should verify mappings for all successful registrations.
  - Should require same namespace for all registrations.
  - Should process all registrations.
  - Should return the number of successful registrations.
- Should skip registrations where recipient already has a name.
- Should skip registrations where name is already registered.
- Should return 0 if no registrations succeed and refund all payment.
- Should process the ETH payment correctly (90% burnt via DETH, 5% to namespace creator, 5% to contract owner) only for successful registrations.
- Should credit correct amount of DETH to sponsor, not recipients.
- Should allow namespace creator to sponsor batch registrations during exclusive period (30 days).
- Should allow anyone to sponsor batch registrations after exclusive period (30 days).
- Should allow sponsoring name registrations including an EIP-1271 contract wallet recipient.
- Should permit anyone (non-namespace-creator) to register multiple names in the special "x" namespace (100 ETH) after the exclusive period ends.

#### Events

- Should emit `NameRegistered` event for each successful registration.

#### Reverts

- Should revert with `XNS: length mismatch` error when arrays have different lengths.
- Should revert with `XNS: empty array` error when arrays are empty.
- Should revert with `XNS: namespace not found` error for non-existent namespace.
- Should revert with `XNS: insufficient payment` error when `msg.value` is less than `pricePerName * successfulCount`.
- Should revert with `XNS: not namespace creator` error when non-creator tries to sponsor during exclusive period.
- Should revert with `XNS: namespace mismatch` error when registrations are in different namespaces.
- Should revert with `XNS: invalid label` error for invalid label in any registration.
- Should revert with `XNS: 0x recipient` error when any recipient is address(0).
- Should revert with `XNS: bad authorization` error for invalid signature in any registration.
- Should revert with `XNS: bad authorization` error when any signature is from wrong recipient.
- Should revert with `XNS: refund failed` error if refund fails when no registrations succeed.

---

### claimFees

#### Functionality

- Should allow owner to claim all pending fees for `msg.sender` and transfer to recipient (non-owner)
  - Should transfer correct amount to recipient.
  - Should reset pending fees to zero after claiming.
- Should allow namespace creator to claim all pending fees for `msg.sender` and transfer to recipient (non-namespace-creator)
  - Should transfer correct amount to recipient.
  - Should reset pending fees to zero after claiming.
- Should allow owner to claim all pending fees to themselves
  - Should transfer correct amount to `msg.sender`.
  - Should reset pending fees to zero after claiming.
- Should allow namespace creator to claim all pending fees to themselves
  - Should transfer correct amount to `msg.sender`.
  - Should reset pending fees to zero after claiming.
- Should allow claiming fees multiple times as they accumulate.

#### Events

- Should emit `FeesClaimed` event with correct recipient and amount.

#### Reverts

- Should revert with `XNS: zero recipient` error when recipient is address(0).
- Should revert with `XNS: no fees to claim` error when caller has no pending fees.
- Should revert with `XNS: fee transfer failed` error when transfer fails (if applicable).

---

### claimFeesToSelf

#### Functionality

- Should allow owner to claim all pending fees to themselves
  - Should transfer correct amount to `msg.sender`.
  - Should reset pending fees to zero after claiming.
- Should allow namespace creator to claim all pending fees to themselves
  - Should transfer correct amount to `msg.sender`.
  - Should reset pending fees to zero after claiming.

#### Events

- Should emit `FeesClaimed` event with `msg.sender` as recipient.

#### Reverts

- Should revert with `XNS: no fees to claim` error when caller has no pending fees.
- Should revert with `XNS: fee transfer failed` error when transfer fails (if applicable).

---

### isValidSignature

#### Functionality

- Should return `true` for valid EOA signature.
- Should return `true` for valid EIP-1271 contract wallet signature.
- Should return `false` for invalid signature.
- Should return `false` for signature from wrong recipient.
- Should return `false` for signature with wrong label.
- Should return `false` for signature with wrong namespace.

---

### getAddress(label,namespace)

#### Functionality

- Should return correct owner address for registered name.
- Should return `address(0)` for unregistered name.
- Should handle special namespace "x" correctly.

---

### getAddress(fullName)

#### Functionality

- Should resolve full name with dot notation correctly (e.g., "alice.001").
- Should resolve bare label with 1 character (e.g., "a").
- Should resolve bare label with 2 characters (e.g., "ab").
- Should resolve bare label with 3 characters (e.g., "abc").
- Should resolve bare label with 4 characters (e.g., "nike").
- Should resolve bare label with 5 characters (e.g., "alice").
- Should resolve bare label with 6 characters (e.g., "snoopy").
- Should resolve bare label with 7 characters (e.g., "bankless").
- Should resolve explicit ".x" namespace (e.g., "nike.x").
- Should resolve correctly for one-character namespaces.
- Should resolve correctly for two-character namespaces.
- Should resolve correctly for three-character namespaces.
- Should resolve correctly for four-character namespaces.
- Should resolve fullnames with three characters.
- Should resolve fullnames with four characters.
- Should resolve fullnames with five characters.
- Should resolve fullnames with six characters.
- Should resolve fullnames with seven characters.
- Should resolve fullnames with twenty-five characters.
- Should return `address(0)` for unregistered names.
- Should return `address(0)` for empty string.
- Should return `address(0)` for "foo.bar.baz" (parses as label="foo.bar", namespace="baz").
- Should return `address(0)` for "foo.abcde" (dot not in last 5 chars, treated as bare label).

---

### getName

#### Functionality

- Should return full name with namespace for regular names (e.g., returns "alice.001").
- Should return bare name without ".x" suffix for names in the "x" namespace (e.g., returns "vitalik" not "vitalik.x").
- Should return empty string for address without a name.

---

### getNamespaceInfo(namespace string)

#### Functionality

- Should return correct details
  - Should return correct `pricePerName`.
  - Should return correct creator address.
  - Should return correct `createdAt` timestamp.

#### Reverts

- Should revert with `XNS: namespace not found` error for non-existent namespace.

---

### getNamespaceInfo(price)

#### Functionality

- Should return correct details
  - Should return correct namespace string.
  - Should return correct `pricePerName`.
  - Should return correct creator address.
  - Should return correct `createdAt` timestamp.

#### Reverts

- Should revert with `XNS: namespace not found` error for unmapped price.

---

### getPendingFees

#### Functionality

- Should return zero for address with no pending fees.
- Should return correct amount for address with pending fees.

---
