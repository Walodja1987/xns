# Test Update Plan

This document outlines all changes needed to update `XNS.test.ts` to reflect the new contract changes (public/private namespaces split).

## Summary of Changes

- **Functions split:** `registerNamespace` → `registerPublicNamespace` + `registerPrivateNamespace`
- **Functions split:** `isValidNamespace` → `isValidPublicNamespace` + `isValidPrivateNamespace`
- **Functions removed:** `getNamespaceInfo(uint256 price)` - entire function removed
- **New functionality:** Private namespaces with different rules (creator-only forever, 10% fees to owner, 0% to creator)
- **Behavior changes:** `registerName` now only works for public namespaces
- **Behavior changes:** Fee routing differs for public vs private namespaces
- **Event changes:** `NamespaceRegistered` now includes `isPrivate` parameter
- **Getter changes:** `getNamespaceInfo(string)` now returns 4 values (adds `isPrivate`)

---

## 1. Contract Initialization Tests

### Updates Required:
- **Line ~23:** Update constant check from `NAMESPACE_REGISTRATION_FEE` to both `PUBLIC_NAMESPACE_REGISTRATION_FEE` (200 ether) and `PRIVATE_NAMESPACE_REGISTRATION_FEE` (10 ether)
- **Line ~20:** Remove test: "Should map SPECIAL_NAMESPACE_PRICE to 'x' namespace" (price mapping removed)
- **Line ~20:** Add test: "Should set special namespace as public (`isPrivate = false`)"
- **Line ~34:** Update event assertion for `NamespaceRegistered` to check `isPrivate = false` parameter

---

## 2. isValidLabel Tests

### Updates Required:
- **No changes needed** - function behavior unchanged

---

## 3. isValidNamespace → isValidPublicNamespace

### Updates Required:
- **Rename entire describe block:** `isValidNamespace` → `isValidPublicNamespace`
- **Update all test descriptions:** Change "namespace" → "public namespace" where appropriate
- **Update function calls:** `xns.isValidNamespace(...)` → `xns.isValidPublicNamespace(...)`
- **No logic changes needed** - same validation rules (1-4 chars, [a-z0-9], no hyphens)

---

## 4. isValidPrivateNamespace (NEW FUNCTION)

### Tests to Add:
Create a new `describe("isValidPrivateNamespace", ...)` block with:

