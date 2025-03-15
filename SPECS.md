### Storage layout

```solidity
struct UserNames {
    string[] names;
    mapping(bytes32 => bool) ownsName;
    uint256 primaryIndex;
}

mapping(bytes32 => address) public nameHashToOwners;
mapping(address => UserNames) public userToNames;
uint256 public totalNamesRegistered;
uint256 public accumulatedFees;
```


### `registerName`

```solidity
function registerName(
    string memory baseName, // e.g. "diva", excluding the suffix
    bool setAsPrimaryForDisplay // if true, set the name as the primary display name at reverse lookups
) external payable;
```

Allows users to register a name by burning ETH.

✨ Mechanics:
1. Ensure caller is an EOA (prevents smart contracts from registering names).
2. Validate input:
   - Ensure `baseName` is not empty.
   - Ensure `baseName` does not contain `"."` (suffixes are added automatically).
   - Check for `"X"` restriction:
     ```solidity
     require(!(keccak256(abi.encodePacked(baseName)) == keccak256(abi.encodePacked("X")) && msg.value == 100 ether),
             "X cannot be registered at 100 ETH.");
     ```
    - Ensure `msg.value` is greater than 0.
    - Ensure `msg.value` is a valid ETH increment.
3. Compute full name by attaching suffix based on ETH burned.
4. Compute hash of full name `keccak256(abi.encodePacked(fullName));`.
5. Ensure name isn’t already registered.
6. Deduct 2% protocol fee and burn the remaining ETH via DETH.
7. Store ownership (`originalOwner = currentOwner = msg.sender`).
8. Handle `setAsPrimaryForReverseLookup` logic:
   - If `setAsPrimaryForReverseLookup == true`, update `primaryNameForReverseLookup[msg.sender]` index with the new name index and emit `PrimaryNameForReverseLookupSet(msg.sender, fullName)` event.
   - If `false`, retain the current `primaryNameForReverseLookup[msg.sender]` index.
9. Emit `NameRegistered(address, fullName)` event.

## Custom domain registration functions

### `registerSuffix`

```solidity
function registerSuffix(string memory suffix) external;
```

Allows a community to register a custom suffix (e.g., .uni). Requires sending 200 ETH as part of the transaction.

✨ Mechanics:

1. Validate suffix format:
   - Must start with ".".
   - Cannot contain multiple dots.
2. The same suffix cannot be registered twice.
3. Deduct 2% protocol fee and burn the remaining ETH via DETH.
4. Store suffix in registry and assign ownership to msg.sender.
5. Emit `SuffixRegistered(suffix, msg.sender)` event.

### `initializeNames`

```solidity
function initializeNames(string[] memory names) external;
```

Allows a suffix creator to pre-register names before public activation.

✨ Mechanics:

1. Ensure caller is suffix owner.
2. Ensure suffix exists and is not yet activated.
3. Add up to 200 names to initializedNames mapping.
4. Emit `NamesInitialized(suffix, fullName)` event for each name.

The function can be called multiple times until the earlier of the following occurs: 200 names are added or the suffix is activated.

### `activateSuffix`

```solidity
function activateSuffix(string memory suffix) external;
```

Finalizes activation of a suffix after pre-registrations are completed.

✨ Mechanics:

1. Ensure caller is the suffix owner.
2. Ensure suffix is not already active.
3. Set `suffixActive[suffixHash] = true` to allow public registrations.
4. Emit `SuffixActivated(suffix)` event.

## View functions

### `getAddress`

```solidity
function getAddress(string memory fullName) external view returns (address);
```

Returns the current owner of a given name.

✨ Mechanics:

Compute hash → `keccak256(abi.encodePacked(fullName))`.
Return `nameHashToOwners[nameHash]`.

### `getName`

```solidity
function getName(address user) external view returns (string memory);
```

Returns the primary display name for an address (reverse lookup).

✨ Mechanics:

Return the name at `userToNames[user].primaryIndex`.




### Other
* The contract does not implement `receive` or `fallback` functions, preventing plain ETH transfers to the contract and rejecting calls to non-existent functions. ETH can only be sent through `registerName`.
