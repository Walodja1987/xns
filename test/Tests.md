# Test cases

The following test cases are implemented in [XNS.test.ts](./XNS.test.ts) file.

## XNS

### Contract initialization

#### Functionality

- Should initialize the contract correctly
  - Should initialize owner correctly.
  - Should set `deployedAt` to current block timestamp.
  - Should register special namespace "x" with correct price (10 ETH).
  - Should set special namespace creator to owner.
  - Should set special namespace as public (`isPrivate = false`).
  - Should register bare name "xns" for the XNS contract itself.
- Should have correct constants
  - Should have correct `PUBLIC_NAMESPACE_REGISTRATION_FEE` (50 ether).
  - Should have correct `PRIVATE_NAMESPACE_REGISTRATION_FEE` (10 ether).
  - Should have correct `EXCLUSIVITY_PERIOD` (30 days).
  - Should have correct `ONBOARDING_PERIOD` (1 year).
  - Should have correct `PRICE_STEP` (0.001 ether / 1e15).
  - Should have correct `PUBLIC_NAMESPACE_MIN_PRICE` (0.001 ether).
  - Should have correct `PRIVATE_NAMESPACE_MIN_PRICE` (0.005 ether).
  - Should have correct `BARE_NAME_NAMESPACE` ("x").
  - Should have correct `BARE_NAME_PRICE` (10 ether).
  - Should have correct `DETH` address.

#### Events

- Should emit `NamespaceRegistered` event for special namespace with `isPrivate = false`.
- Should emit `NameRegistered` event for contract's own name "xns".

#### Reverts

- Should revert with `XNS: 0x owner` error when owner is `address(0)`.

---

### Ownership Transfer

#### Functionality

- Should allow owner to transfer ownership
  - Should allow owner to start ownership transfer via `transferOwnership(newOwner)`.
  - Should set pending owner correctly.
  - Should not change current owner until acceptance.
  - Should emit `OwnershipTransferStarted` event.
  - Should allow pending owner to accept ownership via `acceptOwnership()`.
  - Should update owner after acceptance.
  - Should clear pending owner after acceptance.
  - Should emit `OwnershipTransferred` event.
- Should allow new owner to use owner-only functions.
  - New owner can call `registerPublicNamespaceFor`.
  - New owner can call `registerPrivateNamespaceFor`.
  - Old owner can no longer call owner-only functions.
- Should not migrate pending fees (old owner can still claim).
- Should credit new fees to new owner after transfer.
- Should allow owner to cancel transfer by calling `transferOwnership(address(0))`.
- Should allow owner to overwrite pending transfer by calling `transferOwnership(newAddress)` again.

#### Reverts

- Should revert when non-owner tries to transfer.
- Should revert when non-pending-owner tries to accept.

---

### isValidLabelOrNamespace

#### Functionality

- Should return `true` for valid labelOrNamespaces with lowercase letters.
- Should return `true` for valid labelOrNamespaces with digits.
- Should return `true` for valid labelOrNamespaces with hyphens.
- Should return `true` for valid labelOrNamespaces combining letters, digits, and hyphens.
- Should return `true` for minimum length (1 character).
- Should return `true` for maximum length (20 characters).

#### Reverts

- Should return `false` for empty string.
- Should return `false` for labelOrNamespaces longer than 20 characters.
- Should return `false` for labelOrNamespaces starting with hyphen.
- Should return `false` for labelOrNamespaces ending with hyphen.
- Should return `false` for labelOrNamespaces containing uppercase letters.
- Should return `false` for labelOrNamespaces containing spaces.
- Should return `false` for labelOrNamespaces containing special characters (except hyphen).
- Should return `false` for labelOrNamespaces containing underscores.
- Should return `false` for labelOrNamespaces containing consecutive hyphens.

---

### registerPublicNamespace

#### Functionality

- Should register a new namespace correctly
  - Should create namespace with correct price.
  - Should set namespace creator to `msg.sender`.
  - Should set `isPrivate = false`.
  - Should set `createdAt` timestamp.
- Should require owner to pay fee (same as any other user).
- Should allow anyone (non-owner) to register public namespace with fee during initial period.
- Should allow anyone (non-owner) to register public namespace with fee after initial period.
- Should refund excess payment when non-owner pays more than 50 ETH.
- Should refund excess payment when owner pays more than required fee.
- Should process the ETH payment correctly (80% burnt, 20% to contract owner) when fee is paid.
- Should credit correct amount of DETH to non-owner registrant during initial period.
- Should credit correct amount of DETH to owner after initial period.
- Should credit correct amount of DETH to non-owner registrant after initial period.
- Should allow multiple public namespaces with the same price (no price uniqueness).
- Should allow public namespace with hyphens (e.g., 'my-public-ns').
- Should allow public namespace registration with minimum price (0.001 ETH).