#### Functionality Tests:
- Should return `true` for valid private namespaces with lowercase letters
- Should return `true` for valid private namespaces with digits
- Should return `true` for valid private namespaces with hyphens (NEW - public doesn't allow this)
- Should return `true` for valid private namespaces combining letters, digits, and hyphens
- Should return `true` for minimum length (1 character)
- Should return `true` for maximum length (16 characters) (NEW - public max is 4)

#### Revert Tests:
- Should return `false` for empty string
- Should return `false` for private namespaces longer than 16 characters
- Should return `false` for private namespaces containing uppercase letters
- Should return `false` for private namespaces containing spaces
- Should return `false` for private namespaces containing special characters (except hyphen)
- Should return `false` for private namespaces starting with hyphen
- Should return `false` for private namespaces ending with hyphen
- Should return `false` for private namespaces containing consecutive hyphens

**Implementation notes:**
- Call `xns.isValidPrivateNamespace(...)`
- Test max length of 16 (vs 4 for public)
- Test hyphen validation (allowed, but not leading/trailing/consecutive)

---

## 5. registerNamespace → registerPublicNamespace

### Updates Required:
- **Rename entire describe block:** `registerNamespace` → `registerPublicNamespace`
- **Update all function calls:** `xns.registerNamespace(...)` → `xns.registerPublicNamespace(...)`
- **Update fee constant:** `NAMESPACE_REGISTRATION_FEE` → `PUBLIC_NAMESPACE_REGISTRATION_FEE`
- **Update fee amounts:** Change 200 ETH references to `PUBLIC_NAMESPACE_REGISTRATION_FEE`

### Test Updates:
- **Line ~95:** Remove assertion: "Should map price to namespace" (no longer exists)
- **Line ~120:** Update error message: "Should revert with `XNS: price already in use`" → **REMOVE ENTIRE TEST** (price uniqueness removed)
- **Line ~118:** Add assertion: "Should set `isPrivate = false`" in namespace registration test
- **Line ~112:** Update event assertion to check `isPrivate = false` parameter

### New Tests to Add:
- **Line ~134:** Add test: "Should allow multiple public namespaces with the same price (no price uniqueness)"
  - Register two different public namespaces with same `pricePerName`
  - Should succeed (no uniqueness check)

---

## 6. registerPrivateNamespace (NEW FUNCTION)

### Tests to Add:
Create a new `describe("registerPrivateNamespace", ...)` block with:

#### Functionality Tests:
- Should register a new private namespace correctly
  - Should create namespace with correct price
  - Should set namespace creator to `msg.sender`
  - Should set `isPrivate = true`
  - Should set `createdAt` timestamp
- Should allow owner to register private namespace without fee (`msg.value = 0`) during initial period (1 year)
- Should require owner to pay fee after 1 year
- Should refund all ETH to owner if owner sends ETH during initial period
- Should allow anyone (non-owner) to register private namespace with fee during initial period
- Should allow anyone (non-owner) to register private namespace with fee after initial period
- Should refund excess payment when non-owner pays more than 10 ETH (NOTE: fee is 10 ETH, not 200 ETH)
- Should refund excess payment when owner pays more than required fee after initial period
- Should process the ETH payment correctly (90% burnt, 10% to contract owner, 0% to namespace creator) - **IMPORTANT: different fee split**
- Should not distribute fees when owner registers with `msg.value > 0` during initial period
- Should credit correct amount of DETH to non-owner registrant during initial period
- Should credit correct amount of DETH to owner after initial period
- Should credit correct amount of DETH to non-owner registrant after initial period
- Should allow multiple private namespaces with the same price (no price uniqueness)

#### Events Tests:
- Should emit `NamespaceRegistered` event with correct parameters and `isPrivate = true`

#### Revert Tests:
- Should revert with `XNS: invalid namespace` error for empty namespace
- Should revert with `XNS: invalid namespace` error for private namespace longer than 16 characters
- Should revert with `XNS: invalid namespace` error for private namespace with invalid characters
- Should revert with `XNS: invalid namespace` error for private namespace starting with hyphen
- Should revert with `XNS: invalid namespace` error for private namespace ending with hyphen
- Should revert with `XNS: invalid namespace` error for private namespace with consecutive hyphens
- Should revert with `XNS: 'eth' namespace forbidden` error when trying to register "eth" namespace
- Should revert with `XNS: pricePerName too low` error for price less than 0.001 ETH (NOTE: different error message than public)
- Should revert with `XNS: price must be multiple of 0.001 ETH` error for non-multiple price
- Should revert with `XNS: namespace already exists` error when namespace already exists
- Should revert with `XNS: insufficient namespace fee` error when non-owner pays incorrect fee during initial period
- Should revert with `XNS: insufficient namespace fee` error when non-owner pays incorrect fee after initial period
- Should revert with `XNS: refund failed` error if refund to owner fails during initial period

**Implementation notes:**
- Use `xns.registerPrivateNamespace(namespace, pricePerName, { value: fee })`
- Use `PRIVATE_NAMESPACE_REGISTRATION_FEE` constant (10 ETH)
- Use `isValidPrivateNamespace` for validation
- Check fee distribution: 10% to OWNER, 0% to creator (vs public: 5% each)
- Event includes `isPrivate = true`

---

## 7. registerName Tests

### Updates Required:
- **Update test descriptions:** Change "namespace" → "public namespace" where it refers to registration ability
- **Line ~210:** Update description: "Should register a name correctly" → "Should register a name correctly in public namespace"

### New Tests to Add:
- **Line ~230:** Add test: "Should revert with `XNS: private namespace` error when trying to register in private namespace"
  ```typescript
  // Arrange: Register a private namespace
  await xns.registerPrivateNamespace("private", price, { value: PRIVATE_FEE });
  
  // Act & Assert: Try to register name in private namespace
  await expect(
    xns.connect(user).registerName("label", "private", { value: price })
  ).to.be.revertedWith("XNS: private namespace");
  ```

**Implementation notes:**
- All existing tests should continue to work (they use public namespaces)
- New test must register a private namespace first, then attempt to use `registerName` (should revert)

---

## 8. registerNameWithAuthorization Tests

### Updates Required:
- **Update test descriptions:** Clarify which tests are for public vs private namespaces
- **Line ~247:** Update: "Should allow namespace creator to sponsor registrations" → "...in public namespace during exclusive period"
- **Line ~251:** Update fee processing test descriptions to specify "public namespace"

### New Tests to Add:
- **Line ~249:** Add test: "Should allow namespace creator to sponsor registrations in private namespace (creator-only forever)"
  - Register a private namespace
  - Fast-forward past exclusivity period
  - Creator should still be able to sponsor (forever restriction)
  - Non-creator should NOT be able to sponsor even after exclusivity
  
- **Line ~250:** Add test: "Should revert when non-creator tries to sponsor in private namespace (even after exclusivity period)"
  - Register a private namespace
  - Fast-forward past exclusivity period
  - Non-creator attempts to sponsor → should revert
  
- **Line ~252:** Add test: "Should process the ETH payment correctly for private namespace (90% burnt, 10% to contract owner, 0% to namespace creator)"
  - Verify fee split: 10% to OWNER, 0% to creator

- **Line ~268:** Add revert test: "Should revert with `XNS: not namespace creator` error when non-creator tries to sponsor in private namespace"

**Implementation notes:**
- Existing public namespace tests remain the same
- New tests must use private namespaces
- Verify fee distribution differs for private namespaces

---

## 9. batchRegisterNameWithAuthorization Tests

### Updates Required:
- **Update test descriptions:** Clarify public namespace in descriptions
- **Line ~289:** Update fee processing description to specify "public namespace"

### New Tests to Add:
- **Line ~290:** Add test: "Should process the ETH payment correctly for private namespace (90% burnt via DETH, 10% to contract owner, 0% to namespace creator)"
- **Line ~294:** Add test: "Should allow namespace creator to sponsor batch registrations in private namespace (creator-only forever)"
- **Line ~295:** Add test: "Should revert when non-creator tries to sponsor batch in private namespace"
- **Line ~310:** Add revert test: "Should revert with `XNS: not namespace creator` error when non-creator tries to sponsor batch in private namespace"

**Implementation notes:**
- Similar to single authorization tests but for batch operations
- Verify fee distribution for private namespaces

---

## 10. claimFees Tests

### Updates Required:
- **Line ~327:** Update description: "Should allow namespace creator" → "Should allow public namespace creator"
- **Line ~334:** Update description: "Should allow namespace creator" → "Should allow public namespace creator"

### New Tests to Add:
- **Line ~330:** Add test: "Should allow owner to claim all pending fees from private namespace registrations (10% of private namespace fees go to owner)"
  - Register a private namespace
  - Sponsor some name registrations in private namespace
  - Verify owner receives 10% fees, creator receives 0%
  
- **Line ~337:** Add test: "Should return zero fees for private namespace creator (private namespace creators receive 0% fees)"
  - Register a private namespace
  - Sponsor name registrations
  - Verify creator has 0 pending fees
  - Verify owner has 10% fees

**Implementation notes:**
- Private namespace creators get 0% fees (all 10% goes to OWNER)
- Verify `getPendingFees(creator)` returns 0 for private namespace creators

---

## 11. claimFeesToSelf Tests

### Updates Required:
- **Line ~359:** Update description: "Should allow namespace creator" → "Should allow public namespace creator"

### New Tests to Add:
- **Line ~362:** Add test: "Should return zero fees for private namespace creator when claiming to self (private namespace creators receive 0% fees)"
  - Similar to claimFees test above

---

## 12. isValidSignature Tests

### Updates Required:
- **No changes needed** - function behavior unchanged

---

## 13. getAddress(label,namespace) Tests

### Updates Required:
- **No changes needed** - function behavior unchanged
- May want to add test cases for private namespaces (optional)

---

## 14. getAddress(fullName) Tests

### Updates Required:
- **Line ~424:** Remove test: "Should return `address(0)` for 'foo.abcde' (dot not in last 5 chars, treated as bare label)"
  - This test is no longer relevant with full reverse scan parsing

### New Tests to Add:
- **Line ~421:** Add test: "Should resolve correctly for long private namespaces (e.g., 'label.my-private-namespace' with namespace up to 16 characters)"
  - Register a private namespace with long name (e.g., "my-private-namespace" - 16 chars)
  - Register a name in that namespace
  - Verify `getAddress("label.my-private-namespace")` resolves correctly
  
- **Line ~424:** Add test: "Should return `address(0)` for 'foo.bar.baz' (parses correctly with full reverse scan as label='foo.bar', namespace='baz')"
  - Verify parsing is correct (label="foo.bar", namespace="baz")
  - Since this name is not registered, should return `address(0)`
  
- **Line ~425:** Add test: "Should return correct address for 'label.my-private' (correctly parses long private namespace with full reverse scan)"
  - Register a private namespace "my-private"
  - Register name "label" in that namespace
  - Verify `getAddress("label.my-private")` returns correct address

**Implementation notes:**
- New parsing uses full reverse scan (finds last '.')
- Can handle namespaces up to 16 characters (private namespaces)
- Old test about "foo.abcde" is no longer relevant

---

## 15. getName Tests

### Updates Required:
- **No changes needed** - function behavior unchanged
- May want to add test for private namespace names (optional)

---

## 16. getNamespaceInfo(namespace string) Tests

### Updates Required:
- **Line ~448:** Update return value assertions to include 4 values (not 3)
  - Old: `(pricePerName, creator, createdAt)`
  - New: `(pricePerName, creator, createdAt, isPrivate)`
- **Update all assertions** in this test suite to destructure/include `isPrivate`
- Add assertion to verify `isPrivate` value is correct

### New Assertions to Add:
- For public namespace: verify `isPrivate === false`
- For private namespace: verify `isPrivate === true`

---

## 17. getNamespaceInfo(price) Tests - REMOVE ENTIRE SECTION

### Tests to Remove:
- **Remove entire describe block** for `getNamespaceInfo(uint256 price)`
- Function no longer exists in contract
- Remove all tests:
  - Functionality tests (return correct details)
  - Revert tests (namespace not found for unmapped price)

---

## 18. getPendingFees Tests

### Updates Required:
- **No changes needed** - function behavior unchanged
- New tests in claimFees section will verify private namespace creator gets 0 fees

---

## Setup Function Updates

### Updates Required:
- **Line ~79:** Update constant reference: `NAMESPACE_REGISTRATION_FEE` → `PUBLIC_NAMESPACE_REGISTRATION_FEE`
- **Line ~80:** Update function call: `registerNamespace` → `registerPublicNamespace`

---

## Helper Functions / Utilities

### Updates Required:
- No changes needed to `signRegisterNameAuth` helper
- No changes needed to setup function beyond namespace registration update

---

## Test Organization Recommendations

1. **Group private namespace tests together** - Consider organizing tests so private namespace tests are clearly separated
2. **Use descriptive test names** - Ensure test names clearly indicate whether they test public or private namespace behavior
3. **Shared test utilities** - Consider creating helper functions for:
   - Registering a public namespace
   - Registering a private namespace
   - Verifying fee distribution for public namespaces
   - Verifying fee distribution for private namespaces

---

## Critical Test Scenarios to Verify

1. ✅ Private namespace creator can sponsor forever (not just 30 days)
2. ✅ Private namespace creator gets 0% fees (owner gets 10%)
3. ✅ Public namespace creator gets 5% fees (owner gets 5%)
4. ✅ `registerName` reverts for private namespaces
5. ✅ `registerNameWithAuthorization` works for both public and private
6. ✅ Private namespaces can have same price as other namespaces (no uniqueness)
7. ✅ Long private namespaces (up to 16 chars) parse correctly in `getAddress(fullName)`
8. ✅ `getNamespaceInfo(string)` returns `isPrivate` field
9. ✅ Event `NamespaceRegistered` includes `isPrivate` parameter
10. ✅ Price uniqueness removed (multiple namespaces can share same price)

---

## Order of Updates (Suggested)

1. Start with setup function and constants (easiest, affects everything)
2. Update namespace validation functions (isValidPublicNamespace, add isValidPrivateNamespace)
3. Update namespace registration tests (registerPublicNamespace, add registerPrivateNamespace)
4. Update name registration tests (registerName, registerNameWithAuthorization, batch)
5. Update fee claiming tests
6. Update getter tests (getNamespaceInfo, getAddress)
7. Remove getNamespaceInfo(price) tests
8. Final review and cleanup

---

## Files to Reference

- **Contract:** `contracts/src/XNS.sol` - New contract implementation
- **Old Contract:** `contracts/src/XNS_OLD.sol` - For comparison
- **Changes Summary:** `context/themes/markdown/CHANGES.md` - Detailed change log
- **Test Spec:** `test/Tests.md` - Complete test specification