#### Events

- Should emit `NamespaceRegistered` event with correct parameters.

#### Reverts

- Should revert with `XNS: invalid namespace` error for empty namespace.
- Should revert with `XNS: invalid namespace` error for public namespace longer than 20 characters.
- Should revert with `XNS: invalid namespace` error for public namespace with invalid characters.
- Should revert with `XNS: invalid namespace` error for public namespace starting with hyphen.
- Should revert with `XNS: invalid namespace` error for public namespace ending with hyphen.
- Should revert with `XNS: invalid namespace` error for public namespace with consecutive hyphens.
- Should revert with `XNS: 'eth' namespace forbidden` error when trying to register "eth" namespace.
- Should revert with `XNS: pricePerName too low` error for price less than 0.001 ETH.
- Should revert with `XNS: price not multiple of 0.001 ETH` error for non-multiple price.
- Should revert with `XNS: namespace already exists` error when namespace already exists.
- Should revert with `XNS: insufficient namespace fee` error when non-owner pays incorrect fee during initial period.
- Should revert with `XNS: insufficient namespace fee` error when non-owner pays incorrect fee after initial period.
- Should revert with `XNS: insufficient namespace fee` error when owner pays incorrect fee.
- Should revert with `XNS: price not multiple of 0.001 ETHs when excess payment is sent.

---

### registerPrivateNamespace

#### Functionality

- Should register a new private namespace correctly
  - Should create namespace with correct price.
  - Should set namespace creator to `msg.sender`.
  - Should set `isPrivate = true`.
  - Should set `createdAt` timestamp.
- Should require owner to pay fee (same as any other user).
- Should allow anyone (non-owner) to register private namespace with fee during initial period.
- Should allow anyone (non-owner) to register private namespace with fee after initial period.
- Should refund excess payment when non-owner pays more than 10 ETH.
- Should refund excess payment when owner pays more than required fee.
- Should process the ETH payment correctly (80% burnt, 20% to contract owner, 0% to namespace creator) when fee is paid.
- Should credit correct amount of DETH to non-owner registrant during initial period.
- Should credit correct amount of DETH to owner after initial period.
- Should credit correct amount of DETH to non-owner registrant after initial period.
- Should allow multiple private namespaces with the same price (no price uniqueness).
- Should allow private namespace registration with minimum price (0.005 ETH).

#### Events

- Should emit `NamespaceRegistered` event with correct parameters and `isPrivate = true`.

#### Reverts

- Should revert with `XNS: invalid namespace` error for empty namespace.
- Should revert with `XNS: invalid namespace` error for private namespace longer than 20 characters.
- Should revert with `XNS: invalid namespace` error for private namespace with invalid characters (uppercase, spaces, special chars).
- Should revert with `XNS: invalid namespace` error for private namespace starting with hyphen.
- Should revert with `XNS: invalid namespace` error for private namespace ending with hyphen.
- Should revert with `XNS: invalid namespace` error for private namespace with consecutive hyphens.
- Should revert with `XNS: 'eth' namespace forbidden` error when trying to register "eth" namespace.
- Should revert with `XNS: pricePerName too low` error for price less than 0.005 ETH.
- Should revert with `XNS: price not multiple of 0.001 ETH` error for non-multiple price.
- Should revert with `XNS: namespace already exists` error when namespace already exists.
- Should revert with `XNS: insufficient namespace fee` error when non-owner pays incorrect fee during initial period.
- Should revert with `XNS: insufficient namespace fee` error when non-owner pays incorrect fee after initial period.
- Should revert with `XNS: insufficient namespace fee` error when owner pays incorrect fee.
- Should revert with `XNS: refund failed` error if refund fails when excess payment is sent.
XNS: price not multiple of 0.001 ETH
---

### registerPublicNamespaceFor

#### Functionality

- Should allow OWNER to register public namespace for another address during onboarding.
- Should register namespace with correct creator (not OWNER).
- Should emit `NamespaceRegistered` event with correct parameters.
- Should not process any payment (no fees, no burns).

#### Events

- Should emit `NamespaceRegistered` event with correct parameters.

#### Reverts

- Should revert with `XNS: not owner` when called by non-owner.
- Should revert with `XNS: onboarding over` when called after onboarding period.
- Should revert with `XNS: 0x creator` when creator is zero address.
- Should revert when ETH is sent (function is non-payable).
- Should revert with `XNS: invalid namespace` error for empty namespace.
- Should revert with `XNS: invalid namespace` error for namespace longer than 20 characters.
- Should revert with `XNS: invalid namespace` error for namespace with invalid characters.
- Should revert with `XNS: invalid namespace` error for namespace starting with hyphen.
- Should revert with `XNS: invalid namespace` error for namespace ending with hyphen.
- Should revert with `XNS: invalid namespace` error for namespace with consecutive hyphens.
- Should revert with `XNS: 'eth' namespace forbidden` error when trying to register "eth" namespace.
- Should revert with `XNS: pricePerName too low` error for price less than 0.001 ETH.
- Should revert with `XNS: pricePerName too low` error for zero price.
- Should revert with `XNS: price not multiple of 0.001 ETH` error when price is not a multiple of PRICE_STEP.
- Should revert with `XNS: namespace already exists` error when namespace already exists.

---

### registerPrivateNamespaceFor

#### Functionality

- Should allow OWNER to register private namespace for another address during onboarding.
- Should register namespace with correct creator (not OWNER).
- Should emit `NamespaceRegistered` event with correct parameters and `isPrivate = true`.
- Should not process any payment (no fees, no burns).

#### Events

- Should emit `NamespaceRegistered` event with correct parameters and `isPrivate = true`.

#### Reverts

- Should revert with `XNS: not owner` when called by non-owner.
- Should revert with `XNS: onboarding over` when called after onboarding period.
- Should revert with `XNS: 0x creator` when creator is zero address.
- Should revert when ETH is sent (function is non-payable).
- Should revert with `XNS: invalid namespace` error for empty namespace.
- Should revert with `XNS: invalid namespace` error for namespace longer than 20 characters.
- Should revert with `XNS: invalid namespace` error for namespace with invalid characters.
- Should revert with `XNS: invalid namespace` error for namespace starting with hyphen.
- Should revert with `XNS: invalid namespace` error for namespace ending with hyphen.
- Should revert with `XNS: invalid namespace` error for namespace with consecutive hyphens.
- Should revert with `XNS: 'eth' namespace forbidden` error when trying to register "eth" namespace.
- Should revert with `XNS: pricePerName too low` error for price less than 0.005 ETH.
- Should revert with `XNS: pricePerName too low` error for zero price.
- Should revert with `XNS: price not multiple of 0.001 ETH` error when price is not a multiple of PRICE_STEP.
- Should revert with `XNS: namespace already exists` error when namespace already exists.

---

### registerName

#### Functionality

- Should register a name correctly in public namespace
  - Should set name owner to `msg.sender`.
  - Should map name hash to owner address.
  - Should map owner address to name.
  - Should set correct label and namespace.
- Should allow anyone to register paid names in public namespace after exclusive period (30 days).
- Should process the ETH payment correctly (80% burnt, 10% to namespace creator, 10% to contract owner) when fee is paid.
- Should refund excess payment when `msg.value` exceeds namespace price.
- Should permit anyone (non-namespace-creator) to register a name in the special "x" namespace (10 ETH) after the exclusive period ends.
- Should credit correct amount of DETH to `msg.sender`.
- Should allow a contract to register a name for itself via `registerName` (in constructor).
- Should allow a contract to register a name for itself via `registerName` (after deployment).
- Should refund excess payment to contract when registering in constructor with excess payment.
- Should refund excess payment to contract when registering via function with excess payment.

#### Events

- Should emit `NameRegistered` event with correct parameters.

#### Reverts

- Should revert with `XNS: invalid label` error for invalid label.
- Should revert with `XNS: namespace not found` error when namespace doesn't exist.
- Should revert with `XNS: only for public namespaces` error when trying to register in private namespace.
- Should revert with `XNS: insufficient payment` error when `msg.value` is less than namespace price.
- Should revert with `XNS: in exclusivity period` error when trying to register during exclusive period.
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
- Should allow namespace creator to register a paid name in public namespace during exclusive period using authorization.
- Should allow private namespace creator to register a name for themselves using authorization and process fees correctly (80% burnt, 20% to contract owner, 0% to namespace creator).
- Should allow namespace creator to sponsor registrations in public namespace during exclusive period (30 days).
- Should allow anyone to sponsor registrations in public namespace after exclusive period (30 days).
- Should allow namespace creator to sponsor registrations in private namespace (creator-only forever).
- Should process the ETH payment correctly for public namespace (80% burnt, 10% to namespace creator, 10% to contract owner) when fee is paid.
- Should process the ETH payment correctly for private namespace (80% burnt, 20% to contract owner, 0% to namespace creator) when fee is paid.
- Should allow sponsoring a name registration for an EIP-1271 contract wallet recipient.
- Should refund excess payment when `msg.value` exceeds namespace price.
- Should permit anyone (non-namespace-creator) to register a name in the special "x" namespace (10 ETH) after the exclusive period ends.

#### Events

- Should emit `NameRegistered` event with recipient as owner.

#### Reverts

- Should revert with `XNS: invalid label` error for invalid label.
- Should revert with `XNS: 0x recipient` error when recipient is `address(0)`.
- Should revert with `XNS: namespace not found` error for non-existent namespace.
- Should revert with `XNS: insufficient payment` error when msg.value is less than namespace price.
- Should revert with `XNS: not namespace creator (exclusivity period)` error when non-creator tries to sponsor during exclusive period in public namespace.
- Should revert with `XNS: not namespace creator (private)` error when non-creator tries to sponsor in private namespace.
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
- Should process the ETH payment correctly for public namespace (80% burnt via DETH, 10% to namespace creator, 10% to contract owner) only for successful registrations.
- Should process the ETH payment correctly for private namespace (80% burnt via DETH, 20% to contract owner, 0% to namespace creator) only for successful registrations.
- Should credit correct amount of DETH to sponsor, not recipients.
- Should allow namespace creator to sponsor batch registrations in public namespace during exclusive period (30 days).
- Should allow anyone to sponsor batch registrations in public namespace after exclusive period (30 days).
- Should allow namespace creator to sponsor batch registrations in private namespace (creator-only forever).
- Should allow sponsoring name registrations including an EIP-1271 contract wallet recipient.
- Should permit anyone (non-namespace-creator) to register multiple names in the special "x" namespace (10 ETH) after the exclusive period ends.

#### Events

- Should emit `NameRegistered` event for each successful registration.

#### Reverts

- Should revert with `XNS: length mismatch` error when arrays have different lengths.
- Should revert with `XNS: empty array` error when arrays are empty.
- Should revert with `XNS: namespace not found` error for non-existent namespace.
- Should revert with `XNS: insufficient payment` error when `msg.value` is less than `pricePerName * successfulCount`.
- Should revert with `XNS: not namespace creator (exclusivity period)` error when non-creator tries to sponsor during exclusive period in public namespace.
- Should revert with `XNS: not namespace creator (private)` error when non-creator tries to sponsor batch in private namespace.
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
- Should allow public namespace creator to claim all pending fees for `msg.sender` and transfer to recipient (non-namespace-creator)
  - Should transfer correct amount to recipient.
  - Should reset pending fees to zero after claiming.
- Should allow owner to claim all pending fees from private namespace registrations (20% of private namespace fees go to owner).
- Should allow owner to claim all pending fees to themselves
  - Should transfer correct amount to `msg.sender`.
  - Should reset pending fees to zero after claiming.
- Should allow public namespace creator to claim all pending fees to themselves
  - Should transfer correct amount to `msg.sender`.
  - Should reset pending fees to zero after claiming.
- Should return zero fees for private namespace creator (private namespace creators receive 0% fees).
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
- Should allow public namespace creator to claim all pending fees to themselves
  - Should transfer correct amount to `msg.sender`.
  - Should reset pending fees to zero after claiming.
- Should return zero fees for private namespace creator when claiming to self (private namespace creators receive 0% fees).

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
- Should treat empty namespace as bare name (equivalent to "x" namespace).
- Should return correct recipient address for sponsored name in private namespace.
- Should return `address(0)` for unregistered name in private namespace.
- Should return correct address for long private namespace (up to 20 characters).

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
- Should resolve correctly for long private namespaces (e.g., "label.my-private-namespace" with namespace up to 20 characters).
- Should return `address(0)` for unregistered names.
- Should return `address(0)` for empty string.
- Should return `address(0)` for "foo.bar.baz" (parses correctly with full reverse scan as label="foo.bar", namespace="baz").
- Should return correct address for "label.my-private" (correctly parses long private namespace with full reverse scan).

---

### getName

#### Functionality

- Should return full name with namespace for regular names (e.g., returns "alice.001").
- Should return bare name without ".x" suffix for names in the "x" namespace (e.g., returns "vitalik" not "vitalik.x").
- Should return full name with namespace for private namespace names (e.g., returns "alice.my-private").
- Should return empty string for address without a name.

---

### getNamespaceInfo(namespace string)

#### Functionality

- Should return correct details
  - Should return correct `pricePerName`.
  - Should return correct creator address.
  - Should return correct `createdAt` timestamp.
  - Should return correct `isPrivate` boolean.

#### Reverts

- Should revert with `XNS: namespace not found` error for non-existent namespace.

---

### getNamespacePrice

#### Functionality

- Should return correct price for public namespace.
- Should return correct price for private namespace.
- Should return correct price for special namespace 'x' (bare names).

#### Reverts

- Should revert with `XNS: namespace not found` error for non-existent namespace.

---

### isInExclusivityPeriod

#### Functionality

- Should return `true` for namespace within exclusivity period (30 days after creation).
- Should return `false` for namespace after exclusivity period has ended.

#### Reverts

- Should revert with `XNS: namespace not found` error for non-existent namespace.

---

### getPendingFees

#### Functionality

- Should return zero for address with no pending fees.
- Should return correct amount for address with pending fees.

---
